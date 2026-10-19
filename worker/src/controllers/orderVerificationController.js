import { json } from '../utils/response.js';
import { decryptToken } from '../utils/encryption.js';
import {
  getShopifyOrderByNumber,
  checkShopifyScopes,
  cleanOrderNumber,
} from '../services/shopify/orders.js';
import { logActivity } from '../services/activityLogger.js';
import { getUtcNow } from '../utils/date.js';
import { validateStorefrontAccess } from '../services/storefrontAuth.js'
// =====================================================
// Shared activity logger
// =====================================================

async function safeLogActivity(env, request, context, activity) {
  if (!context?.tenantId) {
    console.warn(
      '[Activity Log] Skipped: tenant ID is unavailable.'
    );
    return;
  }

  try {
    await logActivity(env, request, context, activity);
  } catch (error) {
    console.error('[Activity Log Error]:', error?.message);
  }
}

// =====================================================
// Shopify order verification
// Keep this controller independent of NetSuite.
// =====================================================

export async function verifyShopifyOrderController(request, env) {
  let shop = null;
  let body = {};

  const auth = await validateStorefrontAccess(request, env);

  if (!auth.success) {
    return json({
      success: false,
      verified: false,
      errorCode: 'UNAUTHORIZED_ACCESS',
      message: auth.error || 'Unauthorized storefront access.',
    }, 401);
  }

  shop = auth.shop;

  try {
    body = await request.json();
  } catch {
    return json({
      success: false,
      verified: false,
      errorCode: 'INVALID_JSON',
      message: 'Invalid request payload format.',
    }, 400);
  }


  const orderNumber = cleanOrderNumber(body?.orderNumber);
  const email = String(body?.email || '').trim().toLowerCase();
  const context = { shop, tenantId: 'default' };

  if (!orderNumber || !email) {
    await safeLogActivity(env, request, context, {
      category: 'order_verification',
      action: 'verify_order_failed',
      status: 'failed',
      message: 'Missing order number or email during verification.',
      source: 'customer',
      error_code: 'MISSING_DETAILS',
      http_status: 400,
      metadata: { orderNumber, emailProvided: Boolean(email) },
    });

    return json({
      success: false,
      verified: false,
      errorCode: 'MISSING_DETAILS',
      message: 'Enter your order number and checkout email.',
    }, 400);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({
      success: false,
      verified: false,
      errorCode: 'INVALID_EMAIL',
      message: 'Enter a valid checkout email address.',
    }, 400);
  }

  if (!env.DB || !shop) {
    return json({
      success: false,
      verified: false,
      errorCode: 'CONFIG_ERROR',
      message: 'Database or shop configuration missing.',
    }, 500);
  }

  try {
    const installation = await env.DB.prepare(`
      SELECT tenant_id, access_token_enc, installation_status
      FROM shop_installations
      WHERE shop_domain = ?
      LIMIT 1
    `).bind(shop).first().catch((dbErr) => {
      console.error('[Order Verification] DB Query failed:', dbErr);
      throw new Error('Database query failed. Ensure migrations are applied.');
    });

    if (installation?.tenant_id) {
      context.tenantId = installation.tenant_id;
    }

    if (
      !installation ||
      installation.installation_status !== 'active' ||
      !installation.access_token_enc
    ) {
      return json({
        success: false,
        verified: false,
        errorCode: 'INSTALLATION_INACTIVE',
        message: 'Store installation is inactive or token is missing. Please reinstall the app.',
      }, 409);
    }

    const accessToken = await decryptToken(
      installation.access_token_enc,
      env
    );

    const scopeCheck = await checkShopifyScopes(shop, accessToken, env);

    if (
      !scopeCheck.success ||
      !scopeCheck.scopes.includes('read_orders')
    ) {
      return json({
        success: false,
        verified: false,
        errorCode: 'SCOPE_MISSING',
        message: 'Missing required read_orders permission.',
      }, 403);
    }

    const order = await getShopifyOrderByNumber(
      shop,
      accessToken,
      orderNumber,
      env
    );

    if (!order) {
      await safeLogActivity(env, request, context, {
        category: 'order_verification',
        action: 'verify_order_not_found',
        status: 'warning',
        message: `Order not found for number: ${orderNumber}`,
        source: 'customer',
        error_code: 'ORDER_NOT_FOUND',
        http_status: 404,
        metadata: { orderNumber },
      });

      return json({
        success: false,
        verified: false,
        errorCode: 'ORDER_NOT_FOUND',
        message: 'No order found with this order number.',
      }, 404);
    }

    const shopifyEmail = String(
      order.email ||
      order.contact_email ||
      order.customer?.email ||
      order.billing_address?.email ||
      ''
    ).trim().toLowerCase();

    if (!shopifyEmail || shopifyEmail !== email) {
      await safeLogActivity(env, request, context, {
        category: 'order_verification',
        action: 'verify_order_email_mismatch',
        status: 'warning',
        message: `Email mismatch for order ${order.name}`,
        source: 'customer',
        order_id: String(order.id),
        order_number: String(order.name),
        error_code: 'EMAIL_MISMATCH',
        http_status: 404,
        metadata: { orderNumber },
      });

      return json({
        success: false,
        verified: false,
        errorCode: 'EMAIL_MISMATCH',
        message: 'The checkout email does not match this order.',
      }, 404);
    }

    if (order.cancelled_at) {
      return json({
        success: false,
        verified: false,
        errorCode: 'ORDER_CANCELLED',
        message: 'This order has been cancelled.',
      }, 409);
    }

    const existingReturn = await env.DB.prepare(`
      SELECT id, return_number, status, created_at
      FROM returns
      WHERE shopify_order_id = ?
        AND shop_domain = ?
        AND status IN ('submitted', 'pending', 'under_review')
      LIMIT 1
    `).bind(String(order.id), shop).first();

    await safeLogActivity(env, request, context, {
      category: 'order_verification',
      action: 'verify_order_success',
      status: 'success',
      message: `Order ${order.name} verified successfully.`,
      source: 'customer',
      order_id: String(order.id),
      order_number: String(order.name),
      metadata: {
        verifiedAt: getUtcNow(),
        hasExistingReturn: Boolean(existingReturn),
        returnNumber: existingReturn?.return_number ?? null,
      },
    });

    return json({
      success: true,
      verified: true,
      provider: 'shopify',

      existingReturn: existingReturn
        ? {
            returnId: existingReturn.id,
            returnNumber: existingReturn.return_number,
            status: existingReturn.status,
            statusUrl: `/return-status?returnId=${encodeURIComponent(existingReturn.id)}`,
          }
        : null,

      order: {
        id: String(order.id),
        orderNumber: order.name,
        createdAt: order.created_at,
        fulfillmentStatus: order.display_fulfillment_status,

        items: (order.line_items || []).map((item) => ({
          id: String(item.id),
          productId: item.product_id ? String(item.product_id) : null,
          variantId: item.variant_id ? String(item.variant_id) : null,
          title: item.title,
          variantTitle: item.variant_title,
          quantity: item.quantity,
          sku: item.sku,
        })),
      },

      message: existingReturn
        ? 'An active return request is already pending for this order.'
        : 'Order verified successfully.',
    });
  } catch (error) {
    console.error('[Order Verification Error]:', error);

    await safeLogActivity(env, request, context, {
      category: 'order_verification',
      action: 'verify_order_error',
      status: 'failed',
      message: error.message || 'Internal verification error.',
      source: 'customer',
      error_code: 'INTERNAL_ERROR',
      http_status: 500,
      metadata: { stack: error.stack },
    });

    return json({
      success: false,
      verified: false,
      errorCode: 'INTERNAL_ERROR',
      message: error.message || 'Internal verification error.',
    }, 500);
  }
}

