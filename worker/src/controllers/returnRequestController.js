import { json } from '../utils/response.js';
import { decryptToken } from '../utils/encryption.js';
import { getShopifyOrderByNumber, cleanOrderNumber } from '../services/shopify/orders.js';
import { createReturnInDatabase } from '../services/returnsService.js';
import { uploadAttachmentsToR2 } from '../services/r2Service.js';
import { logActivity } from '../services/activityLogger.js';
import { getUtcNow } from '../utils/date.js';
import { validateStorefrontAccess } from '../services/storefrontAuth.js';

export async function createReturnRequestController(request, env) {
  if (request.method !== 'POST') {
    return json({ success: false, message: 'Method not allowed.' }, 405);
  }

  // 1. Authenticate storefront request
  const auth = await validateStorefrontAccess(request, env);
  if (!auth.success) {
    return json({
      success: false,
      message: auth.error || 'Unauthorized storefront access.',
    }, 401);
  }

  const shop = auth.shop;

  if (!env.DB || !shop) {
    return json({
      success: false,
      message: 'Database or shop configuration missing.',
    }, 500);
  }

  const contentType = request.headers.get('content-type') || '';
  let payload = {};
  let files = [];
  let rawEmail = '';
  const correlationId = crypto.randomUUID();
  const context = { shop, tenantId: 'default' };

  try {
    // 2. Parse Multipart Form Data or JSON Payload
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const payloadData = formData.get('data');
      
      if (payloadData) {
        payload = typeof payloadData === 'string' ? JSON.parse(payloadData) : payloadData;
      } else {
        payload = {
          orderNumber: formData.get('orderNumber'),
          email: formData.get('email'),
          reason: formData.get('reason'),
          requestedResolution: formData.get('requestedResolution'),
          condition: formData.get('condition') ? JSON.parse(formData.get('condition')) : {},
          customerNote: formData.get('customerNote'),
          items: formData.get('items') ? JSON.parse(formData.get('items')) : [],
          source: formData.get('source'),
          orderType: formData.get('orderType'),
          customerId: formData.get('customerId'),
          invoiceNumber: formData.get('invoiceNumber'),
          verifiedOrder: formData.get('verifiedOrder') ? JSON.parse(formData.get('verifiedOrder')) : null,
        };
      }
      rawEmail = formData.get('email') || payload.email || '';
      files = formData.getAll('attachments');
    } else {
      payload = await request.json().catch(() => null) || {};
      rawEmail = payload.email || '';
    }

    const orderNumber = cleanOrderNumber(payload?.orderNumber);
    const reason = String(payload?.reason || '').trim();
    const requestedResolution = String(payload?.requestedResolution || '').trim();
    const condition = payload?.condition || {};
    const customerNote = String(payload?.customerNote || '').trim();
    const selectedItemsInput = Array.isArray(payload?.items) ? payload.items : [];
    
    const source = payload?.source || 'website';
    const orderType = payload?.orderType || (source === 'assisted' ? 'netsuite' : 'shopify');
    const customerIdInput = payload?.customerId || payload?.customerInputs?.assisted?.customerId || null;
    const invoiceNumberInput = payload?.invoiceNumber || payload?.invoiceNumber || payload?.customerInputs?.assisted?.invoiceNumber || null;

    if (!orderNumber) {
      return json({ success: false, message: 'Valid order number is required.' }, 400);
    }

    // 3. Verify Active Store Installation
    const installation = await env.DB.prepare(
      `SELECT tenant_id, access_token_enc, installation_status FROM shop_installations WHERE shop_domain = ? LIMIT 1`
    ).bind(shop).first();

    if (installation?.tenant_id) {
      context.tenantId = installation.tenant_id;
    }

    if (!installation || installation.installation_status !== 'active') {
      return json({ success: false, message: 'Store installation not active.' }, 409);
    }

    let order = null;

    // 4. Resolve Order (NetSuite / Assisted vs Shopify Website)
    if (orderType === 'netsuite' || source === 'assisted') {
      if (payload.verifiedOrder) {
        order = {
          id: payload.verifiedOrder.id || `netsuite_${orderNumber}`,
          name: payload.verifiedOrder.orderNumber || orderNumber,
          created_at: payload.verifiedOrder.createdAt || null,
          display_fulfillment_status: payload.verifiedOrder.fulfillmentStatus || 'fulfilled',
          cancelled_at: null,
          line_items: (payload.verifiedOrder.items || []).map((item) => ({
            id: item.id,
            product_id: item.productId || null,
            variant_id: item.variantId || null,
            title: item.title,
            variant_title: item.variantTitle || null,
            sku: item.sku || null,
            quantity: item.quantity || 1,
          })),
        };
      } else {
        // Fallback NetSuite order constructed from payload items
        order = {
          id: payload.orderId || `netsuite_${orderNumber}`,
          name: orderNumber,
          created_at: null,
          display_fulfillment_status: 'fulfilled',
          cancelled_at: null,
          line_items: selectedItemsInput.map((item, idx) => ({
            id: item.lineItemId || `ns_line_${idx + 1}`,
            product_id: item.productId || null,
            variant_id: item.variantId || null,
            title: item.title,
            variant_title: item.variantTitle || null,
            sku: item.sku || null,
            quantity: item.quantity || 1,
          })),
        };
      }
    } else {
      // Shopify Order Lookup
      if (!installation.access_token_enc) {
        return json({ success: false, message: 'Shopify access token is missing.' }, 409);
      }
      const accessToken = await decryptToken(installation.access_token_enc, env);
      
      order = await getShopifyOrderByNumber(shop, accessToken, orderNumber, env);
      if (!order && payload?.orderNumber) {
        const alt = String(payload.orderNumber).trim();
        const searchNum = alt.startsWith('#') ? alt.substring(1) : `#${alt}`;
        order = await getShopifyOrderByNumber(shop, accessToken, searchNum, env);
      }
    }

    if (!order) {
      await logActivity(env, request, context, {
        category: 'return_request',
        action: 'verify_order_not_found',
        status: 'warning',
        message: `Order not found for number: ${orderNumber}`,
        source: source,
        error_code: 'ORDER_NOT_FOUND',
        http_status: 404,
        correlation_id: correlationId,
        metadata: { orderNumber, orderType }
      });

      return json({ success: false, message: 'Order not found.' }, 404);
    }

    if (order.cancelled_at) {
      return json({ success: false, message: 'Cannot create return for cancelled order.' }, 400);
    }

    const orderEmail = String(
      rawEmail || order.email || order.contact_email || order.customer?.email || order.billing_address?.email || payload?.email || ''
    ).trim().toLowerCase();

    // 5. Upload Attachments to Cloudflare R2
    let attachmentUrls = [];
    if (files.length > 0 && env.R2_BUCKET) {
      const tempReturnNum = `RET-TEMP-${Date.now().toString().slice(-6)}`;
      attachmentUrls = await uploadAttachmentsToR2(env, files, shop, tempReturnNum);
    }

    // 6. Format Return Line Items
    let returnItems = [];
    if (selectedItemsInput.length > 0) {
      returnItems = selectedItemsInput.map((item) => ({
        lineItemId: String(item.lineItemId || item.id),
        productId: item.productId ? String(item.productId) : null,
        variantId: item.variantId ? String(item.variantId) : null,
        title: String(item.title || ''),
        variantTitle: item.variantTitle || null,
        sku: item.sku || null,
        quantity: Number(item.quantity || 1),
      }));
    } else {
      returnItems = Array.isArray(order.line_items) ? order.line_items.map((item) => ({
        lineItemId: String(item.id),
        productId: item.product_id ? String(item.product_id) : null,
        variantId: item.variant_id ? String(item.variant_id) : null,
        title: String(item.title || ''),
        variantTitle: item.variant_title || null,
        sku: item.sku || null,
        quantity: Number(item.quantity || 0),
      })) : [];
    }

    // 7. Insert Return Record into Database
    const result = await createReturnInDatabase(
      env,
      installation,
      shop,
      order,
      orderEmail,
      returnItems,
      correlationId,
      reason,
      requestedResolution,
      condition,
      attachmentUrls,
      customerNote,
      source,
      customerIdInput,
      invoiceNumberInput
    );

    // 8. Log Activity
    await logActivity(env, request, context, {
      category: 'return_request',
      action: 'create_return_request',
      status: 'success',
      message: `Return entry created successfully for order ${result.orderNumber}`,
      source: source,
      order_id: String(order.id),
      order_number: result.orderNumber,
      return_id: result.id,
      return_number: result.returnNumber,
      correlation_id: correlationId,
      metadata: {
        createdAt: getUtcNow(),
        reason,
        requestedResolution,
        orderType,
        itemCount: returnItems.length,
        attachmentsCount: attachmentUrls.length,
      }
    });

    return json({
      success: true,
      existing: false,
      message: 'Return entry created successfully.',
      return: {
        id: result.id,
        returnNumber: result.returnNumber,
        orderNumber: result.orderNumber,
        status: result.status,
        reason: result.reason,
        requestedResolution: result.requestedResolution,
        items: result.items,
        createdAt: result.createdAt,
      },
      statusToken: result.statusToken,
      statusUrl: `/return-status?returnId=${encodeURIComponent(result.id)}`
    }, 201);
  } catch (error) {
    console.error('[Create Return Error]:', error);

    await logActivity(env, request, context, {
      category: 'return_request',
      action: 'create_return_request_failed',
      status: 'failed',
      message: error.message || 'Could not create return entry.',
      source: 'customer',
      error_code: 'CREATE_RETURN_ERROR',
      http_status: 500,
      correlation_id: correlationId,
      metadata: {
        failedAt: getUtcNow(),
        stack: error.stack,
      }
    });

    return json({ success: false, message: error.message || 'Could not create return entry.', correlationId }, 500);
  }
}