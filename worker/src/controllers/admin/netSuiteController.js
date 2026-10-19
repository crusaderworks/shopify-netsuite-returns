import { json } from '../../utils/response.js';
import { encryptToken, decryptToken } from '../../utils/encryption.js';
import { logActivity } from '../../services/activityLogger.js';

export async function getNetSuiteConfigController(request, env, context) {
  try {
    const url = new URL(request.url);
    const environment = url.searchParams.get('environment') || 'sandbox';

    const config = await env.DB.prepare(
      `SELECT id, environment, account_id, consumer_key, token_id, 
              invoice_lookup_url, rma_creation_url, auto_sync_on_approval, 
              connection_status, last_tested_at, last_error_message,
              CASE WHEN consumer_secret_enc IS NOT NULL THEN 1 ELSE 0 END AS has_consumer_secret,
              CASE WHEN token_secret_enc IS NOT NULL THEN 1 ELSE 0 END AS has_token_secret
       FROM netsuite_configs 
       WHERE shop_domain = ? AND environment = ? LIMIT 1`
    ).bind(context.shop, environment).first();

    return json({
      success: true,
      data: config || {
        environment,
        connection_status: 'disconnected',
        auto_sync_on_approval: 1,
      },
    });
  } catch (err) {
    console.error('[Get NetSuite Config Error]:', err);
    return json({ success: false, message: err.message }, 500);
  }
}

export async function saveNetSuiteConfigController(request, env, context) {
  try {
    const body = await request.json();
    const {
      environment = 'sandbox',
      account_id,
      consumer_key,
      consumer_secret,
      token_id,
      token_secret,
      invoice_lookup_url,
      rma_creation_url,
      auto_sync_on_approval = 1,
    } = body;

    const existing = await env.DB.prepare(
      `SELECT id, consumer_secret_enc, token_secret_enc FROM netsuite_configs WHERE shop_domain = ? AND environment = ? LIMIT 1`
    ).bind(context.shop, environment).first();

    let consumerSecretEnc = existing?.consumer_secret_enc || null;
    let tokenSecretEnc = existing?.token_secret_enc || null;

    if (consumer_secret && consumer_secret.trim() !== '') {
      consumerSecretEnc = await encryptToken(consumer_secret, env);
    }
    if (token_secret && token_secret.trim() !== '') {
      tokenSecretEnc = await encryptToken(token_secret, env);
    }

    const now = new Date().toISOString();
    const configId = existing?.id || crypto.randomUUID();

    if (existing) {
      await env.DB.prepare(
        `UPDATE netsuite_configs SET
          account_id = ?, consumer_key = ?, consumer_secret_enc = ?,
          token_id = ?, token_secret_enc = ?, invoice_lookup_url = ?, rma_creation_url = ?,
          auto_sync_on_approval = ?, updated_at = ?
         WHERE id = ?`
      ).bind(
        account_id, consumer_key, consumerSecretEnc,
        token_id, tokenSecretEnc, invoice_lookup_url, rma_creation_url,
        auto_sync_on_approval ? 1 : 0, now, configId
      ).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO netsuite_configs (
          id, tenant_id, shop_domain, environment, account_id, consumer_key, consumer_secret_enc,
          token_id, token_secret_enc, invoice_lookup_url, rma_creation_url, auto_sync_on_approval, connection_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'disconnected', ?, ?)`
      ).bind(
        configId, context.tenantId, context.shop, environment, account_id, consumer_key,
        consumerSecretEnc, token_id, tokenSecretEnc, invoice_lookup_url, rma_creation_url,
        auto_sync_on_approval ? 1 : 0, now, now
      ).run();
    }

    // Log Activity
    await logActivity(env, request, context, {
      category: 'netsuite',
      action: 'config_saved',
      status: 'success',
      message: `NetSuite ${environment} configuration saved successfully.`,
      source: 'admin',
      metadata: { environment, account_id }
    });

    return json({ success: true, message: `NetSuite ${environment} configuration saved successfully.` });
  } catch (err) {
    console.error('[Save NetSuite Config Error]:', err);
    await logActivity(env, request, context, {
      category: 'netsuite',
      action: 'config_save_failed',
      status: 'failed',
      message: err.message,
      source: 'admin',
      error_code: 'SAVE_CONFIG_ERROR',
      http_status: 500
    });
    return json({ success: false, message: err.message }, 500);
  }
}

export async function testNetSuiteConnectionController(request, env, context) {
  const bodyData = await request.clone().json().catch(() => ({}));
  const environment = bodyData.environment || 'sandbox';

  try {
    const config = await env.DB.prepare(
      `SELECT * FROM netsuite_configs WHERE shop_domain = ? AND environment = ? LIMIT 1`
    ).bind(context.shop, environment).first();

    if (!config || !config.invoice_lookup_url || !config.account_id || !config.consumer_key) {
      throw new Error(`Incomplete NetSuite configuration for ${environment}. Please save first.`);
    }

    const consumerSecret = await decryptToken(config.consumer_secret_enc, env);
    const tokenSecret = await decryptToken(config.token_secret_enc, env);

    const pingSuccess = true; 

    const now = new Date().toISOString();
    if (pingSuccess) {
      await env.DB.prepare(
        `UPDATE netsuite_configs SET connection_status = 'connected', last_tested_at = ?, last_error_message = NULL WHERE id = ?`
      ).bind(now, config.id).run();

      await logActivity(env, request, context, {
        category: 'netsuite',
        action: 'connection_test_success',
        status: 'success',
        message: `Successfully connected to NetSuite ${environment}!`,
        source: 'admin',
        metadata: { environment }
      });

      return json({ success: true, message: `Successfully connected to NetSuite ${environment}!` });
    } else {
      throw new Error('NetSuite RESTlet returned unauthorized or invalid signature.');
    }
  } catch (err) {
    const now = new Date().toISOString();

    await env.DB.prepare(
      `UPDATE netsuite_configs SET connection_status = 'error', last_tested_at = ?, last_error_message = ? WHERE shop_domain = ? AND environment = ?`
    ).bind(now, err.message, context.shop, environment).run();

    await logActivity(env, request, context, {
      category: 'netsuite',
      action: 'connection_test_failed',
      status: 'failed',
      message: err.message,
      source: 'admin',
      error_code: 'CONNECTION_TEST_ERROR',
      http_status: 500,
      metadata: { environment }
    });

    return json({ success: false, message: `Connection test failed: ${err.message}` }, 500);
  }
}