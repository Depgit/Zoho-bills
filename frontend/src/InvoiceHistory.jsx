import React, { useEffect, useState, useMemo } from 'react';
import { api, errMsg } from './api.js';

export function getBillTotal(b) {
  if (!b) return 0;
  if (b.lineItems && b.lineItems.length > 0) {
    const subtotal = b.lineItems.reduce((s, l) => s + (Number(l.rate) || 0) * (Number(l.quantity) || 1), 0);
    const disc = Number(b.discount_amount) > 0
      ? Number(b.discount_amount)
      : (Number(b.discount_percent) > 0 ? (subtotal * Number(b.discount_percent) / 100) : 0);
    const withTax = b.lineItems.reduce((s, l) => {
      const lineSub = (Number(l.rate) || 0) * (Number(l.quantity) || 1);
      const taxRate = Number(l.tax_percentage) || 0;
      return s + lineSub * (1 + taxRate / 100);
    }, 0) - disc;
    if (withTax > 0) return withTax;
  }
  if (b.extracted?.total) {
    const parsed = parseFloat(String(b.extracted.total).replace(/[^0-9.]/g, ''));
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

export function formatINR(val) {
  const num = Number(val) || 0;
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Property = the PM who submitted the bill (+ their location / state)
export function propertyOf(b) {
  const u = b.createdBy || {};
  return {
    key: u._id || 'unknown',
    name: u.location_name || u.name || 'Unknown property',
    pm: u.name || '—',
    state: u.source_of_supply || b.source_of_supply || '',
  };
}

// Who approved / rejected the bill at each level, from its history
function approvals(b) {
  const h = b.history || [];
  const after = (from) => h.slice(from).find(x => x.action === 'APPROVED' || x.action === 'REJECTED');
  // last submission starts the current round
  const start = Math.max(0, h.map(x => x.action).lastIndexOf('RESUBMITTED'), h.map(x => x.action).lastIndexOf('SUBMITTED'));
  const l1 = after(start);
  const fin = l1 && l1.action === 'APPROVED' ? after(h.indexOf(l1) + 1) : null;
  return { l1, fin };
}

function getStatusBadge(status) {
  switch (status) {
    case 'PENDING_L1':
      return <span className="badge-status badge-pending-l1">Pending L1</span>;
    case 'PENDING_FINANCE':
      return <span className="badge-status badge-pending-finance">Pending Finance</span>;
    case 'POSTED':
      return <span className="badge-status badge-posted">Passed &amp; Synced</span>;
    case 'REJECTED_L1':
      return <span className="badge-status badge-rejected-l1">Rejected by L1</span>;
    case 'REJECTED_FINANCE':
      return <span className="badge-status badge-rejected-finance">Rejected by Finance</span>;
    default:
      return <span className="badge-status badge-pending-l1">{status || 'In Review'}</span>;
  }
}

export default function InvoiceHistory({ role = 'PM', onEditBill, onNewEntry }) {
  const isPM = role === 'PM';
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'POSTED' | 'PENDING' | 'REJECTED'
  const [datePreset, setDatePreset] = useState('ALL'); // 'ALL' | 'THIS_MONTH' | 'LAST_30' | 'THIS_YEAR' | 'CUSTOM'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');
  const [propertyFilter, setPropertyFilter] = useState('ALL');

  // Preview & Delete modals
  const [previewBill, setPreviewBill] = useState(null);
  const [previewPdf, setPreviewPdf] = useState(null);
  const [previewPdfType, setPreviewPdfType] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // L1 / Finance see every bill in the org, not just their queue
      const { data } = await api.get('/bills', { params: isPM ? {} : { scope: 'history' } });
      setBills(data || []);
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Open Preview Modal
  const openPreview = async (b) => {
    setPreviewBill(b);
    setPreviewPdf(null);
    setPreviewPdfType(null);
    try {
      const r = await api.get(`/bills/${b._id}/pdf`, { responseType: 'blob' });
      setPreviewPdf(URL.createObjectURL(r.data));
      setPreviewPdfType(r.data.type || b.fileType || 'application/pdf');
    } catch (e) {
      console.warn('Document preview not available for bill', b._id);
    }
  };

  const closePreview = () => {
    setPreviewBill(null);
    if (previewPdf) URL.revokeObjectURL(previewPdf);
    setPreviewPdf(null);
    setPreviewPdfType(null);
  };

  // Delete Action
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/bills/${deleteTarget._id}`);
      setMsg(`✓ Bill "${deleteTarget.billNumber}" has been deleted. You can now make a new entry.`);
      setDeleteTarget(null);
      if (previewBill?._id === deleteTarget._id) closePreview();
      load();
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setDeleting(false);
    }
  };

  // Date preset handler
  const handleDatePreset = (preset) => {
    setDatePreset(preset);
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'ALL') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'THIS_MONTH') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(toYMD(firstDay));
      setEndDate(toYMD(today));
    } else if (preset === 'LAST_30') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 30);
      setStartDate(toYMD(thirtyDaysAgo));
      setEndDate(toYMD(today));
    } else if (preset === 'THIS_YEAR') {
      const firstYearDay = new Date(today.getFullYear(), 0, 1);
      setStartDate(toYMD(firstYearDay));
      setEndDate(toYMD(today));
    }
  };

  // KPI Calculations across all bills
  const kpis = useMemo(() => {
    const passed = bills.filter(b => b.status === 'POSTED');
    const pending = bills.filter(b => b.status === 'PENDING_L1' || b.status === 'PENDING_FINANCE');
    const rejected = bills.filter(b => b.status.startsWith('REJECTED'));

    const passedAmt = passed.reduce((sum, b) => sum + getBillTotal(b), 0);
    const pendingAmt = pending.reduce((sum, b) => sum + getBillTotal(b), 0);
    const rejectedAmt = rejected.reduce((sum, b) => sum + getBillTotal(b), 0);
    const totalAmt = bills.reduce((sum, b) => sum + getBillTotal(b), 0);

    const pendingL1Count = bills.filter(b => b.status === 'PENDING_L1').length;
    const pendingFinanceCount = bills.filter(b => b.status === 'PENDING_FINANCE').length;

    return {
      passedAmt,
      passedCount: passed.length,
      pendingAmt,
      pendingCount: pending.length,
      pendingL1Count,
      pendingFinanceCount,
      rejectedAmt,
      rejectedCount: rejected.length,
      totalAmt,
      totalCount: bills.length,
    };
  }, [bills]);

  // Per-property summary (L1 / Finance)
  const properties = useMemo(() => {
    const map = new Map();
    for (const b of bills) {
      const p = propertyOf(b);
      const row = map.get(p.key) || { ...p, total: 0, posted: 0, postedAmt: 0, pending: 0, pendingAmt: 0, rejected: 0, totalAmt: 0 };
      const amt = getBillTotal(b);
      row.total++; row.totalAmt += amt;
      if (b.status === 'POSTED') { row.posted++; row.postedAmt += amt; }
      else if (b.status.startsWith('PENDING')) { row.pending++; row.pendingAmt += amt; }
      else row.rejected++;
      map.set(p.key, row);
    }
    return [...map.values()].sort((a, b) => b.totalAmt - a.totalAmt);
  }, [bills]);

  // Filter & sort bills
  const filteredBills = useMemo(() => {
    return bills.filter(b => {
      if (propertyFilter !== 'ALL' && propertyOf(b).key !== propertyFilter) return false;

      // Status filter
      if (statusFilter === 'POSTED' && b.status !== 'POSTED') return false;
      if (statusFilter === 'PENDING' && !(b.status === 'PENDING_L1' || b.status === 'PENDING_FINANCE')) return false;
      if (statusFilter === 'REJECTED' && !b.status.startsWith('REJECTED')) return false;

      // Date filter (matches b.date, fallback to createdAt)
      const bDate = b.date || (b.createdAt ? b.createdAt.slice(0, 10) : '');
      if (startDate && bDate && bDate < startDate) return false;
      if (endDate && bDate && bDate > endDate) return false;

      // Search text
      if (search.trim()) {
        const q = search.toLowerCase();
        const numMatch = (b.billNumber || '').toLowerCase().includes(q);
        const vendorMatch = (b.vendorName || '').toLowerCase().includes(q);
        const noteMatch = (b.history?.at(-1)?.comment || '').toLowerCase().includes(q);
        const p = propertyOf(b);
        const propMatch = !isPM && `${p.name} ${p.pm} ${p.state}`.toLowerCase().includes(q);
        if (!numMatch && !vendorMatch && !noteMatch && !propMatch) return false;
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === 'date-desc') {
        const da = a.date || a.createdAt || '';
        const db = b.date || b.createdAt || '';
        return db.localeCompare(da);
      }
      if (sortBy === 'date-asc') {
        const da = a.date || a.createdAt || '';
        const db = b.date || b.createdAt || '';
        return da.localeCompare(db);
      }
      if (sortBy === 'amount-desc') {
        return getBillTotal(b) - getBillTotal(a);
      }
      if (sortBy === 'amount-asc') {
        return getBillTotal(a) - getBillTotal(b);
      }
      return 0;
    });
  }, [bills, statusFilter, startDate, endDate, search, sortBy, propertyFilter]);

  const hasActiveFilters = search || statusFilter !== 'ALL' || datePreset !== 'ALL' || startDate || endDate || propertyFilter !== 'ALL';

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '1.25rem' }}>
        <div>
          <h1 className="page-title">Invoice History &amp; Accounting Audit</h1>
          <p className="page-description">
            {isPM
              ? 'Track approved vs. pending billing volume, review approval notes, filter by date, and manage rejected invoices.'
              : 'Every bill across all properties — approvals, pending and rejected, by property, with who approved each.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? 'animate-spin' : ''}>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            Refresh
          </button>
          {isPM && <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onNewEntry}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            + Upload New Bill
          </button>}
        </div>
      </div>

      {msg && (
        <div className={msg.startsWith('✓') ? 'success-banner' : 'error-banner'} style={{ marginBottom: '1.25rem' }}>
          <span>{msg}</span>
          <button
            type="button"
            onClick={() => setMsg('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ─────────────────── TOP FINANCIAL METRIC KPI CARDS ─────────────────── */}
      <div className="kpi-grid">
        {/* Passed & Posted Amount */}
        <div className="kpi-card kpi-card-passed">
          <div className="kpi-header">
            <div className="kpi-icon-wrap kpi-icon-passed">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                <polyline points="9 12 11 14 15 10"></polyline>
              </svg>
            </div>
            <span className="kpi-badge kpi-badge-passed">{kpis.passedCount} Passed</span>
          </div>
          <div className="kpi-label">Passed &amp; Synced Amount</div>
          <div className="kpi-value kpi-val-passed">{formatINR(kpis.passedAmt)}</div>
          <div className="kpi-meta">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Approved by Finance &amp; posted to Zoho Books</span>
          </div>
        </div>

        {/* Pending Amount */}
        <div className="kpi-card kpi-card-pending">
          <div className="kpi-header">
            <div className="kpi-icon-wrap kpi-icon-pending">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
            <span className="kpi-badge kpi-badge-pending">{kpis.pendingCount} Pending</span>
          </div>
          <div className="kpi-label">Pending Approval Amount</div>
          <div className="kpi-value kpi-val-pending">{formatINR(kpis.pendingAmt)}</div>
          <div className="kpi-meta">
            <span>{kpis.pendingL1Count} awaiting L1 • {kpis.pendingFinanceCount} awaiting Finance</span>
          </div>
        </div>

        {/* Rejected Amount */}
        <div className="kpi-card kpi-card-rejected">
          <div className="kpi-header">
            <div className="kpi-icon-wrap kpi-icon-rejected">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            </div>
            <span className="kpi-badge kpi-badge-rejected">{kpis.rejectedCount} Rejected</span>
          </div>
          <div className="kpi-label">Rejected Bills Amount</div>
          <div className="kpi-value kpi-val-rejected">{formatINR(kpis.rejectedAmt)}</div>
          <div className="kpi-meta">
            <span>Can be corrected &amp; resubmitted or deleted</span>
          </div>
        </div>

        {/* Total Invoices Pipeline */}
        <div className="kpi-card kpi-card-total">
          <div className="kpi-header">
            <div className="kpi-icon-wrap kpi-icon-total">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                <line x1="2" y1="10" x2="22" y2="10"></line>
              </svg>
            </div>
            <span className="kpi-badge kpi-badge-total">{kpis.totalCount} Total</span>
          </div>
          <div className="kpi-label">Total Volume Submitted</div>
          <div className="kpi-value">{formatINR(kpis.totalAmt)}</div>
          <div className="kpi-meta">
            <span>Lifetime invoice submissions</span>
          </div>
        </div>
      </div>

      {/* ─────────────────── FILTERS & CONTROLS ─────────────────── */}
      <div className="card" style={{ marginBottom: '1.25rem', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Status Tabs */}
          <div className="status-filter-group">
            <button
              type="button"
              className={`filter-pill ${statusFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setStatusFilter('ALL')}
            >
              All Bills ({kpis.totalCount})
            </button>
            <button
              type="button"
              className={`filter-pill filter-pill-passed ${statusFilter === 'POSTED' ? 'active' : ''}`}
              onClick={() => setStatusFilter('POSTED')}
            >
              ✓ Passed ({kpis.passedCount})
            </button>
            <button
              type="button"
              className={`filter-pill filter-pill-pending ${statusFilter === 'PENDING' ? 'active' : ''}`}
              onClick={() => setStatusFilter('PENDING')}
            >
              ⏳ Pending ({kpis.pendingCount})
            </button>
            <button
              type="button"
              className={`filter-pill filter-pill-rejected ${statusFilter === 'REJECTED' ? 'active' : ''}`}
              onClick={() => setStatusFilter('REJECTED')}
            >
              ⚠️ Rejected ({kpis.rejectedCount})
            </button>
          </div>

          {/* Search Input */}
          <div style={{ minWidth: '240px', flex: '1 1 240px', maxWidth: '380px' }}>
            <div className="input-with-icon">
              <span className="input-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </span>
              <input
                className="form-control has-icon"
                placeholder="Search by Bill #, Vendor, or Notes..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ fontSize: '0.85rem', padding: '0.45rem 0.75rem 0.45rem 2.2rem' }}
              />
            </div>
          </div>
        </div>

        {/* Date Filter Row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '1px solid var(--color-border)' }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Filter by Date:
          </span>

          {/* Quick Presets */}
          <div className="date-presets-row">
            {['ALL', 'THIS_MONTH', 'LAST_30', 'THIS_YEAR'].map(p => (
              <button
                key={p}
                type="button"
                className={`date-preset-btn ${datePreset === p ? 'active' : ''}`}
                onClick={() => handleDatePreset(p)}
              >
                {p === 'ALL' && 'All Time'}
                {p === 'THIS_MONTH' && 'This Month'}
                {p === 'LAST_30' && 'Last 30 Days'}
                {p === 'THIS_YEAR' && 'This Year'}
              </button>
            ))}
          </div>

          {/* From / To Date Pickers */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>From:</span>
              <input
                type="date"
                className="form-control"
                value={startDate}
                onChange={e => { setStartDate(e.target.value); setDatePreset('CUSTOM'); }}
                style={{ fontSize: '0.8125rem', padding: '0.35rem 0.5rem', width: '135px' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>To:</span>
              <input
                type="date"
                className="form-control"
                value={endDate}
                onChange={e => { setEndDate(e.target.value); setDatePreset('CUSTOM'); }}
                style={{ fontSize: '0.8125rem', padding: '0.35rem 0.5rem', width: '135px' }}
              />
            </div>

            {!isPM && (
              <select
                className="form-control"
                value={propertyFilter}
                onChange={e => setPropertyFilter(e.target.value)}
                style={{ fontSize: '0.8125rem', padding: '0.35rem 0.5rem', width: '170px' }}
              >
                <option value="ALL">All Properties</option>
                {properties.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
              </select>
            )}

            {/* Sort selector */}
            <select
              className="form-control"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              style={{ fontSize: '0.8125rem', padding: '0.35rem 0.5rem', width: '150px' }}
            >
              <option value="date-desc">Newest Date First</option>
              <option value="date-asc">Oldest Date First</option>
              <option value="amount-desc">Amount: High → Low</option>
              <option value="amount-asc">Amount: Low → High</option>
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                className="btn btn-outline-danger btn-sm"
                onClick={() => {
                  setSearch(''); setPropertyFilter('ALL');
                  setStatusFilter('ALL');
                  handleDatePreset('ALL');
                }}
                title="Clear all filters"
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─────────────────── BY PROPERTY (L1 / Finance) ─────────────────── */}
      {!isPM && properties.length > 0 && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <div className="card-header">
            <div className="card-title">
              By Property
              <span className="count-pill" style={{ marginLeft: '0.5rem' }}>{properties.length}</span>
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Click a row to filter the bills below</div>
          </div>
          <div className="table-responsive">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Property Manager</th>
                  <th>State</th>
                  <th>Bills</th>
                  <th>Approved &amp; Posted</th>
                  <th>Pending</th>
                  <th>Rejected</th>
                  <th>Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {properties.map(p => (
                  <tr
                    key={p.key}
                    onClick={() => setPropertyFilter(propertyFilter === p.key ? 'ALL' : p.key)}
                    style={{ cursor: 'pointer', background: propertyFilter === p.key ? 'var(--info-bg, rgba(59,130,246,0.06))' : undefined }}
                  >
                    <td style={{ fontWeight: 700 }}>{p.name}</td>
                    <td>{p.pm}</td>
                    <td>{p.state || '—'}</td>
                    <td>{p.total}</td>
                    <td><b>{p.posted}</b> <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>· {formatINR(p.postedAmt)}</span></td>
                    <td>{p.pending} <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>· {formatINR(p.pendingAmt)}</span></td>
                    <td>{p.rejected}</td>
                    <td><strong>{formatINR(p.totalAmt)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─────────────────── INVOICE HISTORY TABLE ─────────────────── */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--primary)' }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            Submitted Invoices Record
            <span className="count-pill" style={{ marginLeft: '0.5rem' }}>{filteredBills.length}</span>
          </div>

          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Showing {filteredBills.length} of {bills.length} invoices
          </div>
        </div>

        {filteredBills.length === 0 ? (
          <div className="pdf-fallback" style={{ borderRadius: 'var(--radius-md)', padding: '3.5rem 1.5rem' }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '0.75rem', color: 'var(--text-muted)' }}>
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <h3 style={{ fontSize: '1.1rem', color: 'var(--text-main)', marginBottom: '0.25rem' }}>No Invoices Found</h3>
            <p style={{ maxWidth: '420px', margin: '0 auto 1.25rem auto' }}>
              {hasActiveFilters
                ? 'No bills match your current filters. Try changing or resetting the date or status filters.'
                : isPM ? 'You have not uploaded any bills yet. Click below to submit your first invoice.' : 'No bills have been submitted yet.'}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => { setSearch(''); setStatusFilter('ALL'); setPropertyFilter('ALL'); handleDatePreset('ALL'); }}
              >
                Clear Filters
              </button>
            ) : isPM && (
              <button type="button" className="btn btn-primary" onClick={onNewEntry}>
                + Upload New Bill
              </button>
            )}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Bill / Invoice #</th>
                  {!isPM && <th>Property</th>}
                  <th>Vendor</th>
                  <th>Bill Date</th>
                  <th>Calculated Total</th>
                  <th>Status</th>
                  {!isPM && <th>Approved By</th>}
                  <th>Review Note / Feedback</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBills.map(b => {
                  const billTotal = getBillTotal(b);
                  const isRejected = b.status.startsWith('REJECTED');
                  const canDelete = isPM && (isRejected || b.status === 'PENDING_L1');
                  const canEdit = isPM && (isRejected || b.status === 'PENDING_L1');
                  const prop = propertyOf(b);
                  const { l1, fin } = approvals(b);
                  const who = (x) => x ? `${x.action === 'APPROVED' ? '✓' : '✕'} ${x.by}${x.at ? ` · ${new Date(x.at).toLocaleDateString('en-IN')}` : ''}` : '—';
                  const latestNote = b.history?.at(-1)?.comment;

                  return (
                    <tr key={b._id} style={isRejected ? { background: 'rgba(239, 68, 68, 0.03)' } : {}}>
                      <td>
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => openPreview(b)}
                          title="Click to view invoice details & document"
                          style={{
                            fontWeight: 700,
                            color: 'var(--primary)',
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            textAlign: 'left',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}
                        >
                          {b.billNumber}
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                          </svg>
                        </button>
                      </td>
                      {!isPM && (
                        <td>
                          <div style={{ fontWeight: 600 }}>{prop.name}</div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {prop.pm}{prop.state ? ` · ${prop.state}` : ''}
                          </span>
                        </td>
                      )}
                      <td>
                        <div style={{ fontWeight: 600 }}>{b.vendorName || 'Unnamed Vendor'}</div>
                        {b.source_of_supply && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Supply: {b.source_of_supply}
                          </span>
                        )}
                      </td>
                      <td>
                        <div>{b.date || '—'}</div>
                        {b.dueDate && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Due: {b.dueDate}
                          </div>
                        )}
                      </td>
                      <td>
                        <strong style={{ color: 'var(--text-main)', fontSize: '0.9375rem' }}>
                          {formatINR(billTotal)}
                        </strong>
                        {b.lineItems?.length > 0 && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {b.lineItems.length} {b.lineItems.length === 1 ? 'item' : 'items'}
                          </div>
                        )}
                      </td>
                      <td>{getStatusBadge(b.status)}</td>
                      {!isPM && (
                        <td style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                          <div>L1: {who(l1)}</div>
                          <div>Finance: {who(fin)}</div>
                        </td>
                      )}
                      <td style={{ maxWidth: '280px' }}>
                        {latestNote ? (
                          <div style={{
                            fontSize: '0.8125rem',
                            color: isRejected ? 'var(--danger-text)' : 'var(--text-secondary)',
                            fontWeight: isRejected ? 600 : 400
                          }}>
                            {isRejected ? '⚠️ ' : ''}“{latestNote}”
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>—</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                          {/* Preview button */}
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => openPreview(b)}
                            title="View Document & Breakdown"
                            style={{ padding: '0.35rem 0.6rem' }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                              <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                          </button>

                          {/* Edit button */}
                          {canEdit && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => onEditBill(b)}
                              title="Edit & Resubmit Bill"
                              style={{ padding: '0.35rem 0.6rem' }}
                            >
                              ✏️ Edit
                            </button>
                          )}

                          {/* Delete button (for rejected or pending bills) */}
                          {canDelete && (
                            <button
                              type="button"
                              className="btn btn-outline-danger btn-sm"
                              onClick={() => setDeleteTarget(b)}
                              title="Delete this bill"
                              style={{ padding: '0.35rem 0.6rem' }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          )}

                          {/* If rejected, also show quick 'New Entry' */}
                          {isPM && isRejected && (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={onNewEntry}
                              title="Make a new invoice entry"
                              style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
                            >
                              + New
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─────────────────── DOCUMENT & DETAIL PREVIEW MODAL ─────────────────── */}
      {previewBill && (
        <div className="history-modal-backdrop" onClick={closePreview}>
          <div className="history-modal-content" onClick={e => e.stopPropagation()}>
            <div className="history-modal-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Bill #{previewBill.billNumber}</h3>
                  {getStatusBadge(previewBill.status)}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Vendor: <strong>{previewBill.vendorName}</strong> • Date: {previewBill.date || '—'}
                </div>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={closePreview}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <div className="history-modal-body">
              {/* Meta details */}
              <div className="detail-chips-row" style={{ marginBottom: '1rem' }}>
                <div className="detail-chip">
                  <span className="detail-chip-label">Bill Total:</span>
                  <span className="detail-chip-val" style={{ color: 'var(--primary)', fontWeight: 700 }}>
                    {formatINR(getBillTotal(previewBill))}
                  </span>
                </div>
                {previewBill.dueDate && (
                  <div className="detail-chip">
                    <span className="detail-chip-label">Due Date:</span>
                    <span className="detail-chip-val">{previewBill.dueDate}</span>
                  </div>
                )}
                {previewBill.source_of_supply && (
                  <div className="detail-chip">
                    <span className="detail-chip-label">Source of Supply:</span>
                    <span className="detail-chip-val">{previewBill.source_of_supply}</span>
                  </div>
                )}
                {previewBill.location_id && (
                  <div className="detail-chip">
                    <span className="detail-chip-label">Location:</span>
                    <span className="detail-chip-val">{previewBill.location_id}</span>
                  </div>
                )}
              </div>

              {/* Line items table */}
              {previewBill.lineItems && previewBill.lineItems.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                    Line Items
                  </h4>
                  <div className="table-responsive">
                    <table className="custom-table" style={{ fontSize: '0.8125rem' }}>
                      <thead>
                        <tr>
                          <th>Item Name</th>
                          <th>Qty × Rate</th>
                          <th>Tax Rate</th>
                          <th>Account</th>
                          <th style={{ textAlign: 'right' }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewBill.lineItems.map((l, i) => {
                          const lineSub = (Number(l.rate) || 0) * (Number(l.quantity) || 1);
                          const taxRate = Number(l.tax_percentage) || 0;
                          const lineTot = lineSub * (1 + taxRate / 100);
                          return (
                            <tr key={i}>
                              <td>
                                <div style={{ fontWeight: 600 }}>{l.name || 'Unnamed item'}</div>
                                {l.description && (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{l.description}</div>
                                )}
                              </td>
                              <td>{l.quantity} × ₹{Number(l.rate || 0).toLocaleString()}</td>
                              <td>
                                <span className="badge badge-info">{taxRate}%</span>
                              </td>
                              <td>
                                <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{l.account_id || '—'}</span>
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                ₹{lineTot.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Audit history */}
              {previewBill.history && previewBill.history.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                    Approval History &amp; Review Trail
                  </h4>
                  <div className="history-timeline">
                    {previewBill.history.map((h, i) => (
                      <div key={i} className="history-item">
                        <span className="history-by">{h.by}</span>
                        <span className="history-action">[{h.action}]</span>
                        <span className="history-comment">{h.comment ? `“${h.comment}”` : 'No comment'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Document preview iframe or image */}
              <div>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                  Attached Invoice File
                </h4>
                <div className="pdf-preview-box">
                  {previewPdf ? (
                    (previewPdfType?.startsWith('image/') || previewBill.fileType?.startsWith('image/')) ? (
                      <div style={{ textAlign: 'center', padding: '1rem', background: '#0f172a', borderRadius: 'var(--radius-md)', overflow: 'auto', maxHeight: '420px' }}>
                        <img src={previewPdf} alt="Invoice Document" style={{ maxWidth: '100%', height: 'auto', borderRadius: '4px' }} />
                      </div>
                    ) : (
                      <iframe src={previewPdf} title="invoice-document" style={{ height: '420px' }} />
                    )
                  ) : (
                    <div className="pdf-fallback" style={{ padding: '2rem' }}>
                      <p>Document preview unavailable or already posted to Zoho Books.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="history-modal-footer">
              {isPM && previewBill.status.startsWith('REJECTED') && (
                <>
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    onClick={() => {
                      const b = previewBill;
                      closePreview();
                      setDeleteTarget(b);
                    }}
                  >
                    🗑️ Delete Bill
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      const b = previewBill;
                      closePreview();
                      onEditBill(b);
                    }}
                  >
                    ✏️ Edit &amp; Resubmit
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      closePreview();
                      onNewEntry();
                    }}
                  >
                    + Make New Entry
                  </button>
                </>
              )}
              <button type="button" className="btn btn-secondary btn-sm" onClick={closePreview}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────── DELETE CONFIRMATION MODAL ─────────────────── */}
      {deleteTarget && (
        <div className="history-modal-backdrop" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="history-modal-content" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'var(--danger-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--danger)', flexShrink: 0
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Delete Bill #{deleteTarget.billNumber}?</h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Vendor: {deleteTarget.vendorName}
                </span>
              </div>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete this bill? The uploaded invoice file will be removed from the server.
              {deleteTarget.status.startsWith('REJECTED') && ' You will then be able to make a clean, fresh entry.'}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-outline-danger btn-sm"
                onClick={handleDelete}
                disabled={deleting}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                {deleting ? (
                  <>
                    <div className="spinner" style={{ width: 14, height: 14, borderColor: 'rgba(225,29,72,0.2)', borderTopColor: 'var(--danger)' }}></div>
                    Deleting...
                  </>
                ) : (
                  'Yes, Delete Bill'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
