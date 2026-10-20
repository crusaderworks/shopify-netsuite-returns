
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Box,
  Banner,
  Divider,
  SkeletonBodyText,
  Icon,
} from '@shopify/polaris';
import {
  ViewIcon,
  MaximizeIcon,
} from '@shopify/polaris-icons';
import { useAppBridge } from '@shopify/app-bridge-react';
import { authenticatedFetch } from '@shopify/app-bridge/utilities';
import { formatLocalDateTime, formatTimeAgo } from '../../utils/date.js';
const API_BASE_URL = (
  import.meta.env.VITE_RETURNS_API_BASE_URL || 'http://localhost:8787'
).replace(/\/$/, '');

const HISTORY_PAGE_SIZE = 5;

const STATUS_OPTIONS = [
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

const previewButtonStyle = {
  padding: '8px 12px',
  border: '1px solid #555',
  borderRadius: 6,
  background: '#303136',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 13,
};

function getStatusTone(status) {
  switch (String(status || '').toLowerCase()) {
    case 'approved':
    case 'refunded':
    case 'received':
    case 'closed':
      return 'success';

    case 'rejected':
    case 'cancelled':
      return 'critical';

    case 'submitted':
    case 'under_review':
    case 'awaiting_shipment':
    case 'in_transit':
      return 'attention';

    default:
      return 'info';
  }
}

function formatStatus(status) {
  if (!status) return 'Unknown';

  return String(status)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function InfoRow({ label, children }) {
  return (
    <Text as="p" variant="bodyMd">
      <Text as="span" fontWeight="semibold">
        {label}:{' '}
      </Text>
      {children || '—'}
    </Text>
  );
}

function StatusBadge({ status }) {
  return (
    <Badge tone={getStatusTone(status)}>
      {formatStatus(status)}
    </Badge>
  );
}

function getAttachmentDetails(item, index) {
  const url = typeof item === 'string' ? item : item?.url;

  const name =
    typeof item === 'object' && item?.name
      ? item.name
      : `Attachment ${index + 1}`;

  const declaredType =
    typeof item === 'object' ? item?.type || '' : '';

  const isVideo =
    declaredType.startsWith('video/') ||
    /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url || '');

  return {
    url,
    name,
    type: isVideo ? 'video' : 'image',
  };
}

export default function ReturnDetails({ returnId, onBack }) {
  const app = useAppBridge();
  const viewerRef = useRef(null);
  const fetchWithAuth = useMemo(
    () => authenticatedFetch(app),
    [app]
  );

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [selectedStatus, setSelectedStatus] = useState('submitted');
  const [initialStatus, setInitialStatus] = useState('submitted');
  const [statusNote, setStatusNote] = useState('');

  const [historyPage, setHistoryPage] = useState(1);

  const [activeModalMedia, setActiveModalMedia] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const closeMediaModal = useCallback(async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // The viewer can still be closed if exiting fullscreen fails.
      }
    }

    setActiveModalMedia(null);
    setZoomLevel(1);
    setIsFullscreen(false);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !document.fullscreenElement) {
        setActiveModalMedia(null);
        setZoomLevel(1);
        setIsFullscreen(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener(
        'fullscreenchange',
        handleFullscreenChange
      );
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const loadDetails = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetchWithAuth(
        `${API_BASE_URL}/api/admin/returns/${encodeURIComponent(returnId)}`
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || 'Failed to load return details.'
        );
      }

      if (!result.data?.returnItem) {
        throw new Error('Return details were not found.');
      }

      setData(result.data);
      setSelectedStatus(result.data.returnItem.status);
      setInitialStatus(result.data.returnItem.status);
      setStatusNote('');
      setHistoryPage(1);
    } catch (err) {
      setError(err.message || 'Failed to load return details.');
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, returnId]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const isStatusChanged = selectedStatus !== initialStatus;
  const isNoteInvalid = isStatusChanged && !statusNote.trim();

  const handleStatusUpdate = async () => {
    if (updating) return;

    if (!isStatusChanged) {
      setError('Please select a different status before saving.');
      return;
    }

    if (!statusNote.trim()) {
      setError(
        'Please enter a note or reason before changing the status.'
      );
      return;
    }

    setUpdating(true);
    setError('');
    setSuccessMsg('');

    try {
      const response = await fetchWithAuth(
        `${API_BASE_URL}/api/admin/returns/${encodeURIComponent(returnId)}/status`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: selectedStatus,
            note: statusNote.trim(),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || 'Failed to update return status.'
        );
      }

      setSuccessMsg('Return status updated successfully!');
      await loadDetails();
    } catch (err) {
      setError(err.message || 'Failed to update return status.');
    } finally {
      setUpdating(false);
    }
  };

  const openMedia = (media) => {
    setActiveModalMedia(media);
    setZoomLevel(1);
    setIsFullscreen(false);
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await viewerRef.current?.requestFullscreen();
      }
    } catch (err) {
      setError('Fullscreen is not available in this browser.');
    }
  };

  if (loading && !data) {
    return (
      <Page
        fullWidth
        title="Return Details"
        backAction={{
          content: 'Back to Returns',
          onAction: onBack,
        }}
      >
        <Card>
          <SkeletonBodyText lines={8} />
        </Card>
      </Page>
    );
  }

  if (!data?.returnItem) {
    return (
      <Page
        fullWidth
        title="Return Details"
        backAction={{
          content: 'Back to Returns',
          onAction: onBack,
        }}
      >
        <BlockStack gap="400">
          {error ? (
            <Banner
              title="Unable to load return"
              tone="critical"
              onDismiss={() => setError('')}
            >
              <p>{error}</p>
            </Banner>
          ) : (
            <Banner tone="critical">
              <p>Return details could not be found.</p>
            </Banner>
          )}

          <Box>
            <Button onClick={loadDetails} loading={loading}>
              Retry
            </Button>
          </Box>
        </BlockStack>
      </Page>
    );
  }

  const { returnItem } = data;

  const items = Array.isArray(returnItem.items)
    ? returnItem.items
    : [];

  const condition = returnItem.condition || {};

  const attachments = Array.isArray(returnItem.attachments)
    ? returnItem.attachments
    : [];

  const history = Array.isArray(data.history)
    ? data.history
    : [];

  const totalHistoryPages = Math.max(
    1,
    Math.ceil(history.length / HISTORY_PAGE_SIZE)
  );

  const safeHistoryPage = Math.min(historyPage, totalHistoryPages);

  const paginatedHistory = history.slice(
    (safeHistoryPage - 1) * HISTORY_PAGE_SIZE,
    safeHistoryPage * HISTORY_PAGE_SIZE
  );

  const historyStart = history.length
    ? (safeHistoryPage - 1) * HISTORY_PAGE_SIZE + 1
    : 0;

  const historyEnd = Math.min(
    safeHistoryPage * HISTORY_PAGE_SIZE,
    history.length
  );

  return (
    <Page
      fullWidth
      title={`Return ${returnItem.returnNumber || returnId}`}
      subtitle={`Associated with order ${returnItem.orderNumber || 'N/A'}`}
      backAction={{
        content: 'Back to Returns',
        onAction: onBack,
      }}
      primaryAction={{
        content: 'Print Return Details',
        onAction: () => window.print(),
      }}
    >
      <BlockStack gap="400">
        {error && (
          <Banner
            title="Something went wrong"
            tone="critical"
            onDismiss={() => setError('')}
          >
            <p>{error}</p>
          </Banner>
        )}

        {successMsg && (
          <Banner
            title="Success"
            tone="success"
            onDismiss={() => setSuccessMsg('')}
          >
            <p>{successMsg}</p>
          </Banner>
        )}

        <Layout>
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Update Status
                  </Text>

                  <Select
                    label="Return Status"
                    options={STATUS_OPTIONS}
                    value={selectedStatus}
                    onChange={(value) => {
                      setSelectedStatus(value);
                      setError('');
                      setSuccessMsg('');
                    }}
                    disabled={updating}
                  />

                  {isStatusChanged && (
                    <TextField
                      label="Status Change Note / Reason"
                      value={statusNote}
                      onChange={(value) => {
                        setStatusNote(value);
                        setError('');
                      }}
                      placeholder="Enter the reason for this status change"
                      autoComplete="off"
                      multiline={3}
                      required
                      error={
                        isNoteInvalid
                          ? 'A note is required to update the status.'
                          : undefined
                      }
                      disabled={updating}
                    />
                  )}

                  <Button
                    variant="primary"
                    fullWidth
                    loading={updating}
                    disabled={
                      updating ||
                      !isStatusChanged ||
                      isNoteInvalid
                    }
                    onClick={handleStatusUpdate}
                  >
                    Save Status
                  </Button>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <InlineStack
                    align="space-between"
                    blockAlign="center"
                    gap="200"
                    wrap
                  >
                    <Text as="h2" variant="headingMd">
                      Customer Info
                    </Text>
                    <StatusBadge status={returnItem.status} />
                  </InlineStack>

                  <Divider />

                  <BlockStack gap="300">
                    <InfoRow label="Email">
                      {returnItem.customerEmail}
                    </InfoRow>
                    <InfoRow label="Customer ID">
                      {returnItem.customerId}
                    </InfoRow>
                    <InlineStack gap="200" blockAlign="center" wrap>
                      <Text as="span" fontWeight="semibold">
                        Source:
                      </Text>
                      <Badge tone="info">
                        {formatStatus(returnItem.source)}
                      </Badge>
                    </InlineStack>
                 <InfoRow label="Created At">
  <div>
    <div>{formatTimeAgo(returnItem.createdAt)}</div>
    <div style={{ fontSize: '12px', color: '#6b7280' }}>
      {formatLocalDateTime(returnItem.createdAt)}
    </div>
  </div>
</InfoRow>

<InfoRow label="Last Updated">
  <div>
    <div>{formatTimeAgo(returnItem.updatedAt)}</div>
    <div style={{ fontSize: '12px', color: '#6b7280' }}>
      {formatLocalDateTime(returnItem.updatedAt)}
    </div>
  </div>
</InfoRow>
                  </BlockStack>
                </BlockStack>
              </Card>
                            {/* Shopify Return Details - only for approved website returns */}
{String(returnItem.source || '').trim().toLowerCase() === 'website' &&
  String(returnItem.status || '').trim().toLowerCase() === 'approved' && (
    <Card>
      <BlockStack gap="400">
        <InlineStack
          align="space-between"
          blockAlign="center"
          wrap
        >
          <Text as="h2" variant="headingMd">
            Shopify Return Details
          </Text>

          <Badge tone="success">Approved</Badge>
        </InlineStack>

        <Divider />

        <BlockStack gap="300">
          <InlineStack
            align="space-between"
            blockAlign="center"
            wrap
          >
            <Text as="span" tone="subdued">
              Shopify Return ID
            </Text>

            <Text as="span" fontWeight="semibold">
              {returnItem.shopify_return_id ??
                returnItem.shopifyReturnId ??
                '—'}
            </Text>
          </InlineStack>
        </BlockStack>
      </BlockStack>
    </Card>
  )}
{/* NetSuite Return Details - only for approved assisted returns */}
{String(returnItem.source || '').trim().toLowerCase() === 'assisted' &&
  String(returnItem.status || '').trim().toLowerCase() === 'approved' && (
    <Card>
      <BlockStack gap="400">
        <InlineStack
          align="space-between"
          blockAlign="center"
          wrap
        >
          <Text as="h2" variant="headingMd">
            NetSuite Return Details
          </Text>

          <Badge tone="success">Approved</Badge>
        </InlineStack>

        <Divider />

        <BlockStack gap="300">
          <InlineStack
            align="space-between"
            blockAlign="center"
            wrap
          >
            <Text as="span" tone="subdued">
              NetSuite Return ID
            </Text>

            <Text as="span" fontWeight="semibold">
              {returnItem.netsuite_return_id ??
                returnItem.netsuiteReturnId ??
                '—'}
            </Text>
          </InlineStack>

          <Divider />

          <InlineStack
            align="space-between"
            blockAlign="center"
            wrap
          >
            <Text as="span" tone="subdued">
              NetSuite RMA Number
            </Text>

            <Text as="span" fontWeight="semibold">
              {returnItem.rma_number ??
                returnItem.rmaNumber ??
                '—'}
            </Text>
          </InlineStack>
        </BlockStack>
      </BlockStack>
    </Card>
  )}
            </BlockStack>
          </Layout.Section>

          <Layout.Section>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Return Reason &amp; Resolution
                  </Text>
                  <Divider />
                  <BlockStack gap="300">
                    <InfoRow label="Reason">
                      {returnItem.reason || 'No reason provided'}
                    </InfoRow>
                    <InfoRow label="Requested Resolution">
                      {returnItem.requestedResolution || 'Not specified'}
                    </InfoRow>
                    <InfoRow label="Customer Note">
                      {returnItem.customerNote || 'None'}
                    </InfoRow>
                  </BlockStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Item Condition Details
                  </Text>
                  <Divider />
                  <BlockStack gap="200">
                    <InfoRow label="In original packaging?">
                      {condition.inOriginalPackaging != null
                        ? String(condition.inOriginalPackaging)
                        : 'N/A'}
                    </InfoRow>
                    <InfoRow label="Has item been used?">
                      {condition.isUsed != null
                        ? String(condition.isUsed)
                        : 'N/A'}
                    </InfoRow>
                    <InfoRow label="All accessories included?">
                      {condition.allAccessoriesIncluded != null
                        ? String(condition.allAccessoriesIncluded)
                        : 'N/A'}
                    </InfoRow>
                    <InfoRow label="Any visible damage?">
                      {condition.hasVisibleDamage != null
                        ? String(condition.hasVisibleDamage)
                        : 'N/A'}
                    </InfoRow>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Attachments */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Attachments ({attachments.length})
                  </Text>
                  <Divider />

                  {attachments.length === 0 ? (
                    <Text as="p" tone="subdued">
                      No attachments provided.
                    </Text>
                  ) : (
                    <InlineStack gap="300" wrap>
                      {attachments.map((item, index) => {
                        const media = getAttachmentDetails(item, index);

                        if (!media.url) return null;

                        return (
                          <button
                            key={`${media.url}-${index}`}
                            type="button"
                            aria-label={`View ${media.name}`}
                            onClick={() => openMedia(media)}
                            style={{
                              position: 'relative',
                              width: 150,
                              height: 120,
                              padding: 0,
                              border: '1px solid #dfe3e8',
                              borderRadius: 8,
                              overflow: 'hidden',
                              cursor: 'pointer',
                              background: '#f6f6f7',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {media.type === 'video' ? (
                              <span style={{ fontSize: 14 }}>
                                ▶ Video
                              </span>
                            ) : (
                              <img
                                src={media.url}
                                alt={media.name}
                                loading="lazy"
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'contain',
                                  display: 'block',
                                }}
                              />
                            )}

                            <span
                              style={{
                                position: 'absolute',
                                right: 8,
                                bottom: 8,
                                width: 34,
                                height: 34,
                                borderRadius: '50%',
                                background: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 1px 5px rgba(0,0,0,.2)',
                              }}
                            >
                              <Icon source={ViewIcon} />
                            </span>
                          </button>
                        );
                      })}
                    </InlineStack>
                  )}
                </BlockStack>
              </Card>

              {/* Returned Items */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Returned Items ({items.length})
                  </Text>
                  <Divider />

                  {items.length === 0 ? (
                    <Text as="p" tone="subdued">
                      No returned items found.
                    </Text>
                  ) : (
                    <BlockStack gap="400">
                      {items.map((item, index) => (
                        <Box
                          key={item.id || `${item.productId || 'item'}-${index}`}
                        >
                          <InlineStack
                            align="space-between"
                            blockAlign="center"
                            gap="300"
                            wrap
                          >
                            <Box minWidth="0">
                              <BlockStack gap="200">
                                <Text
                                  as="p"
                                  variant="bodyMd"
                                  fontWeight="semibold"
                                >
                                  {item.title || 'Product Item'}
                                </Text>
                                <Text
                                  as="p"
                                  variant="bodySm"
                                  tone="subdued"
                                >
                                  SKU: {item.sku || 'N/A'}
                                  {' | '}
                                  Variant ID: {item.variantId || 'N/A'}
                                  {' | '}
                                  Product ID: {item.productId || 'N/A'}
                                </Text>
                              </BlockStack>
                            </Box>
                            <Badge tone="info">
                              Qty: {item.quantity ?? 1}
                            </Badge>
                          </InlineStack>

                          {index < items.length - 1 && (
                            <Box paddingBlockStart="400">
                              <Divider />
                            </Box>
                          )}
                        </Box>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>

              {/* Status Timeline */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack
                    align="space-between"
                    blockAlign="center"
                    gap="200"
                    wrap
                  >
                    <Text as="h2" variant="headingMd">
                      Status Timeline History
                    </Text>
                    <Badge>{history.length} records</Badge>
                  </InlineStack>

                  <Divider />

                  {history.length === 0 ? (
                    <Text as="p" tone="subdued">
                      No history records yet.
                    </Text>
                  ) : (
                    <>
                      <BlockStack gap="400">
                        {paginatedHistory.map((entry, index) => (
                          <Box
                            key={
                              entry.id ||
                              `${entry.createdAt || 'history'}-${index}`
                            }
                          >
                            <BlockStack gap="200">
                              <InlineStack
                                align="space-between"
                                blockAlign="start"
                                gap="300"
                                wrap
                              >
                                <Box minWidth="0">
                                  <BlockStack gap="200">
                                    <Text as="p" variant="bodyMd">
                                      Changed from{' '}
                                      <Text
                                        as="span"
                                        fontWeight="semibold"
                                      >
                                        {formatStatus(
                                          entry.previousStatus || 'none'
                                        )}
                                      </Text>{' '}
                                      to{' '}
                                      <Text
                                        as="span"
                                        fontWeight="semibold"
                                      >
                                        {formatStatus(entry.newStatus)}
                                      </Text>
                                    </Text>
                                    <Badge tone="attention">
                                      {formatStatus(entry.actorType || 'system')}
                                    </Badge>
                                  </BlockStack>
                                </Box>

                                <Text
                                  as="p"
                                  variant="bodySm"
                                  tone="subdued"
                                >
                                  {formatDate(entry.createdAt)}
                                </Text>
                              </InlineStack>

                              {entry.message && (
                                <Text
                                  as="p"
                                  variant="bodySm"
                                  tone="subdued"
                                >
                                  Note: {entry.message}
                                </Text>
                              )}
                            </BlockStack>

                            {index < paginatedHistory.length - 1 && (
                              <Box paddingBlockStart="300">
                                <Divider />
                              </Box>
                            )}
                          </Box>
                        ))}
                      </BlockStack>

                      <Divider />

                      <InlineStack
                        align="space-between"
                        blockAlign="center"
                        gap="300"
                        wrap
                      >
                        <Text
                          as="p"
                          variant="bodySm"
                          tone="subdued"
                        >
                          Showing {historyStart}–{historyEnd} of {history.length} records
                        </Text>

                        <InlineStack gap="200" blockAlign="center">
                          <Button
                            disabled={safeHistoryPage <= 1}
                            onClick={() =>
                              setHistoryPage((page) =>
                                Math.max(1, page - 1)
                              )
                            }
                          >
                            Previous
                          </Button>

                          <Text as="span" variant="bodySm">
                            {safeHistoryPage} / {totalHistoryPages}
                          </Text>

                          <Button
                            disabled={safeHistoryPage >= totalHistoryPages}
                            onClick={() =>
                              setHistoryPage((page) =>
                                Math.min(totalHistoryPages, page + 1)
                              )
                            }
                          >
                            Next
                          </Button>
                        </InlineStack>
                      </InlineStack>
                    </>
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>

      {/* Full-screen attachment viewer */}
      {activeModalMedia && (
        <div
          ref={viewerRef}
          role="dialog"
          aria-modal="true"
          aria-label={activeModalMedia.name || 'Attachment preview'}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            width: '100%',
            height: '100%',
            background: '#111',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Viewer toolbar */}
          <div
            style={{
              flex: '0 0 auto',
              minHeight: 58,
              padding: '10px 16px',
              background: '#202123',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              boxSizing: 'border-box',
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {activeModalMedia.name}
            </span>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setZoomLevel((zoom) =>
                    Math.max(0.25, zoom - 0.25)
                  )
                }
                disabled={zoomLevel <= 0.25}
                style={{
                  ...previewButtonStyle,
                  opacity: zoomLevel <= 0.25 ? 0.5 : 1,
                }}
              >
                −
              </button>

              <span
                style={{
                  fontSize: 13,
                  minWidth: 48,
                  textAlign: 'center',
                }}
              >
                {Math.round(zoomLevel * 100)}%
              </span>

              <button
                type="button"
                onClick={() =>
                  setZoomLevel((zoom) =>
                    Math.min(3, zoom + 0.25)
                  )
                }
                disabled={zoomLevel >= 3}
                style={{
                  ...previewButtonStyle,
                  opacity: zoomLevel >= 3 ? 0.5 : 1,
                }}
              >
                +
              </button>

              <button
                type="button"
                onClick={() => setZoomLevel(1)}
                style={previewButtonStyle}
              >
                Reset
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                style={{
                  ...previewButtonStyle,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Icon source={MaximizeIcon} tone="inherit" />
                {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              </button>

              <button
                type="button"
                onClick={closeMediaModal}
                style={previewButtonStyle}
              >
                ✕ Close
              </button>
            </div>
          </div>

          {/* Media canvas */}
          <div
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'auto',
              padding: 16,
              boxSizing: 'border-box',
              background: '#111',
            }}
          >
            {activeModalMedia.type === 'video' ? (
              <video
                key={activeModalMedia.url}
                src={activeModalMedia.url}
                controls
                autoPlay
                style={{
                  display: 'block',
                  width: `${zoomLevel * 100}%`,
                  height: `${zoomLevel * 100}%`,
                  maxWidth: zoomLevel === 1 ? '100%' : 'none',
                  maxHeight: zoomLevel === 1 ? '100%' : 'none',
                  objectFit: 'contain',
                  flex: '0 0 auto',
                }}
              />
            ) : (
              <img
                key={activeModalMedia.url}
                src={activeModalMedia.url}
                alt={activeModalMedia.name || 'Attachment preview'}
                onClick={() =>
                  setZoomLevel((zoom) =>
                    zoom >= 2 ? 1 : Math.min(3, zoom + 0.25)
                  )
                }
                style={{
                  display: 'block',
                  width: zoomLevel === 1 ? 'auto' : `${zoomLevel * 100}%`,
                  height: zoomLevel === 1 ? 'auto' : `${zoomLevel * 100}%`,
                  maxWidth: zoomLevel === 1 ? '100%' : 'none',
                  maxHeight: zoomLevel === 1 ? '100%' : 'none',
                  objectFit: 'contain',
                  flex: '0 0 auto',
                  cursor: 'zoom-in',
                }}
              />
            )}
          </div>
        </div>
      )}
       <Box paddingBlockEnd="2000" />
    </Page>
  );
}
