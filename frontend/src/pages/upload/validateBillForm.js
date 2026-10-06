import { billTotals } from '../../utils/billMath.js';
import { inr } from '../../utils/format.js';
import { remainingToAllocate } from './PmAllocationsEditor.jsx';

// Client-side checks before saving; returns an error message or ''.
// Drafts only need a location (and valid PM rows for managers).
export function validateBillForm(form, { assigns, draft }) {
  if (!form.location_id) return 'Select the location this bill is for.';
  if (assigns && (!form.allocations?.length || form.allocations.some((a) => !a.pmId || !(Number(a.amount) > 0)))) {
    return 'Choose the Property Manager(s) this bill belongs to, with an amount above 0 for each.';
  }
  if (draft) return '';
  if (!form.vendorId || !form.billNumber || !form.date) return 'Please fill in Vendor, Bill Number and Date.';
  const badRate = form.lineItems.findIndex((l) => !(Number(l.rate) > 0));
  if (badRate >= 0) return `Line item ${badRate + 1}: Rate (₹) must be greater than 0.`;
  if (billTotals(form).total < 0) return 'The discounts are larger than the bill — check the discount rows.';
  if (assigns) {
    const { total } = billTotals(form);
    const remaining = remainingToAllocate(form.allocations, total);
    if (Math.abs(remaining) > 1) {
      return `The assigned amounts must add up to the bill total (${inr(total)}). ${remaining > 0 ? 'Still to assign' : 'Over by'}: ${inr(Math.abs(remaining))}.`;
    }
  }
  return '';
}
