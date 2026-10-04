import { approvalTrail } from '../../utils/billStatus.js';
import { formatDate } from '../../utils/format.js';

// "CM ✓ Ravi · 03/10/2026" lines for the current approval round
export default function ApprovalTrail({ bill }) {
  const steps = approvalTrail(bill);
  if (!steps.length) return <span style={{ color: 'var(--text-muted)' }}>{bill.status === 'DRAFT' ? 'Not submitted' : '—'}</span>;
  return steps.map((x, i) => (
    <div key={i}>
      {x.role} {x.action === 'REJECTED' ? '✕' : '✓'} {x.by}
      {x.at && <span style={{ color: 'var(--text-muted)' }}> · {formatDate(x.at)}</span>}
    </div>
  ));
}
