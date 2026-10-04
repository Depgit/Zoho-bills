// Read side: find earlier submitted bills like this one.
//   1. by vendor GSTIN — but only GSTINs that aren't our own (see ownGstins)
//   2. by OCR text similarity — for invoices where the vendor GSTIN isn't readable
//      (e.g. a receipt that only prints the buyer's "GST Cust" GSTIN)
import mongoose from 'mongoose';
import { ExtractionLog } from '../../models/index.js';
import { NORM } from './compare.js';
import { jaccard, tokens } from './similarity.js';

export const SIMILAR_MIN = 0.3; // same vendor / layout
export const SAME_DOC_MIN = 0.85; // practically the same document (re-scan / re-upload)
const SCAN_LIMIT = 150; // recent submitted logs compared per extraction

const toOid = (id) => (mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(String(id)) : null);

// GSTINs the AI keeps returning but users keep correcting away from = our own (buyer) GSTINs
export async function ownGstins(financeOrgId, minSeen = 2) {
  const org = toOid(financeOrgId);
  if (!org) return [];
  const rows = await ExtractionLog.aggregate([
    { $match: { financeOrgId: org, submitted: true, 'corrections.gstin.from': { $nin: [null, ''] } } },
    { $group: { _id: '$corrections.gstin.from', n: { $sum: 1 } } },
    { $match: { n: { $gte: minSeen } } },
  ]);
  return rows.map((r) => NORM.gstin(r._id));
}

// Submitted logs related to this invoice, best first, each with a similarity `_score`
export async function candidates(financeOrgId, { gstins = [], ocrText = '' } = {}) {
  if (!toOid(financeOrgId)) return { logs: [], own: [] };
  const own = await ownGstins(financeOrgId);
  const vendorGstins = [...new Set([].concat(gstins).map(NORM.gstin).filter((g) => g && !own.includes(g)))];
  const recent = await ExtractionLog.find({ financeOrgId, submitted: true })
    .sort({ createdAt: -1 })
    .limit(SCAN_LIMIT)
    .lean();
  const mine = tokens(ocrText);
  const logs = recent
    .map((l) => ({
      ...l,
      _score: Math.max(jaccard(mine, tokens(l.ocrText)), vendorGstins.includes(l.vendorGstin) ? SIMILAR_MIN : 0),
    }))
    .filter((l) => l._score >= SIMILAR_MIN)
    .sort((a, b) => b._score - a._score);
  return { logs, own };
}
