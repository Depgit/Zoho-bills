import { statusText } from '../../utils/billStatus.js';

// Coloured status pill for a bill: Draft / Pending CM · Ravi / Rejected by OM / Posted to Zoho
export default function StatusBadge({ bill }) {
  return <span className={`badge badge-${(bill?.status || 'draft').toLowerCase()}`}>{statusText(bill)}</span>;
}
