import { decryptToken } from '../../utils/encryption.js';

const SHOPIFY_TIMEOUT_MS = 20000;

function toOrderGid(value) {
  const id = String(value ?? '').trim();

  if (!id) {
    throw new Error('Shopify order ID is missing from the return request.');
  }

  return id.startsWith('gid://')
    ? id
    : `gid://shopify/Order/${id}`;
}

function toLineItemGid(value) {
  const id = String(value ?? '').trim();

  if (!id) {
    return '';
  }

  return id.startsWith('gid://')
    ? id
    : `gid://shopify/LineItem/${id}`;
}

function parseItems(itemsJson) {
  let items;

  try {
    items =
      typeof itemsJson === 'string'
        ? JSON.parse(itemsJson || '[]')
        : itemsJson;
  } catch {
    throw new Error('Return items contain invalid JSON.');
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('No return items were found for this request.');
  }

  return items;
}

async function shopifyGraphQL({
  shop,
  accessToken,
  query,
  variables = {},
  env,
}) {
  const apiVersion = String(
    env.SHOPIFY_API_VERSION || '2026-04',
  ).trim();

  const endpoint =
    `https://${shop}/admin/api/${apiVersion}/graphql.json`;

  let response;

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(
      `Shopify API request failed: ${error?.message || 'Network error'}`,
    );
  }

  const responseText = await response.text();

  let result;

  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error(
      `Shopify returned invalid JSON (HTTP ${response.status}).`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Shopify API failed (HTTP ${response.status}): ${
        result?.errors?.[0]?.message ||
        responseText.slice(0, 500)
      }`,
    );
  }

  if (Array.isArray(result.errors) && result.errors.length) {
    throw new Error(
      `Shopify GraphQL error: ${result.errors
        .map((item) => item.message)
        .join('; ')}`,
    );
  }

  return result.data;
}

async function getShopifyAccessToken({
  env,
  shop,
  tenantId,
}) {
  const installation = await env.DB.prepare(`
    SELECT access_token_enc, installation_status
    FROM shop_installations
    WHERE shop_domain = ?
      AND tenant_id = ?
    LIMIT 1
  `)
    .bind(shop, tenantId)
    .first();

  if (!installation) {
    throw new Error(
      `Shopify installation was not found for ${shop}.`,
    );
  }

  if (
    installation.installation_status &&
    installation.installation_status !== 'active'
  ) {
    throw new Error(
      `Shopify installation is not active for ${shop}.`,
    );
  }

  if (!installation.access_token_enc) {
    throw new Error('Shopify access token is missing.');
  }

  const accessToken = await decryptToken(
    installation.access_token_enc,
    env,
  );

  if (!accessToken) {
    throw new Error('Unable to decrypt the Shopify access token.');
  }

  return String(accessToken);
}

async function getOrderAndFulfillmentLineItems({
  env,
  shop,
  accessToken,
  orderId,
}) {
  const query = `
    query ReturnApprovalOrder($id: ID!) {
      order(id: $id) {
        id
        name
        note
        tags
        fulfillments {
          id
          status
          fulfillmentLineItems(first: 250) {
            nodes {
              id
              quantity
              lineItem {
                id
              }
            }
          }
        }
      }
    }
  `;

  const data = await shopifyGraphQL({
    env,
    shop,
    accessToken,
    query,
    variables: { id: orderId },
  });

  if (!data?.order) {
    throw new Error(`Shopify order not found: ${orderId}`);
  }

  const fulfillmentLineItems = [];

  for (const fulfillment of data.order.fulfillments || []) {
    for (const line of fulfillment.fulfillmentLineItems?.nodes || []) {
      if (line?.id && line?.lineItem?.id) {
        fulfillmentLineItems.push({
          fulfillmentLineItemId: line.id,
          lineItemId: line.lineItem.id,
          quantity: Number(line.quantity || 0),
        });
      }
    }
  }

  return {
    order: data.order,
    fulfillmentLineItems,
  };
}

function buildReturnLineItems(items, fulfillmentLineItems, fallbackNote = '') {
  const result = [];

  for (const item of items) {
    const rawLineItemId =
      item?.lineItemId ??
      item?.line_item_id ??
      item?.lineItem?.id;

    const lineItemGid = toLineItemGid(rawLineItemId);
    const quantity = Number.parseInt(item?.quantity, 10);

    if (!lineItemGid) {
      throw new Error(
        'A return item is missing its Shopify line item ID.',
      );
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(
        `Invalid return quantity for line item ${lineItemGid}.`,
      );
    }

    const matchingFulfillmentLines = fulfillmentLineItems.filter(
      (line) => line.lineItemId === lineItemGid,
    );

    if (matchingFulfillmentLines.length === 0) {
      throw new Error(
        `No fulfilled Shopify line item was found for ${lineItemGid}.`,
      );
    }

    let remainingQuantity = quantity;

    for (const line of matchingFulfillmentLines) {
      if (remainingQuantity <= 0) break;

      const takeQuantity = Math.min(
        remainingQuantity,
        line.quantity,
      );

      if (takeQuantity <= 0) continue;

      const returnReasonNote = String(
        item?.reason || item?.customerNote || fallbackNote || ''
      ).trim() || 'Return requested from NetSuite Returns app';

      result.push({
        fulfillmentLineItemId: line.fulfillmentLineItemId,
        quantity: takeQuantity,
        returnReason: 'OTHER',
        returnReasonNote,
      });

      remainingQuantity -= takeQuantity;
    }

    if (remainingQuantity > 0) {
      throw new Error(
        `Requested return quantity exceeds the fulfilled quantity ` +
        `for line item ${lineItemGid}.`,
      );
    }
  }

  return result;
}

async function createShopifyReturn({
  env,
  shop,
  accessToken,
  orderId,
  returnLineItems,
  customerNote,
}) {
  const mutation = `
    mutation CreateShopifyReturn($returnInput: ReturnInput!) {
      returnCreate(returnInput: $returnInput) {
        return {
          id
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL({
    env,
    shop,
    accessToken,
    query: mutation,
    variables: {
      returnInput: {
        orderId,
        returnLineItems: returnLineItems.map((item) => ({
          fulfillmentLineItemId: item.fulfillmentLineItemId,
          quantity: item.quantity,
          returnReason: item.returnReason,
          ...(item.returnReasonNote
            ? { returnReasonNote: item.returnReasonNote }
            : {}),
        })),
        ...(customerNote ? { notifyCustomer: false } : {}),
      },
    },
  });

  const result = data?.returnCreate;
  const userErrors = result?.userErrors || [];

  if (userErrors.length) {
    throw new Error(
      `Shopify return creation failed: ${userErrors
        .map((item) => item.message)
        .join('; ')}`,
    );
  }

  if (!result?.return?.id) {
    throw new Error(
      'Shopify did not return a return ID after creation.',
    );
  }

  return {
    id: result.return.id,
    status: result.return.status || null,
  };
}

async function updateShopifyOrder({
  env,
  shop,
  accessToken,
  order,
  returnRow,
  shopifyReturnId,
}) {
  const tag = 'Return Approved';
  const existingTags = Array.isArray(order.tags) ? order.tags : [];
  const tagsToAdd = existingTags.includes(tag) ? [] : [tag];

  const noteParts = [
    String(order.note || '').trim(),
    `Return approved in NetSuite Returns app: ${returnRow.return_number || returnRow.id}`,
    `Shopify Return ID: ${shopifyReturnId}`,
  ].filter(Boolean);

  const note = [...new Set(noteParts)].join('\n');

  if (note !== String(order.note || '').trim()) {
    const mutation = `
      mutation UpdateOrderNote($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
            note
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const data = await shopifyGraphQL({
      env,
      shop,
      accessToken,
      query: mutation,
      variables: {
        input: {
          id: order.id,
          note,
        },
      },
    });

    const result = data?.orderUpdate;
    const userErrors = result?.userErrors || [];

    if (userErrors.length) {
      throw new Error(
        `Shopify order note update failed: ${userErrors
          .map((item) => item.message)
          .join('; ')}`,
      );
    }
  }

  if (tagsToAdd.length) {
    const mutation = `
      mutation AddOrderTags($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) {
          userErrors {
            field
            message
          }
        }
      }
    `;

    const data = await shopifyGraphQL({
      env,
      shop,
      accessToken,
      query: mutation,
      variables: {
        id: order.id,
        tags: tagsToAdd,
      },
    });

    const userErrors = data?.tagsAdd?.userErrors || [];

    if (userErrors.length) {
      throw new Error(
        `Shopify order tag update failed: ${userErrors
          .map((item) => item.message)
          .join('; ')}`,
      );
    }
  }
}

/**
- Called when a website return is approved.
- Assisted returns must continue through the existing NetSuite flow.
 */
export async function approveShopifyWebsiteReturn({
  env,
  shop,
  tenantId,
  returnRow,
}) {
  if (!env?.DB) {
    throw new Error('Database binding env.DB is not configured.');
  }

  const shopDomain = String(shop || returnRow?.shop_domain || '')
    .trim()
    .toLowerCase();

  if (!shopDomain || !tenantId || !returnRow?.id) {
    throw new Error(
      'Shop domain, tenant ID, and return ID are required.',
    );
  }

  if (String(returnRow.source || '').toLowerCase() !== 'website') {
    throw new Error(
      'Shopify return creation is only supported for website returns.',
    );
  }

  const accessToken = await getShopifyAccessToken({
    env,
    shop: shopDomain,
    tenantId,
  });

  const orderId = toOrderGid(returnRow.shopify_order_id);

  // Always load the order, including on retries, so order notes/tags
  // can be retried if the Shopify return was already created.
  const { order, fulfillmentLineItems } =
    await getOrderAndFulfillmentLineItems({
      env,
      shop: shopDomain,
      accessToken,
      orderId,
    });

  let shopifyReturnId = returnRow.shopify_return_id || null;
  let shopifyReturnStatus = null;

  if (!shopifyReturnId) {
    const items = parseItems(returnRow.items_json);

    const returnLineItems = buildReturnLineItems(
      items,
      fulfillmentLineItems,
      returnRow.customer_note,
    );

    const createdReturn = await createShopifyReturn({
      env,
      shop: shopDomain,
      accessToken,
      orderId,
      returnLineItems,
      customerNote: String(returnRow.customer_note || '').trim(),
    });

    shopifyReturnId = createdReturn.id;
    shopifyReturnStatus = createdReturn.status;

    // Save the ID immediately to prevent duplicate return creation
    // if the subsequent order note/tag update fails.
    await env.DB.prepare(`
      UPDATE returns
      SET shopify_return_id = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND tenant_id = ?
        AND shop_domain = ?
        AND source = 'website'
    `)
      .bind(
        shopifyReturnId,
        returnRow.id,
        tenantId,
        shopDomain,
      )
      .run();
  }

  // Run this on retries too: note/tag failures should be recoverable.
  await updateShopifyOrder({
    env,
    shop: shopDomain,
    accessToken,
    order,
    returnRow,
    shopifyReturnId,
  });

  return {
    success: true,
    source: 'website',
    synced: true,
    shopifyReturnId,
    shopifyReturnStatus,
    message: 'Shopify return approval sync completed.',
  };
}