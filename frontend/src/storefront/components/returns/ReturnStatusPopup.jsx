import { useState, useEffect } from 'react';
import '../../styles/storefront.css';

export default function ReturnStatusPopup({ isOpen, returnId, onClose }) {
  const [loading, setLoading] = useState(false);
  const [returnDetails, setReturnDetails] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && returnId) {
      fetchReturnStatus(returnId);
    }
  }, [isOpen, returnId]);

  async function fetchReturnStatus(id) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/returns/status?returnId=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (data.success) {
        setReturnDetails(data.return);
      } else {
        setError(data.message || 'Could not fetch return status.');
      }
    } catch (err) {
      setError('Network error while fetching return details.');
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px'
    }}>
      <div style={{
        background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '540px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        maxHeight: '90vh'
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #eaeaea', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>Return Status Details</h3>
          <button 
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#666', fontWeight: 700 }}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '30px', color: '#666' }}>Loading return details...</div>
          )}

          {error && (
            <div style={{ background: '#f8d7da', color: '#721c24', padding: '12px', borderRadius: '6px', fontSize: '14px', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          {!loading && !error && returnDetails && (
            <div>
              <div style={{ background: '#f8f9fa', border: '1px solid #e9ecef', borderRadius: '8px', padding: '16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: '#6c757d', fontWeight: 600 }}>Return Number</span>
                  <strong style={{ fontSize: '16px', fontFamily: 'monospace', color: '#212529' }}>{returnDetails.returnNumber}</strong>
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: '#6c757d', fontWeight: 600, marginBottom: '2px' }}>Status</span>
                  <span style={{ background: '#e2f0cb', color: '#2d6a4f', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, textTransform: 'capitalize' }}>
                    {returnDetails.status}
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '4px' }}>Order Number: <strong>{returnDetails.orderNumber}</strong></span>
                <span style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '16px' }}>Reason: <strong>{returnDetails.reason || 'N/A'}</strong></span>
              </div>

              <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px', color: '#1a1a1a' }}>Returned Items & Quantities</h4>
              <div style={{ border: '1px solid #eaeaea', borderRadius: '6px', overflow: 'hidden' }}>
                {Array.isArray(returnDetails.items) && returnDetails.items.map((item, idx) => (
                  <div key={idx} style={{ padding: '10px 14px', borderBottom: idx < returnDetails.items.length - 1 ? '1px solid #eaeaea' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#333' }}>{item.title}</div>
                      {item.variantTitle && <div style={{ color: '#777', fontSize: '12px' }}>{item.variantTitle}</div>}
                    </div>
                    <div style={{ background: '#f1f3f5', padding: '4px 8px', borderRadius: '4px', fontWeight: 600, color: '#333' }}>
                      Qty: {item.quantity}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #eaeaea', textAlign: 'right', background: '#fafafa' }}>
          <button
            onClick={onClose}
            className="return-button"
            style={{ padding: '8px 18px', borderRadius: '6px', cursor: 'pointer', background: '#1a1a1a', color: '#fff', border: 'none', fontWeight: 600, fontSize: '13px' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}