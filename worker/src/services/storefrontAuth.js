
import { encryptToken, decryptToken } from '../utils/encryption.js';

/**
 * Encrypts shop domain for secure storefront access URL.
 */
export async function generateSecureStorefrontUrl(shopDomain, baseUrl, env) {
  const encryptedShop = await encryptToken(shopDomain, env);
  const safeToken = encodeURIComponent(encryptedShop);

  return `${baseUrl.replace(/\/$/, '')}/return-request?access=${safeToken}`;
}

/**
 * Middleware/Guard to validate storefront access token from request URL.
 */
export async function validateStorefrontAccess(request, env) {
  try {
    const url = new URL(request.url);
    const encodedAccess = url.searchParams.get('access');

    if (!encodedAccess) {
      return {
        success: false,
        error: 'Direct access is not allowed. Please open the portal from your store link.',
      };
    }

    const shopDomain = await decryptToken(encodedAccess, env);

    if (!shopDomain) {
      throw new Error('Invalid shop payload');
    }

    // Verify installation exists and is active in DB.
    const installation = await env.DB.prepare(
      `SELECT tenant_id, installation_status
       FROM shop_installations
       WHERE shop_domain = ?
       LIMIT 1`
    )
      .bind(shopDomain)
      .first();

    if (!installation || installation.installation_status !== 'active') {
      return {
        success: false,
        error: 'Store installation is inactive or invalid.',
      };
    }

    return {
      success: true,
      shop: shopDomain,
      tenantId: installation.tenant_id,
    };
  } catch {
    return {
      success: false,
      error: 'Unauthorized storefront access.',
    };
  }
}
