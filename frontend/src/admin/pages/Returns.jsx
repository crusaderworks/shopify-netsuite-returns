import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  DataTable,
  Box,
  Banner,
  SkeletonBodyText,
  EmptyState,
  TextField,
  Select,
  Checkbox,
  ButtonGroup,
} from '@shopify/polaris';
import { useAppBridge } from '@shopify/app-bridge-react';
import { authenticatedFetch } from '@shopify/app-bridge/utilities';
import ReturnDetails from './ReturnDetails';
import {
  formatLocalDateTime,
  formatTimeAgo,
} from '../../utils/date.js';

const API_BASE_URL = (
  import.meta.env.VITE_RETURNS_API_BASE_URL || 'http://localhost:8787'
).replace(/\/$/, '');

const STATUS_FILTER_OPTIONS = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Submitted', value: 'submitted' },
  { label: 'Under Review', value: 'under_review' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Awaiting Shipment', value: 'awaiting_shipment' },
  { label: 'In Transit', value: 'in_transit' },
  { label: 'Received', value: 'received' },
  { label: 'Refunded', value: 'refunded' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'Closed', value: 'closed' },
];

const SOURCE_FILTER_OPTIONS = [
  { label: 'All Sources', value: 'all' },
  { label: 'Website', value: 'website' },
  { label: 'Assisted', value: 'assisted' },
];

function getStatusBadgeTone(status) {
  switch (String(status).toLowerCase()) {
    case 'approved':
    case 'refunded':
      return 'success';

    case 'rejected':
      return 'critical';

    case 'submitted':
    case 'awaiting_shipment':
      return 'attention';

    default:
      return 'info';
  }
}

