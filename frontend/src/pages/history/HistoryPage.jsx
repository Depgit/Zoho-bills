import { useCallback, useState } from 'react';
import * as billsApi from '../../api/bills.js';
import { showError } from '../../api/errors.js';
import { accounts as loadAccounts } from '../../api/zoho.js';
import FilterChips from '../../components/common/FilterChips.jsx';
import Icon from '../../components/common/Icon.jsx';
import InfoBanner from '../../components/common/InfoBanner.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import RefreshButton from '../../components/common/RefreshButton.jsx';
import { useApiList } from '../../hooks/useApiList.js';
import { useRemote } from '../../hooks/useRemote.js';
import { isEditable, isOwner } from '../../utils/billStatus.js';
import { activeChips } from './activeChips.js';
import BillPreviewModal from './BillPreviewModal.jsx';
import BillsTable from './BillsTable.jsx';
import DeleteBillModal from './DeleteBillModal.jsx';
import ExpenseSummary from './ExpenseSummary.jsx';
import FilterBar from './FilterBar.jsx';
import PropertySummary from './PropertySummary.jsx';
import StatTiles from './StatTiles.jsx';
import { useHistoryFilters } from './useHistoryFilters.js';

// History for every role — filtered, sorted and paged by the server.
//   PM → bills assigned to them (their share only)
//   CM/OM/FM → bills of the PMs below them + bills they own or approve; filter by OM / CM / property
//   ADMIN → every bill; can delete any bill not yet posted
export default function HistoryPage({ role = 'PM', userId, onEditBill, onNewEntry }) {
  const isPM = role === 'PM';
  const canUpload = role !== 'ADMIN';
  const filters = useHistoryFilters();
  const { f, params, update, reset, active } = filters;
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const key = JSON.stringify(params);
  const bills = useRemote((signal) => billsApi.listBills({ scope: 'history', ...params }, signal), key);
  // Side totals ignore paging / sorting and the status filters (and properties also the property filter)
  const { page, pageSize, sort, status, stage, pendingOnMe, ...totalsParams } = params; // eslint-disable-line no-unused-vars
  const { pmId, ...propParams } = totalsParams; // eslint-disable-line no-unused-vars
  const props = useRemote((signal) => billsApi.propertyTotals({ scope: 'history', ...propParams }, signal), JSON.stringify(propParams), {
    initial: [],
    enabled: !isPM,
  });
  const expenses = useRemote((signal) => billsApi.expenseTotals({ scope: 'history', ...totalsParams }, signal), JSON.stringify(totalsParams), {
    initial: [],
    enabled: !isPM,
  });
  const [team] = useApiList(billsApi.team, { enabled: !isPM });
  const [accounts] = useApiList(loadAccounts, { enabled: !isPM, quiet: true });

  const reload = useCallback(() => {
    bills.reload();
    props.reload();
    expenses.reload();
  }, [bills.reload, props.reload, expenses.reload]);

  const permissions = {
    canEdit: (b) => isOwner(b, userId) && isEditable(b),
    canDelete: (b) => b.status !== 'POSTED' && (isOwner(b, userId) || role === 'ADMIN'),
  };

  const deleteBill = async (b) => {
    try {
      await billsApi.deleteBill(b.id);
      setMessage(`✓ Bill "${b.billNumber}" was deleted.`);
      setToDelete(null);
      if (preview?.id === b.id) setPreview(null);
      reload();
    } catch (e) {
      showError(e);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Invoice history"
        description={isPM ? 'Your bills and their approval status.' : 'Every bill in your area — filter by team, property, status or date.'}
      >
        <RefreshButton onClick={reload} loading={bills.loading} />
        {canUpload && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onNewEntry}>
            <Icon name="plus" size={15} /> Upload bill
          </button>
        )}
      </PageHeader>

      <InfoBanner message={message} onClose={() => setMessage('')} />
      <StatTiles
        summary={bills.data?.summary}
        status={f.status}
        pendingOnMe={f.pendingOnMe}
        onStatus={(s) => update({ status: s, stage: '', pendingOnMe: false })}
        onPendingOnMe={(on) => update({ pendingOnMe: on, status: '', stage: '' })}
      />
      <FilterBar filters={filters} team={team} properties={props.data} accounts={accounts} showTeam={!isPM} />
      <FilterChips chips={activeChips(filters, { team, properties: props.data, accounts })} onClear={reset} />
      {!isPM && <PropertySummary properties={props.data} selected={f.pmId} onSelect={(id) => update({ pmId: id })} />}
      {!isPM && (
        <ExpenseSummary
          rows={expenses.data}
          accounts={accounts}
          selected={f.accountId}
          onSelect={(accountId) => update({ accountId })}
          propertyName={props.data.find((p) => p.key === f.pmId)?.name}
        />
      )}

      <BillsTable
        page={bills.data}
        loading={bills.loading}
        sort={f.sort}
        onSort={(s) => update({ sort: s })}
        onPage={(p) => filters.set({ page: p })}
        onPageSize={(s) => update({ pageSize: s })}
        showManagerColumns={!isPM}
        permissions={permissions}
        filtersActive={active}
        canUpload={canUpload}
        handlers={{ onPreview: setPreview, onEdit: onEditBill, onDelete: setToDelete, onNew: onNewEntry, onReset: reset }}
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
