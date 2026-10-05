import DocumentPreview from '../../components/common/DocumentPreview.jsx';
import HistoryTimeline from '../../components/common/HistoryTimeline.jsx';
import StatusBadge from '../../components/common/StatusBadge.jsx';
import { useBillDocument } from '../../hooks/useBillDocument.js';
import AllocationsTable from './AllocationsTable.jsx';
import BillMetaChips from './BillMetaChips.jsx';
import LineItemsTaxTable from './LineItemsTaxTable.jsx';
import ReviewActions from './ReviewActions.jsx';
import TaxDecision from './TaxDecision.jsx';

// Right column: everything about the selected bill + the decision buttons
export default function BillInspector({ bill, taxes, onSlabChange, onDecide }) {
  const doc = useBillDocument(bill);
  const atFM = bill.stage === 'FM'; // approving posts to Zoho, so tax slabs matter

  return (
    <div className="review-detail-card" key={bill.id}>
      <div className="detail-header-banner">
        <div className="detail-title-group">
          <h3>{bill.billNumber}</h3>
          <span className="detail-vendor-name">{bill.vendorName}</span>
        </div>
        <div>
          <StatusBadge bill={bill} />
        </div>
      </div>

      <BillMetaChips bill={bill} />
      {atFM && <TaxDecision bill={bill} />}
      <AllocationsTable bill={bill} />
      <LineItemsTaxTable bill={bill} taxes={taxes} editableSlabs={atFM} onSlabChange={onSlabChange} />
      <HistoryTimeline history={bill.history} title="Audit & Approval Trail" emptyComment="No comment recorded" />

      <div>
        <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Attached Document</h4>
        <DocumentPreview url={doc.url} type={doc.type || bill.fileType} />
      </div>

      <ReviewActions key={bill.id} stage={bill.stage} onDecide={onDecide} />
    </div>
  );
}
