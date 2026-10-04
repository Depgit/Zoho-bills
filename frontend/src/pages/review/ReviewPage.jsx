import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { showError } from '../../api/errors.js';
import InfoBanner from '../../components/common/InfoBanner.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import RefreshButton from '../../components/common/RefreshButton.jsx';
import { ROLE_NAME } from '../../constants/roles.js';
import { useApiList } from '../../hooks/useApiList.js';
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
  const [bills, setBills] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [taxes] = useApiList('/zoho/taxes', { quiet: true });

  const load = () => {
    setLoading(true);
    api
      .get('/bills')
      .then((r) => setBills(r.data))
      .catch(showError)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

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
      await api.post(`/bills/${selected._id}/${action}`, { comment, ...(atFM && action === 'approve' ? { lineItems: selected.lineItems } : {}) });
      setSelected(null);
      load();
    } catch (e) {
      showError(e);
    } finally {
      setMessage('');
    }
  };

  return (
    <div>
      <PageHeader title={isAdmin ? 'All Pending Approvals' : `${ROLE_NAME[role]} Approvals`} description={description(role)}>
        <RefreshButton onClick={load} loading={loading} label="Refresh Queue" />
      </PageHeader>
      <InfoBanner message={message} style={{ marginBottom: '1.25rem' }} />

      <div className="review-layout">
        <QueueList
          title={isAdmin ? 'All Pending Bills' : `Waiting on you (${role})`}
          bills={bills}
          selectedId={selected?._id}
          showApprover={isAdmin}
          onOpen={open}
        />
        {selected ? <BillInspector bill={selected} taxes={taxes} onSlabChange={changeSlab} onDecide={decide} /> : <NoBillSelected />}
      </div>
    </div>
  );
}
