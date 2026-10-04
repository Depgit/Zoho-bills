// Full checks before a bill enters the approval chain (drafts skip these)
import { Bill } from '../../models/index.js';
import { httpError } from '../../utils/httpError.js';
import { fileExists } from '../files.service.js';

export async function checkSubmittable(b) {
  if (!(await fileExists(b.pdfFile))) throw httpError(400, 'The bill file is missing — please upload it again');
  if (!b.vendorId || !b.billNumber || !b.date) throw httpError(400, 'Fill in vendor, bill number and date');
  const badLine = (l) => !l.account_id || !(l.rate > 0) || !(l.quantity > 0);
  if (!b.lineItems?.length || b.lineItems.some(badLine)) {
    throw httpError(400, 'Every line needs an account, a rate above 0 and a quantity above 0');
  }
  const duplicate = await Bill.exists({
    _id: { $ne: b._id },
    financeOrgId: b.financeOrgId,
    vendorId: b.vendorId,
    billNumber: b.billNumber,
    status: { $in: ['PENDING', 'POSTED'] },
  });
  if (duplicate) throw httpError(409, `Bill number ${b.billNumber} already exists for this vendor`);
}
