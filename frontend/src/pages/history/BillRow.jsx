import Icon from '../../components/common/Icon.jsx';
import StatusBadge from '../../components/common/StatusBadge.jsx';
import { inr } from '../../utils/format.js';
import { propertyOf } from '../../utils/properties.js';
import ApprovalTrail from './ApprovalTrail.jsx';

const small = { fontSize: '0.75rem', color: 'var(--text-muted)' };
const iconButton = { padding: '0.35rem 0.6rem' };

// One bill in the history table
export default function BillRow({ bill: b, amount, showManagerColumns, canEdit, canDelete, onPreview, onEdit, onDelete, onNew }) {
  const rejected = b.status === 'REJECTED';
  const note = b.history?.at(-1)?.comment;
  const prop = propertyOf(b);

  return (
    <tr style={rejected ? { background: 'rgba(239, 68, 68, 0.03)' } : {}}>
      <td>
        <button
          type="button"
          className="link-btn"
          onClick={() => onPreview(b)}
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
            gap: '0.25rem',
          }}
        >
          {b.billNumber}
          <Icon name="external" size={12} />
        </button>
      </td>

      {showManagerColumns && (
        <td>
          <div style={{ fontWeight: 600 }}>{prop.name}</div>
          <span style={small}>
            {prop.pm}
            {prop.state ? ` · ${prop.state}` : ''}
          </span>
        </td>
      )}

      <td>
        <div style={{ fontWeight: 600 }}>{b.vendorName || 'Unnamed Vendor'}</div>
        {b.source_of_supply && <span style={small}>Supply: {b.source_of_supply}</span>}
      </td>

      <td>
        <div>{b.date || '—'}</div>
        {b.dueDate && <div style={small}>Due: {b.dueDate}</div>}
      </td>

      <td>
        <strong style={{ color: 'var(--text-main)', fontSize: '0.9375rem' }}>{inr(amount)}</strong>
        {b.lineItems?.length > 0 && (
          <div style={small}>
            {b.lineItems.length} {b.lineItems.length === 1 ? 'item' : 'items'}
          </div>
        )}
      </td>

      <td>
        <StatusBadge bill={b} />
      </td>

      {showManagerColumns && (
        <td style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
          <ApprovalTrail bill={b} />
        </td>
      )}

      <td style={{ maxWidth: '280px' }}>
        {note ? (
          <div
            style={{
              fontSize: '0.8125rem',
              color: rejected ? 'var(--danger-text)' : 'var(--text-secondary)',
              fontWeight: rejected ? 600 : 400,
            }}
          >
            {rejected ? '⚠️ ' : ''}“{note}”
          </div>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>—</span>
        )}
      </td>

      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPreview(b)} title="View Document & Breakdown" style={iconButton}>
            <Icon name="eye" size={14} />
          </button>
          {canEdit && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(b)} title="Edit & Resubmit Bill" style={iconButton}>
              ✏️ Edit
            </button>
          )}
          {canDelete && (
            <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => onDelete(b)} title="Delete this bill" style={iconButton}>
              <Icon name="trash" size={14} />
            </button>
          )}
          {canEdit && rejected && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onNew}
              title="Make a new invoice entry"
              style={{ ...iconButton, fontSize: '0.75rem' }}
            >
              + New
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
