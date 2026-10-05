import { useCallback, useMemo, useState } from 'react';
import * as billsApi from '../../api/bills.js';
import { showError } from '../../api/errors.js';
import { accounts as loadAccounts } from '../../api/zoho.js';
import FilterChips from '../../components/common/FilterChips.jsx';
import Icon from '../../components/common/Icon.jsx';
import InfoBanner from '../../components/common/InfoBanner.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import RefreshButton from '../../components/common/RefreshButton.jsx';
import { useApiList } from '../../hooks/useApiList.js';
import { useBills } from '../../hooks/useBills.js';
import { isEditable, isOwner } from '../../utils/billStatus.js';
import { areaOf, expenseTotals, makeFilter, paginate, propertyTotals, sortBills, summarise } from '../../utils/billQuery.js';
import { activeChips } from './activeChips.js';
import BillPreviewModal from './BillPreviewModal.jsx';
import BillsTable from './BillsTable.jsx';
import DeleteBillModal from './DeleteBillModal.jsx';
import ExpenseSummary from './ExpenseSummary.jsx';
import FilterBar from './FilterBar.jsx';
import PropertySummary from './PropertySummary.jsx';
import StatTiles from './StatTiles.jsx';
import { useHistoryFilters } from './useHistoryFilters.js';

// History for every role. All visible bills are loaded once (and cached); every filter, sort,
// page and total is worked out in the browser, so changing filters is instant. Refresh reloads.
//   PM → bills assigned to them (their share only)
//   CM/OM/FM → bills of the PMs below them + bills they own or approve; filter by OM / CM / property
//   ADMIN → every bill; can delete any bill not yet posted
export default function HistoryPage({ role = 'PM', userId, onEditBill, onNewEntry }) {
  const isPM = role === 'PM';
  const canUpload = role !== 'ADMIN';
  const filters = useHistoryFilters();
  const { f, search, update, reset, active } = filters;
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  const bills = useBills('history');
  const [team, reloadTeam] = useApiList(billsApi.team, { enabled: !isPM });
  const [accounts, reloadAccounts] = useApiList(loadAccounts, { enabled: !isPM, quiet: true });

  const refresh = useCallback(() => {
    bills.refresh();
    if (!isPM) {
      reloadTeam();
      reloadAccounts();
    }
  }, [bills.refresh, reloadTeam, reloadAccounts, isPM]);

  // Everything below is computed from the cached list — no request per filter change
  const view = useMemo(() => {
    const fs = { ...f, q: search };
    const ctx = { userId, role, area: areaOf(team, f.cm || f.om) };
    const base = bills.rows.filter(makeFilter(fs, ctx, ['status'])); // tiles + expenses: every status
    const rows = base.filter(makeFilter(fs, ctx));
    return {
      page: paginate(sortBills(rows, f.sort), f.page, f.pageSize),
      summary: summarise(base, ctx),
      properties: propertyTotals(bills.rows.filter(makeFilter(fs, ctx, ['status', 'property']))),
      expenses: expenseTotals(base, f.pmId),
    };
  }, [bills.rows, f, search, team, userId, role]);

  const permissions = {
    canEdit: (b) => isOwner(b, userId) && isEditable(b),
    canDelete: (b) => b.status !== 'POSTED' && (isOwner(b, userId) || role === 'ADMIN'),
  };

  const deleteBill = async (b) => {
    try {
      await billsApi.deleteBill(b.id); // the cached list reloads by itself
      setMessage(`✓ Bill "${b.billNumber}" was deleted.`);
      setToDelete(null);
      if (preview?.id === b.id) setPreview(null);
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
        <RefreshButton onClick={refresh} loading={bills.loading} />
        {canUpload && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onNewEntry}>
            <Icon name="plus" size={15} /> Upload bill
          </button>
        )}
      </PageHeader>

      <InfoBanner message={message} onClose={() => setMessage('')} />
      {bills.truncated && <div className="notice notice-warning">Showing the most recent 10,000 bills — narrow the dates to see older ones.</div>}
      <StatTiles
        summary={bills.loaded ? view.summary : null}
        status={f.status}
        pendingOnMe={f.pendingOnMe}
        onStatus={(s) => update({ status: s, stage: '', pendingOnMe: false })}
        onPendingOnMe={(on) => update({ pendingOnMe: on, status: '', stage: '' })}
      />
      <FilterBar filters={filters} team={team} properties={view.properties} accounts={accounts} showTeam={!isPM} />
      <FilterChips chips={activeChips(filters, { team, properties: view.properties, accounts })} onClear={reset} />
      {!isPM && <PropertySummary properties={view.properties} selected={f.pmId} onSelect={(id) => update({ pmId: id })} />}
      {!isPM && (
        <ExpenseSummary
          rows={view.expenses}
          accounts={accounts}
          selected={f.accountId}
          onSelect={(accountId) => update({ accountId })}
          propertyName={view.properties.find((p) => p.key === f.pmId)?.name}
        />
      )}

      <BillsTable
        page={bills.loaded ? view.page : null}
        loading={bills.loading && !bills.loaded}
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
