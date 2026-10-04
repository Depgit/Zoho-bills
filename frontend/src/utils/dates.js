// Date filter presets for the history page → { start, end } as YYYY-MM-DD ('' = open)
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const DATE_PRESETS = [
  ['ALL', 'All Time'],
  ['THIS_MONTH', 'This Month'],
  ['LAST_30', 'Last 30 Days'],
  ['THIS_YEAR', 'This Year'],
];

export function presetRange(preset) {
  const today = new Date();
  if (preset === 'THIS_MONTH') return { start: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), end: ymd(today) };
  if (preset === 'LAST_30') {
    const from = new Date();
    from.setDate(today.getDate() - 30);
    return { start: ymd(from), end: ymd(today) };
  }
  if (preset === 'THIS_YEAR') return { start: ymd(new Date(today.getFullYear(), 0, 1)), end: ymd(today) };
  return { start: '', end: '' };
}
