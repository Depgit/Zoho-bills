// Learning from corrections — no model training.
//   extract: earlier examples go into the AI prompt (fewShot), vendor memory is applied (hints),
//            the AI's raw answer is logged (saveExtraction)
//   submit:  what was finally submitted is compared with the AI's answer (recordFinal)
// Every function catches its own errors, so learning can never break extract or submit.
// All lookups are scoped by financeOrgId — one org's data never reaches another org's prompt.
export { saveExtraction, recordFinal } from './record.js';
export { getVendorHints, applyVendorHints } from './hints.js';
export { getExamples, buildFewShotBlock } from './fewShot.js';
export { ownGstins } from './lookup.js';
export { diffFields, fromAi, fromBill } from './compare.js';
export { jaccard, tokens } from './similarity.js';
