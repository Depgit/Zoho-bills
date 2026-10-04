import Icon from '../../components/common/Icon.jsx';
import SearchSelect from '../../components/common/SearchSelect.jsx';
import { DATE_PRESETS } from '../../utils/dates.js';
import StatusPills from './StatusPills.jsx';
import TeamFilters from './TeamFilters.jsx';

const small = { fontSize: '0.8125rem', padding: '0.35rem 0.5rem' };

// Status pills, search, team (OM / CM / property) filters, date presets / range and sort
export default function HistoryFilters({ filters: f, kpis, properties, team, showTeam }) {
  return (
    <div className="card" style={{ marginBottom: '1.25rem', padding: '1rem 1.25rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <StatusPills value={f.status} onChange={f.setStatus} kpis={kpis} />
        <div style={{ minWidth: '240px', flex: '1 1 240px', maxWidth: '380px' }}>
          <div className="input-with-icon">
            <span className="input-icon">
              <Icon name="search" size={16} />
            </span>
            <input
              className="form-control has-icon"
              placeholder="Search by Bill #, Vendor, or Notes..."
              value={f.search}
              onChange={(e) => f.setSearch(e.target.value)}
              style={{ fontSize: '0.85rem', padding: '0.45rem 0.75rem 0.45rem 2.2rem' }}
            />
          </div>
        </div>
      </div>

      {showTeam && <TeamFilters filters={f} team={team} properties={properties} />}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'center',
          marginTop: '0.85rem',
          paddingTop: '0.85rem',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Filter by Date:</span>
        <div className="date-presets-row">
          {DATE_PRESETS.map(([key, label]) => (
            <button key={key} type="button" className={`date-preset-btn ${f.datePreset === key ? 'active' : ''}`} onClick={() => f.setDatePreset(key)}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto', flexWrap: 'wrap' }}>
          {[
            ['start', 'From:'],
            ['end', 'To:'],
          ].map(([key, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label}</span>
              <input
                type="date"
                className="form-control"
                value={f.range[key]}
                onChange={(e) => f.setDate(key, e.target.value)}
                style={{ ...small, width: '135px' }}
              />
            </div>
          ))}

          <SearchSelect value={f.sortBy} onChange={(e) => f.setSortBy(e.target.value)} style={{ ...small, width: '150px' }}>
            <option value="date-desc">Newest Date First</option>
            <option value="date-asc">Oldest Date First</option>
            <option value="amount-desc">Amount: High → Low</option>
            <option value="amount-asc">Amount: Low → High</option>
          </SearchSelect>

          {f.active && (
            <button
              type="button"
              className="btn btn-outline-danger btn-sm"
              onClick={f.reset}
              title="Clear all filters"
              style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
