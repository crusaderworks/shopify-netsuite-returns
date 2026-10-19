/**
 * Cloudflare R2 Storage Service for handling attachment uploads
 * Returns array of attachment objects containing URL and metadata
 */
export async function uploadAttachmentsToR2(env, files, shopDomain, returnNumber) {
  if (!env.R2_BUCKET || !files || files.length === 0) {
    return [];
  }

  const attachments = [];
  const publicBaseUrl = env.R2_PUBLIC_DOMAIN || '';

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file || typeof file.arrayBuffer !== 'function') continue;

    const fileExt = file.name ? file.name.split('.').pop() : 'bin';
    const sanitizeShop = shopDomain.replace(/[^a-zA-Z0-9]/g, '_');
    const key = `returns/${sanitizeShop}/${returnNumber}/${Date.now()}_${i}.${fileExt}`;

    const contentType = file.type || 'application/octet-stream';
    const arrayBuffer = await file.arrayBuffer();

    await env.R2_BUCKET.put(key, arrayBuffer, {
      httpMetadata: { contentType },
      customMetadata: {
        shopDomain,
        returnNumber,
        originalName: file.name || '',
      },
    });

    const url = publicBaseUrl ? `${publicBaseUrl.replace(/\/$/, '')}/${key}` : key;

    // Categorize attachment type
    let type = 'file';
    if (contentType.startsWith('image/')) {
      type = 'image';
    } else if (contentType.startsWith('video/')) {
      type = 'video';
    }

    attachments.push({
      url,
      name: file.name || `attachment_${i + 1}.${fileExt}`,
      contentType,
      type,
    });
  }

  return attachments;
}