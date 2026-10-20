
import { json } from '../utils/response.js';
import { encryptToken } from '../utils/encryption.js';

// Save or reactivate an existing shop installation.
export async function saveShopInstallation(
  env,
  { shop, accessToken, tenantId, scopes },
) {
  const storeName = shop.replace('.myshopify.com', '');

  try {
    // Step 1: Check existing installation.
    const existingInstallation = await env.DB.prepare(`
      SELECT tenant_id
      FROM shop_installations
      WHERE shop_domain = ?
      LIMIT 1
    `)
      .bind(shop)
      .first();

    // Step 2: Determine tenant ID.
    const existingTenantId = existingInstallation?.tenant_id;
    const finalTenantId = existingTenantId || tenantId;

    if (!finalTenantId) {
      throw new Error(
        'Unable to determine tenant ID for this shop.',
      );
    }

    // Step 3: Encrypt the access token before database storage.
    // Never store the raw Shopify access token in access_token_enc.
    let encryptedAccessToken = null;

    if (accessToken) {
      encryptedAccessToken = await encryptToken(accessToken, env);
    }

    // Step 4: Insert or reactivate tenant.
    await env.DB.prepare(`
      INSERT INTO tenants (
        id,
        name,
        status,
        updated_at
      )
      VALUES (?, ?, 'active', datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        status = 'active',
        updated_at = datetime('now')
    `)
      .bind(finalTenantId, storeName)
      .run();

    // Step 5: Insert or update shop installation.
    // If no new token is supplied, preserve the existing token.
    const installationResult = await env.DB.prepare(`
      INSERT INTO shop_installations (
        shop_domain,
        tenant_id,
        access_token_enc,
        granted_scopes,
        installation_status,
        installed_at,
        uninstalled_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, 'active', datetime('now'), NULL, datetime('now'))
      ON CONFLICT(shop_domain) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        access_token_enc = COALESCE(
          excluded.access_token_enc,
          shop_installations.access_token_enc
        ),
        granted_scopes = COALESCE(
          excluded.granted_scopes,
          shop_installations.granted_scopes
        ),
        installation_status = 'active',
        installed_at = COALESCE(
          shop_installations.installed_at,
          datetime('now')
        ),
        uninstalled_at = NULL,
        updated_at = datetime('now')
    `)
      .bind(
        shop,
        finalTenantId,
        encryptedAccessToken,
        scopes || null,
      )
      .run();

    return {
      shop,
      tenantId: finalTenantId,
      reinstalled: Boolean(existingInstallation),
    };
  } catch (err) {
    throw err;
  }
}

// POST /api/installation
// Manual/Postman testing route.
export async function handleInstallation(request, env) {
  if (request.method !== 'POST') {
    return json(
      { success: false, message: 'Method not allowed' },
      405,
    );
  }

  try {
    const body = await request.json();
    const { shop, accessToken, tenantId, scopes } = body;

    if (!shop || !tenantId) {
      return json(
        {
          success: false,
          message: 'Missing required fields: shop or tenantId',
        },
        400,
      );
    }

    const result = await saveShopInstallation(env, {
      shop,
      accessToken,
      tenantId,
      scopes,
    });

    return json(
      {
        success: true,
        message: result.reinstalled
          ? 'Existing installation reactivated successfully.'
          : 'Installation recorded successfully.',
        shop: result.shop,
        tenantId: result.tenantId,
        reinstalled: result.reinstalled,
      },
      200,
    );
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
