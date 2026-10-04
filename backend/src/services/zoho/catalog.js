// Reference data from Zoho: expense accounts, tax slabs, locations
import { gstinState, stateCode } from '../gst.service.js';
import { zohoRequest } from './request.js';

export async function accounts(org) {
  const res = await zohoRequest(org, 'get', '/chartofaccounts', {
    params: { filter_by: 'AccountType.Expense', per_page: 200 },
  });
  return res.chartofaccounts.map((a) => ({ account_id: a.account_id, account_name: a.account_name }));
}

export async function taxes(org) {
  const res = await zohoRequest(org, 'get', '/settings/taxes', { params: { per_page: 200 } });
  return res.taxes.map((t) => ({
    tax_id: t.tax_id,
    tax_name: t.tax_name,
    tax_percentage: t.tax_percentage,
    tax_specific_type: t.tax_specific_type || '',
  }));
}

// state_code ('HR') decides GST vs IGST for bills from this location:
// address.state_code, else the location's GSTIN (tax_reg_no) state digits, else the state name
export async function locations(org) {
  const res = await zohoRequest(org, 'get', '/locations');
  return res.locations
    .filter((l) => l.is_location_active !== false)
    .map((l) => ({
      location_id: l.location_id,
      location_name: l.location_name,
      state_code:
        stateCode(l.address?.state_code) || gstinState(l.tax_reg_no)?.code || stateCode(l.address?.state) || '',
    }));
}
