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
} from '@shopify/polaris';
import { useAppBridge } from '@shopify/app-bridge-react';
import { authenticatedFetch } from '@shopify/app-bridge/utilities';
import { Redirect } from '@shopify/app-bridge/actions';
import { ROUTES } from '../../app/routes';
import ReturnDetails from './ReturnDetails'; // Adjust import path to where ReturnDetails is located

const API_BASE_URL = (
  import.meta.env.VITE_RETURNS_API_BASE_URL || 'http://localhost:8787'
).replace(/\/$/, '');

const REFRESH_INTERVAL = 5000;

function navigateTo(app, path) {
  if (!app || !path) return;
  const redirect = Redirect.create(app);
  redirect.dispatch(Redirect.Action.APP, path);
}

const STAT_CONFIG = [
  { key: 'pending', label: 'Pending returns', description: 'Awaiting review', tone: 'attention' },
  { key: 'approved', label: 'Approved', description: 'Accepted requests', tone: 'success' },
  { key: 'rejected', label: 'Rejected', description: 'Declined requests', tone: 'critical' },
  { key: 'total', label: 'Total returns', description: 'All return requests', tone: 'info' },
];

const STATUS_CONFIG = {
  submitted: { label: 'Submitted', tone: 'attention' },
  under_review: { label: 'Under review', tone: 'info' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'critical' },
  awaiting_shipment: { label: 'Awaiting shipment', tone: 'attention' },
  in_transit: { label: 'In transit', tone: 'info' },
  received: { label: 'Received', tone: 'info' },
  refunded: { label: 'Refunded', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'enabled' },
  closed: { label: 'Closed', tone: 'enabled' },
};

function formatStatus(status) {
  const normalized = String(status || '').toLowerCase();
  return STATUS_CONFIG[normalized] || {
    label: normalized ? normalized.replace(/_/g, ' ') : 'Unknown',
    tone: 'enabled',
  };
}

