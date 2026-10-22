import { useState } from 'react'
import { ArrowRightIcon, CheckCircleIcon } from '../../../components/icons/AppIcons'
import Button from '../../../components/ui/Button'
import { STATUS_PAGE_URL } from '../../../config/env'
// Helper to construct secure status URL using returnNumber and email with access token
function getFormattedStatusUrl(request) {
  const returnNumber = 
    request.returnNumber || 
    request.return_number || 
    request.return?.returnNumber || 
    request.return?.return_number || 
    ''

  // Extract email from all possible properties or search parameters
  const urlParams = new URLSearchParams(window.location.search)
  const email = 
    request.email || 
    request.customerEmail || 
    request.customer_email || 
    request.return?.email || 
    request.return?.customerEmail || 
    urlParams.get('email') || 
    ''

  // Extract access token if present in current URL or sessionStorage
  const accessParam = urlParams.get('access') || sessionStorage.getItem('storefront_access') || ''

  const baseUrl = `${STATUS_PAGE_URL}`
  const queryParams = new URLSearchParams()

  if (returnNumber) queryParams.set('returnNumber', returnNumber)
  if (email) queryParams.set('email', email)
  if (accessParam) queryParams.set('access', accessParam)

  return `${baseUrl}?${queryParams.toString()}`
}

// SVG Icons for Copy and PDF Download/Print
function CopyIcon({ size = 14, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  )
}

function PdfIcon({ size = 14, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="12" y1="18" x2="12" y2="12"></line>
      <polyline points="9 15 12 18 15 15"></polyline>
    </svg>
  )
}

