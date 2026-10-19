import { decryptToken } from './encryption.js';

export const RETURN_STATUSES = [
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'awaiting_shipment',
  'in_transit',
  'received',
  'refunded',
  'cancelled',
  'closed',
];

export const ACTIVITY_CATEGORIES = [
  'order_verification',
  'return_request',
  'netsuite',
  'shopify_api',
  'admin_action',
  'system',
  'authentication',
];

export const ACTIVITY_STATUSES = ['started', 'success', 'failed', 'warning', 'info'];

export function parseLimit(value, fallback = 20, maximum = 100) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(number, maximum);
}

export function parsePage(value) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number) || number < 1) return 1;
  return Math.min(number, 100000);
}

export function parseItems(value) {
  try {
    const items = typeof value === 'string' ? JSON.parse(value || '[]') : value;
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

/**
- Returns SQL query string to select return details, including customer_email_enc for decryption.
 */

export function getReturnSelect() {
  return `
    SELECT
      id,
      return_number AS returnNumber,
      tenant_id AS tenantId,
      shop_domain AS shopDomain,
      source,
      shopify_order_id AS shopifyOrderId,
      shopify_return_id AS shopifyReturnId,
      order_number AS orderNumber,
      customer_id AS customerId,
      invoice_number AS invoiceNumber,
      customer_email_masked AS customerEmailMasked,
      customer_email_enc AS customerEmailEnc,
      status,
      reason,
      requested_resolution AS requestedResolution,
      condition_json,
      attachments_json,
      customer_note AS customerNote,
      items_json,
      netsuite_return_id AS netsuite_return_id,
      rma_number AS rma_number,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM returns
  `;
}


/**
- Global normalization function that automatically decrypts the customer email 
- if customer_email_enc is present, falling back to the masked email.
 */
export async function normalizeReturn(row, env) {
  let customerEmail = row.customerEmailMasked || 'N/A';

  if (row.customerEmailEnc && env) {
    try {
      customerEmail = await decryptToken(row.customerEmailEnc, env);
    } catch {
      customerEmail = row.customerEmailMasked || 'N/A';
    }
  }

  let condition = {};
  try {
    condition = row.condition_json ? JSON.parse(row.condition_json) : {};
  } catch {
    condition = {};
  }

  let attachments = [];
  try {
    attachments = row.attachments_json ? JSON.parse(row.attachments_json) : [];
  } catch {
    attachments = [];
  }

  let items = [];
  try {
    items = parseItems(row.items_json);
  } catch {
    items = [];
  }

  const { customerEmailEnc, customerEmailMasked, ...rest } = row;

  return {
    ...rest,
    customerEmail,
    condition,
    attachments,
    items,
  };
}