// Learning from corrections + extraction cache, against the test database.
//   npm run test:learning
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://zoho:zoho@127.0.0.1:5433/zoho_bills_test';
process.env.ENCRYPTION_KEY ||= 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

const { pool, closeDb, connectDb } = await import('../src/db/client.js');
const { runMigrations, orgsRepo, extractionLogsRepo } = await import('../src/db/index.js');
const learn = await import('../src/services/learning/index.js');
const { cache } = await import('../src/services/extraction/cache.js');

await connectDb();
await runMigrations();
await pool.query('truncate finance_orgs, extraction_logs, extraction_cache cascade');
const mkOrg = async (zohoOrgId) =>
  (await orgsRepo.createWithAdmin({ zohoClientId: 'x', zohoClientSecret: 'x', zohoRefreshToken: 'x', zohoOrgId }, { name: zohoOrgId, email: `${zohoOrgId}@x` })).org.id;
const org = await mkOrg('o1');
const other = await mkOrg('o2');

let fails = 0;
const ok = (label, cond) => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`);
};

const G = '07ABKCS9857K1ZE';
const OWN = '06AAAAA0000A1Z5';
for (const n of [1, 2, 3]) {
  await learn.saveExtraction({
    financeOrgId: org,
    fileId: `f${n}`,
    ocrText: `AKE ENTERPRISES TAX INVOICE AKE/24-25/11${n} delhi gurgaon items quantity rate amount total`,
    provider: 'gemini',
    vendorGstin: OWN,
    aiOutput: { vendor_name: 'AKE Ent', gstin: OWN, invoice_no: `AKE2425-11${n}`, date: `2026-10-0${n}`, tax_percent: 12, line_items: [{ quantity: 1, rate: 1000 }] },
  });
  await learn.recordFinal({
    financeOrgId: org,
    fileId: `f${n}`,
    vendorGstin: G,
    bill: { vendorName: 'AKE Enterprises', billNumber: `AKE/24-25/11${n}`, date: `2026-10-0${n}`, lineItems: [{ quantity: 1, rate: 1000, tax_percentage: 18 }] },
  });
}
const log = await extractionLogsRepo.findByFile(org, 'f1');
ok('corrections recorded', log.submitted && log.hasCorrections && log.corrections.vendor_name?.to === 'AKE Enterprises' && log.vendorGstin === G);
ok('own GSTIN learned', (await learn.ownGstins(org)).includes(OWN));
const hints = await learn.getVendorHints(org, { gstins: [G], ocrText: 'AKE ENTERPRISES TAX INVOICE delhi gurgaon', aiGstin: OWN });
ok('vendor hints', hints.vendor_name === 'AKE Enterprises' && hints.tax_percent === 18 && hints.gstin === G);
ok('other org learns nothing', Object.keys(await learn.getVendorHints(other, { gstins: [G] })).length === 0);
const ex = await learn.getExamples(org, { gstins: [G] });
ok('few-shot examples', ex.examples.length === 3 && learn.buildFewShotBlock(ex).includes('AKE Enterprises'));

await cache.save('h1', 'G|INV1', { total: 1 });
await cache.save('h2', 'G|INV1', { total: 2 });
ok('cache by hash', (await cache.getByHash('h2')).total === 2);
ok('cache by invoice = first saved', (await cache.getByInvoice('G|INV1')).hash === 'h1');
ok('cache miss', (await cache.getByHash('nope')) === null);

console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
await closeDb();
process.exit(fails ? 1 : 0);
