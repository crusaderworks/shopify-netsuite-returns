function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(normalized), c => c.charCodeAt(0));
}

function normalizeShop(value) {
  const shop = String(value || '').toLowerCase();
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) ? shop : null;
}

export async function verifySessionToken(request, env) {
  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token || !env.SHOPIFY_API_SECRET || !env.SHOPIFY_API_KEY) {
    throw new Error('Shopify authentication configuration is missing.');
  }

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid session token.');

  const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
  if (payload.aud !== env.SHOPIFY_API_KEY) {
    throw new Error('Invalid Shopify session token audience.');
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.SHOPIFY_API_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    decodeBase64Url(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );

  if (!valid || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('Invalid or expired Shopify session token.');
  }

  const shop = normalizeShop(new URL(payload.iss).hostname);
  if (!shop) throw new Error('Could not verify Shopify store.');

  return { shop, token };
}

export async function exchangeToken(shop, sessionToken, env) {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: env.SHOPIFY_API_KEY,
      client_secret: env.SHOPIFY_API_SECRET,
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: sessionToken,
      subject_token_type: 'urn:shopify:params:oauth:token-type:id_token',
      requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error('Shopify token exchange failed.');
  }

  return data;
}