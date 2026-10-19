import { json } from '../../utils/response.js';
import { encryptToken } from '../../utils/encryption.js';
import { verifySessionToken, exchangeToken } from '../../services/auth.js';
import { generateSecureStorefrontUrl } from '../../services/storefrontAuth.js';
import { logActivity } from '../../services/activityLogger.js';

export async function handleInstallation(request, env) {
  try {
    const { shop, token } = await verifySessionToken(request, env);
    const tokenData = await exchangeToken(shop, token, env);
    const now = new Date().toISOString();

    let installation = await env.DB.prepare(
      'SELECT tenant_id FROM shop_installations WHERE shop_domain = ?'
    ).bind(shop).first();

    const tenantId = installation?.tenant_id || crypto.randomUUID();

    if (!installation) {
      await env.DB.prepare(`
        INSERT INTO tenants (id, name, status, created_at, updated_at)
        VALUES (?, ?, 'active', ?, ?)
      `).bind(tenantId, shop, now, now).run();

      await env.DB.prepare(`
        INSERT INTO shop_installations (shop_domain, tenant_id, installation_status, installed_at, created_at, updated_at)
        VALUES (?, ?, 'pending', ?, ?, ?)
      `).bind(shop, tenantId, now, now, now).run();
    }

    const accessTokenEnc = await encryptToken(tokenData.access_token, env);
    const refreshTokenEnc = tokenData.refresh_token ? await encryptToken(tokenData.refresh_token, env) : null;

    await env.DB.prepare(`
      UPDATE shop_installations
      SET access_token_enc = ?,
          refresh_token_enc = ?,
          access_token_expires_at = ?,
          granted_scopes = ?,
          installation_status = 'active',
          updated_at = ?
      WHERE shop_domain = ?
    `).bind(
      accessTokenEnc,
      refreshTokenEnc,
      tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
      tokenData.scope || 'read_orders',
      now,
      shop
    ).run();

    // Generate secure storefront portal link for Admin UI interface
    const storefrontBaseUrl = env.STOREFRONT_BASE_URL || 'http://localhost:50959';
    const securePortalUrl = await generateSecureStorefrontUrl(shop, storefrontBaseUrl, env);

    // Log installation activity
    await logActivity(env, request, { shop, tenantId }, {
      category: 'authentication',
      action: 'shop_installed',
      status: 'success',
      message: `Shop successfully installed and activated: ${shop}`,
      source: 'admin',
    });

    return json({
      success: true,
      shop,
      installationStatus: 'active',
      securePortalUrl, // Admin UI can display this URL safely
    });
  } catch (error) {
    console.error('Installation failed:', error.message);
    return json({ success: false, message: error.message }, 401);
  }
}