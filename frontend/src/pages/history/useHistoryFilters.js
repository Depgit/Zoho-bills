import { useMemo, useState } from 'react';
import { presetRange } from '../../utils/dates.js';
import { propertyOf, propertyShares } from '../../utils/properties.js';

const billDate = (b) => b.date || (b.createdAt ? b.createdAt.slice(0, 10) : '');

const SORTS = {
  'date-desc': (a, b) => billDate(b).localeCompare(billDate(a)),
  'date-asc': (a, b) => billDate(a).localeCompare(billDate(b)),
};

// Status / date / property / search filters and sorting for the history table
export function useHistoryFilters(bills, { amountOf, searchProperties }) {
  const [status, setStatus] = useState('ALL'); // ALL | DRAFT | POSTED | PENDING | REJECTED
  const [search, setSearch] = useState('');
  const [property, setProperty] = useState('ALL');
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
  const reset = () => {
    setSearch('');
    setProperty('ALL');
    setStatus('ALL');
    setDatePreset('ALL');
  };

  const matchesSearch = (b, q) =>
    [b.billNumber, b.vendorName, b.history?.at(-1)?.comment].some((v) => (v || '').toLowerCase().includes(q)) ||
    (searchProperties && [propertyOf(b), ...propertyShares(b)].some((p) => `${p.name} ${p.pm} ${p.state}`.toLowerCase().includes(q)));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sort = SORTS[sortBy] || (sortBy === 'amount-desc' ? (a, b) => amountOf(b) - amountOf(a) : (a, b) => amountOf(a) - amountOf(b));
    return bills
      .filter((b) => {
        if (property !== 'ALL' && !propertyShares(b).some((p) => p.key === property)) return false;
        if (status !== 'ALL' && b.status !== status) return false;
        const d = billDate(b);
        if (range.start && d && d < range.start) return false;
        if (range.end && d && d > range.end) return false;
        return !q || matchesSearch(b, q);
      })
      .sort(sort);
  }, [bills, status, range, search, sortBy, property]);

  const active = Boolean(search || status !== 'ALL' || datePreset !== 'ALL' || range.start || range.end || property !== 'ALL');

  return {
    filtered,
    active,
    reset,
    status,
    setStatus,
    search,
    setSearch,
    property,
    setProperty,
    sortBy,
    setSortBy,
    datePreset,
    setDatePreset,
    range,
    setDate,
  };
}
