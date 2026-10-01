import React, { useEffect, useState } from 'react';
import { api, errMsg } from './api.js';

const blank = { name: '', quantity: 1, rate: 0, account_id: '', tax_id: '' };

function Sel({ v, on, opts, id, label, className = '' }) {
  return (
    <select value={v} onChange={e => on(e.target.value)} className={`form-control ${className}`}>
      <option value="">— {label} —</option>
      {opts.map(o => (
        <option key={o[id]} value={o[id]}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

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
      return <span className="badge-status badge-pending-l1">{status || 'Draft'}</span>;
  }
}

export default function PM() {
  const [accounts, setA] = useState([]);
  const [taxes, setT] = useState([]);
  const [contacts, setC] = useState([]);
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  const [mine, setMine] = useState([]);
  const [q, setQ] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadMine = () => api.get('/bills').then(r => setMine(r.data));

  useEffect(() => {
    api.get('/zoho/accounts').then(r => setA(r.data)).catch(e => setMsg(errMsg(e)));
    api.get('/zoho/taxes').then(r => setT(r.data)).catch(e => setMsg(errMsg(e)));
    loadMine();
  }, []);

  const searchVendors = async s => {
    try {
      const r = await api.get('/zoho/contacts');
      setC(r.data);
      return r.data;
    } catch (e) {
      setMsg(errMsg(e));
      return [];
    }
  };

  const upload = async e => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExtracting(true);
    setMsg('Extracting data from invoice via AI OCR…');
    const fd = new FormData();
    fd.append('file', file);

    try {
      const { data } = await api.post('/bills/extract', fd);
      const x = data.extracted || {};
      setQ(x.vendor_name || '');
      const list = await searchVendors(x.vendor_name || '').catch(() => []);
      const match = list.find(c => c.gst_no && c.gst_no === x.gstin);

      setF({
        pdfFile: data.pdfFile,
        fileType: data.fileType || file.type || 'application/pdf',
        extracted: x,
        vendorId: match?.contact_id || '',
        billNumber: x.invoice_no || '',
        date: x.date || '',
        dueDate: '',
        lineItems: (x.line_items?.length ? x.line_items : [blank]).map(l => ({ ...blank, ...l }))
      });
      setMsg(data.warning ? `Note: ${data.warning}` : '');
    } catch (er) {
      setMsg(errMsg(er));
    } finally {
      setExtracting(false);
    }
  };

  const set = (k, v) => setF({ ...f, [k]: v });
  const setLine = (i, k, v) => set('lineItems', f.lineItems.map((l, j) => j === i ? { ...l, [k]: v } : l));
  const taxPct = id => taxes.find(t => t.tax_id === id)?.tax_percentage || 0;
  const total = f?.lineItems.reduce((s, l) => s + (Number(l.rate) || 0) * (Number(l.quantity) || 1) * (1 + taxPct(l.tax_id) / 100), 0) || 0;

  const submit = async () => {
    if (!f.vendorId || !f.billNumber || !f.date) {
      setMsg('Please ensure Vendor, Bill Number, and Date are all specified.');
      return;
    }
    setSubmitting(true);
    const vendorName = contacts.find(c => c.contact_id === f.vendorId)?.contact_name;
    try {
      await api.post('/bills', { ...f, vendorName });
      setF(null);
      setMsg('Invoice successfully submitted for L1 approval!');
      loadMine();
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setSubmitting(false);
    }
  };

  const parsedExtractedTotal = parseFloat(String(f?.extracted?.total || '').replace(/[^0-9.]/g, '')) || 0;
  const totalsMatch = Math.abs(total - parsedExtractedTotal) < 1;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Project Manager Portal</h1>
          <p className="page-description">Upload invoices, review AI-extracted fields, allocate line items, and submit for verification.</p>
        </div>
      </div>

      {msg && (
        <div className={msg.includes('success') ? 'extracted-banner' : 'error-banner'} style={{ marginBottom: '1.5rem' }}>
          {msg.includes('success') ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--success)' }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          )}
          <span>{msg}</span>
        </div>
      )}

      {/* Upload Zone Card */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            Upload Vendor Invoice (PDF / Image)
          </div>
          {extracting && (
            <div className="loading-indicator" style={{ margin: 0, padding: '0.35rem 0.75rem' }}>
              <div className="spinner"></div>
              <span>Processing with AI OCR...</span>
            </div>
          )}
        </div>

        <div className="upload-dropzone">
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/jpg,image/webp"
            onChange={upload}
            disabled={extracting}
          />
          <div className="upload-icon-circle">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <path d="M12 18v-6"></path>
              <path d="m9 15 3-3 3 3"></path>
            </svg>
          </div>
          <div>
            <p className="upload-text-main">Click or drag bill (PDF, JPG, PNG, WEBP) to upload and auto-extract</p>
            <p className="upload-text-sub">Supports PDF documents and invoice photos/scans</p>
          </div>
        </div>
      </div>

      {/* Form / Extracted Bill Editor */}
      {f && (
        <div className="card" style={{ border: '1px solid #c7d2fe', boxShadow: 'var(--shadow-md)' }}>
          <div className="card-header">
            <div className="card-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
                <polyline points="9 11 12 14 22 4"></polyline>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
              </svg>
              Verify & Complete Bill Details
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setF(null)}>
              Cancel
            </button>
          </div>

          {/* OCR Extracted Highlights */}
          <div className="extracted-banner">
            <div className="extracted-meta-group">
              <div className="extracted-item">
                <span className="extracted-item-label">OCR Vendor:</span>
                <span className="extracted-item-val">{f.extracted.vendor_name || 'N/A'}</span>
              </div>
              <div className="extracted-item">
                <span className="extracted-item-label">GSTIN:</span>
                <span className="extracted-item-val" style={{ fontFamily: 'monospace' }}>{f.extracted.gstin || 'N/A'}</span>
              </div>
              <div className="extracted-item">
                <span className="extracted-item-label">OCR Invoice Total:</span>
                <span className="extracted-badge-total">{f.extracted.total || '0.00'}</span>
              </div>
            </div>
          </div>

          {/* Vendor Search & Selection */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            <div className="form-field">
              <label className="form-label">Search Zoho Vendor</label>
              <div className="search-input-group">
                <input
                  className="form-control"
                  placeholder="Type vendor name..."
                  value={q}
                  onChange={e => setQ(e.target.value)}
                />
                <button type="button" className="btn btn-secondary" onClick={() => searchVendors(q)}>
                  Search
                </button>
              </div>
            </div>

            <div className="form-field">
              <label className="form-label">Select Vendor Contact *</label>
              <Sel
                v={f.vendorId}
                on={v => set('vendorId', v)}
                id="contact_id"
                label="Select Zoho Contact"
                opts={contacts.map(c => ({
                  ...c,
                  label: `${c.contact_name} ${c.gst_no ? '· GST: ' + c.gst_no : ''}`
                }))}
              />
            </div>
          </div>

          {/* Date & Bill Number */}
          <div className="form-grid-3">
            <div className="form-field">
              <label className="form-label">Bill / Invoice Number *</label>
              <input
                className="form-control"
                placeholder="INV-2024-001"
                value={f.billNumber}
                onChange={e => set('billNumber', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="form-label">Invoice Date *</label>
              <input
                type="date"
                className="form-control"
                value={f.date}
                onChange={e => set('date', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="form-label">Due Date</label>
              <input
                type="date"
                className="form-control"
                value={f.dueDate}
                onChange={e => set('dueDate', e.target.value)}
              />
            </div>
          </div>

          {/* Line Items Editor */}
          <div className="form-field" style={{ marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label className="form-label" style={{ fontSize: '0.875rem' }}>Bill Line Items & Tax Breakdown</label>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => set('lineItems', [...f.lineItems, blank])}
              >
                + Add Item
              </button>
            </div>

            <div className="line-items-container">
              <div className="line-item-header">
                <div>Description</div>
                <div>Quantity</div>
                <div>Rate (₹)</div>
                <div>Expense Account</div>
                <div>Tax Slab</div>
                <div></div>
              </div>

              {f.lineItems.map((l, i) => (
                <div key={i} className="line-item-row">
                  <input
                    className="form-control"
                    placeholder="Item / service description"
                    value={l.name}
                    onChange={e => setLine(i, 'name', e.target.value)}
                  />
                  <input
                    type="number"
                    min="1"
                    className="form-control"
                    value={l.quantity}
                    onChange={e => setLine(i, 'quantity', +e.target.value)}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-control"
                    value={l.rate}
                    onChange={e => setLine(i, 'rate', +e.target.value)}
                  />
                  <Sel
                    v={l.account_id}
                    on={v => setLine(i, 'account_id', v)}
                    id="account_id"
                    label="Account"
                    opts={accounts.map(a => ({ ...a, label: a.account_name }))}
                  />
                  <Sel
                    v={l.tax_id}
                    on={v => setLine(i, 'tax_id', v)}
                    id="tax_id"
                    label="Tax"
                    opts={taxes.map(t => ({ ...t, label: `${t.tax_name} (${t.tax_percentage}%)` }))}
                  />
                  <button
                    type="button"
                    className="btn-icon-danger"
                    title="Remove line"
                    onClick={() => set('lineItems', f.lineItems.length > 1 ? f.lineItems.filter((_, j) => j !== i) : [blank])}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Computation and Submit CTA */}
          <div className="line-items-actions">
            <div className="computation-summary-card">
              <div>
                <span className="computation-label">Calculated Total (incl. taxes):</span>
                <div className="computation-total-val">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>

              {f.extracted.total && (
                <div style={{ borderLeft: '1px solid var(--color-border)', paddingLeft: '1rem' }}>
                  <span className="computation-label">Invoice OCR Total:</span>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>{f.extracted.total}</div>
                  <span className={`computation-match-pill ${totalsMatch ? 'match' : 'diff'}`}>
                    {totalsMatch ? '✓ Totals Match' : '⚠ Discrepancy'}
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '0.85rem 1.75rem', fontSize: '1rem' }}
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <div className="spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff', width: 16, height: 16 }}></div>
                  Submitting...
                </>
              ) : (
                <>
                  Submit for L1 Approval
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Submitted Bills Table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            My Submitted Bills
            <span className="count-pill" style={{ marginLeft: '0.5rem' }}>{mine.length}</span>
          </div>
        </div>

        {mine.length === 0 ? (
          <div className="pdf-fallback" style={{ borderRadius: 'var(--radius-md)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <p>No bills submitted yet. Upload a vendor invoice above to get started.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Bill Number</th>
                  <th>Vendor</th>
                  <th>Status</th>
                  <th>Latest Review Note</th>
                </tr>
              </thead>
              <tbody>
                {mine.map(b => (
                  <tr key={b._id}>
                    <td>
                      <strong style={{ color: 'var(--primary)' }}>{b.billNumber}</strong>
                    </td>
                    <td>{b.vendorName}</td>
                    <td>{getStatusBadge(b.status)}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                      {b.history?.at(-1)?.comment || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