export default function Returns() {
  const app = useAppBridge();
  const fetchWithAuth = useMemo(
    () => authenticatedFetch(app),
    [app],
  );

  const [returnsList, setReturnsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Filters and pagination
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [page, setPage] = useState(1);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkNote, setBulkNote] = useState('');

  // Return details
  const [selectedReturnId, setSelectedReturnId] = useState(null);

  const fetchReturns = useCallback(async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10',
        ...(statusFilter !== 'all' && {
          status: statusFilter,
        }),
        ...(sourceFilter !== 'all' && {
          source: sourceFilter,
        }),
        ...(search.trim() && {
          search: search.trim(),
        }),
      });

      const response = await fetchWithAuth(
        `${API_BASE_URL}/api/admin/returns?${params.toString()}`,
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(
          result.message ||
            result.error ||
            `Failed to fetch returns. HTTP ${response.status}`,
        );
      }

      setReturnsList(result.data?.returns || []);

      setPagination(
        result.data?.pagination || {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 1,
        },
      );

      setSelectedIds([]);
      setError('');
    } catch (err) {
      console.error('[Returns] Fetch error:', err);
      setError(err.message || 'Failed to fetch returns.');
    } finally {
      setLoading(false);
    }
  }, [
    fetchWithAuth,
    page,
    statusFilter,
    sourceFilter,
    search,
  ]);

  useEffect(() => {
    fetchReturns();
  }, [fetchReturns]);

  const toggleSelectOne = (id) => {
    setSelectedIds((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id],
    );
  };

  const allSelected =
    returnsList.length > 0 &&
    returnsList.every((item) => selectedIds.includes(item.id));

  const someSelected =
    selectedIds.length > 0 && !allSelected;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(returnsList.map((item) => item.id));
    }
  };

  const isBulkNoteInvalid = !bulkNote.trim();

  // Bulk status update with per-return API response validation
  const handleBulkStatusUpdate = async (newStatus) => {
    if (bulkProcessing) return;

    if (selectedIds.length === 0) {
      setError('Please select at least one return.');
      return;
    }

    if (isBulkNoteInvalid) {
      setError('A note/reason is required for bulk status updates.');
      return;
    }

    setBulkProcessing(true);
    setError('');
    setSuccessMessage('');

    try {
      const selectedIdsSnapshot = [...selectedIds];

      const outcomes = await Promise.all(
        selectedIdsSnapshot.map(async (id) => {
          try {
            const response = await fetchWithAuth(
              `${API_BASE_URL}/api/admin/returns/${encodeURIComponent(
                id,
              )}/status`,
              {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  status: newStatus,
                  note: bulkNote.trim(),
                }),
              },
            );

            const result = await response.json().catch(() => ({}));

            // fetch() does not throw automatically for HTTP 4xx/5xx.
            if (!response.ok || result.success !== true) {
              return {
                id,
                success: false,
                message:
                  result.error ||
                  result.message ||
                  `Request failed with HTTP ${response.status}.`,
              };
            }

            return {
              id,
              success: true,
            };
          } catch (err) {
            return {
              id,
              success: false,
              message:
                err.message || 'Network request failed.',
            };
          }
        }),
      );

      const successful = outcomes.filter(
        (item) => item.success,
      );

      const failed = outcomes.filter(
        (item) => !item.success,
      );

      // Refresh the table after all requests have completed.
      await fetchReturns();

      if (successful.length > 0) {
        setSuccessMessage(
          `Successfully updated ${successful.length} of ${outcomes.length} return(s) to "${newStatus}".`,
        );
      }

      if (failed.length > 0) {
        const failureDetails = failed
          .map(
            (item) =>
              `Return ${item.id}: ${item.message}`,
          )
          .join('\n');

        setError(
          `${failed.length} of ${outcomes.length} return(s) failed:\n${failureDetails}`,
        );

        console.error('[Bulk Status Update] Failures:', failed);
      }

      setBulkNote('');
      setSelectedIds([]);
    } catch (err) {
      console.error('[Bulk Status Update] Error:', err);

      setError(
        err.message || 'Failed to perform bulk update.',
      );
    } finally {
      setBulkProcessing(false);
    }
  };

  if (selectedReturnId) {
    return (
      <ReturnDetails
        returnId={selectedReturnId}
        onBack={() => {
          setSelectedReturnId(null);
          fetchReturns();
        }}
      />
    );
  }

  const rows = returnsList.map((item) => {
    const itemCount = Array.isArray(item.items)
      ? item.items.length
      : 0;

    const isChecked = selectedIds.includes(item.id);
    const rawDate = item.createdAt || item.created_at;

    return [
      <Checkbox
        key={`chk-${item.id}`}
        label={`Select return ${item.returnNumber}`}
        labelHidden
        checked={isChecked}
        disabled={bulkProcessing}
        onChange={() => toggleSelectOne(item.id)}
      />,

      <Text
        key={`num-${item.id}`}
        variant="bodyMd"
        fontWeight="semibold"
      >
        {item.returnNumber}
      </Text>,

      item.orderNumber || '—',

      <Box key={`date-${item.id}`}>
        <Text variant="bodyMd">
          {formatTimeAgo(rawDate)}
        </Text>
        <Text variant="bodySm" tone="subdued">
          {formatLocalDateTime(rawDate)}
        </Text>
      </Box>,

      item.customerEmail || '—',

      `${itemCount} item(s)`,

      item.reason || '—',

      <Badge
        key={`badge-${item.id}`}
        tone={getStatusBadgeTone(item.status)}
      >
        {item.status}
      </Badge>,

      <Button
        key={`view-${item.id}`}
        size="slim"
        disabled={bulkProcessing}
        onClick={() => setSelectedReturnId(item.id)}
      >
        View
      </Button>,
    ];
  });

  return (
    <Page
      title="Returns Management"
      fullWidth
      subtitle="Manage, review and update customer return requests"
      secondaryActions={[
        {
          content: 'Refresh',
          onAction: fetchReturns,
          loading,
        },
      ]}
    >
      <BlockStack gap="400">
        <Card>
          <InlineStack gap="300" wrap>
            <Box minWidth="240px" width="40%">
              <TextField
                label="Search"
                labelHidden
                placeholder="Search by return #, order #, or email..."
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
                autoComplete="off"
                disabled={bulkProcessing}
              />
            </Box>

            <Box minWidth="160px" width="25%">
              <Select
                label="Status"
                labelHidden
                options={STATUS_FILTER_OPTIONS}
                value={statusFilter}
                onChange={(value) => {
                  setStatusFilter(value);
                  setPage(1);
                }}
                disabled={bulkProcessing}
              />
            </Box>

            <Box minWidth="160px" width="25%">
              <Select
                label="Source"
                labelHidden
                options={SOURCE_FILTER_OPTIONS}
                value={sourceFilter}
                onChange={(value) => {
                  setSourceFilter(value);
                  setPage(1);
                }}
                disabled={bulkProcessing}
              />
            </Box>
          </InlineStack>
        </Card>

        {error && (
          <Banner
            tone="critical"
            onDismiss={() => setError('')}
          >
            <BlockStack gap="200">
              <Text>{error}</Text>
            </BlockStack>
          </Banner>
        )}

        {successMessage && (
          <Banner
            tone="success"
            onDismiss={() => setSuccessMessage('')}
          >
            {successMessage}
          </Banner>
        )}

        {/* Bulk actions */}
        {selectedIds.length > 0 && (
          <Card background="bg-surface-active">
            <BlockStack gap="300">
              <InlineStack
                align="space-between"
                blockAlign="center"
                gap="300"
                wrap
              >
                <Text
                  variant="bodyMd"
                  fontWeight="semibold"
                >
                  {selectedIds.length} return(s) selected
                </Text>

                <ButtonGroup>
                  <Button
                    loading={bulkProcessing}
                    disabled={
                      isBulkNoteInvalid || bulkProcessing
                    }
                    onClick={() =>
                      handleBulkStatusUpdate('approved')
                    }
                    tone="success"
                  >
                    Approve Selected
                  </Button>

                  <Button
                    loading={bulkProcessing}
                    disabled={
                      isBulkNoteInvalid || bulkProcessing
                    }
                    onClick={() =>
                      handleBulkStatusUpdate('rejected')
                    }
                    tone="critical"
                  >
                    Reject Selected
                  </Button>

                  <Button
                    loading={bulkProcessing}
                    disabled={
                      isBulkNoteInvalid || bulkProcessing
                    }
                    onClick={() =>
                      handleBulkStatusUpdate('under_review')
                    }
                  >
                    Mark Under Review
                  </Button>
                </ButtonGroup>
              </InlineStack>

              <TextField
                label="Bulk Action Note / Reason (Required)"
                placeholder="Enter the reason for this bulk action"
                value={bulkNote}
                onChange={setBulkNote}
                autoComplete="off"
                required
                disabled={bulkProcessing}
                error={
                  isBulkNoteInvalid
                    ? 'Note is required to perform bulk updates'
                    : undefined
                }
              />
            </BlockStack>
          </Card>
        )}

        <Card padding="0">
          {loading && returnsList.length === 0 ? (
            <Box padding="400">
              <SkeletonBodyText lines={6} />
            </Box>
          ) : returnsList.length === 0 ? (
            <Box padding="400">
              <EmptyState
                heading="No returns found"
                image=""
              >
                <Text tone="subdued">
                  No customer returns match your filter criteria.
                </Text>
              </EmptyState>
            </Box>
          ) : (
            <DataTable
              columnContentTypes={[
                'text',
                'text',
                'text',
                'text',
                'text',
                'text',
                'text',
                'text',
                'text',
              ]}
              headings={[
                <Checkbox
                  key="select-all"
                  label="Select all returns"
                  labelHidden
                  checked={
                    allSelected
                      ? true
                      : someSelected
                        ? 'indeterminate'
                        : false
                  }
                  disabled={bulkProcessing}
                  onChange={toggleSelectAll}
                />,
                'Return #',
                'Order #',
                'Created At',
                'Customer',
                'Items',
                'Reason',
                'Status',
                'Actions',
              ]}
              rows={rows}
            />
          )}

          {/* Pagination */}
          <Box padding="400">
            <InlineStack
              align="space-between"
              blockAlign="center"
              gap="300"
              wrap
            >
              <Text variant="bodySm" tone="subdued">
                Page {pagination.page} of{' '}
                {pagination.totalPages} (Total{' '}
                {pagination.total} returns)
              </Text>

              <InlineStack gap="200">
                <Button
                  disabled={page <= 1 || loading || bulkProcessing}
                  onClick={() =>
                    setPage((current) =>
                      Math.max(current - 1, 1),
                    )
                  }
                >
                  Previous
                </Button>

                <Button
                  disabled={
                    page >= pagination.totalPages ||
                    loading ||
                    bulkProcessing
                  }
                  onClick={() =>
                    setPage((current) => current + 1)
                  }
                >
                  Next
                </Button>
              </InlineStack>
            </InlineStack>
          </Box>
        </Card>

        <Box paddingBlockEnd="2000" />
      </BlockStack>
    </Page>
  );
}