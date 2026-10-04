import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { showError } from '../../api/errors.js';
import InfoBanner from '../../components/common/InfoBanner.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import { MANAGER_ROLE, ROLE_NAME } from '../../constants/roles.js';
import { isEditable } from '../../utils/billStatus.js';
import { currentUser } from '../../utils/session.js';
import { matchVendor } from '../../utils/vendorMatch.js';
import { extractedLines, extractionMessage, formFromBill, formFromExtraction } from './billForm.js';
import { useBillFormData } from './useBillFormData.js';
import { validateBillForm } from './validateBillForm.js';
import UploadCard from './UploadCard.jsx';
import BillEditor from './BillEditor.jsx';
import MyBillsTable from './MyBillsTable.jsx';

// Upload / edit a bill, for every uploading role.
//   PM       → bill belongs to them; goes to their CM
//   CM/OM/FM → must pick the PM(s) it belongs to and split the amount; starts at their own manager.
//              FM uploads post straight to Zoho.
// Everyone picks the bill's location (defaults to their own) and can save a Draft first.
export default function BillFormPage({ role = 'PM', initialEditBill, onClearInitialEdit, onNavigateHistory }) {
  const assigns = role !== 'PM';
  const me = currentUser();
  const data = useBillFormData(assigns);
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [vendorQuery, setVendorQuery] = useState('');
  const [message, setMessage] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const nextStep = role === 'FM' ? 'Zoho Books' : `your ${ROLE_NAME[MANAGER_ROLE[role]]}`;
  const close = () => {
    setForm(null);
    setEditingId(null);
  };

  useEffect(() => {
    if (!initialEditBill) return;
    editBill(initialEditBill);
    onClearInitialEdit?.();
  }, [initialEditBill]);

  // Vendor picked (by hand or auto-matched) → apply its remembered expense account
  const selectVendor = (vendorId) =>
    setForm((prev) => ({ ...prev, vendorId, lineItems: data.applyVendorAccount(vendorId, prev.lineItems) }));

  const changeGstin = (gstin) => {
    setForm((prev) => ({ ...prev, extracted: { ...prev.extracted, gstin } }));
    const matched = matchVendor(data.contacts, gstin, form.extracted.vendor_name);
    if (matched) {
      setVendorQuery(matched.contact_name);
      selectVendor(matched.contact_id);
    }
  };

  const upload = async (file, pages) => {
    setExtracting(true);
    setMessage('Extracting data from invoice via AI OCR…');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('pages', pages);
    try {
      const { data: res } = await api.post('/bills/extract', fd);
      const extracted = res.extracted || {};
      const contacts = data.contacts.length ? data.contacts : await data.refreshContacts();
      const matched = matchVendor(contacts, extracted.gstin, extracted.vendor_name);
      if (matched) extracted.vendor_name = matched.contact_name;
      // Clear the search box when nothing matched, so garbage OCR text doesn't empty the dropdown
      setVendorQuery(matched?.contact_name || '');
      const vendorId = matched?.contact_id || '';
      const lines = vendorId ? data.applyVendorAccount(vendorId, extractedLines(extracted)) : extractedLines(extracted);
      setForm(formFromExtraction(res, file, extracted, vendorId, lines, me.location_id));
      setEditingId(null);
      setMessage(extractionMessage(res, extracted, matched));
    } catch (e) {
      setMessage('');
      showError(e);
    } finally {
      setExtracting(false);
    }
  };

  const editBill = async (b) => {
    if (!isEditable(b)) return showError('This bill is already being approved and can no longer be edited.');
    setMessage('');
    const contacts = data.contacts.length ? data.contacts : await data.refreshContacts();
    setVendorQuery(contacts.find((c) => c.contact_id === b.vendorId)?.contact_name || b.vendorName || '');
    setEditingId(b._id);
    setForm(formFromBill(b, data.taxes, me.location_id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // draft = true → save without submitting (assigned PMs already see their amount as Draft)
  const save = async (draft) => {
    const problem = validateBillForm(form, { assigns, draft });
    if (problem) return showError(problem);
    setSubmitting(true);
    try {
      const vendorName = data.contacts.find((c) => c.contact_id === form.vendorId)?.contact_name;
      const body = { ...form, vendorName, draft };
      const { data: saved } = editingId ? await api.put(`/bills/${editingId}`, body) : await api.post('/bills', body);
      setMessage(
        draft
          ? `✓ Draft saved${assigns ? ' — the assigned Property Managers can already see it' : ''}.`
          : saved.status === 'POSTED'
            ? `✓ Bill #${saved.billNumber} posted to Zoho Books.`
            : `✓ Bill #${saved.billNumber} submitted to ${nextStep} for approval.`,
      );
      close();
      data.loadMyBills();
    } catch (e) {
      showError(e);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteBill = async (b) => {
    if (!window.confirm(`Are you sure you want to delete bill #${b.billNumber}? You will be able to make a fresh new entry.`)) return;
    try {
      await api.delete(`/bills/${b._id}`);
      setMessage(`✓ Bill #${b.billNumber || ''} deleted.`);
      if (editingId === b._id) close();
      data.loadMyBills();
    } catch (e) {
      showError(e);
    }
  };

  const description = editingId
    ? 'Update bill details or fix rejected fields, then save changes to resubmit for approval.'
    : role === 'FM'
      ? 'Upload an invoice, check the AI-extracted fields and assign it to Property Managers. Your uploads post straight to Zoho Books.'
      : `Upload an invoice, check the AI-extracted fields${assigns ? ', assign it to Property Managers' : ''}, then save a draft or submit it to ${nextStep}.`;

  return (
    <div>
      <PageHeader title={editingId ? `Edit Bill #${form?.billNumber || ''}` : 'Upload & Create Invoice'} description={description}>
        {editingId && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              close();
              setMessage('');
            }}
          >
            Cancel Edit / New Bill
          </button>
        )}
        {onNavigateHistory && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onNavigateHistory}>
            📜 View Invoice History →
          </button>
        )}
      </PageHeader>

      <InfoBanner message={message} />
      <UploadCard extracting={extracting} onFile={upload} />

      {form && (
        <BillEditor
          role={role}
          form={form}
          setForm={setForm}
          data={data}
          vendor={{ query: vendorQuery, setQuery: setVendorQuery, select: selectVendor, changeGstin }}
          myLocationId={me.location_id}
          submitting={submitting}
          onSave={save}
          onCancel={() => setForm(null)}
        />
      )}

      <MyBillsTable bills={data.myBills} onEdit={editBill} onDelete={deleteBill} onNavigateHistory={onNavigateHistory} />
    </div>
  );
}
