import SearchSelect from '../../components/common/SearchSelect.jsx';

// Location the bill is for — preselected from the profile; its state decides GST vs IGST
export default function LocationField({ value, locations, myLocationId, onChange }) {
  const state = locations.find((l) => l.location_id === value)?.state_code;
  return (
    <div className="form-field" style={{ marginTop: '1.25rem', maxWidth: 420 }}>
      <label className="form-label">Location *</label>
      <SearchSelect value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Select Location —</option>
        {locations.map((l) => (
          <option key={l.location_id} value={l.location_id}>
            {l.location_name}
            {l.state_code ? ` (${l.state_code})` : ''}
            {l.location_id === myLocationId ? ' · my location' : ''}
          </option>
        ))}
      </SearchSelect>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
        State {state || '—'} is used to pick GST (same state as vendor) or IGST.
      </p>
    </div>
  );
}
