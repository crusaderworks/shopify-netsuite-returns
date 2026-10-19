import { json } from '../utils/response.js';
import { decryptToken } from '../utils/encryption.js';
import {
  getShopifyOrder,
  checkShopifyScopes,
} from '../services/shopify/shopifyOrders.js';
import { validateStorefrontAccess } from '../services/storefrontAuth.js'

export async function verifyShopifyOrder(request, env) {
  let shop = null;
  try {
  
    const auth = await validateStorefrontAccess(request, env);
    if (!auth.success) {
      return json({
        success: false,
        verified: false,
        errorCode: 'UNAUTHORIZED_ACCESS',
        message: auth.error || 'Unauthorized storefront access.',
      }, 401);
    }

    shop = auth.shop;

    const body = await request.json().catch(() => ({}));

    const orderNumber = String(body?.orderNumber || '')
      .trim()
      .replace(/^#/, '');

    const email = String(body?.email || '')
      .trim()
      .toLowerCase();

    console.log('[Order Verification] Request received:', {
      shop,
      orderNumber,
      emailProvided: Boolean(email),
    });

    if (!orderNumber || !email) {
      return json({
        success: false,
        verified: false,
        errorCode: 'MISSING_DETAILS',
        message: 'Enter your order number and checkout email.',
      }, 400);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({
        success: false,
        verified: false,
        errorCode: 'INVALID_EMAIL',
        message: 'Enter a valid checkout email address.',
      }, 400);
    }

    if (!env.DB) {
      throw new Error('D1 database binding env.DB is missing.');
    }

    const installation = await env.DB.prepare(`
      SELECT access_token_enc, installation_status
      FROM shop_installations
      WHERE shop_domain = ?
      LIMIT 1
    `).bind(shop).first();

    if (!installation) {
      return json({
        success: false,
        verified: false,
        errorCode: 'INSTALLATION_NOT_FOUND',
        message: 'Shopify installation was not found in the database.',
      }, 409);
    }

    if (installation.installation_status !== 'active') {
      return json({
        success: false,
        verified: false,
        errorCode: 'INSTALLATION_INACTIVE',
        message: 'Shopify installation is inactive.',
      }, 409);
    }

    if (!installation.access_token_enc) {
      return json({
        success: false,
        verified: false,
        errorCode: 'TOKEN_MISSING',
        message: 'Shopify access token is missing from the database.',
      }, 409);
    }

    let accessToken;

    try {
      accessToken = await decryptToken(
        installation.access_token_enc,
        env
      );
    } catch (error) {
      console.error('[Order Verification] Token decryption failed:', {
        shop,
        name: error?.name,
        message: error?.message,
      });

      return json({
        success: false,
        verified: false,
        errorCode: 'TOKEN_DECRYPTION_FAILED',
        message: 'Could not decrypt the Shopify access token. Check the Worker encryption secret.',
      }, 500);
    }

    if (!accessToken) {
      return json({
        success: false,
        verified: false,
        errorCode: 'TOKEN_EMPTY',
        message: 'Decrypted Shopify access token is empty.',
      }, 500);
    }

    console.log('[Order Verification] Token decrypted successfully:', {
      shop,
      tokenPresent: true,
      tokenLength: accessToken.length,
    });

    let scopeCheck;

    try {
      scopeCheck = await checkShopifyScopes(shop, accessToken);
    } catch (error) {
      console.error('[Order Verification] Scope check failed:', {
        shop,
        name: error?.name,
        message: error?.message,
      });

      return json({
        success: false,
        verified: false,
        errorCode: 'SCOPE_CHECK_FAILED',
        message: 'Could not check Shopify permissions. See Worker logs.',
      }, 502);
    }

    if (!scopeCheck.success) {
      console.error('[Order Verification] Scope check response:', {
        shop,
        status: scopeCheck.status,
        error: scopeCheck.error,
      });

      return json({
        success: false,
        verified: false,
        errorCode: scopeCheck.status === 401
          ? 'SHOPIFY_TOKEN_INVALID'
          : 'SCOPE_CHECK_FAILED',
        message: scopeCheck.status === 401
          ? 'Shopify rejected the stored access token.'
          : `Could not retrieve granted Shopify scopes (HTTP ${scopeCheck.status}).`,
      }, 502);
    }

    console.log('[Order Verification] Granted scopes:', {
      shop,
      scopes: scopeCheck.scopes,
    });

    if (!scopeCheck.scopes.includes('read_orders')) {
      return json({
        success: false,
        verified: false,
        errorCode: 'READ_ORDERS_SCOPE_MISSING',
        message: 'The current access token does not have the read_orders scope.',
        debug: {
          grantedScopes: scopeCheck.scopes,
        },
      }, 403);
    }

    let order;

    try {
      order = await getShopifyOrder(
        shop,
        accessToken,
        orderNumber,
        env
      );
    } catch (error) {
      const status = Number(error?.status) || 0;
      const responseBody = error?.responseBody || '';

      console.error('[Order Verification] Orders API failed:', {
        shop,
        orderNumber,
        status,
        name: error?.name,
        message: error?.message,
        shopifyResponse: responseBody,
      });

      if (
        error?.name === 'TimeoutError' ||
        error?.name === 'AbortError'
      ) {
        return json({
          success: false,
          verified: false,
          errorCode: 'SHOPIFY_API_TIMEOUT',
          message: 'Shopify order lookup timed out. Please try again.',
        }, 504);
      }

      if (status === 401) {
        return json({
          success: false,
          verified: false,
          errorCode: 'SHOPIFY_TOKEN_INVALID',
          message: 'Shopify rejected the access token for the Orders API.',
          debug: {
            status,
            shopifyResponse: responseBody,
          },
        }, 502);
      }

      if (status === 403) {
        return json({
          success: false,
          verified: false,
          errorCode: 'SHOPIFY_ORDERS_ACCESS_DENIED',
          message: 'Shopify denied access to the Orders API.',
          debug: {
            status,
            shop,
            orderNumber,
            grantedScopes: scopeCheck.scopes,
            shopifyResponse: responseBody,
          },
        }, 502);
      }

      return json({
        success: false,
        verified: false,
        errorCode: status
          ? `SHOPIFY_HTTP_${status}`
          : 'SHOPIFY_API_ERROR',
        message: 'Shopify order lookup failed. Check Worker logs.',
        debug: {
          status,
          shopifyResponse: responseBody || null,
        },
      }, 502);
    }

    if (!order) {
      return json({
        success: false,
        verified: false,
        errorCode: 'ORDER_NOT_FOUND',
        message: 'No order was found with this order number.',
      }, 404);
    }

    const shopifyEmail = String(order.email || '')
      .trim()
      .toLowerCase();

    if (!shopifyEmail || shopifyEmail !== email) {
      return json({
        success: false,
        verified: false,
        errorCode: 'EMAIL_MISMATCH',
        message: 'The checkout email does not match this order.',
      }, 404);
    }

    if (order.cancelled_at) {
      return json({
        success: false,
        verified: false,
        errorCode: 'ORDER_CANCELLED',
        message: 'This order has been cancelled.',
      }, 409);
    }

    return json({
      success: true,
      verified: true,
      provider: 'shopify',
      order: {
        id: String(order.id),
        orderNumber: order.name,
        createdAt: order.created_at,
        fulfillmentStatus: order.display_fulfillment_status,
        items: (order.line_items || []).map((item) => ({
          id: String(item.id),
          productId: item.product_id
            ? String(item.product_id)
            : null,
          variantId: item.variant_id
            ? String(item.variant_id)
            : null,
          title: item.title,
          variantTitle: item.variant_title,
          quantity: item.quantity,
          sku: item.sku,
        })),
      },
      message: 'Order verified successfully.',
    });
  } catch (error) {
    const message = String(error?.message || '');

    console.error('[Order Verification] Unexpected error:', {
      shop: shop || 'unknown',
      name: error?.name,
      message,
    });

    const databaseError =
      /no such table|D1_ERROR|SQLITE/i.test(message);

    return json({
      success: false,
      verified: false,
      errorCode: databaseError
        ? 'DATABASE_ERROR'
        : 'INTERNAL_VERIFICATION_ERROR',
      message: databaseError
        ? 'Database query failed. Check the D1 binding and shop_installations table.'
        : 'Unexpected order verification error. Check Worker logs.',
    }, 500);
  }
}