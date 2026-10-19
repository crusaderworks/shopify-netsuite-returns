


import { decryptToken } from '../utils/encryption.js';

const NETSUITE_TIMEOUT_MS = 20000;

/**
 * Sync a return with NetSuite when required.
 *
 * Website returns: no NetSuite RMA creation.
 * Assisted returns: create an RMA only when approved.
 * The controller saves netsuiteReturnId and rmaNumber to D1.
 */
export async function syncReturnStatus({
  env,
  shop,
  tenantId,
  returnId,
  newStatus,
  returnSource,
}) {
  if (!env?.DB) {
    throw new Error('Database binding env.DB is not configured.');
  }

  if (!returnId || !tenantId) {
    throw new Error('Return ID and tenant ID are required.');
  }

  const shopDomain = getShopDomain(shop);

  if (!shopDomain) {
    throw new Error('Shop domain is required.');
  }

  // 1. Fetch the return request for this store and tenant.
  const returnRow = await env.DB.prepare(`
    SELECT
      id,
      tenant_id,
      shop_domain,
      source,
      return_number,
      order_number,
      invoice_number,
      customer_id,
      reason,
      customer_note,
      items_json,
      netsuite_return_id,
      rma_number
    FROM returns
    WHERE id = ?
      AND tenant_id = ?
      AND shop_domain = ?
    LIMIT 1
  `)
    .bind(returnId, tenantId, shopDomain)
    .first();

  if (!returnRow) {
    throw new Error(
      'Return request not found for this store and tenant.',
    );
  }

  const source = String(
    returnSource || returnRow.source || '',
  )
    .trim()
    .toLowerCase();

  const status = String(newStatus || '')
    .trim()
    .toLowerCase();

  // 2. Website returns are handled locally.
  if (source === 'website') {
    return {
      success: true,
      source: 'website',
      synced: false,
      netsuiteReturnId: returnRow.netsuite_return_id || null,
      rmaNumber: returnRow.rma_number || null,
      message: 'Website return handled locally.',
    };
  }

  if (source !== 'assisted') {
    throw new Error(
      `Unsupported return source: ${source || 'missing'}`,
    );
  }

  // 3. Only create an RMA when the return is approved.
  if (status !== 'approved') {
    return {
      success: true,
      source: 'assisted',
      synced: false,
      netsuiteReturnId: returnRow.netsuite_return_id || null,
      rmaNumber: returnRow.rma_number || null,
      message: 'NetSuite RMA creation is only performed on approval.',
    };
  }

  // 4. Avoid creating a duplicate when the ID has already been saved.
  if (returnRow.netsuite_return_id) {
    return {
      success: true,
      source: 'assisted',
      synced: true,
      netsuiteReturnId: String(returnRow.netsuite_return_id),
      rmaNumber: returnRow.rma_number || null,
      message: 'NetSuite RMA already exists.',
    };
  }

  // 5. Select the configured NetSuite environment.
  const environment = String(
    env.NETSUITE_ENVIRONMENT || 'sandbox',
  )
    .trim()
    .toLowerCase();

  if (!['sandbox', 'live'].includes(environment)) {
    throw new Error(
      `Invalid NetSuite environment "${environment}". Use sandbox or live.`,
    );
  }

  // 6. Load configuration for this store, tenant and environment.
  const config = await env.DB.prepare(`
    SELECT *
    FROM netsuite_configs
    WHERE shop_domain = ?
      AND environment = ?
      AND tenant_id = ?
    LIMIT 1
  `)
    .bind(shopDomain, environment, tenantId)
    .first();

  if (!config) {
    throw new Error(
      `NetSuite ${environment} configuration was not found for ${shopDomain}.`,
    );
  }

  if (config.connection_status !== 'connected') {
    throw new Error(
      `NetSuite ${environment} connection is not connected.`,
    );
  }

  // 7. Respect the automatic-sync setting.
  if (Number(config.auto_sync_on_approval) !== 1) {
    return {
      success: true,
      source: 'assisted',
      synced: false,
      netsuiteReturnId: returnRow.netsuite_return_id || null,
      rmaNumber: returnRow.rma_number || null,
      message: 'Automatic NetSuite sync is disabled.',
    };
  }

  // 8. Validate the configured RESTlet endpoint.
  const endpoint = String(config.rma_creation_url || '').trim();

  if (!endpoint) {
    throw new Error(
      `rma_creation_url is missing in the ${environment} configuration.`,
    );
  }

  validateNetSuiteEndpoint(endpoint);

  // 9. Validate OAuth credentials.
  if (
    !config.account_id ||
    !config.consumer_key ||
    !config.token_id ||
    !config.consumer_secret_enc ||
    !config.token_secret_enc
  ) {
    throw new Error(
      'NetSuite OAuth credentials are incomplete in the configuration.',
    );
  }

  const consumerSecret = await decryptToken(
    config.consumer_secret_enc,
    env,
  );

  const tokenSecret = await decryptToken(
    config.token_secret_enc,
    env,
  );

  if (!consumerSecret || !tokenSecret) {
    throw new Error(
      'Unable to decrypt NetSuite OAuth credentials.',
    );
  }

  // 10. Normalize invoice number and validate return items.
  const invoiceNumber = normalizeInvoiceNumber(
    returnRow.invoice_number || returnRow.order_number,
  );

  if (!invoiceNumber) {
    throw new Error(
      'Invoice number is missing. Cannot create a NetSuite RMA.',
    );
  }

  const returnedItems = parseReturnedItems(returnRow.items_json);

  if (returnedItems.length === 0) {
    throw new Error('No return items were found for this request.');
  }

  // 11. Resolve the customer's reason to the NetSuite value.
  const netSuiteReason = await resolveNetSuiteReason({
    env,
    shopDomain,
    tenantId,
    reason: returnRow.reason,
  });

  const notes =
    String(returnRow.customer_note || '').trim() ||
    `Customer RMA for Invoice ${invoiceNumber} (${netSuiteReason})`;

  // 12. Build the payload expected by the NetSuite RESTlet.
  const payload = {
    InvoiceNumber: invoiceNumber,
    Return_reason: netSuiteReason,
    RMA_notes: notes,
    Returned_items: returnedItems,
  };

  if (
    returnRow.customer_id !== null &&
    returnRow.customer_id !== undefined &&
    String(returnRow.customer_id).trim() !== ''
  ) {
    payload.CustomerNumber = String(returnRow.customer_id).trim();
  }

  // 13. Generate the OAuth 1.0a HMAC-SHA256 header.
  const authorization = await createNetSuiteOAuthHeader({
    endpoint,
    accountId: config.account_id,
    consumerKey: config.consumer_key,
    consumerSecret: String(consumerSecret),
    tokenId: config.token_id,
    tokenSecret: String(tokenSecret),
  });

  // 14. Send the RMA creation request.
  let response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(NETSUITE_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(
      `NetSuite RMA request failed: ${error?.message || 'Network error'}`,
    );
  }

  const responseText = await response.text();

  let result;

  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error(
      `NetSuite returned invalid JSON (HTTP ${response.status}): ` +
        responseText.slice(0, 500),
    );
  }

  if (!response.ok) {
    const details =
      result?.message ||
      result?.error?.message ||
      result?.error ||
      responseText.slice(0, 500);

    throw new Error(
      `NetSuite RMA request failed (HTTP ${response.status}): ${String(details)}`,
    );
  }

  if (
    result?.success === false ||
    String(result?.status || '').toLowerCase() === 'error'
  ) {
    throw new Error(
      `NetSuite rejected the RMA request: ${
        result?.message ||
        result?.error?.message ||
        'Unknown NetSuite error'
      }`,
    );
  }

  // 15. Extract both the internal ID and display RMA number.
  const rmaDetails = extractNetSuiteReturnDetails(result);

  if (!rmaDetails.id) {
    throw new Error(
      'NetSuite responded without an identifiable RMA ID. Response: ' +
        responseText.slice(0, 1000),
    );
  }

  return {
    success: true,
    source: 'assisted',
    synced: true,
    // Prefer the internal ID for the database reference.
    netsuiteReturnId: rmaDetails.id,
    rmaNumber: rmaDetails.number,
    rmaInternalId: rmaDetails.internalId,
    message: 'NetSuite RMA created successfully.',
  };
}

