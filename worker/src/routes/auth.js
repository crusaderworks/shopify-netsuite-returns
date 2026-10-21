
import { json } from '../utils/response.js';
import { saveShopInstallation } from './installation.js';

export async function handleAuthCallback(request, env) {
  const url = new URL(request.url);

  const code = url.searchParams.get('code');
  const shop = url.searchParams.get('shop');
  const receivedHmac = url.searchParams.get('hmac');

  // Step 1: Validate required parameters.
  if (!code || !shop || !receivedHmac) {
    return json(
      {
        success: false,
        message: 'Missing code, shop, or hmac parameter.',
      },
      400,
    );
  }

  // Validate shop domain before using it in a URL.
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)
  ) {
    return json(
      {
        success: false,
        message: 'Invalid Shopify shop domain.',
      },
      400,
    );
  }

  try {
    // Step 2: Validate Shopify credentials.
    if (!env.SHOPIFY_API_KEY || !env.SHOPIFY_API_SECRET) {
      throw new Error(
        'Missing Shopify API credentials in Worker environment.',
      );
    }

    // Step 3: Exchange authorization code for an access token.
    const accessTokenUrl =
      `https://${shop}/admin/oauth/access_token`;

    const response = await fetch(accessTokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: env.SHOPIFY_API_KEY,
        client_secret: env.SHOPIFY_API_SECRET,
        code,
      }),
    });

    // Read the response once so HTML errors do not cause
    // an unexpected JSON parsing exception.
    const responseText = await response.text();
    const contentType =
      response.headers.get('content-type') || '';

    console.log('[OAuth] Token exchange status:', response.status);
    console.log('[OAuth] Token exchange content type:', contentType);

    if (!response.ok) {
      console.error(
        '[OAuth] Token exchange failed:',
        responseText.slice(0, 300),
      );

      throw new Error(
        `Shopify token exchange failed with HTTP ${response.status}. Check Worker logs for details.`,
      );
    }

    let tokenData;

    try {
      tokenData = JSON.parse(responseText);
    } catch {
      console.error(
        '[OAuth] Non-JSON token response:',
        responseText.slice(0, 300),
      );

      throw new Error(
        `Shopify token endpoint returned non-JSON content. HTTP ${response.status}; Content-Type: ${contentType}`,
      );
    }

    const accessToken = tokenData.access_token;
    const scopes = tokenData.scope || '';

    if (!accessToken) {
      throw new Error(
        'Shopify token response did not contain an access token.',
      );
    }

    // Step 4: Determine tenant ID.
    const storeName = shop.replace('.myshopify.com', '');
    const tenantId = `tenant_${storeName}`;

    // Step 5: Save installation.
    // saveShopInstallation encrypts the token before storage.
    await saveShopInstallation(env, {
      shop,
      accessToken,
      tenantId,
      scopes,
    });

    // Step 6: Redirect to the Shopify Admin app.
    const appHandle =
      env.SHOPIFY_APP_HANDLE || 'netsuite-returns-1';

    const appUrl =
      `https://admin.shopify.com/store/${storeName}/apps/${appHandle}`;

    return Response.redirect(appUrl, 302);
  } catch (err) {
    console.error('[OAuth Callback] Failed:', err.message);

    return json(
      {
        success: false,
        message: err.message || 'Internal server error.',
      },
      500,
    );
  }
}




// https://app-testing-dfueo47y.myshopify.com/admin/oauth/authorize?client_id=0fee8d770cf615d823922004e280522f&scope=read_orders,read_customers,write_orders,write_returns,read_merchant_managed_fulfillment_orders&redirect_uri=https%3A%2F%2Fshopify-netsuite-returns-worker.holy-waterfall-8e46.workers.dev%2Fapi%2Fauth%2Fcallback
