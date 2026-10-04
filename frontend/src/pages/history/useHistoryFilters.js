import { useMemo, useState } from 'react';
import { presetRange } from '../../utils/dates.js';
import { propertyOf, propertyShares } from '../../utils/properties.js';
import { billInArea, buildChain } from '../../utils/team.js';

const billDate = (b) => b.date || (b.createdAt ? b.createdAt.slice(0, 10) : '');

const SORTS = {
  'date-desc': (a, b) => billDate(b).localeCompare(billDate(a)),
  'date-asc': (a, b) => billDate(a).localeCompare(billDate(b)),
};

// Team (OM / CM) / status / date / property / search filters and sorting for the history table
export function useHistoryFilters(bills, { amountOf, searchProperties, team = [] }) {
  const [status, setStatus] = useState('ALL'); // ALL | DRAFT | POSTED | PENDING | REJECTED
  const [search, setSearch] = useState('');
  const [property, setProperty] = useState('ALL');
  const [om, setOmState] = useState('ALL');
  const [cm, setCmState] = useState('ALL');
  const [sortBy, setSortBy] = useState('date-desc');
  const [datePreset, setDatePresetState] = useState('ALL'); // ALL | THIS_MONTH | LAST_30 | THIS_YEAR | CUSTOM
  const [range, setRange] = useState({ start: '', end: '' });

  const setDatePreset = (preset) => {
    setDatePresetState(preset);
    setRange(presetRange(preset));
  };
  const setDate = (key, value) => {
    setRange((r) => ({ ...r, [key]: value }));
    setDatePresetState('CUSTOM');
  };
  // Picking a manager clears the narrower filters below it
  const setOm = (id) => {
    setOmState(id);
    setCmState('ALL');
    setProperty('ALL');
  };
  const setCm = (id) => {
    setCmState(id);
    setProperty('ALL');
  };
  const reset = () => {
    setSearch('');
    setOm('ALL');
    setStatus('ALL');
    setDatePreset('ALL');
  };

  const matchesSearch = (b, q) =>
    [b.billNumber, b.vendorName, b.history?.at(-1)?.comment].some((v) => (v || '').toLowerCase().includes(q)) ||
    (searchProperties && [propertyOf(b), ...propertyShares(b)].some((p) => `${p.name} ${p.pm} ${p.state}`.toLowerCase().includes(q)));

  const chain = useMemo(() => buildChain(team), [team]);
  // Bills in the selected OM / CM's area — KPIs and the property summary use these too
  const teamBills = useMemo(() => {
    const manager = cm !== 'ALL' ? cm : om;
    return manager === 'ALL' ? bills : bills.filter((b) => billInArea(b, manager, chain));
  }, [bills, om, cm, chain]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sort = SORTS[sortBy] || (sortBy === 'amount-desc' ? (a, b) => amountOf(b) - amountOf(a) : (a, b) => amountOf(a) - amountOf(b));
    return teamBills
      .filter((b) => {
        if (property !== 'ALL' && !propertyShares(b).some((p) => p.key === property)) return false;
        if (status !== 'ALL' && b.status !== status) return false;
        const d = billDate(b);
        if (range.start && d && d < range.start) return false;
        if (range.end && d && d > range.end) return false;
        return !q || matchesSearch(b, q);
      })
      .sort(sort);
  }, [teamBills, status, range, search, sortBy, property]);

  const active = Boolean(search || status !== 'ALL' || datePreset !== 'ALL' || range.start || range.end || property !== 'ALL' || om !== 'ALL' || cm !== 'ALL');

  return {
    chain,
    teamBills,
    filtered,
    active,
    reset,
    status,
    setStatus,
    search,
    setSearch,
    property,
    setProperty,
    om,
    setOm,
    cm,
    setCm,
    sortBy,
    setSortBy,
    datePreset,
    setDatePreset,
    range,
    setDate,
  };
}
