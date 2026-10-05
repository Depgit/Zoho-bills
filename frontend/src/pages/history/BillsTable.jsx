import Pagination from '../../components/common/Pagination.jsx';
import SortHeader from '../../components/common/SortHeader.jsx';
import BillRow from './BillRow.jsx';
import EmptyHistory from './EmptyHistory.jsx';

// One page of bills with sortable headers and paging
export default function BillsTable({ page, loading, sort, onSort, onPage, onPageSize, showManagerColumns, permissions, filtersActive, canUpload, handlers }) {
  const rows = page?.rows || [];
  return (
    <section className={`panel ${loading ? 'is-loading' : ''}`}>
      {rows.length === 0 && !loading ? (
        <EmptyHistory filtered={filtersActive} canUpload={canUpload} onReset={handlers.onReset} onNewEntry={handlers.onNew} />
      ) : (
        <div className="table-wrap">
          <table className="table table-cards">
            <thead>
              <tr>
                <SortHeader field="billNumber" sort={sort} onSort={onSort}>
                  Bill #
                </SortHeader>
                {showManagerColumns && <th>Property</th>}
                <SortHeader field="vendor" sort={sort} onSort={onSort}>
                  Vendor
                </SortHeader>
                <SortHeader field="date" sort={sort} onSort={onSort}>
                  Date
                </SortHeader>
                <SortHeader field="amount" sort={sort} onSort={onSort} align="right">
                  Amount
                </SortHeader>
                <SortHeader field="status" sort={sort} onSort={onSort}>
                  Status
                </SortHeader>
                {showManagerColumns && <th className="hide-md">Approvals</th>}
                <th className="hide-md">Note</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <BillRow
                  key={b.id}
                  bill={b}
                  showManagerColumns={showManagerColumns}
                  canEdit={permissions.canEdit(b)}
                  canDelete={permissions.canDelete(b)}
                  {...handlers}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {page && page.total > 0 && <Pagination page={page.page} pageSize={page.pageSize} total={page.total} onPage={onPage} onPageSize={onPageSize} />}
    </section>
  );
}
