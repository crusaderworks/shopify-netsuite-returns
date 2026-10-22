
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Page,
  Layout,
  Card,
  ResourceList,
  ResourceItem,
  Text,
  Badge,
  Button,
  Modal,
  TextField,
  Select,
  Banner,
  Tabs,
  InlineStack,
  BlockStack,
  Box,
} from '@shopify/polaris';
import { useAppBridge } from '@shopify/app-bridge-react';
import { authenticatedFetch } from '@shopify/app-bridge/utilities';

const API_BASE_URL = (
  import.meta.env.VITE_RETURNS_API_BASE_URL || 'http://localhost:8787'
).replace(/\/$/, '');

const STATUS_URL_PLACEHOLDER =
  'yourdomain.com/page/return-status';

function normalizeStatusPageUrl(value) {
  const raw = String(value || '').trim();

  if (!raw) return '';

  const normalized = /^https?:\/\//i.test(raw)
    ? raw
    : `https://${raw}`;

  try {
    const parsed = new URL(normalized);

    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      !parsed.hostname ||
      /\s/.test(raw)
    ) {
      return '';
    }

    return parsed.toString();
  } catch {
    return '';
  }
}

/**
 * Use the configured status page as the URL base.
 * Preserve existing access and other query parameters.
 */
function buildStatusPageUrl(configuredUrl, existingUrl) {
  const base = normalizeStatusPageUrl(configuredUrl);

  if (!base) return '';

  try {
    const target = new URL(base);

    if (existingUrl) {
      const existing = new URL(existingUrl);

      existing.searchParams.forEach((value, key) => {
        if (!target.searchParams.has(key)) {
          target.searchParams.append(key, value);
        }
      });

      if (!target.hash && existing.hash) {
        target.hash = existing.hash;
      }
    }

    return target.toString();
  } catch {
    return '';
  }
}

/**
 * Replace only the iframe src URL.
 * Keep the rest of the generated embed code unchanged.
 */
