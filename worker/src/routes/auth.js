import { json } from '../utils/response.js';
import { saveShopInstallation } from './installation.js';

export async function handleAuthCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const shop = url.searchParams.get('shop');

  if (!code || !shop) {
    return json({ success: false, message: 'Missing code or shop parameter' }, 400);
  }

  try {
    
    const accessTokenUrl = `https://${shop}/admin/oauth/access_token`;
    const response = await fetch(accessTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env.SHOPIFY_API_KEY,
        client_secret: env.SHOPIFY_API_SECRET,
        code,
      }),
    });

    const tokenData = await response.json();
    const accessToken = tokenData.access_token;
    const scopes = tokenData.scope || '';

    if (!accessToken) {
      throw new Error('Failed to obtain access token from Shopify.');
    }

   
    const tenantId = 'tenant_' + shop.replace('.myshopify.com', '');


    await saveShopInstallation(env, {
      shop,
      accessToken,
      tenantId,
      scopes,
    });

    console.log(`[OAuth] Successfully installed for tenant & shop: ${shop}`);

    
    const appUrl = `https://admin.shopify.com/store/${shop.replace('.myshopify.com', '')}/apps/${env.SHOPIFY_APP_HANDLE}`;
    return Response.redirect(appUrl, 302);

  } catch (err) {
    console.error('[OAuth Callback Error]:', err);
    return json({ success: false, message: err.message }, 500);
  }
}