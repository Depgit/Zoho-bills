import { useMemo } from 'react';
import { useDebounced } from '../../hooks/useDebounced.js';
import { useUrlState } from '../../hooks/useUrlState.js';
import { presetRange } from '../../utils/dates.js';

export const DEFAULT_FILTERS = {
  status: '', // '' | DRAFT | PENDING | REJECTED | POSTED
  stage: '', // '' | CM | OM | FM (pending at)
  pendingOnMe: false, // only bills waiting on my approval
  q: '',
  date: 'ALL', // ALL | THIS_MONTH | LAST_30 | THIS_YEAR | CUSTOM
  from: '',
  to: '',
  om: '',
  cm: '',
  pmId: '',
  accountId: '', // expense account
  minAmt: '',
  maxAmt: '',
  zohoError: false,
  sort: 'date:desc',
  page: 1,
  pageSize: 25,
};

// History filters: kept in the URL, turned into API params (search waits until typing stops)
export function useHistoryFilters() {
  const [f, set, reset] = useUrlState(DEFAULT_FILTERS);
  const q = useDebounced(f.q.trim());

  // Any filter change goes back to page 1; changing a manager clears the narrower filters below it
  const update = (patch) => set({ page: 1, ...patch });
  const setDate = (date) => update({ date, ...(date === 'CUSTOM' ? {} : (({ start, end }) => ({ from: start, to: end }))(presetRange(date))) });
  const setOm = (om) => update({ om, cm: '', pmId: '' });
  const setCm = (cm) => update({ cm, pmId: '' });

  const params = useMemo(
    () => ({
      status: f.status || undefined,
      stage: f.status === 'PENDING' && f.stage ? f.stage : undefined,
      q: q || undefined,
      from: f.from || undefined,
      to: f.to || undefined,
      managerId: f.cm || f.om || undefined,
      pmId: f.pmId || undefined,
      accountId: f.accountId || undefined,
      pendingOnMe: f.pendingOnMe ? 1 : undefined,
      minAmt: f.minAmt || undefined,
      maxAmt: f.maxAmt || undefined,
      hasZohoError: f.zohoError ? 1 : undefined,
      sort: f.sort,
      page: f.page,
      pageSize: f.pageSize,
    }),
    [f.status, f.stage, f.pendingOnMe, q, f.from, f.to, f.cm, f.om, f.pmId, f.accountId, f.minAmt, f.maxAmt, f.zohoError, f.sort, f.page, f.pageSize],
  );

  const active = Boolean(f.status || f.pendingOnMe || q || f.from || f.to || f.om || f.cm || f.pmId || f.accountId || f.minAmt || f.maxAmt || f.zohoError);
  return { f, set, update, setDate, setOm, setCm, reset, params, active };
}
