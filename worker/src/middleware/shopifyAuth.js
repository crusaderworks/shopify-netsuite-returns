
import { encryptToken } from '../utils/encryption.js';

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);

  const binary = atob(padded);

  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function normalizeShop(value) {
  const shop = String(value || '').toLowerCase();

  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)
    ? shop
    : null;
}

function getHostname(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Verify the Shopify App Bridge ID/session token.
 * Does not create database records or exchange tokens.
 */
export async function verifySessionToken(request, env) {
  const token = request.headers
    .get('Authorization')
    ?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token || !env.SHOPIFY_API_SECRET || !env.SHOPIFY_API_KEY) {
    throw new Error('Shopify authentication configuration is missing.');
  }

  const parts = token.split('.');

  if (parts.length !== 3) {
    throw new Error('Invalid Shopify session token.');
  }

  try {
    const header = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(parts[0])),
    );

    const payload = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(parts[1])),
    );

    if (header.alg !== 'HS256') {
      throw new Error('Unsupported session token algorithm.');
    }

    const now = Math.floor(Date.now() / 1000);

    if (!payload.exp || payload.exp <= now) {
      throw new Error('Invalid or expired Shopify session token.');
    }

    if (payload.nbf && payload.nbf > now) {
      throw new Error('Shopify session token is not active yet.');
    }

    if (payload.aud !== env.SHOPIFY_API_KEY) {
      throw new Error('Invalid Shopify session token audience.');
    }

    const issuerShop = normalizeShop(getHostname(payload.iss));
    const destinationShop = normalizeShop(getHostname(payload.dest));

    if (
      !issuerShop ||
      !destinationShop ||
      issuerShop !== destinationShop
    ) {
      throw new Error('Shopify session token shop validation failed.');
    }

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.SHOPIFY_API_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );

    if (!valid) {
      throw new Error('Invalid Shopify session token signature.');
    }

    return {
      shop: destinationShop,
      token,
      payload,
    };
  } catch (error) {
    console.error('[ShopifyAuth] Session token rejected:', error.message);
    throw new Error('Shopify session token verification failed.');
  }
}

/**
 * Exchange the verified ID/session token for an offline access token.
 */
export async function exchangeToken(shop, sessionToken, env) {
  const response = await fetch(
    `https://${shop}/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        client_id: env.SHOPIFY_API_KEY,
        client_secret: env.SHOPIFY_API_SECRET,
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        subject_token: sessionToken,
        subject_token_type: 'urn:shopify:params:oauth:token-type:id_token',
        requested_token_type:
          'urn:shopify:params:oauth:token-type:offline-access-token',
        expiring: '1',
      }),
    },
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.access_token) {
    console.error('[ShopifyAuth] Token exchange failed:', response.status);
    throw new Error('Shopify token exchange failed.');
  }

  return data;
}

/**
 * Ensure a shop has an installation record.
 * Call after verifySessionToken(), before existing active-installation checks.
 */
export async function ensureShopInstallation(shop, sessionToken, env) {
  if (!env.DB) {
    throw new Error('Database not configured.');
  }

  // Existing active installation: do not exchange or insert again.
  let installation = await env.DB.prepare(`
    SELECT tenant_id, installation_status
    FROM shop_installations
    WHERE shop_domain = ?
    LIMIT 1
  `)
    .bind(shop)
    .first();

  if (installation?.installation_status === 'active') {
    return {
      shop,
      tenantId: installation.tenant_id,
      created: false,
    };
  }

  // Never create an active installation until Shopify accepts the exchange.
  const tokenData = await exchangeToken(shop, sessionToken, env);

  const accessTokenEnc = await encryptToken(tokenData.access_token, env);

  const refreshTokenEnc = tokenData.refresh_token
    ? await encryptToken(tokenData.refresh_token, env)
    : null;

  const now = new Date().toISOString();

  // Reuse the existing tenant if the shop was previously installed.
  const tenantId = installation?.tenant_id || crypto.randomUUID();
  const storeName = shop.replace('.myshopify.com', '');

  // Create the tenant only if it does not already exist.
  await env.DB.prepare(`
    INSERT OR IGNORE INTO tenants (
      id, name, status, created_at, updated_at
    )
    VALUES (?, ?, 'active', ?, ?)
  `)
    .bind(tenantId, storeName, now, now)
    .run();

  // Insert or reactivate the installation, storing encrypted credentials.
  await env.DB.prepare(`
    INSERT INTO shop_installations (
      shop_domain,
      tenant_id,
      access_token_enc,
      refresh_token_enc,
      access_token_expires_at,
      refresh_token_expires_at,
      granted_scopes,
      installation_status,
      installed_at,
      uninstalled_at,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, NULL, ?, ?)
    ON CONFLICT(shop_domain) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      access_token_enc = excluded.access_token_enc,
      refresh_token_enc = excluded.refresh_token_enc,
      access_token_expires_at = excluded.access_token_expires_at,
      refresh_token_expires_at = excluded.refresh_token_expires_at,
      granted_scopes = excluded.granted_scopes,
      installation_status = 'active',
      installed_at = excluded.installed_at,
      uninstalled_at = NULL,
      updated_at = excluded.updated_at
  `)
    .bind(
      shop,
      tenantId,
      accessTokenEnc,
      refreshTokenEnc,
      tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : null,
      tokenData.refresh_token_expires_in
        ? new Date(
            Date.now() + tokenData.refresh_token_expires_in * 1000,
          ).toISOString()
        : null,
      tokenData.scope || '',
      now,
      now,
      now,
    )
    .run();

  // Read back the installation before allowing the request to continue.
  installation = await env.DB.prepare(`
    SELECT tenant_id, installation_status
    FROM shop_installations
    WHERE shop_domain = ?
    LIMIT 1
  `)
    .bind(shop)
    .first();

  if (
    !installation ||
    installation.installation_status !== 'active' ||
    installation.tenant_id !== tenantId
  ) {
    throw new Error('Shop installation could not be activated.');
  }

  return {
    shop,
    tenantId,
    created: true,
  };
}
