import Icon from '../../components/common/Icon.jsx';
import { billTotals } from '../../utils/billMath.js';
import { taxRateOptions } from './billForm.js';
import ExtractedSummary from './ExtractedSummary.jsx';
import VendorFields from './VendorFields.jsx';
import BillInfoFields from './BillInfoFields.jsx';
import LineItemsEditor from './LineItemsEditor.jsx';
import LocationField from './LocationField.jsx';
import PmAllocationsEditor from './PmAllocationsEditor.jsx';
import TotalsSummary from './TotalsSummary.jsx';
import FormActions from './FormActions.jsx';

// "Verify & Complete Bill Details" card: every field of the bill being created / edited
export default function BillEditor({ role, form, setForm, data, vendor, myLocationId, submitting, onSave, onCancel }) {
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const { subtotal, discount, total } = billTotals(form);

  return (
    <div className="card" style={{ border: '1px solid #c7d2fe', boxShadow: 'var(--shadow-md)' }}>
      <div className="card-header">
        <div className="card-title">
          <Icon name="checkSquare" size={20} style={{ color: 'var(--primary)' }} />
          Verify &amp; Complete Bill Details
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <ExtractedSummary extracted={form.extracted} />

      <VendorFields
        form={form}
        query={vendor.query}
        onQuery={vendor.setQuery}
        contacts={data.contacts}
        vendorAccounts={data.vendorAccounts}
        onGstin={vendor.changeGstin}
        onVendor={vendor.select}
        onRefresh={data.refreshContacts}
      />

      <BillInfoFields form={form} set={set} />

      <LineItemsEditor
        form={form}
        setForm={setForm}
        set={set}
        accounts={data.accounts}
        taxRates={taxRateOptions(data.taxes, form.extracted)}
        discount={discount}
        onAccountPicked={(accountId) => data.rememberVendorAccount(form.vendorId, accountId)}
      />

      <LocationField value={form.location_id} locations={data.locations} myLocationId={myLocationId} onChange={(v) => set('location_id', v)} />

      {role !== 'PM' && <PmAllocationsEditor allocations={form.allocations} pms={data.assignablePms} total={total} setForm={setForm} />}

      <div className="line-items-actions">
        <TotalsSummary subtotal={subtotal} discount={discount} total={total} ocrTotal={form.extracted.total} />
        <FormActions role={role} submitting={submitting} onSave={onSave} />
      </div>
    </div>
  );
}
