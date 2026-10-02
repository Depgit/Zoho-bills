import React, { useEffect, useState } from 'react';
import { api, errMsg } from './api.js';

function getStatusBadge(status) {
  switch (status) {
    case 'PENDING_L1':
      return <span className="badge-status badge-pending-l1">Pending L1</span>;
    case 'PENDING_FINANCE':
      return <span className="badge-status badge-pending-finance">Pending Finance</span>;
    case 'POSTED':
      return <span className="badge-status badge-posted">Posted to Zoho</span>;
    case 'REJECTED_L1':
      return <span className="badge-status badge-rejected-l1">Rejected by L1</span>;
    case 'REJECTED_FINANCE':
      return <span className="badge-status badge-rejected-finance">Rejected by Finance</span>;
    default:
      return <span className="badge-status badge-pending-l1">{status || 'In Review'}</span>;
  }
}

export default function Review({ role }) {
  const [bills, setBills] = useState([]);
  const [sel, setSel] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [pdfType, setPdfType] = useState(null);
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [taxes, setTaxes] = useState([]);

  const load = () => {
    setLoading(true);
    api.get('/bills')
      .then(r => setBills(r.data))
      .catch(e => setMsg(errMsg(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.get('/zoho/taxes')
      .then(r => setTaxes(r.data || []))
      .catch(e => console.warn('Could not load taxes:', e));
  }, []);

  const open = async b => {
    const cloned = JSON.parse(JSON.stringify(b));
    setSel(cloned);
    setMsg('');
    setComment('');
    setPdf(null);
    setPdfType(null);
    try {
      const r = await api.get(`/bills/${b._id}/pdf`, { responseType: 'blob' });
      setPdf(URL.createObjectURL(r.data));
      setPdfType(r.data.type || b.fileType || 'application/pdf');
    } catch (e) {
      console.warn('Document preview not available for bill', b._id);
    }
  };

  const handleTaxChange = (index, taxId) => {
    setSel(prev => {
      if (!prev) return prev;
      const updatedLines = [...prev.lineItems];
      updatedLines[index] = { ...updatedLines[index], tax_id: taxId };
      return { ...prev, lineItems: updatedLines };
    });
  };

  const getTaxName = (taxId) => {
    const found = taxes.find(t => t.tax_id === taxId);
    return found ? `${found.tax_name} (${found.tax_percentage}%)` : (taxId || 'Pending Finance');
  };

  const act = async a => {
    if (a === 'reject' && !comment.trim()) {
      setMsg('Rejection comment is required to return the bill.');
      return;
    }
    if (a === 'approve' && isFinance) {
      const missingIndex = sel.lineItems.findIndex(l => !l.tax_id);
      if (missingIndex >= 0) {
        setMsg(`Please select a Zoho Tax Slab for line item ${missingIndex + 1} ("${sel.lineItems[missingIndex].name || 'Item'}") before approving.`);
        return;
      }
    }
    setMsg('Processing request…');
    try {
      await api.post(`/bills/${sel._id}/${a}`, {
        comment,
        ...(isFinance && a === 'approve' ? { lineItems: sel.lineItems } : {})
      });
      setSel(null);
      setMsg('');
      load();
    } catch (e) {
      setMsg(errMsg(e));
    }
  };

  const isFinance = role === 'FINANCE';
  const queueTitle = isFinance ? 'Finance Review Queue' : 'L1 Verification Queue';

  const filteredBills = bills.filter(b => {
    const q = filterText.toLowerCase();
    return (
      (b.billNumber || '').toLowerCase().includes(q) ||
      (b.vendorName || '').toLowerCase().includes(q) ||
      (b.createdBy?.name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isFinance ? 'Finance Approval & Zoho Sync' : 'L1 Review Portal'}</h1>
          <p className="page-description">
            {isFinance
              ? 'Perform final audit on tax codes, invoice rates, and post approved bills directly to Zoho Books.'
              : 'Inspect incoming vendor bills, line item coding, and verify match against attached invoices.'}
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          {loading ? 'Refreshing…' : 'Refresh Queue'}
        </button>
      </div>

      {msg && (
        <div className="error-banner" style={{ marginBottom: '1.25rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>{msg}</span>
        </div>
      )}

      <div className="review-layout">
        {/* Left Side: Pending Bills Queue */}
        <div className="review-queue-card">
          <div className="review-queue-header">
            <div className="review-queue-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
              </svg>
              <span>{queueTitle}</span>
            </div>
            <span className="count-pill">{bills.length}</span>
          </div>

          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--color-border)' }}>
            <input
              className="form-control"
              placeholder="Filter by bill #, vendor..."
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              style={{ fontSize: '0.8125rem', padding: '0.45rem 0.75rem' }}
            />
          </div>

          <div className="queue-items-list">
            {filteredBills.length === 0 ? (
              <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                {bills.length === 0 ? 'No pending bills in queue' : 'No matching bills found'}
              </div>
            ) : (
              filteredBills.map(b => (
                <div
                  key={b._id}
                  onClick={() => open(b)}
                  className={`queue-item ${sel?._id === b._id ? 'active' : ''}`}
                >
                  <div className="queue-item-top">
                    <span className="queue-item-bill-no">{b.billNumber}</span>
                    {getStatusBadge(b.status)}
                  </div>
                  <div className="queue-item-vendor">{b.vendorName || 'Unnamed Vendor'}</div>
                  <div className="queue-item-submitter">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    Submitted by {b.createdBy?.name || 'PM'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Bill Inspector & Action Panel */}
        {sel ? (
          <div className="review-detail-card">
            {/* Header info */}
            <div className="detail-header-banner">
              <div className="detail-title-group">
                <h3>{sel.billNumber}</h3>
                <span className="detail-vendor-name">{sel.vendorName}</span>
              </div>
              <div>{getStatusBadge(sel.status)}</div>
            </div>

            {/* Metadata Chips */}
            <div className="detail-chips-row">
              <div className="detail-chip">
                <span className="detail-chip-label">Bill Date:</span>
                <span className="detail-chip-val">{sel.date || '—'}</span>
              </div>
              <div className="detail-chip">
                <span className="detail-chip-label">Due Date:</span>
                <span className="detail-chip-val">{sel.dueDate || '—'}</span>
              </div>
              <div className="detail-chip">
                <span className="detail-chip-label">Extracted Total:</span>
                <span className="detail-chip-val" style={{ color: 'var(--primary)' }}>
                  {sel.extracted?.total || 'N/A'}
                </span>
              </div>
              {sel.location_id && (
                <div className="detail-chip">
                  <span className="detail-chip-label">Location:</span>
                  <span className="detail-chip-val">{sel.location_id}</span>
                </div>
              )}
              {sel.source_of_supply && (
                <div className="detail-chip">
                  <span className="detail-chip-label">Source of Supply:</span>
                  <span className="detail-chip-val" style={{ fontWeight: 600 }}>{sel.source_of_supply}</span>
                </div>
              )}
            </div>

            {/* Line Items Breakdown */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 700, margin: 0, color: 'var(--text-secondary)' }}>
                  Line Items Allocation
                </h4>
                {isFinance && sel.status === 'PENDING_FINANCE' && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    * Finance: select appropriate Zoho Tax Slab (GST / IGST) for each item before approving
                  </span>
                )}
              </div>
              <div className="table-responsive">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Item Description</th>
                      <th>Qty × Rate</th>
                      <th>Account Code</th>
                      <th>Tax % (PM)</th>
                      <th>Tax Slab (Zoho)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sel.lineItems.map((l, i) => {
                      const pmRate = l.tax_percentage !== undefined && l.tax_percentage !== null ? l.tax_percentage : null;
                      const matchingTaxes = pmRate !== null ? taxes.filter(t => Number(t.tax_percentage) === Number(pmRate)) : [];
                      const otherTaxes = pmRate !== null ? taxes.filter(t => Number(t.tax_percentage) !== Number(pmRate)) : taxes;

                      return (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{l.name || 'Unnamed item'}</td>
                          <td>
                            {l.quantity} × ₹{Number(l.rate || 0).toLocaleString()}
                          </td>
                          <td>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                              {l.account_id || '—'}
                            </span>
                          </td>
                          <td>
                            <span className="badge badge-info" style={{ fontWeight: 600 }}>
                              {pmRate !== null ? `${pmRate}%` : '—'}
                            </span>
                          </td>
                          <td>
                            {isFinance && sel.status === 'PENDING_FINANCE' ? (
                              <select
                                className="form-control"
                                style={{
                                  fontSize: '0.8125rem',
                                  padding: '0.35rem 0.5rem',
                                  minWidth: '190px',
                                  borderColor: !l.tax_id ? 'var(--warning, #f59e0b)' : 'var(--color-border)'
                                }}
                                value={l.tax_id || ''}
                                onChange={e => handleTaxChange(i, e.target.value)}
                              >
                                <option value="">— Select Tax Slab —</option>
                                {matchingTaxes.length > 0 && (
                                  <optgroup label={`Matches PM Rate (${pmRate}%)`}>
                                    {matchingTaxes.map(t => (
                                      <option key={t.tax_id} value={t.tax_id}>
                                        {t.tax_name} ({t.tax_percentage}%)
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                <optgroup label={matchingTaxes.length > 0 ? "Other Tax Slabs" : "All Tax Slabs"}>
                                  {otherTaxes.map(t => (
                                    <option key={t.tax_id} value={t.tax_id}>
                                      {t.tax_name} ({t.tax_percentage}%)
                                    </option>
                                  ))}
                                </optgroup>
                              </select>
                            ) : (
                              <span style={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                                {getTaxName(l.tax_id)}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* History / Audit trail */}
            {sel.history && sel.history.length > 0 && (
              <div>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                  Audit & Approval Trail
                </h4>
                <div className="history-timeline">
                  {sel.history.map((h, i) => (
                    <div key={i} className="history-item">
                      <span className="history-by">{h.by}</span>
                      <span className="history-action">[{h.action}]</span>
                      <span className="history-comment">{h.comment ? `“${h.comment}”` : 'No comment recorded'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PDF Viewer Frame */}
            <div>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                Attached Document
              </h4>
              <div className="pdf-preview-box">
                {pdf ? (
                  (pdfType?.startsWith('image/') || sel.fileType?.startsWith('image/')) ? (
                    <div style={{ textAlign: 'center', padding: '1rem', background: '#0f172a', borderRadius: 'var(--radius-md)', overflow: 'auto', maxHeight: '500px' }}>
                      <img src={pdf} alt="Invoice Document" style={{ maxWidth: '100%', height: 'auto', borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }} />
                    </div>
                  ) : (
                    <iframe src={pdf} title="invoice-document" />
                  )
                ) : (
                  <div className="pdf-fallback">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="16" y1="13" x2="8" y2="13"></line>
                      <line x1="16" y1="17" x2="8" y2="17"></line>
                    </svg>
                    <p>Document preview unavailable or already posted</p>
                  </div>
                )}
              </div>
            </div>

            {/* Review Decision Actions */}
            <div className="review-actions-bar">
              <input
                className="form-control review-comment-input"
                placeholder="Add reviewer notes or reason for rejection…"
                value={comment}
                onChange={e => setComment(e.target.value)}
              />
              <button type="button" className="btn btn-outline-danger" onClick={() => act('reject')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                Reject Bill
              </button>
              <button type="button" className="btn btn-success" onClick={() => act('approve')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                {isFinance ? 'Approve & Post to Zoho Books' : 'Approve Bill'}
              </button>
            </div>
          </div>
        ) : (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 460, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--color-surface-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
            </div>
            <h3 style={{ color: 'var(--text-main)', fontSize: '1.15rem', marginBottom: '0.25rem' }}>No Bill Selected</h3>
            <p style={{ maxWidth: 360, fontSize: '0.875rem' }}>Select any pending bill from the queue on the left to verify details, inspect the invoice PDF, and approve or reject.</p>
          </div>
        )}
      </div>
    </div>
  );
}
