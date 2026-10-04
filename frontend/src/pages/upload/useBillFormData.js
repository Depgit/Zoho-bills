import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { showError } from '../../api/errors.js';
import { useApiList } from '../../hooks/useApiList.js';

// Everything the bill form needs from the API
export function useBillFormData(assigns) {
  const [accounts] = useApiList('/zoho/accounts');
  const [taxes] = useApiList('/zoho/taxes');
  const [locations] = useApiList('/zoho/locations');
  const [assignablePms] = useApiList('/bills/assignable-pms', { enabled: assigns });
  const [contacts, setContacts] = useState([]);
  const [vendorAccounts, setVendorAccounts] = useState({}); // vendor → remembered expense account
  const [myBills, setMyBills] = useState([]);

  const loadMyBills = () =>
    api
      .get('/bills', { params: { scope: 'mine' } })
      .then((r) => setMyBills(r.data))
      .catch(showError);

  // Reload vendor contacts (returns the list; errors → popup)
  const refreshContacts = async () => {
    try {
      const r = await api.get('/zoho/contacts');
      setContacts(r.data);
      return r.data;
    } catch (e) {
      showError(e);
      return [];
    }
  };

  useEffect(() => {
    api
      .get('/zoho/contacts')
      .then((r) => setContacts(r.data))
      .catch(() => {});
    api
      .get('/bills/vendor-account-map')
      .then((r) => setVendorAccounts(r.data || {}))
      .catch(() => {});
    loadMyBills();
  }, []);

  // Remember the expense account picked for a vendor
  const rememberVendorAccount = (vendorId, accountId) => {
    if (!vendorId || !accountId) return;
    setVendorAccounts((prev) => ({ ...prev, [vendorId]: accountId }));
    api.post('/bills/vendor-account-map', { vendorId, account_id: accountId }).catch(() => {});
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
    loadMyBills,
    refreshContacts,
    rememberVendorAccount,
    applyVendorAccount,
  };
}
