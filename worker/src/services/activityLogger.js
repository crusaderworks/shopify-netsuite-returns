/**
 * Global Activity Logger Service (Strict UTC Timestamp)
 */
export async function logActivity(env, request, context, data) {
  try {
    if (!env || !env.DB) return;

    const id = `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const utcTimestamp = new Date().toISOString(); // Explicit UTC timestamp
    
    // Extract metadata from request headers if available
    let ipHash = null;
    let userAgent = null;
    if (request && typeof request.headers?.get === 'function') {
      const rawIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
      userAgent = request.headers.get('user-agent') || null;
      
      // Simple hash generation for privacy compliance
      ipHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawIp))
        .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''))
        .catch(() => null);
    }

    const tenantId = context?.tenantId || data.tenant_id || 'default';
    const shopDomain = context?.shop || data.shop_domain || 'system';

    const metadata = {
      userAgent,
      ...(data.metadata || {}),
    };

    await env.DB.prepare(`
      INSERT INTO activity_logs (
        id, tenant_id, shop_domain, order_id, order_number, return_id, return_number,
        category, action, status, message, error_code, http_status, source,
        correlation_id, ip_hash, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      tenantId,
      shopDomain,
      data.order_id || null,
      data.order_number || null,
      data.return_id || null,
      data.return_number || null,
      data.category || 'system',
      data.action || 'unknown_action',
      data.status || 'info',
      data.message || null,
      data.error_code || null,
      data.http_status || 200,
      data.source || 'admin',
      data.correlation_id || null,
      ipHash,
      JSON.stringify(metadata),
      utcTimestamp // Bound explicitly as UTC string
    ).run();

  } catch (err) {
    console.error('[Activity Logger Error]:', err);
  }
}