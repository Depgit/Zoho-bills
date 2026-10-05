// The filters in use as removable chips
import { ROLE_NAME } from '../../constants/roles.js';
import { DATE_PRESETS } from '../../utils/dates.js';
import { inr } from '../../utils/format.js';

const STATUS = { DRAFT: 'Drafts', PENDING: 'Pending', REJECTED: 'Rejected', POSTED: 'Posted' };

export function activeChips({ f, update, setDate, setOm, setCm }, { team, properties, accounts }) {
  const nameOf = (id) => team.find((u) => u.id === id)?.name || '…';
  const chips = [];
  const add = (key, label, onRemove) => chips.push({ key, label, onRemove });
  if (f.pendingOnMe) add('onMe', 'Pending on me', () => update({ pendingOnMe: false }));
  if (f.status) add('status', STATUS[f.status], () => update({ status: '', stage: '' }));
  if (f.status === 'PENDING' && f.stage) add('stage', `At ${f.stage}`, () => update({ stage: '' }));
  if (f.q.trim()) add('q', `“${f.q.trim()}”`, () => update({ q: '' }));
  if (f.date !== 'ALL' && f.date !== 'CUSTOM') add('date', DATE_PRESETS.find(([k]) => k === f.date)?.[1], () => setDate('ALL'));
  if (f.date === 'CUSTOM' && (f.from || f.to)) add('range', `${f.from || '…'} → ${f.to || '…'}`, () => setDate('ALL'));
  if (f.om) add('om', `${ROLE_NAME.OM}: ${nameOf(f.om)}`, () => setOm(''));
  if (f.cm) add('cm', `${ROLE_NAME.CM}: ${nameOf(f.cm)}`, () => setCm(''));
  if (f.pmId) add('pm', properties.find((p) => p.key === f.pmId)?.name || 'Property', () => update({ pmId: '' }));
  if (f.accountId) add('acct', `Expense: ${accounts.find((a) => a.account_id === f.accountId)?.account_name || f.accountId}`, () => update({ accountId: '' }));
  if (f.minAmt) add('min', `≥ ${inr(f.minAmt)}`, () => update({ minAmt: '' }));
  if (f.maxAmt) add('max', `≤ ${inr(f.maxAmt)}`, () => update({ maxAmt: '' }));
  if (f.zohoError) add('zoho', 'Zoho error', () => update({ zohoError: false }));
  return chips;
}
