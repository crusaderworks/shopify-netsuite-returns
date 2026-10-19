
import { json } from '../utils/response.js';
import { verifySessionToken } from '../middleware/shopifyAuth.js';

import { getDashboard } from '../controllers/dashboard.js';

import {
  getReturns,
  getReturnById,
  updateReturnStatus,
} from '../controllers/returns.js';

import { getActivityLogs } from '../controllers/logs.js';

import {
  getNetSuiteConfigController,
  saveNetSuiteConfigController,
  testNetSuiteConnectionController,
} from '../controllers/admin/netSuiteController.js';

import { getShopInfoController } from '../controllers/admin/shopInfoController.js';

import {
  getAdminPortalConfigController,
  createAdminPortalConfigController,
  updateAdminPortalConfigController,
  deleteAdminPortalConfigController,
} from '../controllers/returnPortalConfigController.js';

// --------------------------------------------------
// Verify Shopify Session + Active Installation
// --------------------------------------------------
async function getAdminContext(request, env) {
  try {
    const { shop } = await verifySessionToken(request, env);

    if (!shop) {
      return {
        error: json(
          {
            success: false,
            message: 'Unauthorized: No shop found in session token.',
          },
          401,
        ),
      };
    }

    const installation = await env.DB.prepare(`
      SELECT
        si.shop_domain,
        si.tenant_id,
        si.installation_status,
        t.status AS tenant_status
      FROM shop_installations si
      LEFT JOIN tenants t ON t.id = si.tenant_id
      WHERE si.shop_domain = ?
      LIMIT 1
    `)
      .bind(shop)
      .first();

    if (
      !installation ||
      installation.installation_status !== 'active' ||
      !installation.tenant_id
    ) {
      return {
        error: json(
          {
            success: false,
            message:
              'Forbidden: No active installation found for this shop.',
          },
          403,
        ),
      };
    }

    if (
      installation.tenant_status &&
      installation.tenant_status !== 'active'
    ) {
      return {
        error: json(
          {
            success: false,
            message: 'Forbidden: Tenant is not active.',
          },
          403,
        ),
      };
    }

    return {
      shop: installation.shop_domain,
      tenantId: installation.tenant_id,
    };
  } catch (error) {
    console.error('[Admin Auth Context Error]:', error);

    return {
      error: json(
        {
          success: false,
          message:
            error?.message ||
            'Unauthorized: Token verification failed.',
        },
        401,
      ),
    };
  }
}

// --------------------------------------------------
// Admin API Router
// Every route below requires valid Shopify authentication.
// --------------------------------------------------
export async function handleAdminRequest(request, env) {
  if (!env.DB) {
    return json(
      {
        success: false,
        message: 'Database not configured.',
      },
      500,
    );
  }

  try {
    const context = await getAdminContext(request, env);

    if (context.error) {
      return context.error;
    }

    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method;

    // --------------------------------------------------
    // Dashboard
    // GET /api/admin/dashboard
    // --------------------------------------------------
    if (
      pathname === '/api/admin/dashboard' &&
      method === 'GET'
    ) {
      return await getDashboard(env, context);
    }

    // --------------------------------------------------
    // Returns List
    // GET /api/admin/returns
    // --------------------------------------------------
    if (
      pathname === '/api/admin/returns' &&
      method === 'GET'
    ) {
      return await getReturns(request, env, context);
    }

    // --------------------------------------------------
    // Return Status Update
    // PUT /api/admin/returns/:id/status
    // --------------------------------------------------
    if (
      /^\/api\/admin\/returns\/[^/]+\/status$/.test(pathname) &&
      method === 'PUT'
    ) {
      const parts = pathname.split('/');
      const returnId = parts[parts.length - 2];

      return await updateReturnStatus(
        request,
        env,
        context,
        returnId,
      );
    }

    // --------------------------------------------------
    // Single Return Details
    // GET /api/admin/returns/:id
    // --------------------------------------------------
    if (
      pathname.startsWith('/api/admin/returns/') &&
      method === 'GET'
    ) {
      const returnId = pathname.split('/').pop();

      return await getReturnById(
        request,
        env,
        context,
        returnId,
      );
    }

    // --------------------------------------------------
    // Activity Logs
    // GET /api/admin/activity-logs
    // GET /api/admin/logs
    // --------------------------------------------------
    if (
      (
        pathname === '/api/admin/activity-logs' ||
        pathname === '/api/admin/logs'
      ) &&
      method === 'GET'
    ) {
      return await getActivityLogs(
        request,
        env,
        context,
      );
    }

    // --------------------------------------------------
    // NetSuite Configuration
    // GET  /api/admin/netsuite/config
    // POST /api/admin/netsuite/config
    // --------------------------------------------------
    if (pathname === '/api/admin/netsuite/config') {
      if (method === 'GET') {
        return await getNetSuiteConfigController(
          request,
          env,
          context,
        );
      }

      if (method === 'POST') {
        return await saveNetSuiteConfigController(
          request,
          env,
          context,
        );
      }
    }

    // --------------------------------------------------
    // Test NetSuite Connection
    // POST /api/admin/netsuite/test-connection
    // --------------------------------------------------
    if (
      pathname === '/api/admin/netsuite/test-connection' &&
      method === 'POST'
    ) {
      return await testNetSuiteConnectionController(
        request,
        env,
        context,
      );
    }

    // --------------------------------------------------
    // Shop Integration Info
    // GET /api/admin/shop-info
    // --------------------------------------------------
    if (
      pathname === '/api/admin/shop-info' &&
      method === 'GET'
    ) {
      return await getShopInfoController(
        request,
        env,
        context.shop,
      );
    }

    // --------------------------------------------------
    // Admin Portal Configuration
    // GET    /api/admin/portal-config
    // POST   /api/admin/portal-config
    // PUT    /api/admin/portal-config
    // DELETE /api/admin/portal-config
    // --------------------------------------------------
    if (pathname === '/api/admin/portal-config') {
      if (method === 'GET') {
        return await getAdminPortalConfigController(
          request,
          env,
          context.shop,
        );
      }

      if (method === 'POST') {
        return await createAdminPortalConfigController(
          request,
          env,
          context.shop,
        );
      }

      if (method === 'PUT') {
        return await updateAdminPortalConfigController(
          request,
          env,
          context.shop,
        );
      }

      if (method === 'DELETE') {
        return await deleteAdminPortalConfigController(
          request,
          env,
          context.shop,
        );
      }
    }

    return json(
      {
        success: false,
        message: 'Admin endpoint not found',
        path: pathname,
      },
      404,
    );
  } catch (error) {
    console.error('[Admin API Error]:', error);

    return json(
      {
        success: false,
        message: error?.message || 'Internal server error',
      },
      500,
    );
  }
}
