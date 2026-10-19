export async function fetchShopify(shop, accessToken, endpoint, env) {
  const apiVersion = env.SHOPIFY_API_VERSION || '2026-04';
  const url = new URL(`https://${shop}/admin/api/${apiVersion}/${endpoint}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    const requestId = response.headers.get('x-request-id');
    const text = await response.text();
    let data = {};

    try {
      data = JSON.parse(text);
    } catch {
      // Non-JSON response fallback
    }

    if (!response.ok) {
      const error = new Error(`Shopify API returned HTTP ${response.status}.`);
      error.status = response.status;
      error.requestId = requestId;
      error.responseBody = text;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      const timeoutErr = new Error('Shopify API request timed out.');
      timeoutErr.name = 'TimeoutError';
      throw timeoutErr;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}