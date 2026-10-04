// Write side: log each extraction, then record what was finally submitted
import { ExtractionLog } from '../../models/index.js';
import { diffFields, fromAi, fromBill, NORM } from './compare.js';

const MAX_OCR_CHARS = 8000; // cap what we store per bill

export async function saveExtraction({ financeOrgId, fileId, ocrText, aiOutput, provider, vendorGstin }) {
  try {
    await ExtractionLog.updateOne(
      { financeOrgId, fileId },
      {
        $set: {
          ocrText: String(ocrText || '').slice(0, MAX_OCR_CHARS),
          aiOutput,
          provider,
          vendorGstin: NORM.gstin(vendorGstin || aiOutput?.gstin),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
  } catch (e) {
    console.error('[learn] saveExtraction', e.message);
  }
}

export async function recordFinal({ financeOrgId, fileId, bill, vendorGstin }) {
  try {
    const log = await ExtractionLog.findOne({ financeOrgId, fileId });
    if (!log) return; // file was swapped without re-extracting: nothing to learn from
    const finalOutput = fromBill(bill, vendorGstin || log.vendorGstin);
    const corrections = diffFields(fromAi(log.aiOutput), finalOutput);
    log.finalOutput = finalOutput;
    log.corrections = corrections;
    log.hasCorrections = Object.keys(corrections).length > 0;
    log.submitted = true;
    log.vendorGstin = NORM.gstin(finalOutput.gstin) || log.vendorGstin; // trust the Zoho contact GSTIN
    await log.save();
  } catch (e) {
    console.error('[learn] recordFinal', e.message);
  }
}
