// Tell the learning module what was finally submitted — never blocks the response
import * as learn from '../learning/index.js';
import { vendorGstinOf } from '../vendors/index.js';

export const learnFromSubmit = (bill) =>
  vendorGstinOf(bill.financeOrgId, bill)
    .then((vendorGstin) => learn.recordFinal({ financeOrgId: bill.financeOrgId, fileId: String(bill.pdfFile), bill, vendorGstin }))
    .catch((e) => console.error('[learn] final', e.message));
