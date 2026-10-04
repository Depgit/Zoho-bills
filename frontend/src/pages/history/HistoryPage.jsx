import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client.js';
import { useApiList } from '../../hooks/useApiList.js';
import { showError } from '../../api/errors.js';
import Icon from '../../components/common/Icon.jsx';
import InfoBanner from '../../components/common/InfoBanner.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import RefreshButton from '../../components/common/RefreshButton.jsx';
import { getBillTotal, shareOf } from '../../utils/billMath.js';
import { isEditable, isOwner } from '../../utils/billStatus.js';
import { summariseProperties } from '../../utils/properties.js';
import { computeKpis } from './kpis.js';
import { useHistoryFilters } from './useHistoryFilters.js';
import KpiCards from './KpiCards.jsx';
import HistoryFilters from './HistoryFilters.jsx';
import PropertySummary from './PropertySummary.jsx';
import BillsTable from './BillsTable.jsx';
import BillPreviewModal from './BillPreviewModal.jsx';
import DeleteBillModal from './DeleteBillModal.jsx';

// History for every role.
//   PM → bills assigned to them (their amount only), including drafts others haven't submitted yet
//   CM/OM/FM → everything for the PMs below them + bills they own or approve
//   ADMIN → every bill; can delete any bill not yet posted
export default function HistoryPage({ role = 'PM', userId, onEditBill, onNewEntry }) {
  const isPM = role === 'PM';
  const canUpload = role !== 'ADMIN';
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  // A PM counts only their own share of a bill
  const amountOf = (b) => (isPM ? shareOf(b, userId) : getBillTotal(b));
  const permissions = {
    canEdit: (b) => isOwner(b, userId) && isEditable(b),
    canDelete: (b) => b.status !== 'POSTED' && (isOwner(b, userId) || role === 'ADMIN'),
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/bills', { params: { scope: 'history' } });
      setBills(data || []);
    } catch (e) {
      showError(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  // CM/OM/FM/Admin: the people below them, for the OM / CM filters
  const [team] = useApiList('/bills/team', { enabled: !isPM });
  const filters = useHistoryFilters(bills, { amountOf, searchProperties: !isPM, team });
  // KPIs and the property summary follow the selected OM / CM
  const kpis = useMemo(() => computeKpis(filters.teamBills, amountOf), [filters.teamBills]);
  const properties = useMemo(() => summariseProperties(filters.teamBills), [filters.teamBills]);

  const deleteBill = async (b) => {
    try {
      await api.delete(`/bills/${b._id}`);
      setMessage(`✓ Bill "${b.billNumber}" has been deleted. You can now make a new entry.`);
      setToDelete(null);
      if (preview?._id === b._id) setPreview(null);
      load();
    } catch (e) {
      showError(e);
    }
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      <PageHeader
        title="Invoice History & Accounting Audit"
        description={
          isPM
            ? 'Track approved vs. pending billing volume, review approval notes, filter by date, and manage rejected invoices.'
            : 'Every bill across all properties — approvals, pending and rejected, by property, with who approved each.'
        }
        style={{ marginBottom: '1.25rem' }}
      >
        <RefreshButton onClick={load} loading={loading} />
        {canUpload && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onNewEntry}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <Icon name="plus" size={16} />
            Upload New Bill
          </button>
        )}
      </PageHeader>

      <InfoBanner message={message} onClose={() => setMessage('')} style={{ marginBottom: '1.25rem' }} />
      <KpiCards kpis={kpis} />
      {!isPM && <PropertySummary properties={properties} selected={filters.property} onSelect={filters.setProperty} />}

      <HistoryFilters filters={filters} kpis={kpis} properties={properties} team={team} showTeam={!isPM} />

      <BillsTable
        bills={filters.filtered}
        totalCount={bills.length}
        showManagerColumns={!isPM}
        permissions={permissions}
        amountOf={amountOf}
        filtersActive={filters.active}
        canUpload={canUpload}
        handlers={{ onPreview: setPreview, onEdit: onEditBill, onDelete: setToDelete, onNew: onNewEntry, onReset: filters.reset }}
      />

      {preview && (
        <BillPreviewModal
          bill={preview}
          canEdit={permissions.canEdit(preview)}
          onClose={() => setPreview(null)}
          onDelete={setToDelete}
          onEdit={onEditBill}
          onNew={onNewEntry}
        />
      )}
      {toDelete && <DeleteBillModal bill={toDelete} onCancel={() => setToDelete(null)} onConfirm={deleteBill} />}
    </div>
  );
}
