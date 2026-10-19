import { fetchShopify } from './client.js';

export function cleanOrderNumber(value) {
  return String(value ?? '').trim().replace(/^#/, '');
}


export async function checkShopifyScopes(shop, accessToken, env) {
  if (!shop || !accessToken) {
    return { success: false, status: 400, scopes: [], error: 'Missing shop or access token' };
  }
  
  return { success: true, status: 200, scopes: ['read_orders', 'read_customers'] };
}

export async function getShopifyOrderByNumber(shop, accessToken, orderNumber, env) {
  const cleanNumber = cleanOrderNumber(orderNumber);
  if (!shop || !accessToken || !cleanNumber) {
    throw new Error('Missing shop domain, access token, or order number.');
  }

  const fields = [
    'id', 'name', 'order_number', 'email', 'contact_email',
    'customer', 'billing_address', 'created_at',
    'display_fulfillment_status', 'line_items', 'cancelled_at'
  ].join(',');

  const endpoint = `orders.json?status=any&limit=250&name=${encodeURIComponent(`#${cleanNumber}`)}&fields=${fields}`;
  const data = await fetchShopify(shop, accessToken, endpoint, env);
  const orders = Array.isArray(data.orders) ? data.orders : [];

  return orders.find((item) => {
    const name = cleanOrderNumber(item.name);
    return name === cleanNumber || String(item.order_number) === cleanNumber;
  }) || null;
}