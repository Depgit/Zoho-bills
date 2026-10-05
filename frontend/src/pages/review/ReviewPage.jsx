import { useEffect, useMemo, useState } from 'react';
import { decideBill } from '../../api/bills.js';
import { showError } from '../../api/errors.js';
import { taxes as loadTaxes } from '../../api/zoho.js';
import InfoBanner from '../../components/common/InfoBanner.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import RefreshButton from '../../components/common/RefreshButton.jsx';
import { ROLE_NAME } from '../../constants/roles.js';
import { useApiList } from '../../hooks/useApiList.js';
import { useBills } from '../../hooks/useBills.js';
import { makeFilter, paginate, sortBills } from '../../utils/billQuery.js';
import { autoSlabs, needsSlab } from '../../utils/tax.js';
import QueueList from './QueueList.jsx';
import BillInspector from './BillInspector.jsx';
import NoBillSelected from './NoBillSelected.jsx';

const description = (role) => {
  if (role === 'ADMIN') return 'Every bill waiting in the chain. As Admin you can approve or reject on behalf of whoever it waits on.';
  if (role === 'FM') return 'Final check: confirm tax slabs and amounts, then approve to post the bill to Zoho Books.';
  const next = ROLE_NAME[{ CM: 'OM', OM: 'FM' }[role]] || 'manager';
  return `Bills waiting on you. Approving sends them to your ${next}; rejecting returns them to the owner.`;
};

// Approval queue: bills waiting on me (Admin: every pending bill)
export default function ReviewPage({ role }) {
  const isAdmin = role === 'ADMIN';
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [taxes] = useApiList(loadTaxes, { quiet: true });
  // The whole queue is cached; search and paging happen in the browser (oldest waiting first)
  const queue = useBills('queue');
  const shown = useMemo(
    () => paginate(sortBills(queue.rows.filter(makeFilter({ q: search }, {})), 'updated:asc'), page, 25),
    [queue.rows, search, page],
  );
  const onSearch = (v) => {
    setSearch(v);
    setPage(1);
  };

  // At the FM stage, fill each line's tax slab automatically (also when taxes arrive late)
  const prepare = (b) => (b?.stage === 'FM' && taxes.length ? autoSlabs(b, taxes) : b);
  useEffect(() => setSelected((prev) => prepare(prev)), [taxes]);
  const open = (b) => setSelected(prepare(structuredClone(b)));

  const changeSlab = (index, taxId) =>
    setSelected((prev) => ({ ...prev, lineItems: prev.lineItems.map((l, i) => (i === index ? { ...l, tax_id: taxId } : l)) }));

  const decide = async (action, comment) => {
    if (action === 'reject' && !comment.trim()) return showError('Write a reason for rejecting — it goes back to the bill owner.');
    const atFM = selected.stage === 'FM';
    if (action === 'approve' && atFM) {
      const missing = selected.lineItems.findIndex((l) => needsSlab(selected, l) && !l.tax_id);
      if (missing >= 0) {
        return showError(
          `Please select a Zoho Tax Slab for line item ${missing + 1} ("${selected.lineItems[missing].name || 'Item'}") before approving.`,
        );
      }
    }
    setMessage('Processing request…');
    try {
      await decideBill(selected.id, action, { comment, ...(atFM && action === 'approve' ? { lineItems: selected.lineItems } : {}) });
      setSelected(null); // the cached queue reloads by itself
    } catch (e) {
      showError(e);
    } finally {
      setMessage('');
    }
  };

  return (
    <div className="page">
      <PageHeader title={isAdmin ? 'All pending approvals' : `${ROLE_NAME[role]} approvals`} description={description(role)}>
        <RefreshButton onClick={queue.refresh} loading={queue.loading} label="Refresh" />
      </PageHeader>
      <InfoBanner message={message} />

      <div className="review-layout">
        <QueueList
          title={isAdmin ? 'All pending' : 'Waiting on you'}
          page={queue.loaded ? shown : null}
          loading={queue.loading && !queue.loaded}
          search={search}
          onSearch={onSearch}
          onPage={setPage}
          selectedId={selected?.id}
          showApprover={isAdmin}
          onOpen={open}
        />
        {selected ? <BillInspector bill={selected} taxes={taxes} onSlabChange={changeSlab} onDecide={decide} /> : <NoBillSelected />}
      </div>
    </div>
  );
}
