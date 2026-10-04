import DocumentPreview from '../../components/common/DocumentPreview.jsx';
import HistoryTimeline from '../../components/common/HistoryTimeline.jsx';
import Modal from '../../components/common/Modal.jsx';
import StatusBadge from '../../components/common/StatusBadge.jsx';
import { useBillDocument } from '../../hooks/useBillDocument.js';
import { getBillTotal } from '../../utils/billMath.js';
import { inr } from '../../utils/format.js';
import PreviewAllocations from './PreviewAllocations.jsx';
import PreviewLineItems from './PreviewLineItems.jsx';

function Chip({ label, children, valueStyle }) {
  return (
    <div className="detail-chip">
      <span className="detail-chip-label">{label}</span>
      <span className="detail-chip-val" style={valueStyle}>
        {children}
      </span>
    </div>
  );
}

// Full bill details + document. A rejected bill the user can edit gets Delete / Edit / New buttons.
export default function BillPreviewModal({ bill: b, canEdit, onClose, onDelete, onEdit, onNew }) {
  const doc = useBillDocument(b);
  const closeThen = (fn) => () => {
    onClose();
    fn(b);
  };

  return (
    <Modal onClose={onClose}>
      <div className="history-modal-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Bill #{b.billNumber}</h3>
            <StatusBadge bill={b} />
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            Vendor: <strong>{b.vendorName}</strong> • Date: {b.date || '—'}
          </div>
        </div>
        <button
          type="button"
          className="btn-icon"
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-muted)' }}
        >
          ✕
        </button>
      </div>

      <div className="history-modal-body">
        <div className="detail-chips-row" style={{ marginBottom: '1rem' }}>
          <Chip label="Bill Total:" valueStyle={{ color: 'var(--primary)', fontWeight: 700 }}>
            {inr(getBillTotal(b))}
          </Chip>
          {b.dueDate && <Chip label="Due Date:">{b.dueDate}</Chip>}
          {b.source_of_supply && <Chip label="Source of Supply:">{b.source_of_supply}</Chip>}
          {b.location_id && <Chip label="Location:">{b.location_name || b.location_id}</Chip>}
        </div>

        <PreviewLineItems lines={b.lineItems} />
        <PreviewAllocations bill={b} />
        <HistoryTimeline history={b.history} title="Approval History & Review Trail" />

        <div>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Attached Invoice File</h4>
          <DocumentPreview
            url={doc.url}
            type={doc.type || b.fileType}
            height={420}
            fallback="Document preview unavailable or already posted to Zoho Books."
          />
        </div>
      </div>

      <div className="history-modal-footer">
        {canEdit && b.status === 'REJECTED' && (
          <>
            <button type="button" className="btn btn-outline-danger btn-sm" onClick={closeThen(onDelete)}>
              🗑️ Delete Bill
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={closeThen(onEdit)}>
              ✏️ Edit &amp; Resubmit
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={closeThen(onNew)}>
              + Make New Entry
            </button>
          </>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
