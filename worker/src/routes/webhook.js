import { json } from '../utils/response.js';

export async function handleAppUninstalled(request, env) {
  if (request.method !== 'POST') {
    return json({ success: false, message: 'Method not allowed' }, 405);
  }

  try {
  
    const shopDomain = request.headers.get('X-Shopify-Shop-Domain');

    if (!shopDomain) {
      return json({ success: false, message: 'Missing Shopify shop header' }, 400);
    }

 
    await env.DB.prepare(`
      UPDATE shop_installations 
      SET 
        installation_status = 'uninstalled',
        uninstalled_at = datetime('now'),
        updated_at = datetime('now')
      WHERE shop_domain = ?
    `).bind(shopDomain).run();

    console.log(`[Webhook] App uninstalled successfully for shop: ${shopDomain}`);
    return new Response('Webhook processed successfully', { status: 200 });

  } catch (err) {
    console.error('[Webhook Uninstalled Error]:', err);
    return json({ success: false, message: err.message || 'Internal server error' }, 500);
  }
}