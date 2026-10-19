
import { json } from '../utils/response.js';
import { parseLimit, parsePage } from '../utils/admin.js';

export async function getActivityLogs(request, env, context) {
  try {
    const url = new URL(request.url);

    const page = parsePage(url.searchParams.get('page'));
    const limit = parseLimit(url.searchParams.get('limit'));
    const offset = (page - 1) * limit;

    if (!context?.shop || !context?.tenantId) {
      return json(
        {
          success: false,
          message: 'Shop or tenant context is missing.',
        },
        { status: 400 }
      );
    }

    // Count logs belonging to the current shop and tenant.
    const countStatement = env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM activity_logs
      WHERE shop_domain = ?
        AND tenant_id = ?
    `).bind(context.shop, context.tenantId);

    // Fetch only the requested page.
    const rowsStatement = env.DB.prepare(`
      SELECT
        id,
        order_id AS orderId,
        order_number AS orderNumber,
        return_id AS returnId,
        return_number AS returnNumber,
        category,
        action,
        status,
        message,
        source,
        created_at AS createdAt
      FROM activity_logs
      WHERE shop_domain = ?
        AND tenant_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).bind(
      context.shop,
      context.tenantId,
      limit,
      offset
    );

    const [count, rows] = await Promise.all([
      countStatement.first(),
      rowsStatement.all(),
    ]);

    const total = Number(count?.total || 0);
    const totalPages = Math.ceil(total / limit);

    const logs = rows.results || [];

    return json({
      success: true,
      logs,
      data: {
        logs,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1 && total > 0,
        },
      },
    });
  } catch (error) {
    console.error('[ActivityLogs] Failed to fetch logs:', error);

    return json(
      {
        success: false,
        message: 'Failed to fetch activity logs.',
      },
      { status: 500 }
    );
  }
}
