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
  Box
} from '@shopify/polaris';
import { useAppBridge } from '@shopify/app-bridge-react';
import { authenticatedFetch } from '@shopify/app-bridge/utilities';

const API_BASE_URL = (
  import.meta.env.VITE_RETURNS_API_BASE_URL || 'http://localhost:8787'
).replace(/\/$/, '');

export default function ReturnPortalConfigAdmin() {
  const app = useAppBridge();
  const fetchWithAuth = useMemo(() => authenticatedFetch(app), [app]);

  const [selectedTab, setSelectedTab] = useState(0);
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState({ show: false, type: 'success', message: '' });

  // Storefront Integration Info State
  const [shopInfo, setShopInfo] = useState({ shop: '', securePortalUrl: '', embedCode: '' });
  const [copied, setCopied] = useState(false);

  // Modal State for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({
    config_type: 'reason',
    label: '',
    value: '',
    sort_order: 0
  });

  const tabs = [
    { id: 'reasons', content: 'Return Reasons', type: 'reason' },
    { id: 'resolutions', content: 'Requested Resolutions', type: 'resolution' },
    { id: 'condition', content: 'Condition Questions', type: 'condition_question' },
  ];

  const activeType = tabs[selectedTab].type;

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/admin/portal-config`, {
        headers: { Accept: 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        setConfigs(data.configs || []);
      }
    } catch (err) {
      showBanner('error', 'Failed to load configurations.');
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth]);

  const fetchShopInfo = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/admin/shop-info`, {
        headers: { Accept: 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        setShopInfo(data);
      }
    } catch (err) {
      console.error('Failed to load shop integration info');
    }
  }, [fetchWithAuth]);

  useEffect(() => {
    fetchConfigs();
    fetchShopInfo();
  }, [fetchConfigs, fetchShopInfo]);

  function showBanner(type, message) {
    setBanner({ show: true, type, message });
    setTimeout(() => setBanner({ show: false, type: 'success', message: '' }), 4000);
  }

  function handleCopy(text) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    showBanner('success', 'Copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  }

  function handleOpenModal(item = null) {
    if (item) {
      setEditingItem(item);
      setForm({
        config_type: item.config_type,
        label: item.label,
        value: item.value,
        sort_order: item.sort_order
      });
    } else {
      setEditingItem(null);
      setForm({
        config_type: activeType,
        label: '',
        value: '',
        sort_order: filteredConfigs.length + 1
      });
    }
    setIsModalOpen(true);
  }

  async function handleSave() {
    if (!form.label.trim() || !form.value.trim()) {
      showBanner('error', 'Please fill in both Label and Value.');
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
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        showBanner('success', editingItem ? 'Updated successfully!' : 'Created successfully!');
        setIsModalOpen(false);
        fetchConfigs();
      } else {
        showBanner('error', data.message || 'Failed to save configuration.');
      }
    } catch (err) {
      showBanner('error', 'An error occurred while saving.');
    }
  }

  async function handleToggleStatus(item) {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/admin/portal-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          id: item.id,
          is_active: item.is_active ? 0 : 1
        })
      });
      const data = await res.json();
      if (data.success) {
        fetchConfigs();
      } else {
        showBanner('error', data.message || 'Failed to update status.');
      }
    } catch (err) {
      showBanner('error', 'Failed to toggle status.');
    }
  }

  async function handleDelete(id) {
    if (!confirm('Are you sure you want to delete this option?')) return;

    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/admin/portal-config?id=${id}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        showBanner('success', 'Deleted successfully.');
        fetchConfigs();
      } else {
        showBanner('error', data.message || 'Failed to delete option.');
      }
    } catch (err) {
      showBanner('error', 'Failed to delete option.');
    }
  }

  const filteredConfigs = configs.filter((c) => c.config_type === activeType);

  return (
    <Page
      fullWidth
      title="Return Portal Configuration"
      subtitle="Manage dropdown options, condition questions, and get your storefront integration links."
      primaryAction={{
        content: 'Add Option',
        onAction: () => handleOpenModal()
      }}
    >
      <Layout>
        <Layout.Section>
          {banner.show && (
            <Banner status={banner.type === 'error' ? 'critical' : 'success'}>
              <p>{banner.message}</p>
            </Banner>
          )}
        </Layout.Section>

        {/* Storefront Integration & Embed Code Section */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Storefront Portal Integration ({shopInfo.shop || 'Loading...'})
              </Text>
              <Text variant="bodyMd" tone="subdued">
                Share this secure portal URL directly with your customers or embed the return portal into a custom page in your Shopify store using the iframe snippet below.
              </Text>

              <BlockStack gap="200">
                <Text variant="bodySm" fontWeight="bold">Secure Portal URL:</Text>
                <InlineStack gap="300" blockAlign="center" wrap={false}>
                  <Box width="100%">
                    <TextField
                      value={shopInfo.securePortalUrl}
                      readOnly
                      autoComplete="off"
                    />
                  </Box>
                  <Button onClick={() => handleCopy(shopInfo.securePortalUrl)}>
                    {copied ? 'Copied!' : 'Copy URL'}
                  </Button>
                </InlineStack>
              </BlockStack>

              <BlockStack gap="200">
                <Text variant="bodySm" fontWeight="bold">Embed Code (Iframe):</Text>
                <InlineStack gap="300" blockAlign="start" wrap={false}>
                  <Box width="100%">
                    <TextField
                      value={shopInfo.embedCode}
                      readOnly
                      multiline={3}
                      autoComplete="off"
                    />
                  </Box>
                  <Button onClick={() => handleCopy(shopInfo.embedCode)}>
                    Copy Code
                  </Button>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
              <ResourceList
                loading={loading}
                resourceName={{ singular: 'config', plural: 'configs' }}
                items={filteredConfigs}
                renderItem={(item) => {
                  const { id, label, value, is_active, sort_order } = item;

                  return (
                    <ResourceItem id={id} accessibilityLabel={`Manage ${label}`}>
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="100">
                          <InlineStack gap="200" blockAlign="center">
                            <Text variant="bodyMd" fontWeight="bold">
                              {label}
                            </Text>
                            <Badge tone={is_active ? 'success' : 'attention'}>
                              {is_active ? 'Active' : 'Disabled'}
                            </Badge>
                          </InlineStack>

                          <InlineStack gap="300">
                            <Text variant="bodySm" tone="subdued">
                              Value/Key: <code>{value}</code>
                            </Text>
                            <Text variant="bodySm" tone="subdued">
                              Sort Order: {sort_order}
                            </Text>
                          </InlineStack>
                        </BlockStack>

                        <InlineStack gap="200">
                          <Button
                            size="slim"
                            onClick={() => handleToggleStatus(item)}
                          >
                            {is_active ? 'Disable' : 'Enable'}
                          </Button>
                          <Button size="slim" onClick={() => handleOpenModal(item)}>
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

      {/* Add / Edit Modal */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? 'Edit Configuration' : 'Add New Configuration'}
        primaryAction={{
          content: 'Save',
          onAction: handleSave
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setIsModalOpen(false)
          }
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Select
              label="Type"
              options={[
                { label: 'Return Reason', value: 'reason' },
                { label: 'Requested Resolution', value: 'resolution' },
                { label: 'Condition Question', value: 'condition_question' }
              ]}
              value={form.config_type}
              onChange={(val) => setForm({ ...form, config_type: val })}
              disabled={Boolean(editingItem)}
            />

            <TextField
              label="Display Label"
              value={form.label}
              onChange={(val) =>
                setForm({
                  ...form,
                  label: val,
                  value: editingItem ? form.value : val.replace(/[^a-zA-Z0-9]/g, '')
                })
              }
              placeholder="e.g. Defective / Damaged"
              autoComplete="off"
            />

            <TextField
              label="Value / Key"
              value={form.value}
              onChange={(val) => setForm({ ...form, value: val })}
              placeholder="e.g. defective_damaged or inOriginalPackaging"
              helpText="Identifier stored in database."
              autoComplete="off"
            />

            <TextField
              label="Sort Order"
              type="number"
              value={String(form.sort_order)}
              onChange={(val) => setForm({ ...form, sort_order: Number(val) })}
              autoComplete="off"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
      <Box paddingBlockEnd="2000" />
    </Page>
  );
}