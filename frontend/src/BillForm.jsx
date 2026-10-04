import React, { useEffect, useState } from 'react';
import { api, showError } from './api.js';
import { StatusBadge, isEditable, inr, currentUser, idOf, ROLE_NAME, MANAGER_ROLE } from './billUtils.jsx';
import SearchSelect from './SearchSelect.jsx';

const blank = { name: '', description: '', quantity: 1, rate: '', account_id: '', tax_percentage: 0, tax_id: '' };

function Sel({ v, on, opts, id, label, className = '' }) {
  return (
    <SearchSelect value={v} onChange={e => on(e.target.value)} className={`form-control ${className}`}>
      <option value="">— {label} —</option>
      {opts.map(o => (
        <option key={o[id]} value={o[id]}>
          {o.label}
        </option>
      ))}
    </SearchSelect>
  );
}

// Upload form for every uploading role.
//   PM       → bill belongs to them (no PM picker); goes to their CM
//   CM/OM/FM → must pick the PM(s) it belongs to and split the amount; CM → OM → FM chain
//              starts at the uploader's manager. FM uploads go straight to Zoho.
// Everyone picks the bill's location (defaults to their own) and can save a Draft first.
export default function BillForm({ role = 'PM', initialEditBill, onClearInitialEdit, onNavigateHistory }) {
  const assigns = role !== 'PM';                  // uploader must choose the PM(s)
  const [myPms, setMyPms] = useState([]);         // PMs this uploader may assign to
  const [locations, setLocations] = useState([]); // Zoho locations a bill can be for
  const me = currentUser();                       // default location comes from the profile
  const [accounts, setA] = useState([]);
  const [taxes, setT] = useState([]);
  const [contacts, setC] = useState([]);
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  const [mine, setMine] = useState([]);
  const [q, setQ] = useState('');
  const [extracting, setExtracting] = useState(false);
  // PDF pages sent for extraction: 'trim' = first 2 + last 2, 'all' = every page
  const [pdfPages, setPdfPages] = useState(() => {
    try { return localStorage.getItem('pdfPages') === 'all' ? 'all' : 'trim'; } catch { return 'trim'; }
  });
  const choosePdfPages = v => {
    setPdfPages(v);
    try { localStorage.setItem('pdfPages', v); } catch { /* ignore */ }
  };
  const [submitting, setSubmitting] = useState(false);
  // vendor → default account_id map (backed by DB)
  const [vendorAccountMap, setVendorAccountMap] = useState({});
  // editingId: set when editing an existing bill (pending / rejected)
  const [editingId, setEditingId] = useState(null);

  const loadMine = () => api.get('/bills', { params: { scope: 'mine' } }).then(r => setMine(r.data));

  // Load all contacts once on mount (full list, no search filter)
  const loadContacts = () =>
    api.get('/zoho/contacts').then(r => setC(r.data)).catch(() => { });

  useEffect(() => {
    api.get('/zoho/accounts').then(r => setA(r.data)).catch(showError);
    api.get('/zoho/taxes').then(r => setT(r.data)).catch(showError);
    api.get('/zoho/locations').then(r => setLocations(r.data || [])).catch(showError);
    api.get('/bills/vendor-account-map').then(r => setVendorAccountMap(r.data || {})).catch(() => { });
    loadContacts();
    loadMine();
    if (assigns) api.get('/bills/assignable-pms').then(r => setMyPms(r.data || [])).catch(showError);
  }, []);

  useEffect(() => {
    if (initialEditBill) {
      editBill(initialEditBill);
      if (onClearInitialEdit) onClearInitialEdit();
    }
  }, [initialEditBill]);

  // Refresh vendor list (called from Search button or on demand)
  const searchVendors = async () => {
    try {
      const r = await api.get('/zoho/contacts');
      setC(r.data);
      return r.data;
    } catch (e) {
      showError(e);
      return [];
    }
  };

  // Find the best-matching contact for the extracted invoice.
  // Priority: exact GSTIN match → partial GSTIN match → fuzzy name match.
  const matchVendor = (list, gstin, vendorName) => {
    const normGstin = (v) => (v || '').toUpperCase().replace(/\s/g, '');
    const extracted = normGstin(gstin);

    // 1) Exact GSTIN match
    if (extracted) {
      const exact = list.find(c => normGstin(c.gst_no) === extracted);
      if (exact) return exact;

      // 2) Partial GSTIN match (last 10 chars = PAN + suffix, first 2 = state code)
      const partial = list.find(c => {
        const cg = normGstin(c.gst_no);
        return cg.length === 15 && extracted.length === 15 && cg.slice(2, 12) === extracted.slice(2, 12);
      });
      if (partial) return partial;
    }

    // 3) Fuzzy vendor name match (case-insensitive, ignores Pvt/Ltd etc.)
    if (vendorName) {
      const core = vendorName.toLowerCase().replace(/pvt|ltd|private|limited|llp|\./g, '').trim();
      const nameFuzzy = list.find(c => {
        const cn = c.contact_name.toLowerCase().replace(/pvt|ltd|private|limited|llp|\./g, '').trim();
        return cn.includes(core) || core.includes(cn);
      });
      if (nameFuzzy) return nameFuzzy;
    }

    return null;
  };

  // Save vendor → account mapping to DB
  const saveVendorAccount = async (vendorId, account_id) => {
    if (!vendorId || !account_id) return;
    setVendorAccountMap(prev => ({ ...prev, [vendorId]: account_id }));
    api.post('/bills/vendor-account-map', { vendorId, account_id }).catch(() => { });
  };

  // When vendor changes, apply remembered account_id to line items that have none set
  const applyVendorMemory = (vendorId, items) => {
    const remembered = vendorAccountMap[vendorId];
    if (!remembered) return items;
    return items.map(l => ({ ...l, account_id: l.account_id || remembered }));
  };

  const upload = async e => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-uploading the same file (e.g. to compare page modes)
    if (!file) return;

    setExtracting(true);
    setMsg('Extracting data from invoice via AI OCR…');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('pages', pdfPages);

    try {
      const { data } = await api.post('/bills/extract', fd);
      const x = data.extracted || {};

      // Use already-loaded contacts; refresh only if empty
      const list = contacts.length ? contacts : await searchVendors().catch(() => []);
      const matched = matchVendor(list, x.gstin, x.vendor_name);
      const vendorId = matched?.contact_id || '';

      if (matched) {
        x.vendor_name = matched.contact_name;
        setQ(matched.contact_name);
      } else {
        setQ(''); // Clear the search box so the dropdown isn't empty due to garbage OCR text
      }


      // Show a hint if we found a match by GSTIN
      const matchHint = matched
        ? (matched.gst_no && (matched.gst_no.toUpperCase() === (x.gstin || '').toUpperCase())
          ? `✓ Vendor auto-matched by GSTIN: ${matched.contact_name}`
          : `✓ Vendor matched by name: ${matched.contact_name}`)
        : '';

      const defaultTaxPct = (x.tax_percent !== undefined && x.tax_percent !== null && !isNaN(Number(x.tax_percent)))
        ? Number(x.tax_percent)
        : 0;

      // Collapse all extracted rows into ONE line: rate = pre-tax total (qty × rate summed).
      // PM can still add more lines manually.
      const xItems = x.line_items || [];
      const sum = xItems.reduce((s, l) => s + (Number(l.quantity) || 1) * (Number(l.rate) || 0), 0);
      const fallback = Number(x.total) > 0 && Number(x.tax_amount) > 0 ? Number(x.total) - Number(x.tax_amount) : 0;
      const totalRate = Math.round((sum || fallback) * 100) / 100;
      const rawItems = [{
        ...blank,
        name: xItems.length > 1 ? `${xItems[0].name} + ${xItems.length - 1} more` : (xItems[0]?.name || ''),
        quantity: 1,
        rate: totalRate || '',   // keep blank if nothing was read so PM must fill it
        tax_percentage: defaultTaxPct,
      }];
      const items = vendorId ? applyVendorMemory(vendorId, rawItems) : rawItems;

      setF({
        pdfFile: data.pdfFile,
        fileType: data.fileType || file.type || 'application/pdf',
        extracted: x,
        vendorId,
        billNumber: x.invoice_no || '',
        date: x.date || '',
        dueDate: '',
        discount_amount: x.discount_amount || 0,
        discount_percent: x.discount_percent || 0,
        lineItems: items,
        accountPicked: false,
        allocations: [],
        location_id: me.location_id || '',   // preselected from the profile; can be changed
      });
      setEditingId(null);
      const pp = data.extractMeta?.pdfPages;
      const pagesHint = pp
        ? `PDF: ${pp.mode === 'all' ? 'all pages' : 'first 2 + last 2'}${pp.read ? ` (${pp.read}/${pp.total ?? '?'} read)` : ''}`
        : '';
      const sourceHint = data.extractMeta?.source ? `via ${data.extractMeta.source}` : '';
      const metaHint = [pagesHint, sourceHint].filter(Boolean).join(' · ');
      setMsg(data.warning ? `Note: ${data.warning}` : [matchHint, metaHint].filter(Boolean).join(' — '));
    } catch (er) {
      setMsg('');
      showError(er);
    } finally {
      setExtracting(false);
    }
  };

  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  const setLine = (i, k, v) => {
    let updated = f.lineItems.map((l, j) => j === i ? { ...l, [k]: v } : l);
    // First expense account picked on a bill → copy it to the other lines that were
    // empty or had the same (auto-filled) account. Later picks change only that line.
    const firstAccountPick = k === 'account_id' && v && !f.accountPicked;
    if (firstAccountPick) {
      const prevAcct = f.lineItems[i].account_id;
      updated = updated.map((l, j) => (j !== i && (!l.account_id || l.account_id === prevAcct))
        ? { ...l, account_id: v }
        : l);
    }
    setF(prev => ({ ...prev, lineItems: updated, ...(firstAccountPick && { accountPicked: true }) }));
    // When account_id changes and we have a vendor, persist the mapping
    if (k === 'account_id' && f.vendorId && v) {
      saveVendorAccount(f.vendorId, v);
    }
  };

  // When vendor selection changes, apply the remembered account
  const setVendor = v => {
    const items = applyVendorMemory(v, f.lineItems);
    setF(prev => ({ ...prev, vendorId: v, lineItems: items }));
  };

  const standardRates = [0, 5, 12, 18, 28];
  const zohoRates = taxes.map(t => Number(t.tax_percentage)).filter(p => !isNaN(p));
  const extractedRate = (f?.extracted?.tax_percent !== undefined && f?.extracted?.tax_percent !== null && !isNaN(Number(f.extracted.tax_percent)))
    ? [Number(f.extracted.tax_percent)]
    : [];
  const taxRateOptions = Array.from(new Set([...standardRates, ...zohoRates, ...extractedRate])).sort((a, b) => a - b);

  // Subtotal before discount (no tax yet)
  const subtotal = f?.lineItems.reduce((s, l) =>
    s + (Number(l.rate) || 0) * (Number(l.quantity) || 1), 0) || 0;

  // Discount value: prefer flat amount, else compute from percent
  const discountVal = f
    ? (Number(f.discount_amount) > 0
      ? Number(f.discount_amount)
      : (Number(f.discount_percent) > 0 ? subtotal * Number(f.discount_percent) / 100 : 0))
    : 0;

  // Total with tax applied then discount deducted
  const total = (f?.lineItems.reduce((s, l) => {
    const lineSubtotal = (Number(l.rate) || 0) * (Number(l.quantity) || 1);
    const pct = Number(l.tax_percentage) || 0;
    return s + lineSubtotal * (1 + pct / 100);
  }, 0) || 0) - discountVal;

  // CM split: what's left of the bill total to allocate
  const allocated = (f?.allocations || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const allocRemaining = Math.round((total - allocated) * 100) / 100;
  const setAlloc = (i, k, v) => setF(prev => ({ ...prev, allocations: prev.allocations.map((a, j) => (j === i ? { ...a, [k]: v } : a)) }));
  const addAlloc = () => setF(prev => ({
    ...prev,
    // pre-fill the new row with whatever is still unallocated
    allocations: [...(prev.allocations || []), { pmId: '', amount: allocRemaining > 0 ? allocRemaining : '' }],
  }));
  const removeAlloc = i => setF(prev => ({ ...prev, allocations: prev.allocations.filter((_, j) => j !== i) }));

  // Where a submitted bill goes next, for the button and the success message
  const nextStep = role === 'FM' ? 'Zoho Books' : `your ${ROLE_NAME[MANAGER_ROLE[role]]}`;

  // draft = true → save without submitting (PMs already see their assigned amount as Draft)
  const submit = async (draft = false) => {
    if (!f.location_id) return showError('Select the location this bill is for.');
    if (assigns && (!f.allocations?.length || f.allocations.some(a => !a.pmId || !(Number(a.amount) > 0))))
      return showError('Choose the Property Manager(s) this bill belongs to, with an amount above 0 for each.');
    if (!draft) {
      if (!f.vendorId || !f.billNumber || !f.date) return showError('Please fill in Vendor, Bill Number and Date.');
      const badRate = f.lineItems.findIndex(l => !(Number(l.rate) > 0));
      if (badRate >= 0) return showError(`Line item ${badRate + 1}: Rate (₹) must be greater than 0.`);
      if (assigns && Math.abs(allocRemaining) > 1)
        return showError(`The assigned amounts must add up to the bill total (${inr(total)}). ${allocRemaining > 0 ? 'Still to assign' : 'Over by'}: ${inr(Math.abs(allocRemaining))}.`);
    }
    setSubmitting(true);
    const vendorName = contacts.find(c => c.contact_id === f.vendorId)?.contact_name;
    try {
      const body = { ...f, vendorName, draft };
      const { data } = editingId ? await api.put(`/bills/${editingId}`, body) : await api.post('/bills', body);
      setMsg(draft ? `✓ Draft saved${assigns ? ' — the assigned Property Managers can already see it' : ''}.`
        : data.status === 'POSTED' ? `✓ Bill #${data.billNumber} posted to Zoho Books.`
          : `✓ Bill #${data.billNumber} submitted to ${nextStep} for approval.`);
      setF(null);
      setEditingId(null);
      loadMine();
    } catch (e) {
      showError(e);
    } finally {
      setSubmitting(false);
    }
  };

  // Load an existing bill into the edit form
  const editBill = async (b) => {
    if (!isEditable(b)) return showError('This bill is already being approved and can no longer be edited.');
    setMsg('');
    // Ensure contacts are loaded
    const list = contacts.length ? contacts : await searchVendors('').catch(() => []);
    setQ(list.find(c => c.contact_id === b.vendorId)?.contact_name || b.vendorName || '');
    setEditingId(b._id);
    setF({
      pdfFile: b.pdfFile || '',
      fileType: b.fileType || 'application/pdf',
      extracted: b.extracted || {},
      vendorId: b.vendorId || '',
      billNumber: b.billNumber || '',
      date: b.date || '',
      dueDate: b.dueDate || '',
      discount_amount: b.discount_amount || 0,
      discount_percent: b.discount_percent || 0,
      lineItems: (b.lineItems?.length ? b.lineItems : [blank]).map(l => ({
        ...blank,
        ...l,
        tax_percentage: l.tax_percentage !== undefined && l.tax_percentage !== null
          ? Number(l.tax_percentage)
          : (taxes.find(t => t.tax_id === l.tax_id)?.tax_percentage || 0)
      })),
      // existing bill with accounts already chosen → don't overwrite other lines
      accountPicked: (b.lineItems || []).some(l => l.account_id),
      allocations: (b.allocations || []).map(a => ({ pmId: idOf(a.pmId), amount: a.amount })),
      location_id: b.location_id || me.location_id || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteBill = async (b) => {
    if (!window.confirm(`Are you sure you want to delete bill #${b.billNumber}? You will be able to make a fresh new entry.`)) return;
    try {
      await api.delete(`/bills/${b._id}`);
      setMsg(`✓ Bill #${b.billNumber || ''} deleted.`);
      if (editingId === b._id) {
        setEditingId(null);
        setF(null);
      }
      loadMine();
    } catch (e) {
      showError(e);
    }
  };

  const parsedExtractedTotal = parseFloat(String(f?.extracted?.total || '').replace(/[^0-9.]/g, '')) || 0;
  const totalsMatch = Math.abs(total - parsedExtractedTotal) < 1;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {editingId ? `Edit Bill #${f?.billNumber || ''}` : 'Upload & Create Invoice'}
          </h1>
          <p className="page-description">
            {editingId
              ? 'Update bill details or fix rejected fields, then save changes to resubmit for approval.'
              : role === 'FM'
                ? 'Upload an invoice, check the AI-extracted fields and assign it to Property Managers. Your uploads post straight to Zoho Books.'
                : `Upload an invoice, check the AI-extracted fields${assigns ? ', assign it to Property Managers' : ''}, then save a draft or submit it to ${nextStep}.`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {editingId && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => { setEditingId(null); setF(null); setMsg(''); }}
            >
              Cancel Edit / New Bill
            </button>
          )}
          {onNavigateHistory && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onNavigateHistory}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              📜 View Invoice History →
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className="extracted-banner" style={{ marginBottom: '1.5rem' }}>
          {msg.startsWith('✓') ? (
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
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', marginLeft: 'auto', marginRight: '0.75rem' }}>
            PDF pages
            <SearchSelect
              className="form-control"
              style={{ width: 'auto', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
              value={pdfPages}
              onChange={e => choosePdfPages(e.target.value)}
              disabled={extracting}
            >
              <option value="trim">First 2 + last 2</option>
              <option value="all">All pages</option>
            </SearchSelect>
          </label>
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
              Verify &amp; Complete Bill Details
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
              {(f.extracted.tax_percent !== undefined && f.extracted.tax_percent !== null) ? (
                <div className="extracted-item">
                  <span className="extracted-item-label">Tax Rate:</span>
                  <span className="extracted-item-val" style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>
                    {f.extracted.tax_percent}%
                  </span>
                </div>
              ) : null}
              {(f.extracted.discount_amount > 0 || f.extracted.discount_percent > 0) && (
                <div className="extracted-item">
                  <span className="extracted-item-label">OCR Discount:</span>
                  <span className="extracted-item-val" style={{ color: 'var(--warning, #f59e0b)' }}>
                    {f.extracted.discount_amount > 0
                      ? `₹${f.extracted.discount_amount}`
                      : `${f.extracted.discount_percent}%`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Vendor Search & Selection */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            <div className="form-field">
              <label className="form-label">GSTIN Search & Match</label>
              <input
                className="form-control"
                placeholder="Type or select GSTIN..."
                value={f.extracted.gstin || ''}
                onChange={e => {
                  const newGstin = e.target.value.toUpperCase().replace(/\s/g, '');
                  setF(prev => ({ ...prev, extracted: { ...prev.extracted, gstin: newGstin } }));
                  const matched = matchVendor(contacts, newGstin, f.extracted.vendor_name);
                  if (matched) {
                    setQ(matched.contact_name);
                    setVendor(matched.contact_id);
                  }
                }}
              />
              {f.extracted.gstins?.length > 0 && (
                <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {f.extracted.gstins.map(g => (
                    <button
                      key={g}
                      type="button"
                      style={{
                        fontSize: '0.75rem', padding: '0.2rem 0.5rem',
                        background: f.extracted.gstin === g ? 'var(--primary)' : 'var(--color-surface-subtle)',
                        color: f.extracted.gstin === g ? '#fff' : 'var(--text-main)',
                        border: '1px solid var(--color-border)', borderRadius: '4px', cursor: 'pointer'
                      }}
                      onClick={() => {
                        setF(prev => ({ ...prev, extracted: { ...prev.extracted, gstin: g } }));
                        const matched = matchVendor(contacts, g, f.extracted.vendor_name);
                        if (matched) {
                          setQ(matched.contact_name);
                          setVendor(matched.contact_id);
                        }
                      }}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              )}
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                {f.extracted.gstins?.length > 1 ? `Found ${f.extracted.gstins.length} GSTINs in document. Click one above or type manually.` : 'Enter GSTIN to auto-match vendor.'}
              </p>
            </div>

            <div className="form-field">
              <label className="form-label">Search Zoho Vendor</label>
              <div className="search-input-group">
                <input
                  className="form-control"
                  placeholder="Filter contacts by name..."
                  value={q}
                  onChange={e => {
                    setQ(e.target.value);
                    // Live-filter the already-loaded contacts client-side
                  }}
                />
                <button type="button" className="btn btn-secondary" onClick={searchVendors}>
                  Refresh
                </button>
              </div>
              {q && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                  Showing {contacts.filter(c => c.contact_name.toLowerCase().includes(q.toLowerCase())).length} matching contacts
                </p>
              )}
            </div>

            <div className="form-field">
              <label className="form-label">Select Vendor Contact *</label>
              <Sel
                v={f.vendorId}
                on={setVendor}
                id="contact_id"
                label="Select Zoho Contact"
                opts={
                  (q
                    ? contacts.filter(c => (c.contact_name || '').toLowerCase().includes(q.toLowerCase()))
                    : contacts
                  ).map(c => ({
                    ...c,
                    label: `${c.contact_name}${c.gst_no ? ' · ' + c.gst_no : ''}${vendorAccountMap[c.contact_id] ? ' ✓' : ''}`
                  }))
                }
              />
              {f.vendorId && (() => {
                const matched = contacts.find(c => c.contact_id === f.vendorId);
                const byGstin = matched?.gst_no &&
                  matched.gst_no.toUpperCase().replace(/\s/g, '') === (f.extracted?.gstin || '').toUpperCase().replace(/\s/g, '');
                return matched ? (
                  <p style={{
                    fontSize: '0.75rem', marginTop: '0.3rem',
                    color: byGstin ? 'var(--success, #22c55e)' : 'var(--primary, #6366f1)'
                  }}>
                    {byGstin
                      ? `✓ Auto-matched by GSTIN: ${matched.contact_name}`
                      : `✓ Selected: ${matched.contact_name}${matched.gst_no ? ' (GST: ' + matched.gst_no + ')' : ''}`}
                    {vendorAccountMap[f.vendorId] ? ' · Default account applied' : ''}
                  </p>
                ) : null;
              })()}
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
              <label className="form-label" style={{ fontSize: '0.875rem' }}>Bill Line Items &amp; Tax Breakdown</label>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => set('lineItems', [
                  ...f.lineItems,
                  // new line starts with the account already used on this bill
                  { ...blank, account_id: f.lineItems.find(l => l.account_id)?.account_id || '' },
                ])}
              >
                + Add Item
              </button>
            </div>

            <div className="line-items-container">
              <div className="line-item-header" style={{ gridTemplateColumns: '1.4fr 1.2fr 0.6fr 0.8fr 1.3fr 1fr 36px' }}>
                <div>Description</div>
                <div>Item Name</div>
                <div>Qty</div>
                <div>Rate (₹)</div>
                <div>Expense Account</div>
                <div>Tax %</div>
                <div></div>
              </div>

              {f.lineItems.map((l, i) => (
                <div key={i} className="line-item-row" style={{ gridTemplateColumns: '1.4fr 1.2fr 0.6fr 0.8fr 1.3fr 1fr 36px' }}>
                  <input
                    className="form-control"
                    placeholder="Detailed description"
                    value={l.description || ''}
                    onChange={e => setLine(i, 'description', e.target.value)}
                  />
                  <input
                    className="form-control"
                    placeholder="Item / service name"
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
                    style={!(Number(l.rate) > 0) ? { borderColor: '#ef4444' } : {}}
                    placeholder="Rate ₹ *"
                    value={l.rate === '' ? '' : l.rate}
                    onChange={e => setLine(i, 'rate', e.target.value === '' ? '' : +e.target.value)}
                  />
                  <Sel
                    v={l.account_id}
                    on={v => setLine(i, 'account_id', v)}
                    id="account_id"
                    label="Account"
                    opts={accounts.map(a => ({ ...a, label: a.account_name }))}
                  />
                  <SearchSelect
                    className="form-control"
                    value={l.tax_percentage !== undefined && l.tax_percentage !== null ? l.tax_percentage : 0}
                    onChange={e => setLine(i, 'tax_percentage', Number(e.target.value))}
                  >
                    {taxRateOptions.map(r => (
                      <option key={r} value={r}>
                        {r}%
                      </option>
                    ))}
                  </SearchSelect>
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

            {/* Discount row */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
              marginTop: '0.75rem', padding: '0.75rem 1rem',
              background: 'var(--color-surface-subtle, rgba(99,102,241,0.05))',
              borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-border)'
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                <line x1="7" y1="7" x2="7.01" y2="7"></line>
              </svg>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                Discount on bill:
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-control"
                  style={{ maxWidth: 130 }}
                  placeholder="Flat amount"
                  value={f.discount_amount || ''}
                  onChange={e => set('discount_amount', +e.target.value || 0)}
                />
              </div>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>or</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  className="form-control"
                  style={{ maxWidth: 100 }}
                  placeholder="% off"
                  value={f.discount_percent || ''}
                  onChange={e => set('discount_percent', +e.target.value || 0)}
                />
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>%</span>
              </div>
              {discountVal > 0 && (
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--success, #22c55e)', whiteSpace: 'nowrap' }}>
                  − ₹{discountVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} off
                </span>
              )}
            </div>
          </div>

          {/* Location the bill is for — preselected from the profile; its state decides GST vs IGST */}
          {(
            <div className="form-field" style={{ marginTop: '1.25rem', maxWidth: 420 }}>
              <label className="form-label">Location *</label>
              <SearchSelect className="form-control" value={f.location_id || ''} onChange={e => set('location_id', e.target.value)}>
                <option value="">— Select Location —</option>
                {locations.map(l => (
                  <option key={l.location_id} value={l.location_id}>
                    {l.location_name}{l.state_code ? ` (${l.state_code})` : ''}{l.location_id === me.location_id ? ' · my location' : ''}
                  </option>
                ))}
              </SearchSelect>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                State {locations.find(l => l.location_id === f.location_id)?.state_code || '—'} is used to pick GST (same state as vendor) or IGST.
              </p>
            </div>
          )}

          {/* CM / OM / FM: which PM(s) the bill belongs to, and how much each */}
          {assigns && (
            <div style={{ marginTop: '1.25rem', padding: '1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700 }}>Property Manager(s) this bill belongs to *</h4>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: Math.abs(allocRemaining) <= 1 ? 'var(--success, #22c55e)' : 'var(--warning, #f59e0b)' }}>
                  Allocated {inr(allocated)} of {inr(total)}
                  {Math.abs(allocRemaining) > 1 && ` · ${allocRemaining > 0 ? 'remaining' : 'over by'} ${inr(Math.abs(allocRemaining))}`}
                  {Math.abs(allocRemaining) <= 1 && ' ✓'}
                </span>
              </div>
              {myPms.length === 0 && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--warning, #f59e0b)', margin: '0 0 0.5rem' }}>
                  No Property Managers are in your reporting line yet — ask the Admin to set up the hierarchy.
                </p>
              )}
              {(f.allocations || []).map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                  <SearchSelect className="form-control" style={{ flex: '1 1 220px' }} value={a.pmId} onChange={e => setAlloc(i, 'pmId', e.target.value)}>
                    <option value="">— Property Manager —</option>
                    {myPms
                      .filter(p => p._id === a.pmId || !f.allocations.some(x => x.pmId === p._id))
                      .map(p => <option key={p._id} value={p._id}>{p.name}{p.location_name ? ` · ${p.location_name}` : ''}</option>)}
                  </SearchSelect>
                  <input
                    className="form-control" type="number" min="0" step="0.01" placeholder="Amount ₹"
                    style={{ flex: '0 1 160px' }} value={a.amount}
                    onChange={e => setAlloc(i, 'amount', e.target.value)}
                  />
                  <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => removeAlloc(i)}>✕</button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm" onClick={addAlloc} disabled={myPms.length === 0}>
                + Add Property Manager
              </button>
            </div>
          )}

          {/* Computation and Submit CTA */}
          <div className="line-items-actions">
            <div className="computation-summary-card">
              <div>
                <span className="computation-label">Subtotal (before discount):</span>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  ₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                {discountVal > 0 && (
                  <div style={{ fontSize: '0.8125rem', color: 'var(--success, #22c55e)' }}>
                    − ₹{discountVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} discount
                  </div>
                )}
                <span className="computation-label" style={{ marginTop: '0.25rem', display: 'block' }}>Calculated Total (incl. taxes):</span>
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

            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0.85rem 1.25rem', fontSize: '1rem' }}
              onClick={() => submit(true)}
              disabled={submitting}
              title="Save without submitting. Assigned Property Managers see it as Draft."
            >
              💾 Save as Draft
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '0.85rem 1.75rem', fontSize: '1rem' }}
              onClick={() => submit(false)}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <div className="spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff', width: 16, height: 16 }}></div>
                  Submitting...
                </>
              ) : (
                <>
                  {role === 'FM' ? 'Post to Zoho Books' : `Submit to ${MANAGER_ROLE[role]}`}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </>
              )}
            </button>
            </div>
          </div>
        </div>
      )}

      {/* Submitted Bills Table */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            My Recent Submissions
            <span className="count-pill" style={{ marginLeft: '0.5rem' }}>{mine.length}</span>
          </div>
          {onNavigateHistory && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onNavigateHistory}
            >
              📜 View Full History &amp; Analytics →
            </button>
          )}
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {mine.map(b => (
                  <tr key={b._id}>
                    <td>
                      <strong style={{ color: 'var(--primary)' }}>{b.billNumber}</strong>
                    </td>
                    <td>{b.vendorName}</td>
                    <td><StatusBadge bill={b} /></td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                      {b.history?.at(-1)?.comment || '—'}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {isEditable(b) && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => editBill(b)}
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          ✏️ Edit
                        </button>
                      )}
                      {isEditable(b) && (
                        <button
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => deleteBill(b)}
                          style={{ whiteSpace: 'nowrap', marginLeft: '0.4rem' }}
                          title="Delete bill and make a fresh entry"
                        >
                          🗑️ Delete
                        </button>
                      )}
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
