import { useState, useEffect } from 'react'
import '../styles/storefront.css'
import Alert from '../../components/ui/Alert'
import Button from '../../components/ui/Button'

const API_BASE_URL = (
  import.meta.env.VITE_RETURNS_API_BASE_URL || 'http://localhost:8787'
).replace(/\/$/, '')

/**
 * Helper to automatically append the storefront access token 
 * from URL search parameters or sessionStorage.
 */
function getStorefrontUrl(path) {
  const urlParams = new URLSearchParams(window.location.search)
  let accessParam = urlParams.get('access')

  if (accessParam) {
    sessionStorage.setItem('storefront_access', accessParam)
  } else {
    accessParam = sessionStorage.getItem('storefront_access')
  }

  const separator = path.includes('?') ? '&' : '?'
  return `${API_BASE_URL}${path}${accessParam ? `${separator}access=${encodeURIComponent(accessParam)}` : ''}`
}

export default function ReturnStatus() {
  const [returnNumberInput, setReturnNumberInput] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [statusData, setStatusData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Attachment Modal Lightbox State
  const [activeMedia, setActiveMedia] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const rawNumber = params.get('returnNumber') || params.get('returnId') || ''
    const rawEmail = params.get('email') || ''

    if (rawNumber) {
      const decodedNumber = decodeURIComponent(rawNumber).trim()
      const decodedEmail = decodeURIComponent(rawEmail).trim()
      setReturnNumberInput(decodedNumber)
      setEmailInput(decodedEmail)

      if (decodedEmail) {
        fetchReturnStatus(decodedNumber, decodedEmail)
      }
    }
  }, [])

  async function fetchReturnStatus(numberToSearch, emailToSearch) {
    const cleanNumber = String(numberToSearch || '').trim()
    const cleanEmail = String(emailToSearch || '').trim().toLowerCase()

    if (!cleanNumber) {
      setError('Please enter a valid Return Number.')
      return
    }

    if (!cleanEmail) {
      setError('Please enter the email address associated with this return.')
      return
    }

    setLoading(true)
    setError('')
    setStatusData(null)

    try {
      const queryNumber = encodeURIComponent(cleanNumber)
      const queryEmail = encodeURIComponent(cleanEmail)

      // Use getStorefrontUrl to securely include access token in fetch request
      const targetUrl = getStorefrontUrl(`/api/returns/status?returnNumber=${queryNumber}&email=${queryEmail}`)

      const response = await fetch(targetUrl)
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Return request not found. Please verify your details.')
      }

      const returnRecord = data.return || data.data || {}
      setStatusData(returnRecord)
    } catch (err) {
      setError(err.message || 'Failed to fetch return status. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleSearchSubmit(e) {
    e.preventDefault()
    if (returnNumberInput.trim() && emailInput.trim()) {
      const encNum = encodeURIComponent(returnNumberInput.trim())
      const encEmail = encodeURIComponent(emailInput.trim().toLowerCase())
      
      // Preserve access parameter in URL history push state
      const urlParams = new URLSearchParams(window.location.search)
      const accessParam = urlParams.get('access') || sessionStorage.getItem('storefront_access') || ''
      const accessQuery = accessParam ? `&access=${encodeURIComponent(accessParam)}` : ''

      const newUrl = `${window.location.pathname}?returnNumber=${encNum}&email=${encEmail}${accessQuery}`
      window.history.pushState({ path: newUrl }, '', newUrl)

      fetchReturnStatus(returnNumberInput.trim(), emailInput.trim())
    } else {
      setError('Both Return Number and Email are required.')
    }
  }

  function getStatusBadgeStyle(status) {
    const s = String(status || '').toLowerCase()
    switch (s) {
      case 'approved':
      case 'refunded':
      case 'received':
      case 'closed':
        return { bg: '#e6f4ea', color: '#137333', border: '#b7e1cd' }
      case 'rejected':
      case 'cancelled':
        return { bg: '#fce8e6', color: '#c5221f', border: '#f5c2c7' }
      case 'in_transit':
      case 'awaiting_shipment':
      case 'under_review':
      case 'submitted':
      default:
        return { bg: '#fef7e0', color: '#b06000', border: '#fde293' }
    }
  }

  function formatStatusLabel(status) {
    if (!status) return 'Submitted'
    return String(status)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
  }

  // Helper Utilities for Safe JSON Parsing
  const safeParseJSON = (data, fallback = {}) => {
    if (!data) return fallback
    if (typeof data === 'object') return data
    try { return JSON.parse(data) } catch { return fallback }
  }

  const rawOrderNum = String(statusData?.order_number || statusData?.orderNumber || statusData?.invoice_number || 'N/A').replace(/^#+/, '')
  const conditionObj = safeParseJSON(statusData?.condition_json || statusData?.condition, {})
  const attachmentsList = safeParseJSON(statusData?.attachments_json || statusData?.attachments, [])
  const itemsList = safeParseJSON(statusData?.items_json || statusData?.items, [])

  // Helper to maintain access token on back-link
  const getBackLinkUrl = () => {
    const urlParams = new URLSearchParams(window.location.search)
    const accessParam = urlParams.get('access') || sessionStorage.getItem('storefront_access') || ''
    return `/return-request${accessParam ? `?access=${encodeURIComponent(accessParam)}` : ''}`
  }

  return (
    <main className="return-portal">
      <div className="return-container" style={{ maxWidth: '680px', margin: '0 auto', padding: '16px 12px' }}>
        
        {/* Intro Header */}
        <div className="return-intro" style={{ marginBottom: '16px', textAlign: 'left' }}>
          <p className="return-eyebrow" style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.8px', color: '#6b7280', marginBottom: '2px' }}>
            RETURNS &amp; SUPPORT
          </p>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', margin: '0 0 4px 0', lineHeight: '1.2' }}>
            Track Return Status
          </h1>
          <p style={{ fontSize: '13px', color: '#4b5563', margin: 0 }}>
            Enter your Return Number and email address below to view live status updates.
          </p>
        </div>

        <section className="return-form-card" style={{ padding: '16px 20px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
          
          {/* Lookup Input Form */}
          <form onSubmit={handleSearchSubmit} noValidate style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              
              <div style={{ flex: '1 1 170px' }}>
                <label htmlFor="returnNumberSearch" style={{ display: 'block', fontWeight: 600, marginBottom: '3px', fontSize: '12px', color: '#374151' }}>
                  Return Number <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  id="returnNumberSearch"
                  type="text"
                  value={returnNumberInput}
                  onChange={(e) => {
                    setReturnNumberInput(e.target.value)
                    setError('')
                  }}
                  placeholder="e.g. RET-20261018-XXXX"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', outline: 'none' }}
                />
              </div>

              <div style={{ flex: '1 1 180px' }}>
                <label htmlFor="emailSearch" style={{ display: 'block', fontWeight: 600, marginBottom: '3px', fontSize: '12px', color: '#374151' }}>
                  Email Address <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  id="emailSearch"
                  type="email"
                  value={emailInput}
                  onChange={(e) => {
                    setEmailInput(e.target.value)
                    setError('')
                  }}
                  placeholder="Email used for return"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', outline: 'none' }}
                />
              </div>

              <div>
                <Button type="submit" loading={loading} disabled={loading} style={{ padding: '7px 16px', height: '34px', fontSize: '13px', fontWeight: 600 }}>
                  <span>{loading ? 'Searching…' : 'Check'}</span>
                </Button>
              </div>

            </div>
          </form>

          {/* Error Message */}
          {error && (
            <Alert type="error" className="return-inline-alert" onDismiss={() => setError('')} style={{ fontSize: '12px', padding: '8px 12px', marginBottom: '12px' }}>
              {error}
            </Alert>
          )}

          {/* Return Status Details Card */}
          {statusData && (
            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '14px', marginTop: '12px' }}>
              
              {/* Header & Status Badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <span style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', color: '#9ca3af', fontWeight: 700, letterSpacing: '0.5px' }}>
                    Return Number
                  </span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: '#111827', fontFamily: 'monospace' }}>
                    {statusData.return_number || statusData.returnNumber || 'N/A'}
                  </span>
                </div>

                <div>
                  {(() => {
                    const style = getStatusBadgeStyle(statusData.status)
                    return (
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: style.bg,
                          color: style.color,
                          border: `1px solid ${style.border}`,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}
                      >
                        {formatStatusLabel(statusData.status)}
                      </span>
                    )
                  })()}
                </div>
              </div>

              {/* Order Info Compact Grid */}
              <div 
                style={{ 
                  background: '#f9fafb', 
                  borderRadius: '6px', 
                  padding: '10px 12px', 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
                  gap: '12px 16px', 
                  marginBottom: '12px', 
                  border: '1px solid #f3f4f6',
                  alignItems: 'start'
                }}
              >
                <div>
                  <span style={{ display: 'block', fontSize: '10px', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>Order Number</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#1f2937', whiteSpace: 'nowrap' }}>#{rawOrderNum}</span>
                </div>

                <div>
                  <span style={{ display: 'block', fontSize: '10px', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>Email</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#1f2937', wordBreak: 'break-all' }}>
                    {statusData.customer_email_masked || statusData.customerEmail || emailInput || 'N/A'}
                  </span>
                </div>

                <div>
                  <span style={{ display: 'block', fontSize: '10px', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>Reason</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#1f2937' }}>{statusData.reason || 'N/A'}</span>
                </div>

                <div style={{ gridColumn: 'span 2', minWidth: 'max-content' }}>
                  <span style={{ display: 'block', fontSize: '10px', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>Requested Resolution</span>
                  <span 
                    style={{ 
                      fontSize: '12px', 
                      fontWeight: 600, 
                      color: '#2563eb', 
                      whiteSpace: 'nowrap',
                      display: 'inline-block'
                    }}
                  >
                    {statusData.requested_resolution || statusData.requestedResolution || 'Original Payment'}
                  </span>
                </div>

                {statusData.created_at && (
                  <div>
                    <span style={{ display: 'block', fontSize: '10px', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>Submitted On</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#1f2937', whiteSpace: 'nowrap' }}>
                      {new Date(statusData.created_at).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Item Condition Details (if present) */}
              {Object.keys(conditionObj).length > 0 && (
                <div style={{ marginBottom: '12px', padding: '10px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <span style={{ display: 'block', fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
                    Item Condition Verification
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '6px', fontSize: '11px', color: '#334155' }}>
                    <div>Original Packaging: <strong>{conditionObj.inOriginalPackaging ? String(conditionObj.inOriginalPackaging).toUpperCase() : 'N/A'}</strong></div>
                    <div>Item Used: <strong>{conditionObj.isUsed ? String(conditionObj.isUsed).toUpperCase() : 'N/A'}</strong></div>
                    <div>Accessories Included: <strong>{conditionObj.allAccessoriesIncluded ? String(conditionObj.allAccessoriesIncluded).toUpperCase() : 'N/A'}</strong></div>
                    <div>Visible Damage: <strong>{conditionObj.hasVisibleDamage ? String(conditionObj.hasVisibleDamage).toUpperCase() : 'N/A'}</strong></div>
                  </div>
                </div>
              )}

              {/* Customer Note */}
              {(statusData.customer_note || statusData.customerNote) && (
                <div style={{ marginBottom: '12px', background: '#eff6ff', borderLeft: '3px solid #3b82f6', padding: '8px 10px', borderRadius: '0 6px 6px 0' }}>
                  <span style={{ display: 'block', fontSize: '10px', color: '#1d4ed8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>
                    Customer Note
                  </span>
                  <p style={{ margin: 0, fontSize: '12px', color: '#1e3a8a', lineHeight: '1.4' }}>
                    {statusData.customer_note || statusData.customerNote}
                  </p>
                </div>
              )}

              {/* Uploaded Attachments Preview */}
              {attachmentsList && attachmentsList.length > 0 && (
                <div style={{ marginBottom: '14px' }}>
                  <h4 style={{ fontSize: '11px', fontWeight: 700, marginBottom: '6px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Attached Photos / Videos ({attachmentsList.length})
                  </h4>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {attachmentsList.map((item, idx) => {
                      const url = typeof item === 'string' ? item : item?.url
                      const isVideo = typeof item === 'object' ? item?.type === 'video' : /\.(mp4|webm|ogg|mov)($|\?)/i.test(url)
                      if (!url) return null

                      return (
                        <div
                          key={idx}
                          onClick={() => setActiveMedia({ url, isVideo })}
                          style={{
                            width: '64px',
                            height: '64px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            background: '#000',
                            position: 'relative'
                          }}
                        >
                          {isVideo ? (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '10px' }}>
                              ▶ Video
                            </div>
                          ) : (
                            <img src={url} alt={`Attachment ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Returned Items List */}
              {itemsList && itemsList.length > 0 && (
                <div style={{ marginBottom: '14px' }}>
                  <h4 style={{ fontSize: '11px', fontWeight: 700, marginBottom: '6px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Returned Items ({itemsList.length})
                  </h4>
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
                    {itemsList.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '8px 12px',
                          borderBottom: idx < itemsList.length - 1 ? '1px solid #f3f4f6' : 'none',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: '#fff'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '12px', color: '#1f2937' }}>{item.title || 'Returned Item'}</div>
                          {item.variantTitle && <div style={{ fontSize: '11px', color: '#6b7280' }}>Variant: {item.variantTitle}</div>}
                          {item.sku && <div style={{ fontSize: '10px', color: '#9ca3af' }}>SKU: {item.sku}</div>}
                        </div>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563', background: '#f3f4f6', padding: '2px 8px', borderRadius: '4px' }}>
                          Qty: {item.quantity ?? 1}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Vertical Timeline */}
              {statusData.history && statusData.history.length > 0 && (
                <div style={{ marginBottom: '14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '12px 14px' }}>
                  <h4 style={{ fontSize: '11px', fontWeight: 700, marginBottom: '10px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Status Timeline &amp; Updates
                  </h4>
                  <div style={{ position: 'relative', paddingLeft: '18px' }}>
                    <div style={{ position: 'absolute', left: '4px', top: '4px', bottom: '4px', width: '2px', borderLeft: '2px dashed #d1d5db', zIndex: 1 }} />

                    {statusData.history.map((event, idx) => (
                      <div key={idx} style={{ position: 'relative', marginBottom: idx < statusData.history.length - 1 ? '12px' : '0', zIndex: 2 }}>
                        <div style={{ position: 'absolute', left: '-18px', top: '2px', width: '8px', height: '8px', borderRadius: '50%', background: '#fff', border: '2px solid #2563eb' }} />
                        
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#1f2937' }}>
                          {event.new_status || event.newStatus ? `Status changed to ${formatStatusLabel(event.new_status || event.newStatus)}` : formatStatusLabel(event.event_type || event.eventType)}
                        </div>
                        
                        {event.message && (
                          <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '1px' }}>
                            {event.message}
                          </div>
                        )}

                        {(event.actor_type || event.actorType) && (
                          <span style={{ display: 'inline-block', fontSize: '9px', fontWeight: 600, color: '#4b5563', background: '#f3f4f6', padding: '1px 4px', borderRadius: '4px', marginTop: '2px', textTransform: 'uppercase' }}>
                            By {event.actor_type || event.actorType}
                          </span>
                        )}

                        {(event.created_at || event.createdAt) && (
                          <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px' }}>
                            {new Date(event.created_at || event.createdAt).toLocaleString()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer Links with preserved access token */}
              <div style={{ textAlign: 'center', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #f3f4f6' }}>
                <a
                  href={getBackLinkUrl()}
                  style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none', fontSize: '12px' }}
                >
                  &larr; Submit another return request
                </a>
              </div>

            </div>
          )}

        </section>

        {/* Media Preview Modal Lightbox */}
        {activeMedia && (
          <div
            onClick={() => setActiveMedia(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 99999,
              padding: '16px'
            }}
          >
            <div style={{ maxWidth: '90vw', maxHeight: '90vh', background: '#000', borderRadius: '8px', overflow: 'hidden' }}>
              {activeMedia.isVideo ? (
                <video src={activeMedia.url} controls autoPlay style={{ maxWidth: '100%', maxHeight: '80vh' }} />
              ) : (
                <img src={activeMedia.url} alt="Attachment Preview" style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }} />
              )}
            </div>
          </div>
        )}

      </div>
    </main>
  )
}