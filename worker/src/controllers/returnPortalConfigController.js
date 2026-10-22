
import { json } from '../utils/response.js'
import { logActivity } from '../services/activityLogger.js'
import { validateStorefrontAccess } from '../services/storefrontAuth.js'

const DEFAULT_STATUS_PAGE_URL = 'http://localhost:5173/status'

// 1. Storefront API: GET /api/returns/portal-config
export async function getReturnPortalConfigController(request, env) {
  try {
    if (!env.DB) {
      return json({
        success: true,
        data: {
          reasons: [],
          resolutions: [],
          conditionQuestions: [],
          STATUS_PAGE_URL: DEFAULT_STATUS_PAGE_URL,
        },
      })
    }

    const auth = await validateStorefrontAccess(request, env)

    if (!auth.success) {
      return json({ success: false, message: auth.error }, 401)
    }

    const shopDomain = auth.shop

    const stmt = env.DB.prepare(`
      SELECT config_type, label, value, sort_order
      FROM return_portal_config
      WHERE shop_domain = ? AND is_active = 1
      ORDER BY sort_order ASC
    `)

    const result = await stmt.bind(shopDomain).all()
    const configs = result.results || []

    const grouped = {
      reasons: configs.filter(c => c.config_type === 'reason'),
      resolutions: configs.filter(c => c.config_type === 'resolution'),
      conditionQuestions: configs.filter(
        c => c.config_type === 'condition_question'
      ),
      STATUS_PAGE_URL:
        configs.find(c => c.config_type === 'status_page_url')?.value ||
        DEFAULT_STATUS_PAGE_URL,
    }

    return json({ success: true, data: grouped })
  } catch (error) {
    console.error('Error fetching portal config:', error)

    return json({
      success: false,
      message: 'Failed to load form configuration.',
    }, 500)
  }
}

// 2. Admin API: GET /api/admin/portal-config
export async function getAdminPortalConfigController(request, env, shopDomain) {
  try {
    if (!env.DB) {
      return json({ success: true, configs: [] })
    }

    const stmt = env.DB.prepare(`
      SELECT
        id,
        config_type,
        label,
        value,
        is_active,
        sort_order,
        created_at,
        updated_at
      FROM return_portal_config
      WHERE shop_domain = ?
      ORDER BY config_type ASC, sort_order ASC
    `)

    const result = await stmt.bind(shopDomain).all()

    return json({
      success: true,
      configs: result.results || [],
    })
  } catch (error) {
    console.error('Error fetching admin portal config:', error)

    return json({
      success: false,
      message: 'Failed to fetch configurations.',
    }, 500)
  }
}

// 3. Admin API: POST /api/admin/portal-config (Create)
export async function createAdminPortalConfigController(request, env, shopDomain) {
  try {
    const { config_type, label, value, sort_order = 0 } = await request.json()

    if (!config_type || !label || !value) {
      return json({
        success: false,
        message: 'config_type, label, and value are required.',
      }, 400)
    }

    const tenantStmt = env.DB.prepare(`
      SELECT tenant_id
      FROM shop_installations
      WHERE shop_domain = ?
    `)

    const shopRecord = await tenantStmt.bind(shopDomain).first()
    const tenantId = shopRecord?.tenant_id || 'default'
    const context = { shop: shopDomain, tenantId }

    const id = `cfg_${config_type}_${Date.now()}`

    const insertStmt = env.DB.prepare(`
      INSERT INTO return_portal_config (
        id,
        tenant_id,
        shop_domain,
        config_type,
        label,
        value,
        is_active,
        sort_order,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
    `)

    await insertStmt.bind(
      id,
      tenantId,
      shopDomain,
      config_type,
      label,
      value,
      sort_order
    ).run()

    await logActivity(env, request, context, {
      category: 'admin_action',
      action: 'portal_config_created',
      status: 'success',
      message: `Created portal configuration [${config_type}]: ${label}`,
      source: 'admin',
      metadata: { config_id: id, config_type, label, value },
    })

    return json({
      success: true,
      message: 'Configuration added successfully.',
      id,
    })
  } catch (error) {
    console.error('Error creating portal config:', error)

    return json({
      success: false,
      message: error.message || 'Failed to create configuration.',
    }, 500)
  }
}

// 4. Admin API: PUT /api/admin/portal-config (Update / Toggle Status)
export async function updateAdminPortalConfigController(request, env, shopDomain) {
  try {
    const { id, label, value, is_active, sort_order } = await request.json()

    if (!id) {
      return json({
        success: false,
        message: 'Config ID is required.',
      }, 400)
    }

    const updateStmt = env.DB.prepare(`
      UPDATE return_portal_config
      SET
        label = COALESCE(?, label),
        value = COALESCE(?, value),
        is_active = COALESCE(?, is_active),
        sort_order = COALESCE(?, sort_order),
        updated_at = datetime('now')
      WHERE id = ? AND shop_domain = ?
    `)

    await updateStmt.bind(
      label !== undefined ? label : null,
      value !== undefined ? value : null,
      is_active !== undefined ? is_active : null,
      sort_order !== undefined ? sort_order : null,
      id,
      shopDomain
    ).run()

    const tenantStmt = env.DB.prepare(`
      SELECT tenant_id
      FROM shop_installations
      WHERE shop_domain = ?
    `)

    const shopRecord = await tenantStmt.bind(shopDomain).first()
    const context = {
      shop: shopDomain,
      tenantId: shopRecord?.tenant_id || 'default',
    }

    await logActivity(env, request, context, {
      category: 'admin_action',
      action: 'portal_config_updated',
      status: 'success',
      message: `Updated portal configuration ID: ${id}`,
      source: 'admin',
      metadata: { config_id: id, label, value, is_active, sort_order },
    })

    return json({
      success: true,
      message: 'Configuration updated successfully.',
    })
  } catch (error) {
    console.error('Error updating portal config:', error)

    return json({
      success: false,
      message: error.message || 'Failed to update configuration.',
    }, 500)
  }
}

// 5. Admin API: DELETE /api/admin/portal-config (Delete)
export async function deleteAdminPortalConfigController(request, env, shopDomain) {
  try {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')

    if (!id) {
      return json({
        success: false,
        message: 'Config ID is required.',
      }, 400)
    }

    const deleteStmt = env.DB.prepare(`
      DELETE FROM return_portal_config
      WHERE id = ? AND shop_domain = ?
    `)

    await deleteStmt.bind(id, shopDomain).run()

    const tenantStmt = env.DB.prepare(`
      SELECT tenant_id
      FROM shop_installations
      WHERE shop_domain = ?
    `)

    const shopRecord = await tenantStmt.bind(shopDomain).first()
    const context = {
      shop: shopDomain,
      tenantId: shopRecord?.tenant_id || 'default',
    }

    await logActivity(env, request, context, {
      category: 'admin_action',
      action: 'portal_config_deleted',
      status: 'success',
      message: `Deleted portal configuration ID: ${id}`,
      source: 'admin',
      metadata: { config_id: id },
    })

    return json({
      success: true,
      message: 'Configuration deleted successfully.',
    })
  } catch (error) {
    console.error('Error deleting portal config:', error)

    return json({
      success: false,
      message: error.message || 'Failed to delete configuration.',
    }, 500)
  }
}
