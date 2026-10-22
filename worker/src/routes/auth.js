import { json } from '../utils/response.js';
import { saveShopInstallation } from './installation.js';

export async function handleAuthCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  let shop = url.searchParams.get('shop');

  if (!code || !shop) {
    return json(
      { success: false, message: 'Missing code or shop parameter' },
      400,
    );
  }

  // 1. Strict validation: Reject any weird/garbage shop names immediately to avoid Cloudflare 1016 error
  shop = shop.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!shop || !shop.endsWith('.myshopify.com') || shop.includes(' ')) {
    console.error('[Security Warning] Invalid shop parameter detected:', shop);
    return json(
      { success: false, message: 'Invalid shop domain provided.' },
      400,
    );
  }

  try {
    if (!env.SHOPIFY_API_KEY || !env.SHOPIFY_API_SECRET) {
      throw new Error('Missing Shopify API credentials in Worker environment.');
    }

    const accessTokenUrl = `https://${shop}/admin/oauth/access_token`;

    const response = await fetch(accessTokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: env.SHOPIFY_API_KEY,
        client_secret: env.SHOPIFY_API_SECRET,
        code,
      }),
    });

    const responseText = await response.text();
    let tokenData;
    
    try {
      tokenData = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error(`Shopify returned non-JSON response (HTTP ${response.status}): ${responseText}`);
    }

    if (!response.ok) {
      const errorMessage = tokenData.error_description || tokenData.error || 'Unknown error';
      
      // Handle duplicate/re-used authorization code gracefully
      if (errorMessage.includes('authorization code was not found or was already used')) {
        const appHandle = env.SHOPIFY_APP_HANDLE || 'netsuite-returns-2';
        const storeName = shop.replace('.myshopify.com', '');
        const appUrl = `https://admin.shopify.com/store/${storeName}/apps/${appHandle}`;
        return Response.redirect(appUrl, 302);
      }

      throw new Error(`Shopify token exchange failed: ${errorMessage}`);
    }

    const accessToken = tokenData.access_token;
    const scopes = tokenData.scope || '';

    if (!accessToken) {
      throw new Error('Failed to obtain access token from Shopify response.');
    }

    const tenantId = 'tenant_' + shop.replace('.myshopify.com', '');

    // Save token securely to database
    await saveShopInstallation(env, {
      shop,
      accessToken,
      tenantId,
      scopes,
    });

    // Redirect to Shopify Admin App page
    const appHandle = env.SHOPIFY_APP_HANDLE || 'netsuite-returns-2';
    const storeName = shop.replace('.myshopify.com', '');
    const appUrl = `https://admin.shopify.com/store/${storeName}/apps/${appHandle}`;

    return Response.redirect(appUrl, 302);
  } catch (err) {
    console.error('[Auth Callback Error]:', err.message);
    return json(
      {
        success: false,
        message: err.message || 'Internal server error',
      },
      500,
    );
  }
}
// https://app-testing-dfueo47y.myshopify.com/admin/oauth/authorize?client_id=17dd48865c798b27b8c24080faea3ca9&scope=read_orders,read_customers,write_orders,write_returns,read_merchant_managed_fulfillment_orders&redirect_uri=https%3A%2F%2Fshopify-netsuite-returns-worker.holy-waterfall-8e46.workers.dev%2Fapi%2Fauth%2Fcallback


// https://app-testing-dfueo47y.myshopify.com/admin/oauth/authorize?client_id=0fee8d770cf615d823922004e280522f&scope=read_orders,read_customers,write_orders,write_returns,read_merchant_managed_fulfillment_orders&redirect_uri=https://cart-simulations-martha-converter.trycloudflare.com%2Fapi%2Fauth%2Fcallback