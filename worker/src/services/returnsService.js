import { sha256, encryptToken, maskEmail } from '../utils/encryption.js';
import { getUtcNow } from '../utils/date.js'; 

export function makeReturnNumber() {
  const date = getUtcNow().slice(0, 10).replace(/-/g, ''); 
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  return `RET-${date}-${suffix}`;
}

export async function createReturnInDatabase(
  env,
  installation,
  shop,
  order,
  orderEmail,
  orderItems,
  correlationId,
  reason = '',
  requestedResolution = '',
  condition = {},
  attachmentUrls = [],
  customerNote = '',
  source = 'website',
  customerIdInput = null,
  invoiceNumberInput = null
) {
  const now = getUtcNow(); 
  const shopifyOrderId = String(order.id);
  const normalizedOrderNumber = String(order.name || `#${order.order_number}`);
  const customerId = customerIdInput || (order.customer?.id ? String(order.customer.id) : null);
  const invoiceNumber = invoiceNumberInput || (source === 'assisted' ? normalizedOrderNumber : null);

  const emailHash = orderEmail ? await sha256(orderEmail) : null;
  const emailEnc = orderEmail ? await encryptToken(orderEmail, env) : null;
  const emailMasked = maskEmail(orderEmail);

  const statusToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const statusTokenHash = await sha256(statusToken);

  const returnId = crypto.randomUUID();
  const returnNumber = makeReturnNumber();
  const historyId = crypto.randomUUID();

  const historyMetadata = JSON.stringify({
    source,
    correlationId,
    orderNumber: normalizedOrderNumber,
  });

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO returns (
        id,
        return_number,
        tenant_id,
        shop_domain,
        source,
        shopify_order_id,
        order_number,
        customer_id,
        invoice_number,
        customer_email_hash,
        customer_email_masked,
        customer_email_enc,
        status,
        reason,
        requested_resolution,
        condition_json,
        attachments_json,
        customer_note,
        items_json,
        status_token_hash,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      returnId,
      returnNumber,
      installation.tenant_id,
      shop,
      source, // 'website' or 'assisted'
      shopifyOrderId,
      normalizedOrderNumber,
      customerId,
      invoiceNumber,
      emailHash,
      emailMasked,
      emailEnc,
      reason || null,
      requestedResolution || null,
      JSON.stringify(condition || {}),
      JSON.stringify(attachmentUrls || []),
      customerNote || null,
      JSON.stringify(orderItems || []),
      statusTokenHash,
      now,
      now
    ),

    env.DB.prepare(
      `INSERT INTO return_status_history (
        id, return_id, tenant_id, shop_domain, event_type, previous_status, new_status, message, actor_type, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, 'return_submitted', NULL, 'submitted', ?, 'system', ?, ?)`
    ).bind(
      historyId, 
      returnId, 
      installation.tenant_id, 
      shop, 
      `Return request created via ${source}`, 
      historyMetadata, 
      now
    ),
  ]);

  return {
    id: returnId,
    returnNumber,
    orderNumber: normalizedOrderNumber,
    status: 'submitted',
    reason,
    requestedResolution,
    customerNote,
    items: orderItems,
    createdAt: now,
    statusToken,
  };
}