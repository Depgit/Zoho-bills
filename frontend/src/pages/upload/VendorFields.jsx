import GstinField from './GstinField.jsx';
import VendorSearchField from './VendorSearchField.jsx';
import VendorSelectField from './VendorSelectField.jsx';

// GSTIN → auto-match, name filter, and the vendor dropdown
export default function VendorFields({ form, query, onQuery, contacts, vendorAccounts, onGstin, onVendor, onRefresh }) {
  const q = query.toLowerCase();
  const filtered = q ? contacts.filter((c) => (c.contact_name || '').toLowerCase().includes(q)) : contacts;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
      <GstinField gstin={form.extracted.gstin} found={form.extracted.gstins} onChange={onGstin} />
      <VendorSearchField query={query} onQuery={onQuery} matches={filtered.length} onRefresh={onRefresh} />
      <VendorSelectField
        vendorId={form.vendorId}
        contacts={filtered}
        allContacts={contacts}
        vendorAccounts={vendorAccounts}
        extractedGstin={form.extracted?.gstin}
        onSelect={onVendor}
      />
    </div>
  );
}
