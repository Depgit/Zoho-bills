import Icon from '../../components/common/Icon.jsx';
import StatusBadge from '../../components/common/StatusBadge.jsx';
import { returnedTo } from '../../utils/billStatus.js';
import { inr } from '../../utils/format.js';
import ApprovalTrail from './ApprovalTrail.jsx';

// "Saket" or "Split · 3 properties", with the PM name(s)
function property(b) {
  const pms = (b.allocations || []).map((a) => a.pm).filter(Boolean);
  if (!pms.length) return { name: 'Unassigned', sub: '' };
  if (pms.length === 1) return { name: pms[0].location_name || pms[0].name, sub: pms[0].name };
  return { name: `Split · ${pms.length} properties`, sub: pms.map((p) => p.name).join(', ') };
}

// One bill in the history table (a card on phones)
export default function BillRow({ bill: b, showManagerColumns, canEdit, canDelete, onPreview, onEdit, onDelete }) {
  const rejected = b.status === 'REJECTED';
  const mine = rejected && canEdit; // only the owner has to act on a rejection
  const note = b.history?.at(-1)?.comment;
  const prop = property(b);

  return (
    <tr className={mine ? 'row-attention' : undefined}>
      <td data-label="Bill #">
        <button type="button" className="link" onClick={() => onPreview(b)}>
          {b.billNumber || '—'}
        </button>
      </td>
      {showManagerColumns && (
        <td data-label="Property">
          <div className="cell-main">{prop.name}</div>
          {prop.sub && <div className="cell-sub">{prop.sub}</div>}
        </td>
      )}
      <td data-label="Vendor">
        <div className="cell-main truncate">{b.vendorName || 'Unnamed vendor'}</div>
      </td>
      <td data-label="Date" className="nowrap">
        {b.date || '—'}
      </td>
      <td data-label="Amount" className="num nowrap">
        <b>{inr(b.amount)}</b>
      </td>
      <td data-label="Status">
        <StatusBadge bill={b} />
        {rejected && <div className="cell-sub">{mine ? '↩ Back to you' : `↩ With ${returnedTo(b)}`}</div>}
      </td>
      {showManagerColumns && (
        <td data-label="Approvals" className="hide-md cell-sub">
          <ApprovalTrail bill={b} />
        </td>
      )}
      <td data-label="Note" className="hide-md">
        {note ? <div className={`note ${mine ? 'note-danger' : ''}`}>“{note}”</div> : <span className="muted">—</span>}
      </td>
      <td className="actions">
        <button type="button" className="icon-btn" onClick={() => onPreview(b)} title="View bill & document">
          <Icon name="eye" size={15} />
        </button>
        {canEdit && (
          <button type="button" className="icon-btn" onClick={() => onEdit(b)} title="Edit & resubmit">
            <Icon name="edit" size={15} />
          </button>
        )}
        {canDelete && (
          <button type="button" className="icon-btn danger" onClick={() => onDelete(b)} title="Delete bill">
            <Icon name="trash" size={15} />
          </button>
        )}
      </td>
    </tr>
  );
}