function formatDate(value, includeTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

function normalizeDashboardResponse(data) {
  const stats = data?.stats || {};
  return {
    stats: {
      pending: stats.pendingReturns ?? stats.pending ?? 0,
      approved: stats.approvedReturns ?? stats.approved ?? 0,
      rejected: stats.rejectedReturns ?? stats.rejected ?? 0,
      total: stats.totalReturns ?? stats.total ?? 0,
      websiteCount: stats.websiteCount ?? stats.website ?? 0,
      assistedCount: stats.assistedCount ?? stats.assisted ?? 0,
    },
    recentReturns: Array.isArray(data?.recentReturns) ? data.recentReturns : [],
  };
}
function StatCard({ label, value, description, tone, sourceBreakdown }) {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center" gap="200">
          <Text as="p" variant="bodyMd" tone="subdued">{label}</Text>
          <Badge tone={tone}>{label}</Badge>
        </InlineStack>

        <Text as="p" variant="heading2xl" fontWeight="semibold">
          {Number(value || 0).toLocaleString()}
        </Text>

        <InlineStack align="space-between" blockAlign="end">
          <Text as="p" variant="bodySm" tone="subdued">{description}</Text>
          {sourceBreakdown && (
            <Text as="p" variant="bodyXs" tone="subdued" alignment="end">
              Website: {sourceBreakdown.website} | Assisted: {sourceBreakdown.assisted}
            </Text>
          )}
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

function RecentReturns({ app, returns, loading, onViewAll, onSelectReturn }) {
  const rows = returns.map((item) => {
    const itemCount = Array.isArray(item.items) ? item.items.length : 0;
    const status = formatStatus(item.status);

    return [
      <Text key={`return-${item.id}`} as="span" variant="bodyMd" fontWeight="semibold">
        {item.returnNumber || item.id || '—'}
      </Text>,
      item.orderNumber || '—',
      item.customerEmail || '—',
      `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`,
      item.reason || '—',
      <Badge key={`status-${item.id}`} tone={status.tone}>{status.label}</Badge>,
      formatDate(item.createdAt),
      <Button key={`view-${item.id}`} size="slim" onClick={() => onSelectReturn(item.id)}>
        👁 View
      </Button>,
    ];
  });

  return (
    <Card padding="0">
      <Box padding="400">
        <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
          <BlockStack gap="100">
            <Text as="h2" variant="headingMd">Recent returns</Text>
            <Text as="p" tone="subdued" variant="bodySm">The latest customer return requests</Text>
          </BlockStack>
          <Button onClick={() => navigateTo(app, ROUTES.returns)}>View all returns</Button>
        </InlineStack>
      </Box>

      <Divider />

      {loading && returns.length === 0 ? (
        <Box padding="400"><SkeletonBodyText lines={5} /></Box>
      ) : returns.length === 0 ? (
        <Box padding="400">
          <EmptyState heading="No return requests yet" image="">
            <Text as="p" tone="subdued">Customer return requests will appear here when submitted.</Text>
          </EmptyState>
        </Box>
      ) : (
        <DataTable
          columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text']}
          headings={['Return', 'Order', 'Customer', 'Items', 'Reason', 'Status', 'Created', 'Actions']}
          rows={rows}
        />
      )}
    </Card>
  );
}

export default function Dashboard() {
  const app = useAppBridge();
  const fetchWithAuth = useMemo(() => authenticatedFetch(app), [app]);

  const [dashboard, setDashboard] = useState({
    stats: { pending: 0, approved: 0, rejected: 0, total: 0, websiteCount: 0, assistedCount: 0 },
    recentReturns: [],
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedReturnId, setSelectedReturnId] = useState(null);

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/admin/dashboard`, {
        headers: { Accept: 'application/json' },
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(data.message || `Could not load dashboard (${response.status}).`);
      }

      setDashboard(normalizeDashboardResponse(data.data || data));
      setError('');
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message || 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchWithAuth]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const interval = window.setInterval(() => loadDashboard({ silent: true }), REFRESH_INTERVAL);
    return () => window.clearInterval(interval);
  }, [autoRefresh, loadDashboard]);

  // If a return is selected from the recent table, render ReturnDetails while keeping dashboard mounted or switch view
  if (selectedReturnId) {
    return (
      <ReturnDetails
        returnId={selectedReturnId}
        onBack={() => { setSelectedReturnId(null); loadDashboard(); }}
      />
    );
  }

  return (
    <Page
      fullWidth
      title="Returns overview"
      subtitle="Monitor and manage customer return requests."
      primaryAction={{ content: 'View all returns', onAction: () => navigateTo(app, ROUTES.returns) }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingMd">Dashboard controls</Text>
                  <Badge tone={autoRefresh ? 'success' : 'enabled'}>
                    {autoRefresh ? 'Auto-refresh on (5s)' : 'Auto-refresh off'}
                  </Badge>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  {lastUpdated ? `Last updated at ${formatDate(lastUpdated, true)}` : 'Not loaded yet'}
                </Text>
              </BlockStack>

              <InlineStack gap="200" wrap>
                <Button onClick={() => loadDashboard({ silent: true })} loading={refreshing}>Refresh now</Button>
                <Button variant={autoRefresh ? 'primary' : 'secondary'} onClick={() => setAutoRefresh((prev) => !prev)}>
                  {autoRefresh ? 'Turn auto-refresh off' : 'Turn auto-refresh on'}
                </Button>
              </InlineStack>
            </InlineStack>
          </Card>
        </Layout.Section>

        {error && (
          <Layout.Section>
            <Banner title="Dashboard update failed" tone="critical" onDismiss={() => setError('')}>
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Return activity</Text>
            <InlineStack gap="400" wrap>
              {STAT_CONFIG.map((stat) => (
                <Box key={stat.key} minWidth="220px" width="calc(25% - 12px)">
                  {loading ? (
                    <Card><BlockStack gap="300"><SkeletonBodyText lines={2} /></BlockStack></Card>
                  ) : (
                    <StatCard
                      label={stat.label}
                      value={dashboard.stats[stat.key]}
                      description={stat.description}
                      tone={stat.tone}
                      sourceBreakdown={stat.key === 'total' ? { website: dashboard.stats.websiteCount, assisted: dashboard.stats.assistedCount } : null}
                    />
                  )}
                </Box>
              ))}
            </InlineStack>
          </BlockStack>
        </Layout.Section>

        <Layout.Section>
          <RecentReturns
            app={app}
            returns={dashboard.recentReturns}
            loading={loading}
            onSelectReturn={(id) => setSelectedReturnId(id)}
          />
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">Manage your returns</Text>
                <Text as="p" tone="subdued">Review customer requests or configure your app settings.</Text>
              </BlockStack>
              <InlineStack gap="300" wrap>
                <Button variant="primary" onClick={() => navigateTo(app, ROUTES.returns)}>Review return requests</Button>
                <Button onClick={() => navigateTo(app, ROUTES.settings)}>App settings</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    <Box paddingBlockEnd="2000" />
    </Page>
  );
}