// =====================================================
// NetSuite OAuth 1.0a helpers
// =====================================================

function oauthEncode(value) {
  return encodeURIComponent(String(value)).replace(
    /[!'()*]/g,
    (char) =>
      `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function createNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256Base64(key, message) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(message)
  );

  const bytes = new Uint8Array(signature);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

async function createNetSuiteOAuthHeader({
  endpoint,
  accountId,
  consumerKey,
  consumerSecret,
  tokenId,
  tokenSecret,
}) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: createNonce(),
    oauth_signature_method: 'HMAC-SHA256',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: tokenId,
    oauth_version: '1.0',
  };

  const signatureParams = [];

  for (const [key, value] of endpoint.searchParams.entries()) {
    signatureParams.push([
      oauthEncode(key),
      oauthEncode(value),
    ]);
  }

  for (const [key, value] of Object.entries(oauthParams)) {
    signatureParams.push([
      oauthEncode(key),
      oauthEncode(value),
    ]);
  }

  signatureParams.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
    return 0;
  });

  const normalizedParams = signatureParams
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  const baseUrl =
    `${endpoint.protocol}//${endpoint.host}${endpoint.pathname}`;

  const signatureBaseString = [
    'POST',
    oauthEncode(baseUrl),
    oauthEncode(normalizedParams),
  ].join('&');

  const signingKey =
    `${oauthEncode(consumerSecret)}&${oauthEncode(tokenSecret)}`;

  const signature = await hmacSha256Base64(
    signingKey,
    signatureBaseString
  );

  const authorizationParams = {
    realm: accountId,
    ...oauthParams,
    oauth_signature: signature,
  };

  return (
    'OAuth ' +
    Object.entries(authorizationParams)
      .map(([key, value]) =>
        `${oauthEncode(key)}="${oauthEncode(value)}"`
      )
      .join(', ')
  );
}

// =====================================================
// NetSuite assisted invoice verification + Activity Logs
// =====================================================

export async function verifyAssistedOrderController(request, env) {
  let shop = null;

  const auth = await validateStorefrontAccess(request, env);

  if (!auth.success) {
    return json({
      success: false,
      verified: false,
      errorCode: 'UNAUTHORIZED_ACCESS',
      message: auth.error || 'Unauthorized storefront access.',
    }, 401);
  }

  shop = auth.shop;

  let body = {};

  try {
    body = await request.json();
  } catch {
    return json({
      success: false,
      verified: false,
      errorCode: 'INVALID_JSON',
      message: 'Invalid request payload format.',
    }, 400);
  }

  const customerId = String(body?.customerId ?? '').trim();
  const invoiceNumber = String(body?.invoiceNumber ?? '').trim();
  const email = String(body?.email ?? '').trim().toLowerCase();

  const environment = String(
    body?.environment ?? env.NETSUITE_ENVIRONMENT ?? 'sandbox'
  ).trim().toLowerCase();

  const context = { shop, tenantId: null };

  // Resolve tenant before writing activity records.
  if (env.DB && shop) {
    try {
      const installation = await env.DB.prepare(`
        SELECT tenant_id
        FROM shop_installations
        WHERE shop_domain = ?
        LIMIT 1
      `).bind(shop).first();

      context.tenantId = installation?.tenant_id ?? null;
    } catch (error) {
      console.error(
        '[NetSuite Verification] Tenant lookup failed:',
        error?.message
      );
    }
  }

  if (!customerId || !invoiceNumber || !email) {
    await safeLogActivity(env, request, context, {
      category: 'order_verification',
      action: 'verify_assisted_order_failed',
      status: 'failed',
      message: 'Missing customer ID, invoice number, or email.',
      error_code: 'MISSING_DETAILS',
      http_status: 400,
      metadata: {
        provider: 'netsuite',
        customerIdProvided: Boolean(customerId),
        invoiceNumberProvided: Boolean(invoiceNumber),
        emailProvided: Boolean(email),
      },
    });

    return json({
      success: false,
      verified: false,
      errorCode: 'MISSING_DETAILS',
      message: 'Customer ID, invoice number, and email address are required.',
    }, 400);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    await safeLogActivity(env, request, context, {
      category: 'order_verification',
      action: 'verify_assisted_order_failed',
      status: 'failed',
      message: 'Invalid email supplied for NetSuite invoice verification.',
      error_code: 'INVALID_EMAIL',
      http_status: 400,
      metadata: { provider: 'netsuite', invoiceNumber },
    });

    return json({
      success: false,
      verified: false,
      errorCode: 'INVALID_EMAIL',
      message: 'Enter a valid email address.',
    }, 400);
  }

  if (!env.DB || !shop) {
    return json({
      success: false,
      verified: false,
      errorCode: 'CONFIG_ERROR',
      message: 'Database or shop configuration is missing.',
    }, 500);
  }

  if (!['sandbox', 'live'].includes(environment)) {
    return json({
      success: false,
      verified: false,
      errorCode: 'INVALID_ENVIRONMENT',
      message: 'Invalid NetSuite environment.',
    }, 400);
  }

  try {
    const config = await env.DB.prepare(`
      SELECT
        account_id,
        consumer_key,
        consumer_secret_enc,
        token_id,
        token_secret_enc,
        invoice_lookup_url
      FROM netsuite_configs
      WHERE shop_domain = ?
        AND environment = ?
      LIMIT 1
    `).bind(shop, environment).first();

    if (
      !config?.account_id ||
      !config?.consumer_key ||
      !config?.consumer_secret_enc ||
      !config?.token_id ||
      !config?.token_secret_enc ||
      !config?.invoice_lookup_url
    ) {
      await safeLogActivity(env, request, context, {
        category: 'order_verification',
        action: 'verify_assisted_order_failed',
        status: 'failed',
        message: `NetSuite ${environment} configuration is incomplete.`,
        error_code: 'NETSUITE_NOT_CONFIGURED',
        http_status: 503,
        metadata: { provider: 'netsuite', environment },
      });

      return json({
        success: false,
        verified: false,
        errorCode: 'NETSUITE_NOT_CONFIGURED',
        message: `NetSuite ${environment} configuration is incomplete.`,
      }, 503);
    }

    const endpoint = new URL(config.invoice_lookup_url);

    if (
      endpoint.protocol !== 'https:' ||
      !endpoint.hostname.endsWith('.restlets.api.netsuite.com')
    ) {
      return json({
        success: false,
        verified: false,
        errorCode: 'INVALID_NETSUITE_URL',
        message: 'The configured NetSuite RESTlet URL is invalid.',
      }, 500);
    }

    const consumerSecret = await decryptToken(
      config.consumer_secret_enc,
      env
    );

    const tokenSecret = await decryptToken(
      config.token_secret_enc,
      env
    );

    if (!consumerSecret || !tokenSecret) {
      throw new Error('NetSuite credentials could not be decrypted.');
    }

    const authorization = await createNetSuiteOAuthHeader({
      endpoint,
      accountId: config.account_id,
      consumerKey: config.consumer_key,
      consumerSecret,
      tokenId: config.token_id,
      tokenSecret,
    });

    const nsResponse = await fetch(endpoint.toString(), {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        CustomerNumber: customerId,
        InvoiceNumber: invoiceNumber,
        Email: email,
      }),
      signal: AbortSignal.timeout(20000),
    });

    const responseText = await nsResponse.text();

    let result;

    try {
      result = responseText ? JSON.parse(responseText) : null;
    } catch {
      result = null;
    }

    if (!nsResponse.ok) {
      await safeLogActivity(env, request, context, {
        category: 'order_verification',
        action: 'verify_assisted_order_failed',
        status: 'failed',
        message: `NetSuite RESTlet returned HTTP ${nsResponse.status}.`,
        error_code:
          nsResponse.status === 401
            ? 'NETSUITE_AUTH_FAILED'
            : 'NETSUITE_REQUEST_FAILED',
        http_status: 502,
        metadata: {
          provider: 'netsuite',
          environment,
          invoiceNumber,
          netsuiteStatus: nsResponse.status,
        },
      });

      return json({
        success: false,
        verified: false,
        errorCode:
          nsResponse.status === 401
            ? 'NETSUITE_AUTH_FAILED'
            : 'NETSUITE_REQUEST_FAILED',
        message:
          nsResponse.status === 401
            ? 'NetSuite rejected authentication. Check credentials and permissions.'
            : `NetSuite RESTlet returned HTTP ${nsResponse.status}.`,
      }, 502);
    }

    if (!result || typeof result !== 'object') {
      await safeLogActivity(env, request, context, {
        category: 'order_verification',
        action: 'verify_assisted_order_failed',
        status: 'failed',
        message: 'NetSuite returned an invalid response.',
        error_code: 'INVALID_NETSUITE_RESPONSE',
        http_status: 502,
        metadata: { provider: 'netsuite', environment },
      });

      return json({
        success: false,
        verified: false,
        errorCode: 'INVALID_NETSUITE_RESPONSE',
        message: 'NetSuite returned an invalid response.',
      }, 502);
    }

    if (result.success !== true) {
      await safeLogActivity(env, request, context, {
        category: 'order_verification',
        action: 'verify_assisted_order_not_found',
        status: 'warning',
        message: result.message || 'No matching NetSuite invoice was found.',
        error_code: 'ORDER_NOT_FOUND',
        http_status: 404,
        metadata: {
          provider: 'netsuite',
          environment,
          invoiceNumber,
        },
      });

      return json({
        success: false,
        verified: false,
        errorCode: 'ORDER_NOT_FOUND',
        message:
          result.message ||
          'No matching invoice was found for the supplied details.',
      }, 404);
    }

    const invoice =
      result.invoice ??
      result.order ??
      result.data?.invoice ??
      result.data?.order ??
      result.data ??
      result;

    const returnedCustomerId = String(
      invoice.customerNumber ??
      invoice.CustomerNumber ??
      invoice.customerId ??
      ''
    ).trim();

    const returnedInvoiceNumber = String(
      invoice.InvoiceNumber ??
      invoice.invoiceNumber ??
      invoice.invoicenumber ??
      invoice.tranId ??
      invoice.orderNumber ??
      ''
    ).trim();

    const returnedEmail = String(
      invoice.CustomerEmail ??
      invoice.customerEmail ??
      invoice.email ??
      ''
    ).trim().toLowerCase();

    if (
      returnedCustomerId !== customerId ||
      returnedInvoiceNumber.toLowerCase() !== invoiceNumber.toLowerCase() ||
      returnedEmail !== email
    ) {
      await safeLogActivity(env, request, context, {
        category: 'order_verification',
        action: 'verify_assisted_order_mismatch',
        status: 'warning',
        message: 'NetSuite customer, invoice number, or email mismatch.',
        error_code: 'CUSTOMER_OR_INVOICE_MISMATCH',
        http_status: 403,
        metadata: {
          provider: 'netsuite',
          environment,
          invoiceNumber,
          customerId,
          customerMatched: returnedCustomerId === customerId,
          invoiceMatched:
            returnedInvoiceNumber.toLowerCase() === invoiceNumber.toLowerCase(),
          emailMatched: returnedEmail === email,
        },
      });

      return json({
        success: false,
        verified: false,
        errorCode: 'CUSTOMER_OR_INVOICE_MISMATCH',
        message: 'The invoice, customer ID, or email does not match.',
      }, 403);
    }

    const rawItems =
      invoice.lineitems ??
      invoice.lineItems ??
      invoice.items ??
      [];

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      await safeLogActivity(env, request, context, {
        category: 'order_verification',
        action: 'verify_assisted_order_failed',
        status: 'warning',
        message: 'No invoice line items were returned by NetSuite.',
        error_code: 'ORDER_NOT_FOUND',
        http_status: 404,
        metadata: {
          provider: 'netsuite',
          environment,
          invoiceNumber: returnedInvoiceNumber,
        },
      });

      return json({
        success: false,
        verified: false,
        errorCode: 'ORDER_NOT_FOUND',
        message: 'No invoice items were found.',
      }, 404);
    }

    const orderId = `netsuite_${returnedInvoiceNumber}`;

    const items = rawItems.map((item, index) => ({
      id: String(
        item.id ??
        item.lineId ??
        item.line ??
        `ns_line_${index + 1}`
      ),
      productId: null,
      variantId: null,
      title: String(
        item.description ??
        item.title ??
        item.name ??
        item.SKU ??
        item.sku ??
        'Item'
      ),
      variantTitle: String(
        item.variantTitle ?? item.variant ?? 'Standard'
      ),
      quantity: Number(item.quantity ?? item.qty ?? 1),
      sku: String(item.SKU ?? item.sku ?? ''),
    }));

    const existingReturn = await env.DB.prepare(`
      SELECT id, return_number, status, created_at
      FROM returns
      WHERE shopify_order_id = ?
        AND shop_domain = ?
        AND status IN ('submitted', 'pending', 'under_review')
      LIMIT 1
    `).bind(orderId, shop).first();

    const orderData = {
      id: orderId,
      orderNumber: returnedInvoiceNumber,
      createdAt:
        invoice.tranDate ??
        invoice.date ??
        invoice.createdDate ??
        invoice.createdAt ??
        null,
      fulfillmentStatus: 'fulfilled',
      items,
    };

    await safeLogActivity(env, request, context, {
      category: 'order_verification',
      action: 'verify_assisted_order_success',
      status: 'success',
      message: `Assisted invoice ${returnedInvoiceNumber} verified via NetSuite.`,
      source: 'customer',
      order_id: orderId,
      order_number: returnedInvoiceNumber,
      metadata: {
        verifiedAt: getUtcNow(),
        provider: 'netsuite',
        environment,
        customerId,
        hasExistingReturn: Boolean(existingReturn),
        returnNumber: existingReturn?.return_number ?? null,
        itemCount: items.length,
      },
    });

    return json({
      success: true,
      verified: true,
      provider: 'netsuite',

      existingReturn: existingReturn
        ? {
            returnId: existingReturn.id,
            returnNumber: existingReturn.return_number,
            status: existingReturn.status,
            statusUrl: `/return-status?returnId=${encodeURIComponent(existingReturn.id)}`,
          }
        : null,

      order: orderData,

      message: existingReturn
        ? 'An active return request is already pending for this invoice.'
        : 'Invoice verified successfully via NetSuite.',
    });
  } catch (error) {
    console.error('[NetSuite Verification Error]:', {
      name: error?.name,
      message: error?.message,
    });

    await safeLogActivity(env, request, context, {
      category: 'order_verification',
      action: 'verify_assisted_order_error',
      status: 'failed',
      message: error?.message || 'NetSuite invoice verification failed.',
      source: 'customer',
      error_code: 'INTERNAL_ERROR',
      http_status: 500,
      metadata: {
        provider: 'netsuite',
        environment,
        invoiceNumber,
      },
    });

    return json({
      success: false,
      verified: false,
      errorCode: 'INTERNAL_ERROR',
      message: 'Failed to verify invoice through NetSuite service.',
    }, 500);
  }
}