/**
 * Accept a shop domain string or shop object.
 */
function getShopDomain(shop) {
  if (typeof shop === 'string') {
    return shop.trim().toLowerCase();
  }

  if (shop && typeof shop === 'object') {
    return String(
      shop.shop_domain ||
        shop.shopDomain ||
        shop.domain ||
        shop.myshopifyDomain ||
        '',
    )
      .trim()
      .toLowerCase();
  }

  return '';
}

/**
 * PHP-compatible invoice normalization:
 * - Keep an existing INV prefix.
 * - Prefix INV only when the invoice is numeric.
 * - Leave other invoice formats unchanged.
 */
function normalizeInvoiceNumber(value) {
  const invoice = String(value ?? '').trim();

  if (!invoice) {
    return '';
  }

  if (/^INV/i.test(invoice)) {
    return invoice;
  }

  if (/^\d+$/.test(invoice)) {
    return `INV${invoice}`;
  }

  return invoice;
}

/**
 * Convert saved items to the RESTlet payload format.
 */
function parseReturnedItems(itemsJson) {
  let items;

  try {
    items =
      typeof itemsJson === 'string'
        ? JSON.parse(itemsJson || '[]')
        : itemsJson;
  } catch {
    throw new Error('Return items contain invalid JSON.');
  }

  if (!Array.isArray(items)) {
    throw new Error('Return items must be an array.');
  }

  return items.map((item, index) => {
    const sku = String(
      item?.sku ||
        item?.SKU ||
        item?.product_id ||
        '',
    ).trim();

    const rawQuantity = item?.quantity ?? item?.Quantity ?? 1;
    const quantity = Number.parseInt(rawQuantity, 10);

    if (!sku) {
      throw new Error(`SKU is missing for return item ${index + 1}.`);
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(
        `Invalid quantity for return item ${index + 1}.`,
      );
    }

    return {
      SKU: sku,
      Quantity: quantity,
    };
  });
}

