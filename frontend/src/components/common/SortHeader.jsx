// A table header that sorts by `field`; sort is "field:asc|desc"
export default function SortHeader({ field, sort, onSort, children, align }) {
  const [current, dir] = sort.split(':');
  const active = current === field;
  const next = active && dir === 'desc' ? 'asc' : 'desc';
  return (
    <th className={`th-sort ${active ? 'active' : ''}`} style={align ? { textAlign: align } : undefined} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(`${field}:${next}`)}>
        {children}
        <span className="th-sort-icon">{active ? (dir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  );
}
