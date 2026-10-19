import { json } from '../utils/response.js';
import { parseLimit, parsePage, normalizeReturn, getReturnSelect } from '../utils/admin.js';
import { getUtcNow } from '../utils/date.js';
import { logActivity } from '../services/activityLogger.js'; 
import { syncReturnStatus } from '../services/syncReturn.js';
export async function getReturns(request, env, context) {
  const url = new URL(request.url);
  const page = parsePage(url.searchParams.get('page'));
  const limit = parseLimit(url.searchParams.get('limit'));
  const offset = (page - 1) * limit;
  const status = (url.searchParams.get('status') || '').trim();
  const source = (url.searchParams.get('source') || '').trim();
  const search = (url.searchParams.get('search') || '').trim();

  const conditions = ['shop_domain = ?', 'tenant_id = ?'];
  const bindings = [context.shop, context.tenantId];

  if (status && status !== 'all') {
    conditions.push('status = ?');
    bindings.push(status);
  }

  if (source && source !== 'all') {
    conditions.push('source = ?');
    bindings.push(source);
  }

  if (search) {
    conditions.push(`
      (
        return_number LIKE ?
        OR order_number LIKE ?
        OR customer_email_masked LIKE ?
        OR reason LIKE ?
      )
    `);
    const term = `%${search}%`;
    bindings.push(term, term, term, term);
  }

  const whereClause = conditions.join(' AND ');

  const countStatement = env.DB.prepare(`
    SELECT COUNT(*) AS total
    FROM returns
    WHERE ${whereClause}
  `).bind(...bindings);

  const rowsStatement = env.DB.prepare(`
    ${getReturnSelect()}
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...bindings, limit, offset);

  const [count, rows] = await Promise.all([
    countStatement.first(),
    rowsStatement.all(),
  ]);

  const total = Number(count?.total || 0);
  const rawList = rows.results || rows || [];

  const normalizedReturns = await Promise.all(
    rawList.map((row) => normalizeReturn(row, env))
  );

  return json({
    success: true,
    data: {
      returns: normalizedReturns,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    },
  });
}




export async function getReturnById(request, env, context, returnId) {
  const returnRecord = await env.DB.prepare(`
    ${getReturnSelect()}
    WHERE id = ? AND shop_domain = ? AND tenant_id = ?
    LIMIT 1
  `)
    .bind(returnId, context.shop, context.tenantId)
    .first();

  if (!returnRecord) {
    return json(
      { success: false, message: 'Return not found' },
      404,
    );
  }

  const { results: history } = await env.DB.prepare(`
    SELECT
      id,
      event_type AS eventType,
      previous_status AS previousStatus,
      new_status AS newStatus,
      message,
      actor_type AS actorType,
      created_at AS createdAt
    FROM return_status_history
    WHERE return_id = ?
      AND shop_domain = ?
      AND tenant_id = ?
    ORDER BY created_at DESC
  `)
    .bind(returnId, context.shop, context.tenantId)
    .all();

  const returnItem = await normalizeReturn(returnRecord, env);

  return json({
    success: true,
    data: {
      returnItem: {
        ...returnItem,
        netsuite_return_id: returnRecord.netsuite_return_id ?? null,
        rma_number: returnRecord.rma_number ?? null,
      },
      history: history || [],
    },
  });
}




export async function updateReturnStatus(request, env, context, returnId) {
  const body = await request.json().catch(() => ({}));
  const newStatus = String(body.status || '').trim();
  const note = body.note || 'Status updated by admin';
  const correlationId = crypto.randomUUID();

  const log = async ({
    action,
    status,
    message,
    metadata = {},
    error_code,
    http_status,
  }) => {
    try {
      await logActivity(env, request, context, {
        category: 'admin_action',
        action,
        status,
        message,
        source: 'admin',
        return_id: returnId,
        correlation_id: correlationId,
        ...(error_code ? { error_code } : {}),
        ...(http_status ? { http_status } : {}),
        metadata: { correlationId, ...metadata },
      });
    } catch (error) {
      console.error('[Activity Log Error]:', error);
    }
  };

  const validStatuses = [
    'submitted',
    'under_review',
    'approved',
    'rejected',
    'awaiting_shipment',
    'in_transit',
    'received',
    'refunded',
    'cancelled',
    'closed',
  ];

  if (!newStatus) {
    await log({
      action: 'update_return_status_failed',
      status: 'failed',
      message: 'New status is required.',
      error_code: 'STATUS_REQUIRED',
      http_status: 400,
    });

    return json({ success: false, message: 'New status is required.' }, 400);
  }

  if (!validStatuses.includes(newStatus)) {
    await log({
      action: 'update_return_status_failed',
      status: 'failed',
      message: `Invalid return status: ${newStatus}`,
      error_code: 'INVALID_STATUS',
      http_status: 400,
    });

    return json({ success: false, message: 'Invalid return status.' }, 400);
  }

  let existing;

  try {
    existing = await env.DB.prepare(`
      SELECT
        id,
        return_number,
        order_number,
        status,
        source,
        netsuite_return_id,
        rma_number
      FROM returns
      WHERE id = ?
        AND shop_domain = ?
        AND tenant_id = ?
      LIMIT 1
    `)
      .bind(returnId, context.shop, context.tenantId)
      .first();
  } catch (error) {
    await log({
      action: 'update_return_status_failed',
      status: 'failed',
      message: `Failed to load return: ${error.message}`,
      error_code: 'RETURN_LOOKUP_FAILED',
      http_status: 500,
    });

    return json({
      success: false,
      message: 'Could not load return request.',
    }, 500);
  }

  if (!existing) {
    await log({
      action: 'update_return_status_failed',
      status: 'failed',
      message: 'Return not found for this shop and tenant.',
      error_code: 'RETURN_NOT_FOUND',
      http_status: 404,
    });

    return json({ success: false, message: 'Return not found.' }, 404);
  }

  const prevStatus = existing.status;
  const returnSource = existing.source;

  if (prevStatus === newStatus) {
    await log({
      action: 'update_return_status_skipped',
      status: 'success',
      message: `Return ${existing.return_number} already has status "${newStatus}".`,
      metadata: {
        returnNumber: existing.return_number,
        previousStatus: prevStatus,
        newStatus,
        netsuiteReturnId: existing.netsuite_return_id ?? null,
        rmaNumber: existing.rma_number ?? null,
      },
    });

    return json({
      success: true,
      message: 'Return already has this status.',
      data: {
        returnId,
        returnNumber: existing.return_number,
        source: returnSource,
        status: prevStatus,
        netsuiteReturnId: existing.netsuite_return_id ?? null,
        rmaNumber: existing.rma_number ?? null,
      },
    });
  }

  await log({
    action: 'return_status_sync_started',
    status: 'success',
    message: `Starting ${returnSource} processing for return ${existing.return_number}: ${prevStatus} → ${newStatus}.`,
    metadata: {
      returnNumber: existing.return_number,
      orderNumber: existing.order_number,
      returnSource,
      previousStatus: prevStatus,
      newStatus,
      netsuiteReturnId: existing.netsuite_return_id ?? null,
      rmaNumber: existing.rma_number ?? null,
    },
  });

  // Process NetSuite/website handling before updating the local status.
  let syncResult;

  try {
    syncResult = await syncReturnStatus({
      env,
      shop: context.shop,
      tenantId: context.tenantId,
      returnId,
      newStatus,
      returnSource,
    });

    await log({
      action: 'return_status_sync_succeeded',
      status: 'success',
      message:
        returnSource === 'website'
          ? `Website return ${existing.return_number}: external sync skipped; local update may proceed.`
          : `NetSuite sync completed for return ${existing.return_number}.`,
      metadata: {
        returnNumber: existing.return_number,
        returnSource,
        previousStatus: prevStatus,
        newStatus,
        netsuiteReturnId:
          syncResult?.netsuiteReturnId ??
          existing.netsuite_return_id ??
          null,
        rmaNumber:
          syncResult?.rmaNumber ??
          existing.rma_number ??
          null,
        externalSyncPerformed: syncResult?.synced === true,
      },
    });
  } catch (error) {
    console.error('[Return Sync Failed]:', error);

    await log({
      action: 'return_status_sync_failed',
      status: 'failed',
      message: `${returnSource} processing failed: ${error.message || String(error)}. Local status was not changed.`,
      error_code: 'EXTERNAL_SYNC_FAILED',
      http_status: 502,
      metadata: {
        returnNumber: existing.return_number,
        returnSource,
        previousStatus: prevStatus,
        requestedStatus: newStatus,
        netsuiteReturnId: existing.netsuite_return_id ?? null,
        rmaNumber: existing.rma_number ?? null,
        error: error.message || String(error),
      },
    });

    return json({
      success: false,
      message: 'Return processing failed. Local status was not changed.',
      error: error.message || 'Return processing failed.',
      correlationId,
    }, 502);
  }

  const now = getUtcNow();

  // Keep the internal NetSuite ID and display RMA number in separate columns.
  const newNetSuiteReturnId =
    syncResult?.netsuiteReturnId != null
      ? String(syncResult.netsuiteReturnId).trim() || null
      : null;

  const newRmaNumber =
    syncResult?.rmaNumber != null
      ? String(syncResult.rmaNumber).trim() || null
      : null;

  try {
    const result = await env.DB.prepare(`
      UPDATE returns
      SET
        status = ?,
        updated_at = ?,
        netsuite_return_id = COALESCE(?, netsuite_return_id),
        rma_number = COALESCE(?, rma_number)
      WHERE id = ?
        AND shop_domain = ?
        AND tenant_id = ?
        AND status = ?
    `)
      .bind(
        newStatus,
        now,
        newNetSuiteReturnId,
        newRmaNumber,
        returnId,
        context.shop,
        context.tenantId,
        prevStatus
      )
      .run();

    if (!result.success || Number(result.meta?.changes ?? 0) !== 1) {
      throw new Error(
        'Local update affected no rows. The status may have changed concurrently.'
      );
    }
  } catch (error) {
    console.error('[Local Status Update Failed]:', error);

    await log({
      action: 'update_return_status_failed',
      status: 'failed',
      message: `Processing succeeded, but local status update failed: ${error.message}`,
      error_code: 'LOCAL_STATUS_UPDATE_FAILED',
      http_status: 500,
      metadata: {
        returnNumber: existing.return_number,
        returnSource,
        previousStatus: prevStatus,
        requestedStatus: newStatus,
        netsuiteReturnId:
          newNetSuiteReturnId ?? existing.netsuite_return_id ?? null,
        rmaNumber: newRmaNumber ?? existing.rma_number ?? null,
        error: error.message,
      },
    });

    return json({
      success: false,
      message: 'Processing succeeded, but the local update failed. Verify the external system before retrying.',
      correlationId,
    }, 500);
  }

  try {
    await env.DB.prepare(`
      INSERT INTO return_status_history (
        id,
        return_id,
        tenant_id,
        shop_domain,
        event_type,
        previous_status,
        new_status,
        message,
        actor_type,
        created_at
      )
      VALUES (?, ?, ?, ?, 'status_change', ?, ?, ?, 'admin', ?)
    `)
      .bind(
        crypto.randomUUID(),
        returnId,
        context.tenantId,
        context.shop,
        prevStatus,
        newStatus,
        note,
        getUtcNow()
      )
      .run();

    await log({
      action: 'return_status_history_saved',
      status: 'success',
      message: `Status history saved for return ${existing.return_number}.`,
      metadata: {
        previousStatus: prevStatus,
        newStatus,
      },
    });
  } catch (error) {
    console.error('[Status History Insert Failed]:', error);

    await log({
      action: 'return_status_history_failed',
      status: 'failed',
      message: `Status was updated, but history insert failed: ${error.message}`,
      error_code: 'STATUS_HISTORY_INSERT_FAILED',
      http_status: 500,
      metadata: {
        previousStatus: prevStatus,
        newStatus,
        error: error.message,
      },
    });

    return json({
      success: false,
      message: 'Return status was updated, but status history could not be saved.',
      correlationId,
    }, 500);
  }

  const finalNetSuiteReturnId =
    newNetSuiteReturnId ??
    existing.netsuite_return_id ??
    null;

  const finalRmaNumber =
    newRmaNumber ??
    existing.rma_number ??
    null;

  await log({
    action: 'update_return_status',
    status: 'success',
    message: `Changed return status from ${prevStatus} to ${newStatus} for return ${existing.return_number}.`,
    metadata: {
      returnNumber: existing.return_number,
      orderNumber: existing.order_number,
      returnSource,
      previousStatus: prevStatus,
      newStatus,
      netsuiteReturnId: finalNetSuiteReturnId,
      rmaNumber: finalRmaNumber,
      updatedAt: now,
      note,
    },
  });

  return json({
    success: true,
    message: 'Return status updated successfully.',
    data: {
      returnId,
      returnNumber: existing.return_number,
      source: returnSource,
      previousStatus: prevStatus,
      status: newStatus,
      netsuiteReturnId: finalNetSuiteReturnId,
      rmaNumber: finalRmaNumber,
      correlationId,
    },
  });
}
