import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  Select,
  TextField,
  Banner,
  Divider,
  Checkbox,
  Box,
} from '@shopify/polaris';
import { useAppBridge } from '@shopify/app-bridge-react';
import { authenticatedFetch } from '@shopify/app-bridge/utilities';

const API_BASE_URL = (
  import.meta.env.VITE_RETURNS_API_BASE_URL || 'http://localhost:8787'
).replace(/\/$/, '');

export default function NetSuite() {
  const app = useAppBridge();
  const fetchWithAuth = useMemo(() => authenticatedFetch(app), [app]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Active Environment Tab/Dropdown State
  const [environment, setEnvironment] = useState('sandbox');

  // Form Fields per Environment
  const [accountId, setAccountId] = useState('');
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [tokenSecret, setTokenSecret] = useState('');
  const [invoiceLookupUrl, setInvoiceLookupUrl] = useState('');
  const [rmaCreationUrl, setRmaCreationUrl] = useState('');
  const [autoSyncOnApproval, setAutoSyncOnApproval] = useState(true);

  // Status Meta
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [hasConsumerSecret, setHasConsumerSecret] = useState(false);
  const [hasTokenSecret, setHasTokenSecret] = useState(false);
  const [lastTestedAt, setLastTestedAt] = useState('');

  // Load configuration whenever environment dropdown changes
  const loadConfig = useCallback(async (envTarget) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/admin/netsuite/config?environment=${envTarget}`);
      const result = await res.json();

      if (result.success && result.data) {
        const d = result.data;
        setAccountId(d.account_id || '');
        setConsumerKey(d.consumer_key || '');
        setTokenId(d.token_id || '');
        setInvoiceLookupUrl(d.invoice_lookup_url || '');
        setRmaCreationUrl(d.rma_creation_url || '');
        setAutoSyncOnApproval(d.auto_sync_on_approval !== 0);
        setConnectionStatus(d.connection_status || 'disconnected');
        setHasConsumerSecret(!!d.has_consumer_secret);
        setHasTokenSecret(!!d.has_token_secret);
        setLastTestedAt(d.last_tested_at || '');
        
        // Clear secret input fields when switching
        setConsumerSecret('');
        setTokenSecret('');
      }
    } catch (err) {
      setError(err.message || 'Failed to load NetSuite settings.');
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth]);

  useEffect(() => {
    loadConfig(environment);
  }, [environment, loadConfig]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/admin/netsuite/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          environment,
          account_id: accountId.trim(),
          consumer_key: consumerKey.trim(),
          consumer_secret: consumerSecret.trim() || undefined,
          token_id: tokenId.trim(),
          token_secret: tokenSecret.trim() || undefined,
          invoice_lookup_url: invoiceLookupUrl.trim(),
          rma_creation_url: rmaCreationUrl.trim(),
          auto_sync_on_approval: autoSyncOnApproval ? 1 : 0,
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || 'Failed to save config.');

      setSuccessMsg(`NetSuite ${environment.toUpperCase()} settings saved successfully!`);
      await loadConfig(environment);
    } catch (err) {
      setError(err.message || 'Could not save NetSuite settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/admin/netsuite/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment }),
      });
      const result = await res.json();

      if (!res.ok || !result.success) throw new Error(result.message || 'Connection test failed.');

      setSuccessMsg(`NetSuite ${environment.toUpperCase()} connection verified successfully!`);
      await loadConfig(environment);
    } catch (err) {
      setError(err.message || 'Connection test failed.');
    } finally {
      setTesting(false);
    }
  };

  const getBadgeTone = (status) => {
    switch (status) {
      case 'connected': return 'success';
      case 'error': return 'critical';
      default: return 'attention';
    }
  };

  return (
    <Page fullWidth
      title="NetSuite ERP Integration"
      subtitle="Manage separate Token-Based Authentication (TBA) settings for Sandbox and Live environments"
      primaryAction={{
        content: `Save ${environment.toUpperCase()} Settings`,
        onAction: handleSave,
        loading: saving,
        disabled: loading || saving,
      }}
    >
      <BlockStack gap="400">
        {error && (
          <Banner title="Error" tone="critical" onDismiss={() => setError('')}>
            <p>{error}</p>
          </Banner>
        )}

        {successMsg && (
          <Banner title="Success" tone="success" onDismiss={() => setSuccessMsg('')}>
            <p>{successMsg}</p>
          </Banner>
        )}

        {/* Environment Switcher Banner / Card */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Active Target Environment
              </Text>
              <Badge tone={getBadgeTone(connectionStatus)}>
                {environment.toUpperCase()}: {connectionStatus.toUpperCase()}
              </Badge>
            </InlineStack>
            <Select
              label="Select Environment to Configure & View Saved Credentials"
              options={[
                { label: 'Sandbox (Testing Environment)', value: 'sandbox' },
                { label: 'Live (Production Environment)', value: 'live' },
              ]}
              value={environment}
              onChange={(val) => setEnvironment(val)}
              disabled={loading}
            />
          </BlockStack>
        </Card>

        <Layout>
          {/* Main Credentials Form */}
          <Layout.Section>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Token-Based Authentication (TBA) — {environment.toUpperCase()}
                  </Text>
                  <Text as="p" tone="subdued">
                    Credentials entered here are securely encrypted and saved independently for the {environment} environment.
                  </Text>

                  <Divider />

                  <TextField
                    label="Account ID (Realm)"
                    value={accountId}
                    onChange={setAccountId}
                    placeholder={environment === 'sandbox' ? 'e.g. 1234567_SB1' : 'e.g. 1234567'}
                    autoComplete="off"
                  />

                  <BlockStack gap="300">
                    <Text variant="headingSm">Integration Application Keys</Text>
                    <TextField
                      label="Consumer Key"
                      value={consumerKey}
                      onChange={setConsumerKey}
                      placeholder="NetSuite Consumer Key"
                      autoComplete="off"
                    />
                    <TextField
                      label="Consumer Secret"
                      value={consumerSecret}
                      onChange={setConsumerSecret}
                      placeholder={hasConsumerSecret ? '•••••••••••••••• (Saved securely)' : 'NetSuite Consumer Secret'}
                      type="password"
                      autoComplete="off"
                      helpText={hasConsumerSecret ? 'Leave blank to keep existing encrypted secret.' : ''}
                    />
                  </BlockStack>

                  <BlockStack gap="300">
                    <Text variant="headingSm">User Access Token Keys</Text>
                    <TextField
                      label="Token ID"
                      value={tokenId}
                      onChange={setTokenId}
                      placeholder="NetSuite Token ID"
                      autoComplete="off"
                    />
                    <TextField
                      label="Token Secret"
                      value={tokenSecret}
                      onChange={setTokenSecret}
                      placeholder={hasTokenSecret ? '•••••••••••••••• (Saved securely)' : 'NetSuite Token Secret'}
                      type="password"
                      autoComplete="off"
                      helpText={hasTokenSecret ? 'Leave blank to keep existing encrypted secret.' : ''}
                    />
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* RESTlet URLs */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    RESTlet Deployment URLs ({environment.toUpperCase()})
                  </Text>
                  <Divider />

                  <TextField
                    label="Invoice / Order Lookup RESTlet URL"
                    value={invoiceLookupUrl}
                    onChange={setInvoiceLookupUrl}
                    placeholder="https://app.netsuite.com/app/site/hosting/restlet.nl?script=...&deploy=..."
                    autoComplete="off"
                  />

                  <TextField
                    label="RMA Creation RESTlet URL"
                    value={rmaCreationUrl}
                    onChange={setRmaCreationUrl}
                    placeholder="https://app.netsuite.com/app/site/hosting/restlet.nl?script=...&deploy=..."
                    autoComplete="off"
                  />
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          {/* Sidebar Actions */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Sync Actions & Status
                  </Text>
                  <Divider />

                  <Checkbox
                    label={`Auto-create RMA in NetSuite (${environment}) upon Return Approval`}
                    checked={autoSyncOnApproval}
                    onChange={setAutoSyncOnApproval}
                  />

                  {lastTestedAt && (
                    <Text variant="bodySm" tone="subdued">
                      Last tested: {new Date(lastTestedAt).toLocaleString()}
                    </Text>
                  )}

                  <Button
                    variant="primary"
                    fullWidth
                    loading={testing}
                    disabled={loading || testing || !accountId}
                    onClick={handleTestConnection}
                  >
                    Test {environment.toUpperCase()} Connection
                  </Button>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
       <Box paddingBlockEnd="2000" />
    </Page>
  );
}