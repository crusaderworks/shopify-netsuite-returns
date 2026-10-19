import { json } from '../../utils/response.js';
import { generateSecureStorefrontUrl } from '../../services/storefrontAuth.js';

export async function getShopInfoController(request, env, shop) {
  try {
    const storefrontBaseUrl = env.STOREFRONT_BASE_URL || 'http://localhost:50959';
    const securePortalUrl = await generateSecureStorefrontUrl(shop, storefrontBaseUrl, env);

    return json({
      success: true,
      shop,
      securePortalUrl,
      embedCode: `<iframe src="${securePortalUrl}" width="100%" height="800px" style="border:none; border-radius:8px;"></iframe>`
    });
  } catch (err) {
    console.error('[Shop Info Error]:', err);
    return json({ success: false, message: err.message }, 500);
  }
}