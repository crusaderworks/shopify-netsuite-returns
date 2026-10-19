
import { json } from '../utils/response.js';

// Save or reactivate an existing shop installation.
export async function saveShopInstallation(
  env,
  { shop, accessToken, tenantId, scopes },
) {
  const storeName = shop.replace('.myshopify.com', '');

  // Reuse the existing tenant ID for this shop, if available.
  const existingInstallation = await env.DB.prepare(`
    SELECT tenant_id
    FROM shop_installations
    WHERE shop_domain = ?
    LIMIT 1
  `)
    .bind(shop)
    .first();

  const existingTenantId = existingInstallation?.tenant_id;
  const finalTenantId = existingTenantId || tenantId;

  if (!finalTenantId) {
    throw new Error('Unable to determine tenant ID for this shop.');
  }

  // Reactivate/update the existing tenant instead of creating a new one.
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

  // Reactivate/update the existing installation.
  await env.DB.prepare(`
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
      accessToken || null,
      scopes || null,
    )
    .run();

  return {
    shop,
    tenantId: finalTenantId,
    reinstalled: Boolean(existingInstallation),
  };
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

    console.log(
      `[Installation] Shop activated/updated: ${shop}; tenant: ${result.tenantId}`,
    );

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
    console.error('[Installation Error]:', err);

    return json(
      {
        success: false,
        message: err.message || 'Internal server error',
      },
      500,
    );
  }
}
