import React from 'react';

// Shared bill helpers for every screen.
export const ROLE_NAME = { PM: 'Property Manager', CM: 'Cluster Manager', OM: 'Operations Manager', FM: 'Finance Manager', ADMIN: 'Admin' };
export const MANAGER_ROLE = { PM: 'CM', CM: 'OM', OM: 'FM', FM: null };
export const UPLOAD_ROLES = ['PM', 'CM', 'OM', 'FM'];

export const idOf = x => String(x?._id || x || '');
export const inr = n => '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Logged-in user as saved at login
export const currentUser = () => { try { return JSON.parse(localStorage.getItem('user') || 'null') || {}; } catch { return {}; } };

// "Draft", "Pending CM", "Rejected by OM", "Posted to Zoho"
export function statusText(b) {
  if (!b) return '';
  if (b.status === 'DRAFT') return 'Draft';
  if (b.status === 'PENDING') return `Pending ${b.stage}${b.approverId?.name ? ` · ${b.approverId.name}` : ''}`;
  if (b.status === 'REJECTED') return `Rejected by ${b.stage}`;
  if (b.status === 'POSTED') return 'Posted to Zoho';
  return b.status;
}

const BADGE = { DRAFT: '', PENDING: 'badge-pending-finance', REJECTED: 'badge-rejected-finance', POSTED: 'badge-posted' };
export function StatusBadge({ bill }) {
  const draft = bill?.status === 'DRAFT';
  return (
    <span className={`badge-status ${BADGE[bill?.status] || 'badge-pending-l1'}`}
      style={draft ? { background: 'var(--color-surface-subtle, #f1f5f9)', color: 'var(--text-secondary)', border: '1px dashed var(--color-border)' } : undefined}>
      {statusText(bill)}
    </span>
  );
}

// The owner can still edit: a draft, a rejected bill, or a pending bill nobody has approved yet
export const isEditable = b => b && (b.status === 'DRAFT' || b.status === 'REJECTED' || (b.status === 'PENDING' && b.stage === b.firstStage));
export const isOwner = (b, userId) => idOf(b?.ownerId) === String(userId);

// Bill total as the form computes it: subtotal + tax − discount
export function getBillTotal(b) {
  if (!b) return 0;
  if (b.lineItems && b.lineItems.length > 0) {
    const subtotal = b.lineItems.reduce((s, l) => s + (Number(l.rate) || 0) * (Number(l.quantity) || 1), 0);
    const disc = Number(b.discount_amount) > 0
      ? Number(b.discount_amount)
      : (Number(b.discount_percent) > 0 ? (subtotal * Number(b.discount_percent) / 100) : 0);
    const withTax = b.lineItems.reduce((s, l) => {
      const lineSub = (Number(l.rate) || 0) * (Number(l.quantity) || 1);
      return s + lineSub * (1 + (Number(l.tax_percentage) || 0) / 100);
    }, 0) - disc;
    if (withTax > 0) return withTax;
  }
  if (b.extracted?.total) {
    const parsed = parseFloat(String(b.extracted.total).replace(/[^0-9.]/g, ''));
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

// A PM's share of a bill (their allocation), or 0
export const shareOf = (b, pmId) => Number(b?.allocations?.find(a => idOf(a.pmId) === String(pmId))?.amount) || 0;
