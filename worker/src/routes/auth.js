import { json } from '../utils/response.js';
import { saveShopInstallation } from './installation.js';

export async function handleAuthCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const shop = url.searchParams.get('shop');

  if (!code || !shop) {
    return json(
      {
        success: false,
        message: 'Missing code or shop parameter',
      },
      400,
    );
  }

  try {
// Step 1: Validate Shopify configuration.
    if (!env.SHOPIFY_API_KEY || !env.SHOPIFY_API_SECRET) {
      throw new Error(
        'Missing Shopify API credentials in Worker environment.',
      );
    }

// Step 2: Exchange authorization code for an access token.
    const accessTokenUrl =
      `https://${shop}/admin/oauth/access_token`;

    const response = await fetch(accessTokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: env.SHOPIFY_API_KEY,
        client_secret: env.SHOPIFY_API_SECRET,
        code,
      }),
    });

    const tokenData = await response.json();

    if (!response.ok) {
      throw new Error(
        `Shopify token exchange failed with HTTP ${response.status}: ${
          tokenData.error_description ||
          tokenData.error ||
          'Unknown error'
        }`,
      );
    }

// Shopify access token; saveShopInstallation handles encryption.
    const accessToken = tokenData.access_token;
    const scopes = tokenData.scope || '';

    if (!accessToken) {
      throw new Error(
        'Failed to obtain access token from Shopify.',
      );
    }

// Step 3: Generate tenant ID.
    const tenantId =
      'tenant_' + shop.replace('.myshopify.com', '');

// Step 4: Save installation.
    await saveShopInstallation(env, {
      shop,
      accessToken,
      tenantId,
      scopes,
    });

// Step 5: Redirect to Shopify Admin.
    const appHandle = env.SHOPIFY_APP_HANDLE || 'netsuite-returns-1';

    const storeName = shop.replace('.myshopify.com', '');
    const appUrl =
      `https://admin.shopify.com/store/${storeName}/apps/${appHandle}`;

    return Response.redirect(appUrl, 302);
  } catch (err) {
    return json(
      {
        success: false,
        message: err.message || 'Internal server error',
      },
      500,
    );
  }
}



// https://app-testing-dfueo47y.myshopify.com/admin/oauth/authorize?client_id=0fee8d770cf615d823922004e280522f&scope=read_orders,read_customers,write_orders,write_returns,read_merchant_managed_fulfillment_orders&redirect_uri=https%3A%2F%2Fshopify-netsuite-returns-worker.holy-waterfall-8e46.workers.dev%2Fapi%2Fauth%2Fcallback
