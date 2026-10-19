import { json } from '../utils/response.js'
import { validateStorefrontAccess } from '../services/storefrontAuth.js'
// Helper function to generate SHA-256 hash for secure email comparison
async function hashEmail(email) {
  if (!email) return ''
  const msgUint8 = new TextEncoder().encode(email.trim().toLowerCase())
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function getReturnStatusController(request, env) {
  let shopDomain = null;

  try {
    // Validate storefront access and get authenticated shop
    const auth = await validateStorefrontAccess(request, env);

    if (!auth.success) {
      return json(
        {
          success: false,
          message: auth.error || 'Unauthorized storefront access.',
        },
        401
      );
    }

    shopDomain = auth.shop;

    const url = new URL(request.url);

    const rawReturnNumber =
      url.searchParams.get('returnNumber') ||
      url.searchParams.get('number') ||
      '';

    const rawEmail = url.searchParams.get('email') || '';

    const returnNumber = rawReturnNumber.trim();
    const email = rawEmail.trim().toLowerCase();

    if (!returnNumber) {
      return json(
        { success: false, message: 'Missing returnNumber parameter.' },
        400
      );
    }

    if (!email) {
      return json(
        {
          success: false,
          message: 'Email address is required to view return status.',
        },
        400
      );
    }

    let returnData = null;

    // Check Cloudflare KV if available
    if (env.RETURNS) {
      const raw = await env.RETURNS.get(`return_num:${returnNumber}`);

      if (raw) {
        try {
          const parsed = JSON.parse(raw);

          if (
            parsed.email &&
            parsed.email.trim().toLowerCase() === email
          ) {
            returnData = parsed;
          }
        } catch (error) {
          console.error('Failed to parse KV record:', error);
        }
      }
    }

    // Check D1 if the return was not found in KV
    if (!returnData && env.DB) {
      const result = await env.DB.prepare(
        `SELECT *
         FROM returns
         WHERE return_number = ?
           AND shop_domain = ?`
      )
        .bind(returnNumber, shopDomain)
        .first();

      if (result) {
        // Verify the supplied email
        const inputEmailHash = await hashEmail(email);
        const dbHash = result.customer_email_hash || '';
        const dbMasked = (result.customer_email_masked || '').toLowerCase();

        const isMatch =
          (dbHash && dbHash === inputEmailHash) ||
          (!dbHash && dbMasked && (
            dbMasked === email ||
            dbMasked.includes(email) ||
            email.includes(dbMasked)
          ));

        if (!isMatch) {
          return json(
            {
              success: false,
              message:
                'Return details do not match the provided email address.',
            },
            403
          );
        }

        // Fetch return status timeline
        const historyResult = await env.DB.prepare(
          `SELECT
             event_type,
             previous_status,
             new_status,
             message,
             actor_type,
             created_at
           FROM return_status_history
           WHERE return_id = ?
             AND shop_domain = ?
           ORDER BY created_at ASC`
        )
          .bind(result.id, shopDomain)
          .all();

        returnData = {
          ...result,

          // Explicitly expose NetSuite return identifiers
          netsuite_return_id: result.netsuite_return_id ?? null,
          rma_number: result.rma_number ?? null,

          items: result.items_json
            ? JSON.parse(result.items_json)
            : result.items || [],

          history: historyResult.results || [],
        };
      }
    }

    if (!returnData) {
      return json(
        {
          success: false,
          message:
            'No return request found for the specified return number and email.',
        },
        404
      );
    }

    // Normalize identifiers for KV and D1 responses
    returnData = {
      ...returnData,
      netsuite_return_id:
        returnData.netsuite_return_id ??
        returnData.netsuiteReturnId ??
        null,
      rma_number:
        returnData.rma_number ??
        returnData.rmaNumber ??
        null,
    };

    return json({
      success: true,
      return: returnData,
    });
  } catch (error) {
    console.error('Error fetching return status:', error);

    return json(
      {
        success: false,
        message:
          error.message || 'Failed to fetch return status.',
      },
      500
    );
  }
}