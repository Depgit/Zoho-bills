import SearchSelect from '../../components/common/SearchSelect.jsx';
import { sameGstin } from '../../utils/vendorMatch.js';

// Pick the Zoho vendor contact; ✓ marks vendors with a remembered expense account
export default function VendorSelectField({ vendorId, contacts, allContacts, vendorAccounts, extractedGstin, onSelect }) {
  const selected = allContacts.find((c) => c.contact_id === vendorId);
  const byGstin = selected?.gst_no && sameGstin(selected.gst_no, extractedGstin);

  return (
    <div className="form-field">
      <label className="form-label">Select Vendor Contact *</label>
      <SearchSelect value={vendorId} onChange={(e) => onSelect(e.target.value)}>
        <option value="">— Select Zoho Contact —</option>
        {contacts.map((c) => (
          <option key={c.contact_id} value={c.contact_id}>
            {`${c.contact_name}${c.gst_no ? ' · ' + c.gst_no : ''}${vendorAccounts[c.contact_id] ? ' ✓' : ''}`}
          </option>
        ))}
      </SearchSelect>
      {selected && (
        <p style={{ fontSize: '0.75rem', marginTop: '0.3rem', color: byGstin ? 'var(--success, #22c55e)' : 'var(--primary, #6366f1)' }}>
          {byGstin
            ? `✓ Auto-matched by GSTIN: ${selected.contact_name}`
            : `✓ Selected: ${selected.contact_name}${selected.gst_no ? ' (GST: ' + selected.gst_no + ')' : ''}`}
          {vendorAccounts[vendorId] ? ' · Default account applied' : ''}
        </p>
      )}
    </div>
  );
}