function replaceIframeSrc(embedCode, configuredUrl) {
  if (!embedCode || !configuredUrl) return '';

  const iframeSrcRegex =
    /(<iframe\b[^>]*\bsrc\s*=\s*)(["'])(.*?)\2/i;

  const match = embedCode.match(iframeSrcRegex);

  if (!match) return embedCode;

  const originalIframeUrl = match[3];

  const updatedIframeUrl = buildStatusPageUrl(
    configuredUrl,
    originalIframeUrl
  );

  if (!updatedIframeUrl) return '';

  return embedCode.replace(
    iframeSrcRegex,
    (_, prefix, quote) =>
      `${prefix}${quote}${updatedIframeUrl}${quote}`
  );
}

export default function ReturnPortalConfigAdmin() {
  const app = useAppBridge();
  const fetchWithAuth = useMemo(
    () => authenticatedFetch(app),
    [app]
  );

  const [selectedTab, setSelectedTab] = useState(0);
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState({
    show: false,
    type: 'success',
    message: '',
  });

  // Existing storefront integration information.
  const [shopInfo, setShopInfo] = useState({
    shop: '',
    securePortalUrl: '',
    embedCode: '',
  });

  const [copied, setCopied] = useState(false);

  // Status page URL comes from the D1 configuration.
  const [statusPageUrl, setStatusPageUrl] = useState('');
  const [savingStatusUrl, setSavingStatusUrl] = useState(false);

  // Add/Edit modal.
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({
    config_type: 'reason',
    label: '',
    value: '',
    sort_order: 0,
  });

  const tabs = [
    { id: 'reasons', content: 'Return Reasons', type: 'reason' },
    {
      id: 'resolutions',
      content: 'Requested Resolutions',
      type: 'resolution',
    },
    {
      id: 'condition',
      content: 'Condition Questions',
      type: 'condition_question',
    },
  ];

  const activeType = tabs[selectedTab].type;

  const statusPageConfig = configs.find(
    (item) => item.config_type === 'status_page_url'
  );

  // If the database value is empty, do not fall back to an env URL.
  const configuredPortalUrl = statusPageUrl.trim()
    ? buildStatusPageUrl(
        statusPageUrl,
        shopInfo.securePortalUrl
      )
    : '';

  const configuredEmbedCode = statusPageUrl.trim()
    ? replaceIframeSrc(
        shopInfo.embedCode,
        statusPageUrl
      )
    : '';

  const fetchConfigs = useCallback(async () => {
    setLoading(true);

    try {
      const res = await fetchWithAuth(
        `${API_BASE_URL}/api/admin/portal-config`,
        {
          headers: { Accept: 'application/json' },
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.message || 'Failed to load configurations.'
        );
      }

      const loadedConfigs = data.configs || [];

      setConfigs(loadedConfigs);

      const statusConfig = loadedConfigs.find(
        (item) => item.config_type === 'status_page_url'
      );

      setStatusPageUrl(statusConfig?.value || '');
    } catch (error) {
      showBanner(
        'error',
        error.message || 'Failed to load configurations.'
      );
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth]);

  const fetchShopInfo = useCallback(async () => {
    try {
      const res = await fetchWithAuth(
        `${API_BASE_URL}/api/admin/shop-info`,
        {
          headers: { Accept: 'application/json' },
        }
      );

      const data = await res.json();

      if (res.ok && data.success) {
        setShopInfo({
          shop: data.shop || '',
          securePortalUrl: data.securePortalUrl || '',
          embedCode: data.embedCode || '',
        });
      }
    } catch (error) {
      console.error(
        'Failed to load shop integration info:',
        error
      );
    }
  }, [fetchWithAuth]);

  useEffect(() => {
    fetchConfigs();
    fetchShopInfo();
  }, [fetchConfigs, fetchShopInfo]);

  function showBanner(type, message) {
    setBanner({ show: true, type, message });

    setTimeout(() => {
      setBanner({
        show: false,
        type: 'success',
        message: '',
      });
    }, 4000);
  }

  async function handleCopy(text) {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      showBanner('success', 'Copied to clipboard!');

      setTimeout(() => setCopied(false), 2000);
    } catch {
      showBanner('error', 'Failed to copy to clipboard.');
    }
  }

  function handleOpenModal(item = null) {
    if (item) {
      setEditingItem(item);

      setForm({
        config_type: item.config_type,
        label: item.label,
        value: item.value,
        sort_order: item.sort_order,
      });
    } else {
      setEditingItem(null);

      setForm({
        config_type: activeType,
        label: '',
        value: '',
        sort_order:
          configs.filter(
            (item) => item.config_type === activeType
          ).length + 1,
      });
    }

    setIsModalOpen(true);
  }

  async function handleSave() {
    if (!form.label.trim() || !form.value.trim()) {
      showBanner(
        'error',
        'Please fill in both Label and Value.'
      );
      return;
    }

    try {
      const url = `${API_BASE_URL}/api/admin/portal-config`;
      const method = editingItem ? 'PUT' : 'POST';

      const payload = editingItem
        ? { id: editingItem.id, ...form }
        : form;

      const res = await fetchWithAuth(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.message || 'Failed to save configuration.'
        );
      }

      showBanner(
        'success',
        editingItem
          ? 'Updated successfully!'
          : 'Created successfully!'
      );

      setIsModalOpen(false);
      await fetchConfigs();
    } catch (error) {
      showBanner(
        'error',
        error.message || 'An error occurred while saving.'
      );
    }
  }

  async function handleSaveStatusPageUrl() {
    const value = statusPageUrl.trim();
    const existingConfig = configs.find(
      (item) => item.config_type === 'status_page_url'
    );

    // Allow clearing an existing configuration.
    // If no record exists, require a URL before creating it.
    if (!value && !existingConfig) {
      showBanner(
        'error',
        `Enter your status page URL, e.g. ${STATUS_URL_PLACEHOLDER}`
      );
      return;
    }

    if (value && !normalizeStatusPageUrl(value)) {
      showBanner(
        'error',
        `Enter a valid URL, e.g. ${STATUS_URL_PLACEHOLDER}`
      );
      return;
    }

    setSavingStatusUrl(true);

    try {
      const payload = existingConfig
        ? {
            id: existingConfig.id,
            value,
          }
        : {
            config_type: 'status_page_url',
            label: 'Status Page URL',
            value,
            sort_order: 1,
          };

      const res = await fetchWithAuth(
        `${API_BASE_URL}/api/admin/portal-config`,
        {
          method: existingConfig ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.message || 'Failed to save status page URL.'
        );
      }

      showBanner(
        'success',
        value
          ? 'Status page URL saved successfully.'
          : 'Status page URL cleared successfully.'
      );

      await fetchConfigs();
    } catch (error) {
      showBanner(
        'error',
        error.message || 'Failed to save status page URL.'
      );
    } finally {
      setSavingStatusUrl(false);
    }
  }

  async function handleToggleStatus(item) {
    try {
      const res = await fetchWithAuth(
        `${API_BASE_URL}/api/admin/portal-config`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            id: item.id,
            is_active: item.is_active ? 0 : 1,
          }),
        }
      );

      const data = await res.json();

      if (res.ok && data.success) {
        await fetchConfigs();
      } else {
        showBanner(
          'error',
          data.message || 'Failed to update status.'
        );
      }
    } catch {
      showBanner('error', 'Failed to toggle status.');
    }
  }

  async function handleDelete(id) {
    if (!confirm('Are you sure you want to delete this option?')) {
      return;
    }

    try {
      const res = await fetchWithAuth(
        `${API_BASE_URL}/api/admin/portal-config?id=${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
          headers: { Accept: 'application/json' },
        }
      );

      const data = await res.json();

      if (res.ok && data.success) {
        showBanner('success', 'Deleted successfully.');
        await fetchConfigs();
      } else {
        showBanner(
          'error',
          data.message || 'Failed to delete option.'
        );
      }
    } catch {
      showBanner('error', 'Failed to delete option.');
    }
  }

  const filteredConfigs = configs.filter(
    (item) => item.config_type === activeType
  );

  return (
    <Page
      fullWidth
      title="Return Portal Configuration"
      subtitle="Manage return options and configure your customer-facing return portal."
      primaryAction={{
        content: 'Add Option',
        onAction: () => handleOpenModal(),
      }}
    >
      <Layout>
        {banner.show && (
          <Layout.Section>
            <Banner
              tone={
                banner.type === 'error'
                  ? 'critical'
                  : 'success'
              }
              onDismiss={() =>
                setBanner({
                  show: false,
                  type: 'success',
                  message: '',
                })
              }
            >
              <p>{banner.message}</p>
            </Banner>
          </Layout.Section>
        )}

        {/* Storefront integration */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Storefront Portal Integration (
                {shopInfo.shop || 'Loading...'})
              </Text>

              <Text variant="bodyMd" tone="subdued">
                Configure your customer return-status page below.
                The saved URL is used for both the direct link and
                iframe integration. Existing access parameters are
                preserved.
              </Text>

              {/* Status page URL configuration */}
              <BlockStack gap="200">
                <Text variant="bodySm" fontWeight="bold">
                  Status Page URL
                </Text>

                <TextField
                  label="Customer Return Status Page"
                  labelHidden
                  value={statusPageUrl}
                  onChange={setStatusPageUrl}
                  placeholder={STATUS_URL_PLACEHOLDER}
                  helpText="Example: yourdomain.com/page/return-status. Enter your complete page URL, including the path."
                  autoComplete="url"
                  clearButton
                  onClearButtonClick={() =>
                    setStatusPageUrl('')
                  }
                />

                <InlineStack align="end" gap="200">
                  <Button
                    onClick={() => {
                      const savedValue =
                        statusPageConfig?.value || '';

                      setStatusPageUrl(savedValue);
                    }}
                    disabled={savingStatusUrl}
                  >
                    Cancel
                  </Button>

                  <Button
                    variant="primary"
                    onClick={handleSaveStatusPageUrl}
                    loading={savingStatusUrl}
                  >
                    Save Status Page URL
                  </Button>
                </InlineStack>

                {!statusPageUrl.trim() && (
                  <Banner tone="warning">
                    <p>
                      Add your status page URL to enable the
                      direct URL and iframe embed code. No
                      environment URL or localhost fallback
                      will be used.
                    </p>
                  </Banner>
                )}
              </BlockStack>

              {/* Direct URL */}
              <BlockStack gap="200">
                <Text variant="bodySm" fontWeight="bold">
                  Secure Portal URL
                </Text>

                <InlineStack
                  gap="300"
                  blockAlign="center"
                  wrap={false}
                >
                  <Box width="100%">
                    <TextField
                      label="Secure Portal URL"
                      labelHidden
                      value={configuredPortalUrl}
                      readOnly
                      autoComplete="off"
                      placeholder="Add your status page URL above"
                    />
                  </Box>

                  <Button
                    onClick={() =>
                      handleCopy(configuredPortalUrl)
                    }
                    disabled={!configuredPortalUrl}
                  >
                    Copy URL
                  </Button>
                </InlineStack>
              </BlockStack>

              {/* Iframe code */}
              <BlockStack gap="200">
                <Text variant="bodySm" fontWeight="bold">
                  Embed Code (Iframe)
                </Text>

                <InlineStack
                  gap="300"
                  blockAlign="start"
                  wrap={false}
                >
                  <Box width="100%">
                    <TextField
                      label="Iframe Embed Code"
                      labelHidden
                      value={configuredEmbedCode}
                      readOnly
                      multiline={3}
                      autoComplete="off"
                      placeholder="Add your status page URL above"
                    />
                  </Box>

                  <Button
                    onClick={() =>
                      handleCopy(configuredEmbedCode)
                    }
                    disabled={!configuredEmbedCode}
                  >
                    Copy Code
                  </Button>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Existing configuration tabs */}
        <Layout.Section>
          <Card padding="0">
            <Tabs
              tabs={tabs}
              selected={selectedTab}
              onSelect={setSelectedTab}
            >
              <ResourceList
                loading={loading}
                resourceName={{
                  singular: 'config',
                  plural: 'configs',
                }}
                items={filteredConfigs}
                renderItem={(item) => {
                  const {
                    id,
                    label,
                    value,
                    is_active,
                    sort_order,
                  } = item;

                  return (
                    <ResourceItem
                      id={id}
                      accessibilityLabel={`Manage ${label}`}
                    >
                      <InlineStack
                        align="space-between"
                        blockAlign="center"
                      >
                        <BlockStack gap="100">
                          <InlineStack
                            gap="200"
                            blockAlign="center"
                          >
                            <Text
                              variant="bodyMd"
                              fontWeight="bold"
                            >
                              {label}
                            </Text>

                            <Badge
                              tone={
                                is_active
                                  ? 'success'
                                  : 'attention'
                              }
                            >
                              {is_active
                                ? 'Active'
                                : 'Disabled'}
                            </Badge>
                          </InlineStack>

                          <InlineStack gap="300">
                            <Text
                              variant="bodySm"
                              tone="subdued"
                            >
                              Value/Key:{' '}
                              <code>{value}</code>
                            </Text>

                            <Text
                              variant="bodySm"
                              tone="subdued"
                            >
                              Sort Order: {sort_order}
                            </Text>
                          </InlineStack>
                        </BlockStack>

                        <InlineStack gap="200">
                          <Button
                            size="slim"
                            onClick={() =>
                              handleToggleStatus(item)
                            }
                          >
                            {is_active
                              ? 'Disable'
                              : 'Enable'}
                          </Button>

                          <Button
                            size="slim"
                            onClick={() =>
                              handleOpenModal(item)
                            }
                          >
                            Edit
                          </Button>

                          <Button
                            size="slim"
                            tone="critical"
                            onClick={() => handleDelete(id)}
                          >
                            Delete
                          </Button>
                        </InlineStack>
                      </InlineStack>
                    </ResourceItem>
                  );
                }}
              />
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Add/Edit modal */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          editingItem
            ? 'Edit Configuration'
            : 'Add New Configuration'
        }
        primaryAction={{
          content: 'Save',
          onAction: handleSave,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setIsModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Select
              label="Type"
              options={[
                {
                  label: 'Return Reason',
                  value: 'reason',
                },
                {
                  label: 'Requested Resolution',
                  value: 'resolution',
                },
                {
                  label: 'Condition Question',
                  value: 'condition_question',
                },
              ]}
              value={form.config_type}
              onChange={(value) =>
                setForm({
                  ...form,
                  config_type: value,
                })
              }
              disabled={Boolean(editingItem)}
            />

            <TextField
              label="Display Label"
              value={form.label}
              onChange={(value) =>
                setForm({
                  ...form,
                  label: value,
                  value: editingItem
                    ? form.value
                    : value.replace(/[^a-zA-Z0-9]/g, ''),
                })
              }
              placeholder="e.g. Defective / Damaged"
              autoComplete="off"
            />

            <TextField
              label="Value / Key"
              value={form.value}
              onChange={(value) =>
                setForm({
                  ...form,
                  value,
                })
              }
              placeholder="e.g. defective_damaged or inOriginalPackaging"
              helpText="Identifier stored in the database."
              autoComplete="off"
            />

            <TextField
              label="Sort Order"
              type="number"
              value={String(form.sort_order)}
              onChange={(value) =>
                setForm({
                  ...form,
                  sort_order: Number(value),
                })
              }
              autoComplete="off"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Box paddingBlockEnd="2000" />
    </Page>
  );
}
