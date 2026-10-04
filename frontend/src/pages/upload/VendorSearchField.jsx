// Filter the vendor dropdown by name; Refresh reloads contacts from Zoho
export default function VendorSearchField({ query, onQuery, matches, onRefresh }) {
  return (
    <div className="form-field">
      <label className="form-label">Search Zoho Vendor</label>
      <div className="search-input-group">
        <input className="form-control" placeholder="Filter contacts by name..." value={query} onChange={(e) => onQuery(e.target.value)} />
        <button type="button" className="btn btn-secondary" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      {query && (
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>Showing {matches} matching contacts</p>
      )}
    </div>
  );
}