export default function ReturnSuccess({ request, onNewRequest }) {
  const [copied, setCopied] = useState(false)
  const returnNumber = 
    request.returnNumber || 
    request.return_number || 
    request.return?.returnNumber || 
    request.returnId || 
    'N/A'
  
  // Always use returnNumber and email based status URL
  const statusUrl = getFormattedStatusUrl(request)

  function handleCopy() {
    navigator.clipboard.writeText(returnNumber).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  function handleDownloadPdf() {
    window.print()
  }

  return (
    <section 
      className="return-success" 
      role="status" 
      aria-live="polite"
      style={{
        padding: '16px 20px',
        background: '#fff',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        textAlign: 'center'
      }}
    >
      {/* Icon & Title Header */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ color: '#16a34a', display: 'flex', justifyContent: 'center', marginBottom: '6px' }}>
          <CheckCircleIcon style={{ width: '28px', height: '28px' }} />
        </div>
        <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.8px', color: '#6b7280', margin: '0 0 2px 0', textTransform: 'uppercase' }}>
          RETURN REQUEST REGISTERED
        </p>
        <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: '0 0 4px 0', lineHeight: '1.2' }}>
          {request.isExisting ? 'Return Request Already Exists' : 'Your request was submitted successfully'}
        </h1>
        <p style={{ fontSize: '12px', color: '#4b5563', margin: 0 }}>
          {request.message}
        </p>
      </div>
      
      {/* Return Number ID Card */}
      <div 
        style={{ 
          background: '#f9fafb', 
          border: '1px solid #e5e7eb', 
          borderRadius: '6px', 
          padding: '12px 14px', 
          marginBottom: '12px',
          maxWidth: '420px',
          margin: '0 auto 12px auto'
        }}
      >
        <span style={{ display: 'block', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: '#9ca3af', letterSpacing: '0.5px' }}>
          Return Number
        </span>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', margin: '4px 0 6px 0' }}>
          <strong style={{ fontFamily: 'monospace', fontSize: '16px', color: '#111827' }}>{returnNumber}</strong>
          <button
            type="button"
            onClick={handleCopy}
            title="Copy Return Number"
            style={{ 
              background: '#fff', 
              border: '1px solid #d1d5db', 
              color: '#374151', 
              padding: '3px 8px', 
              borderRadius: '4px', 
              cursor: 'pointer', 
              fontSize: '11px', 
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <CopyIcon size={12} />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <small style={{ fontSize: '11px', color: '#6b7280', display: 'block' }}>Keep this number for future reference or follow-up.</small>
        
        <div style={{ marginTop: '8px', borderTop: '1px solid #f3f4f6', paddingTop: '8px' }}>
          <button
            type="button"
            onClick={handleDownloadPdf}
            style={{ 
              background: 'transparent', 
              border: 'none', 
              color: '#2563eb', 
              cursor: 'pointer', 
              fontSize: '11px', 
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <PdfIcon size={13} />
            Download / Print PDF Confirmation
          </button>
        </div>
      </div>

      {/* View Return Status Button (Using returnNumber & email) */}
      <div style={{ marginBottom: '14px' }}>
        <a 
          target="_blank"
          href={statusUrl}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '6px 14px',
            fontSize: '12px',
            fontWeight: 600,
            textDecoration: 'none',
            borderRadius: '6px',
            background: '#111827',
            color: '#fff',
            lineHeight: '1.4'
          }}
        >
          <span>View Return Status</span>
          <ArrowRightIcon style={{ width: '12px', height: '12px' }} />
        </a>
      </div>

      {/* Compact Next Steps Box */}
      <section 
        className="return-next-steps" 
        style={{ 
          textAlign: 'left', 
          background: '#fff', 
          border: '1px solid #e5e7eb', 
          borderRadius: '6px', 
          padding: '12px 14px', 
          marginBottom: '12px' 
        }}
      >
        <h2 style={{ fontSize: '12px', fontWeight: 700, color: '#111827', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          What to do next
        </h2>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <li style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <span style={{ background: '#f3f4f6', color: '#374151', fontSize: '10px', fontWeight: 700, borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>1</span>
            <div>
              <strong style={{ fontSize: '12px', color: '#1f2937', display: 'block' }}>Pack your items</strong>
              <small style={{ fontSize: '11px', color: '#6b7280', lineHeight: '1.3', display: 'block' }}>Securely package your items, preferably in their original packaging.</small>
            </div>
          </li>
          <li style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <span style={{ background: '#f3f4f6', color: '#374151', fontSize: '10px', fontWeight: 700, borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>2</span>
            <div>
              <strong style={{ fontSize: '12px', color: '#1f2937', display: 'block' }}>Keep your return number</strong>
              <small style={{ fontSize: '11px', color: '#6b7280', lineHeight: '1.3', display: 'block' }}>Use your return number when contacting support or following up.</small>
            </div>
          </li>
          <li style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <span style={{ background: '#f3f4f6', color: '#374151', fontSize: '10px', fontWeight: 700, borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>3</span>
            <div>
              <strong style={{ fontSize: '12px', color: '#1f2937', display: 'block' }}>Follow return instructions</strong>
              <small style={{ fontSize: '11px', color: '#6b7280', lineHeight: '1.3', display: 'block' }}>Wait for the store's return shipping label or instructions before sending.</small>
            </div>
          </li>
          <li style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <span style={{ background: '#f3f4f6', color: '#374151', fontSize: '10px', fontWeight: 700, borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>4</span>
            <div>
              <strong style={{ fontSize: '12px', color: '#1f2937', display: 'block' }}>Wait for inspection</strong>
              <small style={{ fontSize: '11px', color: '#6b7280', lineHeight: '1.3', display: 'block' }}>Once received and inspected, your refund/exchange will be processed.</small>
            </div>
          </li>
        </ol>
      </section>

      {/* Secondary Bottom Button */}
      <div>
        <Button 
          variant="secondary" 
          onClick={onNewRequest}
          style={{ padding: '6px 14px', fontSize: '12px', height: '32px', background: '#f3f4f6', color: '#374151' }}
        >
          Start another request
        </Button>
      </div>
    </section>
  )
}