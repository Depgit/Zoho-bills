// Vendor GSTIN: type one, or click one of the GSTINs found in the document
const chipStyle = (selected) => ({
  fontSize: '0.75rem',
  padding: '0.2rem 0.5rem',
  background: selected ? 'var(--primary)' : 'var(--color-surface-subtle)',
  color: selected ? '#fff' : 'var(--text-main)',
  border: '1px solid var(--color-border)',
  borderRadius: '4px',
  cursor: 'pointer',
});

export default function GstinField({ gstin, found = [], onChange }) {
  return (
    <div className="form-field">
      <label className="form-label">GSTIN Search & Match</label>
      <input
        className="form-control"
        placeholder="Type or select GSTIN..."
        value={gstin || ''}
        onChange={(e) => onChange(e.target.value.toUpperCase().replace(/\s/g, ''))}
      />
      {found.length > 0 && (
        <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {found.map((g) => (
            <button key={g} type="button" style={chipStyle(gstin === g)} onClick={() => onChange(g)}>
              {g}
            </button>
          ))}
        </div>
      )}
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
        {found.length > 1
          ? `Found ${found.length} GSTINs in document. Click one above or type manually.`
          : 'Enter GSTIN to auto-match vendor.'}
      </p>
    </div>
  );
}
