import { json } from '../utils/response.js';

/**
 * 
 * @param {Request} request 
 * @param {object} env 
 * @returns {Promise<{shop: string, payload: object}>}
 */
export async function verifySessionToken(request, env) {
  const authHeader = request.headers.get('Authorization') || '';

  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized: Missing or invalid Authorization header.');
  }

  const token = authHeader.substring(7);
  const parts = token.split('.');

  if (parts.length !== 3) {
    throw new Error('Unauthorized: Malformed session token.');
  }

  try {
   
    const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson);

  
    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowInSeconds) {
      throw new Error('Unauthorized: Session token has expired.');
    }

  
    if (!payload.dest) {
      throw new Error('Unauthorized: Destination claim missing in token.');
    }

    const destUrl = new URL(payload.dest);
    const shop = destUrl.hostname;

    if (!shop || !shop.endsWith('.myshopify.com')) {
      throw new Error('Unauthorized: Invalid shop domain in session token.');
    }

   
    return {
      shop,
      payload,
    };
  } catch (err) {
    console.error('[ShopifyAuth Middleware Error]:', err);
    throw new Error(err.message || 'Unauthorized: Token verification failed.');
  }
}