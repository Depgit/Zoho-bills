import { useEffect, useState } from 'react';
import * as billsApi from '../../api/bills.js';
import { showError } from '../../api/errors.js';
import InfoBanner from '../../components/common/InfoBanner.jsx';
import PageHeader from '../../components/common/PageHeader.jsx';
import { MANAGER_ROLE, ROLE_NAME } from '../../constants/roles.js';
import { isEditable } from '../../utils/billStatus.js';
import { currentUser } from '../../utils/session.js';
import { matchVendor } from '../../utils/vendorMatch.js';
import { extractedLines, extractionMessage, formFromBill, formFromExtraction } from './billForm.js';
import { useBillFormData } from './useBillFormData.js';
import { useBillDocument } from '../../hooks/useBillDocument.js';
import { useFilePreview } from '../../hooks/useFilePreview.js';
import FilePreviewPanel from './FilePreviewPanel.jsx';
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
  // What the user is looking at: the file just picked on this device, else (editing) the bill's stored file
  const [localPreview, showLocalFile, clearLocalFile] = useFilePreview();
  const stored = useBillDocument(editingId && !localPreview && form?.pdfFile ? { id: editingId, fileType: form.fileType } : null);
  const preview = localPreview || (stored.url ? { url: stored.url, type: stored.type } : null);

  const nextStep = role === 'FM' ? 'Zoho Books' : `your ${ROLE_NAME[MANAGER_ROLE[role]]}`;
  const close = () => {
    setForm(null);
    setEditingId(null);
    clearLocalFile();
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

  // Editing a bill: a new file only replaces the attachment — everything already filled in stays
  const replaceFile = async (file, pages) => {
    showLocalFile(file);
    setExtracting(true);
    setMessage('Uploading the new file…');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('pages', pages);
    try {
      const res = await billsApi.extractBill(fd);
      setForm((prev) => ({ ...prev, pdfFile: res.pdfFile, fileType: res.fileType || file.type || 'application/pdf' }));
      setMessage('✓ New file attached — your bill details were kept. Save to keep the change.');
    } catch (e) {
      setMessage('');
      showError(e);
    } finally {
      setExtracting(false);
    }
  };

  const upload = async (file, pages) => {
    if (editingId && form) return replaceFile(file, pages);
    showLocalFile(file);
    setForm(null);
    setExtracting(true);
    setMessage('Extracting data from invoice via AI OCR…');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('pages', pages);
    try {
      const res = await billsApi.extractBill(fd);
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
    clearLocalFile();
    setEditingId(b.id);
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
      const saved = await billsApi.saveBill(editingId, body);
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
      await billsApi.deleteBill(b.id);
      setMessage(`✓ Bill #${b.billNumber || ''} deleted.`);
      if (editingId === b.id) close();
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
    <div className="page">
      <PageHeader title={editingId ? `Edit bill #${form?.billNumber || ''}` : 'Upload a bill'} description={description}>
        {editingId && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              close();
              setMessage('');
            }}
          >
            Cancel edit
          </button>
        )}
        {onNavigateHistory && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onNavigateHistory}>
            Invoice history →
          </button>
        )}
      </PageHeader>

      <InfoBanner message={message} />
      {editingId && form && !form.pdfFile && (
        <div className="notice notice-warning" role="alert">
          The uploaded file of this bill was deleted because it stayed rejected for more than 10 days. Upload the bill file again below before
          resubmitting — the details you see are kept.
        </div>
      )}
      <UploadCard extracting={extracting} onFile={upload} replacing={Boolean(editingId && form)} />

      {(form || (extracting && localPreview)) && (
        <div className="editor-layout">
          <div className="editor-main">
            {form ? (
              <BillEditor
                role={role}
                form={form}
                setForm={setForm}
                data={data}
                vendor={{ query: vendorQuery, setQuery: setVendorQuery, select: selectVendor, changeGstin }}
                myLocationId={me.location_id}
                submitting={submitting}
                onSave={save}
                onCancel={close}
              />
            ) : (
              <div className="card reading">
                <div className="spinner" /> Reading the invoice with AI OCR — check the file on the right meanwhile…
              </div>
            )}
          </div>
          <FilePreviewPanel preview={preview} loading={stored.url === null && Boolean(editingId && form?.pdfFile && !localPreview)} />
        </div>
      )}

      <MyBillsTable page={data.myBills} loading={data.myBillsLoading} onPage={data.setMyPage} onEdit={editBill} onDelete={deleteBill} onNavigateHistory={onNavigateHistory} />
    </div>
  );
}
