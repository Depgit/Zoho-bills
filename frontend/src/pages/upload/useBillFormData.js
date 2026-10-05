import { useCallback, useEffect, useMemo, useState } from 'react';
import * as billsApi from '../../api/bills.js';
import { showError } from '../../api/errors.js';
import * as zoho from '../../api/zoho.js';
import { useApiList } from '../../hooks/useApiList.js';
import { useBills } from '../../hooks/useBills.js';
import { paginate } from '../../utils/billQuery.js';

// Everything the bill form needs from the API
export function useBillFormData(assigns) {
  const [accounts] = useApiList(zoho.accounts);
  const [taxes] = useApiList(zoho.taxes);
  const [locations] = useApiList(zoho.locations);
  const [assignablePms] = useApiList(billsApi.assignablePms, { enabled: assigns });
  const [contacts, setContacts] = useState([]);
  const [vendorAccounts, setVendorAccounts] = useState({}); // vendor → remembered expense account

  // The bills I own, newest first, a page at a time
  const [myPage, setMyPage] = useState(1);
  const mine = useBills('mine'); // cached; newest first already
  const myBills = useMemo(() => (mine.loaded ? paginate(mine.rows, myPage, 10) : null), [mine.rows, mine.loaded, myPage]);

  // Reload vendor contacts (returns the list; errors → popup)
  const refreshContacts = useCallback(async () => {
    try {
      const list = await zoho.contacts({ force: true });
      setContacts(list);
      return list;
    } catch (e) {
      showError(e);
      return [];
    }
  }, []);

  useEffect(() => {
    zoho.contacts().then(setContacts).catch(() => {});
    billsApi
      .vendorAccounts()
      .then((map) => setVendorAccounts(map || {}))
      .catch(() => {});
  }, []);

  // Remember the expense account picked for a vendor
  const rememberVendorAccount = (vendorId, accountId) => {
    if (!vendorId || !accountId) return;
    setVendorAccounts((prev) => ({ ...prev, [vendorId]: accountId }));
    billsApi.rememberVendorAccount(vendorId, accountId).catch(() => {});
  };

  // Give lines without an account the vendor's remembered one
  const applyVendorAccount = (vendorId, lines) => {
    const remembered = vendorAccounts[vendorId];
    return remembered ? lines.map((l) => ({ ...l, account_id: l.account_id || remembered })) : lines;
  };

  return {
    accounts,
    taxes,
    locations,
    assignablePms,
    contacts,
    vendorAccounts,
    myBills,
    myBillsLoading: mine.loading && !mine.loaded,
    setMyPage,
    refreshContacts,
    rememberVendorAccount,
    applyVendorAccount,
  };
}
