// Write side: log each extraction, then record what was finally submitted
import { extractionLogsRepo } from '../../db/index.js';
import { diffFields, fromAi, fromBill, NORM } from './compare.js';

const MAX_OCR_CHARS = 8000; // cap what we store per bill

export async function saveExtraction({ financeOrgId, fileId, ocrText, aiOutput, provider, vendorGstin }) {
  try {
    await extractionLogsRepo.upsertExtraction({
      financeOrgId,
      fileId: String(fileId),
      ocrText: String(ocrText || '').slice(0, MAX_OCR_CHARS),
      aiOutput: aiOutput ?? null,
      provider: provider || '',
      vendorGstin: NORM.gstin(vendorGstin || aiOutput?.gstin),
    });
  } catch (e) {
    console.error('[learn] saveExtraction', e.message);
  }
}

export async function recordFinal({ financeOrgId, fileId, bill, vendorGstin }) {
  try {
    const log = await extractionLogsRepo.findByFile(financeOrgId, fileId);
    if (!log) return; // file was swapped without re-extracting: nothing to learn from
    const finalOutput = fromBill(bill, vendorGstin || log.vendorGstin);
    const corrections = diffFields(fromAi(log.aiOutput || {}), finalOutput);
    await extractionLogsRepo.update(log.id, {
      finalOutput,
      corrections,
      hasCorrections: Object.keys(corrections).length > 0,
      submitted: true,
      vendorGstin: NORM.gstin(finalOutput.gstin) || log.vendorGstin, // trust the Zoho contact GSTIN
    });
  } catch (e) {
    console.error('[learn] recordFinal', e.message);
  }
}
