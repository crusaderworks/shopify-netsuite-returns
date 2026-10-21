import { handleInstallation } from './routes/installation.js';
import { handleAuthCallback } from './routes/auth.js';

import {
  verifyShopifyOrderController,
  verifyAssistedOrderController,
} from './controllers/orderVerificationController.js';

import { getReturnStatusController } from './controllers/returnStatusController.js';
import { healthCheck } from './controllers/healthController.js';
import { json, handleOptions } from './utils/response.js';
import { createReturnRequestController } from './controllers/returnRequestController.js';
import { handleAdminRequest } from './routes/admin.js';
import { handleAppUninstalled } from './routes/webhook.js';

import {
  getReturnPortalConfigController,
} from './controllers/returnPortalConfigController.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const { method } = request;

    if (method === 'OPTIONS') {
      return handleOptions();
    }

    try {
      // --------------------------------------------------
      // R2 Static Attachment Server
      // --------------------------------------------------
      if (method === 'GET' && pathname.startsWith('/returns/')) {
        if (!env.R2_BUCKET) {
          return json(
            {
              success: false,
              message: 'R2 Bucket binding not found.',
            },
            500,
          );
        }

        const key = pathname.replace(/^\//, '');

        try {
          const object = await env.R2_BUCKET.get(key);

          if (!object) {
            return json(
              {
                success: false,
                message: 'Attachment file not found.',
              },
              404,
            );
          }

          const headers = new Headers();
          object.writeHttpMetadata(headers);
          headers.set('etag', object.httpEtag);
          headers.set('Cache-Control', 'public, max-age=31536000');
          headers.set('Access-Control-Allow-Origin', '*');

          return new Response(object.body, { headers });
        } catch (error) {
          console.error('[R2 File Serve Error]:', error);

          return json(
            {
              success: false,
              message: 'Failed to retrieve attachment.',
            },
            500,
          );
        }
      }

      // Health Check
      if (pathname === '/api/health' && method === 'GET') {
        return await healthCheck(env);
      }

      // Shopify OAuth Callback
      if (pathname === '/api/auth/callback' && method === 'GET') {
        return await handleAuthCallback(request, env);
      }

      // Manual / Postman Installation
      // if (pathname === '/api/installation' && method === 'POST') {
      //   return await handleInstallation(request, env);
      // }

      // App Uninstalled Webhook
      if (
        pathname === '/api/webhooks/app-uninstalled' &&
        method === 'POST'
      ) {
        return await handleAppUninstalled(request, env);
      }

      // --------------------------------------------------
      // ALL ADMIN APIs
      // Authentication and routing are handled in admin.js
      // --------------------------------------------------
      if (pathname.startsWith('/api/admin/')) {
        return await handleAdminRequest(request, env);
      }

      // Public Storefront Portal Configuration
      if (
        pathname === '/api/returns/portal-config' &&
        method === 'GET'
      ) {
        return await getReturnPortalConfigController(request, env);
      }

      // Customer Portal Return Status
      if (
        pathname === '/api/returns/status' &&
        method === 'GET'
      ) {
        return await getReturnStatusController(request, env);
      }

      // Order Verification
      // Shop is resolved inside the controller.
      if (
        pathname === '/api/orders/verify' &&
        method === 'POST'
      ) {
        return await verifyShopifyOrderController(request, env);
      }

      // Create Return Request
      // Shop is resolved inside the controller.
      if (
        pathname === '/api/returns/requests' &&
        method === 'POST'
      ) {
        return await createReturnRequestController(request, env);
      }

      // Storefront Order Verification (Website)
      if (
        pathname === '/api/storefront/orders/verify' &&
        method === 'POST'
      ) {
        
        return await verifyShopifyOrderController(request, env);
      }

      // Storefront Order Verification (Assisted / NetSuite)
      if (
        pathname === '/api/storefront/orders/verify-assisted' &&
        method === 'POST'
      ) {
        return await verifyAssistedOrderController(request, env);
      }

      // Endpoint Not Found
      return json(
        {
          success: false,
          message: 'Endpoint not found',
          path: pathname,
        },
        404,
      );
    } catch (error) {
      console.error('[Worker Request Error]:', error);

      return json(
        {
          success: false,
          message:
            error?.message || 'Request could not be completed.',
        },
        500,
      );
    }
  },
};