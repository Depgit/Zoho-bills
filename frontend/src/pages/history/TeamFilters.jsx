import SearchSelect from '../../components/common/SearchSelect.jsx';
import { ROLE_NAME } from '../../constants/roles.js';
import { idOf } from '../../utils/ids.js';
import { membersOf } from '../../utils/team.js';

const select = { fontSize: '0.8125rem', padding: '0.35rem 0.5rem', width: '200px' };
const label = { fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' };

// OM → CM → Property dropdowns; each list only shows people / properties under the one picked before it
export default function TeamFilters({ filters: f, team, properties }) {
  const oms = membersOf(team, 'OM', f.chain);
  const cms = membersOf(team, 'CM', f.chain, f.om !== 'ALL' ? f.om : '');

  const managerSelect = (role, list, value, onChange) =>
    list.length > 0 && (
      <SearchSelect value={value} onChange={(e) => onChange(e.target.value)} style={select}>
        <option value="ALL">All {ROLE_NAME[role]}s</option>
        {list.map((u) => (
          <option key={idOf(u)} value={idOf(u)}>
            {u.name}
          </option>
        ))}
      </SearchSelect>
    );

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '1px solid var(--color-border)' }}>
      <span style={label}>Filter by Team:</span>
      {managerSelect('OM', oms, f.om, f.setOm)}
      {managerSelect('CM', cms, f.cm, f.setCm)}
      <SearchSelect value={f.property} onChange={(e) => f.setProperty(e.target.value)} style={select}>
        <option value="ALL">All Properties</option>
        {properties.map((p) => (
          <option key={p.key} value={p.key}>
            {p.name} {p.pm !== '—' ? `· ${p.pm}` : ''}
          </option>
        ))}
      </SearchSelect>
    </div>
  );
}
