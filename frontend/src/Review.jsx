import React, { useEffect, useState } from 'react';
import { api, showError } from './api.js';
import { StatusBadge, ROLE_NAME, inr } from './billUtils.jsx';
import SearchSelect from './SearchSelect.jsx';

const isIgst = t => t.tax_specific_type === 'igst' || /igst/i.test(t.tax_name || '');

// Slab for a line: same state → GST (CGST+SGST), different state → IGST, matching the PM's %
const pickSlab = (taxes, pct, interState) =>
  taxes.find(t => Number(t.tax_percentage) === Number(pct) && isIgst(t) === interState)?.tax_id || '';

// A line needs a slab only if the bill has a vendor GSTIN and the line has a tax %
const needsSlab = (bill, l) => !!bill?.taxInfo?.hasGst && Number(l.tax_percentage) > 0;

// Auto-pick every line's slab from vendor state vs property state (taxInfo from the API)
const autoSlabs = (bill, taxes) => ({
  ...bill,
  lineItems: bill.lineItems.map(l => ({
    ...l,
    tax_id: !needsSlab(bill, l) ? ''
      : (bill.taxInfo.interState === null ? l.tax_id : (pickSlab(taxes, l.tax_percentage, bill.taxInfo.interState) || l.tax_id)),
  })),
});

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
      .catch(showError)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.get('/zoho/taxes')
      .then(r => setTaxes(r.data || []))
      .catch(e => console.warn('Could not load taxes:', e));
  }, []);

  const interState = sel?.taxInfo?.interState ?? null;
  // Taxes may arrive after a bill is opened → fill its slabs then
  useEffect(() => {
    if (taxes.length) setSel(prev => (prev?.stage === 'FM' ? autoSlabs(prev, taxes) : prev));
  }, [taxes]);

  const open = async b => {
    const cloned = JSON.parse(JSON.stringify(b));
    setSel(cloned.stage === 'FM' ? autoSlabs(cloned, taxes) : cloned);
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
    return found ? `${found.tax_name} (${found.tax_percentage}%)` : (taxId || 'Set at FM approval');
  };

  const act = async a => {
    if (a === 'reject' && !comment.trim()) {
      showError('Write a reason for rejecting — it goes back to the bill owner.');
      return;
    }
    if (a === 'approve' && atFM) {
      const missingIndex = sel.lineItems.findIndex(l => needsSlab(sel, l) && !l.tax_id);
      if (missingIndex >= 0) {
        showError(`Please select a Zoho Tax Slab for line item ${missingIndex + 1} ("${sel.lineItems[missingIndex].name || 'Item'}") before approving.`);
        return;
      }
    }
    setMsg('Processing request…');
    try {
      await api.post(`/bills/${sel._id}/${a}`, {
        comment,
        ...(atFM && a === 'approve' ? { lineItems: sel.lineItems } : {})
      });
      setSel(null);
      setMsg('');
      load();
    } catch (e) {
      setMsg('');
      showError(e);
    }
  };

  const isAdmin = role === 'ADMIN';
  // The selected bill is at the last step: approving posts it to Zoho (tax slabs needed)
  const atFM = sel?.stage === 'FM';
  const queueTitle = isAdmin ? 'All Pending Bills' : `Waiting on you (${role})`;

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
          <h1 className="page-title">{isAdmin ? 'All Pending Approvals' : `${ROLE_NAME[role]} Approvals`}</h1>
          <p className="page-description">
            {isAdmin
              ? 'Every bill waiting in the chain. As Admin you can approve or reject on behalf of whoever it waits on.'
              : role === 'FM'
                ? 'Final check: confirm tax slabs and amounts, then approve to post the bill to Zoho Books.'
                : `Bills waiting on you. Approving sends them to your ${ROLE_NAME[{ CM: 'OM', OM: 'FM' }[role]] || 'manager'}; rejecting returns them to the owner.`}
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
        <div className="extracted-banner" style={{ marginBottom: '1.25rem' }}>
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
                    <StatusBadge bill={b} />
                  </div>
                  <div className="queue-item-vendor">{b.vendorName || 'Unnamed Vendor'}</div>
                  <div className="queue-item-submitter">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    By {b.ownerId?.name || b.createdBy?.name || '—'} ({b.ownerId?.role || b.createdBy?.role || '?'}){b.location_name ? ` · ${b.location_name}` : ''}
                  </div>
                  {isAdmin && b.approverId?.name && (
                    <div className="queue-item-submitter">Waiting on {b.approverId.name} ({b.stage})</div>
                  )}
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
              <div><StatusBadge bill={sel} /></div>
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

            {/* Tax type: vendor GSTIN state vs property (PM) state — decided automatically */}
            {atFM && sel.taxInfo && (
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <span>Vendor GSTIN: <b>{sel.vendorGstin || 'none'}</b>{sel.taxInfo.vendor && ` (${sel.taxInfo.vendor})`}</span>
                <span>Property state: <b>{sel.taxInfo.property || sel.source_of_supply || 'not set'}</b></span>
                <b style={{ color: 'var(--primary)' }}>
                  {!sel.taxInfo.hasGst ? 'No GSTIN on bill → no tax'
                    : sel.taxInfo.interState === null ? 'State unknown → pick slab manually'
                      : sel.taxInfo.interState ? 'Different state → IGST' : 'Same state → GST (CGST + SGST)'}
                </b>
              </div>
            )}

            {/* Which PM(s) the bill belongs to and their amounts */}
            {sel.allocations?.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 700, margin: '0 0 0.5rem', color: 'var(--text-secondary)' }}>
                  Property Manager(s) · uploaded by {sel.createdBy?.name || '—'} ({sel.createdBy?.role || '?'})
                </h4>
                <div className="table-responsive">
                  <table className="custom-table">
                    <thead><tr><th>Property Manager</th><th>Property</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                    <tbody>
                      {sel.allocations.map((a, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{a.pmId?.name || '—'}</td>
                          <td>{a.pmId?.location_name || '—'}</td>
                          <td style={{ textAlign: 'right' }}>{inr(a.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Line Items Breakdown */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 700, margin: 0, color: 'var(--text-secondary)' }}>
                  Line Items Allocation
                </h4>
                {atFM && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    * Tax slab is picked automatically — change it only if needed
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
                      // Suggested = PM's % and, once the GSTINs are known, the right type (GST / IGST)
                      const fits = t => pmRate !== null && Number(t.tax_percentage) === Number(pmRate) && (interState === null || isIgst(t) === interState);
                      const matchingTaxes = taxes.filter(fits);
                      const otherTaxes = taxes.filter(t => !fits(t));

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
                            {atFM && !needsSlab(sel, l) ? (
                              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>No GST</span>
                            ) : atFM ? (
                              <SearchSelect
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
                                  <optgroup label={`Suggested: ${interState === null ? '' : interState ? 'IGST ' : 'GST '}${pmRate}%`}>
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
                              </SearchSelect>
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
                {atFM ? 'Approve & Post to Zoho Books' : `Approve → ${{ CM: 'OM', OM: 'FM' }[sel.stage] || 'next'}`}
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
