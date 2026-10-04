import Icon from '../../components/common/Icon.jsx';
import { inr } from '../../utils/format.js';

function KpiCard({ kind, icon, badge, label, value, meta, valueClass }) {
  return (
    <div className={`kpi-card kpi-card-${kind}`}>
      <div className="kpi-header">
        <div className={`kpi-icon-wrap kpi-icon-${kind}`}>
          <Icon name={icon} size={22} strokeWidth={2.2} />
        </div>
        <span className={`kpi-badge kpi-badge-${kind}`}>{badge}</span>
      </div>
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${valueClass || ''}`}>{inr(value)}</div>
      <div className="kpi-meta">{meta}</div>
    </div>
  );
}

// Posted / pending / rejected / total amounts
export default function KpiCards({ kpis: k }) {
  return (
    <div className="kpi-grid">
      <KpiCard
        kind="passed"
        icon="shieldCheck"
        badge={`${k.passedCount} Passed`}
        label="Passed & Synced Amount"
        value={k.passedAmt}
        valueClass="kpi-val-passed"
        meta={
          <>
            <Icon name="check" size={13} />
            <span>Approved by the Finance Manager &amp; posted to Zoho Books</span>
          </>
        }
      />
      <KpiCard
        kind="pending"
        icon="clock"
        badge={`${k.pendingCount} Pending`}
        label="Pending Approval Amount"
        value={k.pendingAmt}
        valueClass="kpi-val-pending"
        meta={
          <span>
            {k.pendingCm} at CM • {k.pendingOm} at OM • {k.pendingFm} at FM{k.draftCount ? ` • ${k.draftCount} draft` : ''}
          </span>
        }
      />
      <KpiCard
        kind="rejected"
        icon="xCircle"
        badge={`${k.rejectedCount} Rejected`}
        label="Rejected Bills Amount"
        value={k.rejectedAmt}
        valueClass="kpi-val-rejected"
        meta={<span>Can be corrected &amp; resubmitted or deleted</span>}
      />
      <KpiCard
        kind="total"
        icon="card"
        badge={`${k.totalCount} Total`}
        label="Total Volume Submitted"
        value={k.totalAmt}
        meta={<span>Lifetime invoice submissions</span>}
      />
    </div>
  );
}