/**
 * Resolve the customer-facing reason using return_portal_config.
 * The "value" field is the value sent to NetSuite.
 */
async function resolveNetSuiteReason({
  env,
  shopDomain,
  tenantId,
  reason,
}) {
  const suppliedReason = String(reason || '').trim();

  if (!suppliedReason) {
    return mapReturnReason('');
  }

  // Match both label and value, scoped to this tenant and shop.
  // A submitted return may reference a reason deactivated later.
  const configuredReason = await env.DB.prepare(`
    SELECT label, value
    FROM return_portal_config
    WHERE shop_domain = ?
      AND tenant_id = ?
      AND config_type = 'reason'
      AND (
        LOWER(TRIM(label)) = LOWER(TRIM(?))
        OR LOWER(TRIM(value)) = LOWER(TRIM(?))
      )
    ORDER BY
      CASE
        WHEN LOWER(TRIM(value)) = LOWER(TRIM(?)) THEN 0
        ELSE 1
      END,
      sort_order ASC
    LIMIT 1
  `)
    .bind(
      shopDomain,
      tenantId,
      suppliedReason,
      suppliedReason,
      suppliedReason,
    )
    .first();

  if (configuredReason?.value) {
    return String(configuredReason.value).trim();
  }

  // Backward-compatible fallback for existing saved returns.
  return mapReturnReason(suppliedReason);
}

/**
 * Map known return reasons to NetSuite's accepted reason values.
 */
function mapReturnReason(reason) {
  const normalized = String(reason || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

  const exactMappings = {
    'customer ordered incorrect item (return for credit)':
      'Customer Ordered Incorrect Item (Return for Credit)',

    'damaged or missing product':
      'Damaged or Missing Product',

    'received incorrect product (return for credit)':
      'Received Incorrect Product (Return for Credit)',

    'received incorrect product (return for credit)(warehouse)':
      'Received Incorrect Product (Return for Credit)',

    'warranty repair (defective part)':
      'Warranty Repair (Defective Part)',

    'non-warranty repair':
      'Non-Warranty Repair',

    'duplicate shipment':
      'Duplicate Shipment',

    'items without label':
      'Items Without Label',

    'wrong customer':
      'Wrong Customer',
  };

  if (exactMappings[normalized]) {
    return exactMappings[normalized];
  }

  if (
    normalized.includes('damag') ||
    normalized.includes('miss') ||
    normalized.includes('transit')
  ) {
    return 'Damaged or Missing Product';
  }

  if (
    normalized.includes('wrong item') ||
    normalized.includes('incorrect product')
  ) {
    return 'Received Incorrect Product (Return for Credit)';
  }

  if (
    normalized.includes('defect') ||
    normalized.includes('work') ||
    normalized.includes('warranty')
  ) {
    return 'Warranty Repair (Defective Part)';
  }

  if (normalized.includes('repair')) {
    return 'Non-Warranty Repair';
  }

  if (normalized.includes('duplicate')) {
    return 'Duplicate Shipment';
  }

  if (normalized.includes('label')) {
    return 'Items Without Label';
  }

  if (
    normalized.includes('customer') &&
    normalized.includes('wrong')
  ) {
    return 'Wrong Customer';
  }

  return 'Customer Ordered Incorrect Item (Return for Credit)';
}

/**
 * Validate the configured NetSuite RESTlet endpoint.
 */
function validateNetSuiteEndpoint(endpoint) {
  let url;

  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('The configured NetSuite RMA URL is invalid.');
  }

  if (url.protocol !== 'https:') {
    throw new Error('The NetSuite RMA endpoint must use HTTPS.');
  }

  if (!url.hostname.endsWith('.restlets.api.netsuite.com')) {
    throw new Error(
      'The configured RMA URL is not a valid NetSuite RESTlet host.',
    );
  }

  if (!url.pathname.includes('/app/site/hosting/restlet.nl')) {
    throw new Error(
      'The configured RMA URL does not point to a NetSuite RESTlet.',
    );
  }
}

