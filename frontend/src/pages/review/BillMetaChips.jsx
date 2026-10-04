// Small "label: value" chips: dates, OCR total, location, state
function Chip({ label, children, valueStyle }) {
  return (
    <div className="detail-chip">
      <span className="detail-chip-label">{label}</span>
      <span className="detail-chip-val" style={valueStyle}>
        {children}
      </span>
    </div>
  );
}

export default function BillMetaChips({ bill: b }) {
  return (
    <div className="detail-chips-row">
      <Chip label="Bill Date:">{b.date || '—'}</Chip>
      <Chip label="Due Date:">{b.dueDate || '—'}</Chip>
      <Chip label="Extracted Total:" valueStyle={{ color: 'var(--primary)' }}>
        {b.extracted?.total || 'N/A'}
      </Chip>
      {b.location_id && <Chip label="Location:">{b.location_name || b.location_id}</Chip>}
      {b.source_of_supply && (
        <Chip label="Source of Supply:" valueStyle={{ fontWeight: 600 }}>
          {b.source_of_supply}
        </Chip>
      )}
    </div>
  );
}
