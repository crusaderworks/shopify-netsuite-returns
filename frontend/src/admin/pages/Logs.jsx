import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Page,
  Layout,
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
  Divider,
  Modal,
} from '@shopify/polaris';
import { useAppBridge } from '@shopify/app-bridge-react';
import { authenticatedFetch } from '@shopify/app-bridge/utilities';
import { formatLocalDateTime, formatTimeAgo } from '../../utils/date.js';

const API_BASE_URL = (
  import.meta.env.VITE_RETURNS_API_BASE_URL || 'http://localhost:8787'
).replace(/\/$/, '');

const PAGE_SIZE = 20;

function getStatusBadgeTone(status) {
  const norm = String(status || '').toLowerCase();

  if (
    norm === 'success' ||
    norm === 'completed' ||
    norm === 'approved'
  ) {
    return 'success';
  }

  if (
    norm === 'error' ||
    norm === 'failed' ||
    norm === 'critical'
  ) {
    return 'critical';
  }

  if (norm === 'pending' || norm === 'warning') {
    return 'attention';
  }

  return 'info';
}

export default function Logs() {
  const app = useAppBridge();

  const fetchWithAuth = useMemo(
    () => authenticatedFetch(app),
    [app]
  );

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  // Modal State for full message view
  const [selectedMessage, setSelectedMessage] = useState(null);

  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });

  const loadLogs = useCallback(
    async (requestedPage = 1, silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const response = await fetchWithAuth(
          `${API_BASE_URL}/api/admin/activity-logs?page=${requestedPage}&limit=${PAGE_SIZE}`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
            },
          }
        );

        const result = await response.json().catch(() => ({}));

        if (!response.ok || result.success === false) {
          throw new Error(
            result.message ||
              `Could not load activity logs (${response.status}).`
          );
        }

        const logList = result.logs ?? result.data?.logs ?? [];
        const meta = result.data?.pagination ?? result.pagination;

        if (!Array.isArray(logList)) {
          throw new Error('Invalid activity logs response.');
        }

        if (meta) {
          const total = Math.max(0, Number(meta.total) || 0);
          const limit = Math.max(1, Number(meta.limit) || PAGE_SIZE);
          const totalPages = Math.max(
            1,
            Number(meta.totalPages) ||
              Math.ceil(total / limit)
          );

          if (requestedPage > totalPages) {
            setPagination({
              page: totalPages,
              limit,
              total,
              totalPages,
            });
            setPage(totalPages);
            await loadLogsRef.current(totalPages, silent);
            return;
          }

          setPagination({
            page: Number(meta.page) || requestedPage,
            limit,
            total,
            totalPages,
          });
        } else {
          throw new Error(
            'Pagination information is missing from the API response.'
          );
        }

        setLogs(logList);
        setPage(requestedPage);
        setError('');
        setLastUpdated(new Date().toISOString());
      } catch (err) {
        console.error('[ActivityLogs] Failed to load:', err);
        setError(err.message || 'Unable to load activity logs.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchWithAuth]
  );

  const loadLogsRef = useMemo(() => ({ current: null }), []);
  loadLogsRef.current = loadLogs;

  useEffect(() => {
    loadLogs(1, false);
  }, [loadLogs]);

  const handlePageChange = (nextPage) => {
    if (
      nextPage < 1 ||
      nextPage > pagination.totalPages ||
      nextPage === page
    ) {
      return;
    }
    loadLogs(nextPage, false);
  };

  const handleRefresh = () => {
    loadLogs(page, true);
  };

  const rows = logs.map((log, index) => {
    const id = log.id ?? `${page}-${index}`;
    const timestamp = log.createdAt || log.created_at;
    const fullMessage = log.message || '—';
    // Only show "See more" if message is genuinely long (more than 75 characters)
    const isLongMessage = fullMessage.length > 75;

    return [
      <BlockStack key={`time-${id}`} gap="050">
        <Text as="span" variant="bodySm" fontWeight="semibold">
          {formatTimeAgo(timestamp)}
        </Text>
        <Text as="span" variant="bodyXs" tone="subdued">
          {formatLocalDateTime(timestamp)}
        </Text>
      </BlockStack>,

      <Badge key={`cat-${id}`} tone="info">
        {log.category || 'general'}
      </Badge>,

      <Text
        key={`action-${id}`}
        as="span"
        variant="bodyMd"
        fontWeight="semibold"
      >
        {log.action || '—'}
      </Text>,

      <Text key={`ref-${id}`} as="span" variant="bodyMd">
        {log.returnNumber ||
          log.return_number ||
          log.orderNumber ||
          log.order_number ||
          '—'}
      </Text>,

      <Badge
        key={`status-${id}`}
        tone={getStatusBadgeTone(log.status)}
      >
        {log.status || 'unknown'}
      </Badge>,

      <div key={`msg-${id}`} style={{ width: '100%', maxWidth: '350px', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
        <Text 
          as="p" 
          variant="bodySm" 
          style={{ 
            display: '-webkit-box', 
            WebkitLineClamp: isLongMessage ? 2 : 'unset', 
            WebkitBoxOrient: 'vertical', 
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            margin: 0,
            lineHeight: '1.4'
          }}
        >
          {fullMessage}
        </Text>
        {isLongMessage && (
          <Box paddingBlockStart="100">
            <Button
              plain
              slim
              onClick={() => setSelectedMessage(fullMessage)}
            >
              See more
            </Button>
          </Box>
        )}
      </div>,
    ];
  });

  const startRecord =
    pagination.total === 0
      ? 0
      : (page - 1) * pagination.limit + 1;

  const endRecord = Math.min(
    page * pagination.limit,
    pagination.total
  );

  return (
    <Page
      fullWidth
      title="Activity Logs"
      subtitle="Audit trail of system events, API requests, and NetSuite sync activities."
    >
      <BlockStack gap="400">
        {error && (
          <Banner
            title="Failed to load logs"
            tone="critical"
            onDismiss={() => setError('')}
          >
            <p>{error}</p>
            <Box paddingBlockStart="200">
              <Button onClick={() => loadLogs(page, false)}>
                Try again
              </Button>
            </Box>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack
                  align="space-between"
                  blockAlign="center"
                  gap="300"
                  wrap
                >
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      System audit log
                    </Text>

                    <Text
                      as="p"
                      variant="bodySm"
                      tone="subdued"
                    >
                      {lastUpdated
                        ? `Last updated at ${formatLocalDateTime(lastUpdated)}`
                        : 'Fetching logs...'}
                    </Text>
                  </BlockStack>

                  <Button
                    onClick={handleRefresh}
                    loading={refreshing}
                    disabled={loading}
                  >
                    Refresh logs
                  </Button>
                </InlineStack>

                <Divider />

                <InlineStack
                  gap="200"
                  align="start"
                  blockAlign="center"
                  wrap
                >
                  <Badge tone="info">
                    {pagination.total} total logs
                  </Badge>

                  <Badge>
                    {pagination.totalPages} pages
                  </Badge>

                  <Badge>
                    {pagination.limit} per page
                  </Badge>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card padding="0">
              {loading && logs.length === 0 ? (
                <Box padding="400">
                  <SkeletonBodyText lines={6} />
                </Box>
              ) : logs.length === 0 && !error ? (
                <Box padding="400">
                  <EmptyState
                    heading="No activity logs found"
                    image=""
                  >
                    <Text as="p" tone="subdued">
                      System actions and API events will show up
                      here as they occur.
                    </Text>
                  </EmptyState>
                </Box>
              ) : logs.length > 0 ? (
                <DataTable
                  columnContentTypes={[
                    'text',
                    'text',
                    'text',
                    'text',
                    'text',
                    'text',
                  ]}
                  headings={[
                    'Timestamp',
                    'Category',
                    'Action',
                    'Reference',
                    'Status',
                    'Message',
                  ]}
                  rows={rows}
                  footerContent={`Showing ${startRecord}–{endRecord} of ${pagination.total} logs`}
                />
              ) : null}
            </Card>
          </Layout.Section>

          {/* Server-side pagination controls */}
          <Layout.Section>
            <Card>
              <InlineStack
                align="space-between"
                blockAlign="center"
                gap="300"
                wrap
              >
                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd" fontWeight="medium">
                    Page {page} of {pagination.totalPages}
                  </Text>

                  <Text as="p" variant="bodySm" tone="subdued">
                    Showing {startRecord}–{endRecord} of{' '}
                    {pagination.total} logs
                  </Text>
                </BlockStack>

                <InlineStack gap="200" blockAlign="center">
                  <Button
                    disabled={page <= 1 || loading || refreshing}
                    onClick={() => handlePageChange(page - 1)}
                  >
                    Previous
                  </Button>

                  <Button
                    disabled={
                      page >= pagination.totalPages ||
                      loading ||
                      refreshing
                    }
                    onClick={() => handlePageChange(page + 1)}
                  >
                    Next
                  </Button>
                </InlineStack>
              </InlineStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>

      {/* Modal for full log message popup */}
      <Modal
        open={Boolean(selectedMessage)}
        onClose={() => setSelectedMessage(null)}
        title="Activity Log Message Details"
        primaryAction={{
          content: 'Close',
          onAction: () => setSelectedMessage(null),
        }}
      >
        <Modal.Section>
          <Box paddingBlock="200">
            <Text as="p" variant="bodyMd" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {selectedMessage}
            </Text>
          </Box>
        </Modal.Section>
      </Modal>

      <Box paddingBlockEnd="2000" />
    </Page>
  );
}