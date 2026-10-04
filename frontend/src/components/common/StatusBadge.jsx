import { statusText } from '../../utils/billStatus.js';

const BADGE_CLASS = {
  DRAFT: '',
  PENDING: 'badge-pending-finance',
  REJECTED: 'badge-rejected-finance',
  POSTED: 'badge-posted',
};

const DRAFT_STYLE = {
  background: 'var(--color-surface-subtle, #f1f5f9)',
  color: 'var(--text-secondary)',
  border: '1px dashed var(--color-border)',
};

// Coloured status pill for a bill: Draft / Pending CM / Rejected by OM / Posted to Zoho
export default function StatusBadge({ bill }) {
  return (
    <span
      className={`badge-status ${BADGE_CLASS[bill?.status] || 'badge-pending-l1'}`}
      style={bill?.status === 'DRAFT' ? DRAFT_STYLE : undefined}
    >
      {statusText(bill)}
    </span>
  );
}
