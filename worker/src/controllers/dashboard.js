import { json } from '../utils/response.js';
import { normalizeReturn, getReturnSelect } from '../utils/admin.js';

export async function getDashboard(env, context) {
  const { shop, tenantId } = context;

  const countsQuery = env.DB.prepare(`
    SELECT
      COUNT(*) AS totalReturns,
      COALESCE(SUM(
        CASE
          WHEN status IN ('submitted', 'under_review') THEN 1
          ELSE 0
        END
      ), 0) AS pendingReturns,
      COALESCE(SUM(
        CASE WHEN status = 'approved' THEN 1 ELSE 0 END
      ), 0) AS approvedReturns,
      COALESCE(SUM(
        CASE WHEN status = 'rejected' THEN 1 ELSE 0 END
      ), 0) AS rejectedReturns,
      COALESCE(SUM(
        CASE WHEN status = 'closed' THEN 1 ELSE 0 END
      ), 0) AS closedReturns,
      COALESCE(SUM(
        CASE WHEN source = 'website' THEN 1 ELSE 0 END
      ), 0) AS websiteCount,
      COALESCE(SUM(
        CASE WHEN source = 'assisted' THEN 1 ELSE 0 END
      ), 0) AS assistedCount
    FROM returns
    WHERE shop_domain = ? AND tenant_id = ?
  `).bind(shop, tenantId);

  const recentQuery = env.DB.prepare(`
    ${getReturnSelect()}
    WHERE shop_domain = ? AND tenant_id = ?
    ORDER BY created_at DESC
    LIMIT 8
  `).bind(shop, tenantId);

  const [stats, recentResult] = await Promise.all([
    countsQuery.first(),
    recentQuery.all(),
  ]);

  const rawRecent = recentResult.results || [];
  const recentReturns = await Promise.all(
    rawRecent.map((row) => normalizeReturn(row, env))
  );

  return json({
    success: true,
    data: {
      stats: {
        totalReturns: Number(stats?.totalReturns || 0),
        pendingReturns: Number(stats?.pendingReturns || 0),
        approvedReturns: Number(stats?.approvedReturns || 0),
        rejectedReturns: Number(stats?.rejectedReturns || 0),
        closedReturns: Number(stats?.closedReturns || 0),
        websiteCount: Number(stats?.websiteCount || 0),
        assistedCount: Number(stats?.assistedCount || 0),
      },
      recentReturns,
    },
  });
}