/**
 * Build a NetSuite OAuth 1.0a HMAC-SHA256 Authorization header.
 */
async function createNetSuiteOAuthHeader({
  endpoint,
  accountId,
  consumerKey,
  consumerSecret,
  tokenId,
  tokenSecret,
}) {
  const url = new URL(endpoint);

  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: createNonce(),
    oauth_signature_method: 'HMAC-SHA256',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: tokenId,
    oauth_version: '1.0',
  };

  // Include URL query parameters such as script and deploy in the signature.
  const signatureParams = [];

  for (const [key, value] of url.searchParams.entries()) {
    signatureParams.push([key, value]);
  }

  for (const [key, value] of Object.entries(oauthParams)) {
    signatureParams.push([key, value]);
  }

  signatureParams.sort((a, b) => {
    const keyComparison = oauthEncode(a[0]).localeCompare(
      oauthEncode(b[0]),
    );

    if (keyComparison !== 0) {
      return keyComparison;
    }

    return oauthEncode(a[1]).localeCompare(oauthEncode(b[1]));
  });

  const normalizedParams = signatureParams
    .map(([key, value]) => `${oauthEncode(key)}=${oauthEncode(value)}`)
    .join('&');

  const baseUrl = `${url.protocol}//${url.host}${url.pathname}`;

  const signatureBaseString = [
    'POST',
    oauthEncode(baseUrl),
    oauthEncode(normalizedParams),
  ].join('&');

  const signingKey =
    `${oauthEncode(consumerSecret)}&${oauthEncode(tokenSecret)}`;

  oauthParams.oauth_signature = await hmacSha256Base64(
    signingKey,
    signatureBaseString,
  );

  const headerParams = Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, value]) => `${oauthEncode(key)}="${oauthEncode(value)}"`,
    )
    .join(', ');

  return `OAuth realm="${oauthEncode(
    String(accountId).toUpperCase(),
  )}", ${headerParams}`;
}

function oauthEncode(value) {
  return encodeURIComponent(String(value)).replace(
    /[!'()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function createNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function hmacSha256Base64(key, message) {
  const encoder = new TextEncoder();

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(message),
  );

  return bytesToBase64(new Uint8Array(signature));
}

function bytesToBase64(bytes) {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

/**
 * Extract both the NetSuite internal ID and display RMA number.
 * Supports ReturnAuthorizationInternalId and ReturnAuthorizationNumber.
 */
function extractNetSuiteReturnDetails(result) {
  if (result === null || result === undefined) {
    return {
      id: null,
      number: null,
      internalId: null,
    };
  }

  if (typeof result === 'string' || typeof result === 'number') {
    const value = String(result).trim();

    return {
      id: value || null,
      number: null,
      internalId: null,
    };
  }

  const internalIdKeys = [
    'ReturnAuthorizationInternalId',
    'returnAuthorizationInternalId',
    'return_authorization_internal_id',
    'netsuite_return_id',
    'netsuiteReturnId',
    'rma_internal_id',
    'rmaInternalId',
    'internalid',
    'internalId',
    'InternalID',
    'recordId',
  ];

  const numberKeys = [
    'ReturnAuthorizationNumber',
    'returnAuthorizationNumber',
    'return_authorization_number',
    'rma_number',
    'rmaNumber',
    'RMA_number',
    'RMA_Number',
  ];

  const findValue = (object, keys) => {
    for (const key of keys) {
      const value = object[key];

      if (
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ''
      ) {
        return String(value).trim();
      }
    }

    return null;
  };

  const internalId = findValue(result, internalIdKeys);
  const number = findValue(result, numberKeys);

  // Prefer the internal ID for the database reference.
  const id = internalId || number;

  if (id) {
    return {
      id,
      number,
      internalId,
    };
  }

  // Support nested response formats as well.
  for (const key of ['data', 'result', 'rma', 'record']) {
    if (result[key] && typeof result[key] === 'object') {
      const nested = extractNetSuiteReturnDetails(result[key]);

      if (nested.id) {
        return nested;
      }
    }
  }

  return {
    id: null,
    number: null,
    internalId: null,
  };
}
