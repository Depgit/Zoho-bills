// One-off copy of everything in MongoDB into PostgreSQL + file storage.
//
//   node scripts/migrate-mongo-to-pg.js --dry-run     read + check only, write nothing
//   node scripts/migrate-mongo-to-pg.js               copy (safe to run again — rows are upserted)
//   --adopt-orphans   bills whose organisation no longer exists move into the one remaining organisation
//                     (default: they're skipped and listed — the app can't show them today either)
//
// Reads MONGO_URI (MongoDB is only read, never changed) and writes DATABASE_URL + STORAGE_DRIVER.
// Every Mongo ObjectId becomes a fixed UUID (same id on every run), so references stay intact.
// Bills from the old two-level flow are mapped: PENDING_FINANCE → PENDING at FM, REJECTED_L1 → REJECTED at CM.
import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import { eq, sql } from 'drizzle-orm';
import { GridFSBucket, MongoClient } from 'mongodb';
import { db, closeDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import * as t from '../src/db/schema/index.js';
import { checkEncryptionKey, encrypt } from '../src/security/secrets.js';
import { putObject, storageDriver } from '../src/storage/index.js';
import { billTotal } from '../src/services/bills/total.js';
import { MANAGER_ROLE } from '../src/services/hierarchy.service.js';

const DRY = process.argv.includes('--dry-run');
const ADOPT = process.argv.includes('--adopt-orphans');
const MONGO_URI = process.env.MONGO_URI;
const STORE_FILE = process.env.EXTRACT_STORE || './data/extract-store.json';
if (!MONGO_URI || !process.env.DATABASE_URL) throw new Error('Set MONGO_URI and DATABASE_URL');
checkEncryptionKey(); // Zoho credentials are stored encrypted

// ObjectId → stable UUID (name-based, v5 layout)
const uid = (oid) => {
  if (!oid) return null;
  const h = crypto.createHash('sha1').update(`zoho-bills:${oid}`).digest('hex');
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (v) => (DAY.test(String(v || '')) ? String(v) : null);
const num = (v, d = 0) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);
const date = (v) => (v ? new Date(v) : new Date());
const warnings = [];
const warn = (msg) => warnings.push(msg);

const mongo = await MongoClient.connect(MONGO_URI);
const mdb = mongo.db();
const all = (name) => mdb.collection(name).find().toArray();
console.log(`MongoDB "${mdb.databaseName}" → PostgreSQL${DRY ? '  (dry run — nothing is written)' : ''}, files → ${storageDriver()}`);

if (!DRY) await runMigrations();

const [orgs, users, bills, contacts, vendorMaps, logs, gridFiles] = await Promise.all([
  all('financeorgs'),
  all('users'),
  all('bills'),
  all('contacts'),
  all('vendoraccountmaps'),
  all('extractionlogs'),
  mdb.collection('billFiles.files').find().toArray(),
]);
const orgIds = new Set(orgs.map((o) => String(o._id)));
const userById = new Map(users.map((u) => [String(u._id), u]));
const userId = (oid) => (oid && userById.has(String(oid)) ? uid(oid) : null);
// Where a record of a deleted organisation goes: nowhere, or (--adopt-orphans) the only organisation left
const adoptInto = ADOPT && orgs.length === 1 ? orgs[0]._id : null;
if (ADOPT && !adoptInto) throw new Error('--adopt-orphans needs exactly one organisation in MongoDB');
const orgOf = (oid) => (oid && orgIds.has(String(oid)) ? oid : adoptInto);
const gridIds = new Set(gridFiles.map((f) => String(f._id)));

// Upsert helper: insert, or overwrite the row with the same key
const upsert = (table, rows, target) =>
  DRY || !rows.length
    ? null
    : db
        .insert(table)
        .values(rows)
        .onConflictDoUpdate({
          target,
          set: Object.fromEntries(Object.keys(rows[0]).map((k) => [k, sql.raw(`excluded."${table[k].name}"`)])),
        });

// ── organisations ───────────────────────────────────────────────────────────
await upsert(
  t.financeOrgs,
  orgs.map((o) => ({
    id: uid(o._id),
    zohoClientId: encrypt(o.zohoClientId),
    zohoClientSecret: encrypt(o.zohoClientSecret),
    zohoRefreshToken: encrypt(o.zohoRefreshToken),
    zohoOrgId: o.zohoOrgId,
    zohoAccountsUrl: o.zohoAccountsUrl || 'https://accounts.zoho.in',
    zohoApiUrl: o.zohoApiUrl || 'https://www.zohoapis.in',
    displayName: o.displayName || null,
    createdAt: date(o.createdAt),
    updatedAt: date(o.updatedAt || o.createdAt),
  })),
  t.financeOrgs.id,
);

// ── users (managers set in a second pass, once everyone exists) ──────────────
const emails = new Set();
const userRows = [];
for (const u of users) {
  const email = String(u.email || '').toLowerCase();
  if (emails.has(email)) {
    warn(`user ${u.email}: duplicate email (case-insensitive) — skipped`);
    continue;
  }
  emails.add(email);
  if (u.financeOrgId && !orgIds.has(String(u.financeOrgId))) warn(`user ${u.email}: organisation missing — kept without one`);
  userRows.push({
    id: uid(u._id),
    financeOrgId: u.financeOrgId && orgIds.has(String(u.financeOrgId)) ? uid(u.financeOrgId) : null,
    name: u.name || u.email,
    email: u.email,
    passwordHash: u.passwordHash || null,
    role: u.role,
    managerId: null,
    locationId: u.location_id || '',
    locationName: u.location_name || '',
    sourceOfSupply: u.source_of_supply || '',
    createdAt: date(u.createdAt || u._id.getTimestamp()),
  });
}
await upsert(t.users, userRows, t.users.id);
if (!DRY) {
  for (const u of users) {
    if (u.managerId && userById.has(String(u.managerId))) {
      await db.update(t.users).set({ managerId: uid(u.managerId) }).where(eq(t.users.id, uid(u._id)));
    }
  }
}

// ── files: only those a bill still uses (the rest would be cleaned up as orphans anyway) ──
const bucket = new GridFSBucket(mdb, { bucketName: 'billFiles' });
const readGrid = (id) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    bucket
      .openDownloadStream(id)
      .on('data', (c) => chunks.push(c))
      .on('error', reject)
      .on('end', () => resolve(Buffer.concat(chunks)));
  });
const usedFiles = new Set(bills.map((b) => b.pdfFile && String(b.pdfFile)).filter((id) => id && gridIds.has(id)));
const missingFiles = bills.filter((b) => b.pdfFile && !gridIds.has(String(b.pdfFile)));
missingFiles.forEach((b) => warn(`bill ${b.billNumber}: its file ${b.pdfFile} is not in GridFS — kept without a file`));
let filesCopied = 0;
for (const f of gridFiles) {
  if (!usedFiles.has(String(f._id))) continue;
  const id = uid(f._id);
  const storageKey = `bills/${id}`;
  if (!DRY) {
    const exists = (await db.select({ id: t.files.id }).from(t.files).where(eq(t.files.id, id))).length > 0;
    if (!exists) {
      const buffer = await readGrid(f._id);
      const mimeType = f.metadata?.contentType || f.contentType || 'application/pdf';
      await putObject(storageKey, buffer, mimeType);
      await db.insert(t.files).values({ id, storageKey, filename: f.filename || '', mimeType, size: buffer.length, createdAt: date(f.uploadDate) });
    }
  }
  filesCopied++;
}

// ── bills (+ line items, allocations, history) ─────────────────────────────
const LEGACY = {
  PENDING_FINANCE: { status: 'PENDING', stage: 'FM' },
  REJECTED_L1: { status: 'REJECTED', stage: 'CM' },
};
let billsCopied = 0;
for (const b of bills) {
  const billOrg = orgOf(b.financeOrgId);
  if (!billOrg) {
    warn(`bill ${b.billNumber}: its organisation was deleted — skipped (use --adopt-orphans to keep it)`);
    continue;
  }
  if (String(billOrg) !== String(b.financeOrgId)) warn(`bill ${b.billNumber}: organisation deleted — moved into the current one`);
  const legacy = LEGACY[b.status];
  const status = legacy?.status || b.status;
  if (!['DRAFT', 'PENDING', 'REJECTED', 'POSTED'].includes(status)) {
    warn(`bill ${b.billNumber}: unknown status ${b.status} — skipped`);
    continue;
  }
  if (legacy) warn(`bill ${b.billNumber}: old status ${b.status} → ${status} at ${legacy.stage}`);
  const ownerOid = b.ownerId || b.createdBy;
  const owner = ownerOid && userById.get(String(ownerOid));
  if (!owner) warn(`bill ${b.billNumber}: owner no longer exists — kept with no owner (Admin can still see / delete it)`);
  const id = uid(b._id);
  const lineItems = (b.lineItems || []).map((l, position) => ({
    billId: id,
    position,
    name: l.name || '',
    description: l.description || '',
    quantity: num(l.quantity, 1),
    rate: num(l.rate),
    accountId: l.account_id || '',
    taxId: l.tax_id || '',
    taxPercentage: num(l.tax_percentage),
  }));
  const allocations = (b.allocations || []).map((a, position) => ({ billId: id, position, pmId: userId(a.pmId), amount: num(a.amount) }));
  const history = (b.history || []).map((h) => ({
    billId: id,
    byName: h.by || '',
    byId: userId(h.byId),
    role: h.role || '',
    action: h.action,
    comment: h.comment || '',
    at: date(h.at),
  }));
  const row = {
    id,
    financeOrgId: uid(billOrg),
    fileId: b.pdfFile && usedFiles.has(String(b.pdfFile)) ? uid(b.pdfFile) : null,
    fileType: b.fileType || 'application/pdf',
    extracted: b.extracted ?? null,
    vendorId: b.vendorId || '',
    vendorName: b.vendorName || '',
    billNumber: b.billNumber || '',
    billDate: day(b.date),
    dueDate: day(b.dueDate),
    discountAmount: num(b.discount_amount),
    discountPercent: num(b.discount_percent),
    locationId: b.location_id || '',
    locationName: b.location_name || '',
    sourceOfSupply: b.source_of_supply || '',
    status,
    stage: status === 'POSTED' || status === 'DRAFT' ? '' : legacy?.stage || b.stage || '',
    firstStage: b.firstStage || (owner ? MANAGER_ROLE[owner.role] || '' : ''),
    approverId: status === 'PENDING' ? userId(b.approverId) : null,
    createdBy: userId(b.createdBy),
    ownerId: userId(ownerOid),
    vendorGstin: b.vendorGstin || '',
    zohoBillId: b.zohoBillId || null,
    zohoError: b.zohoError || null,
    total: billTotal(b),
    createdAt: date(b.createdAt),
    updatedAt: date(b.updatedAt || b.createdAt),
  };
  if (!DRY) {
    await db.transaction(async (tx) => {
      await tx
        .insert(t.bills)
        .values(row)
        .onConflictDoUpdate({ target: t.bills.id, set: row });
      await tx.delete(t.billLineItems).where(eq(t.billLineItems.billId, id));
      await tx.delete(t.billAllocations).where(eq(t.billAllocations.billId, id));
      await tx.delete(t.billHistory).where(eq(t.billHistory.billId, id));
      if (lineItems.length) await tx.insert(t.billLineItems).values(lineItems);
      if (allocations.length) await tx.insert(t.billAllocations).values(allocations);
      if (history.length) await tx.insert(t.billHistory).values(history);
    });
  }
  billsCopied++;
}

// ── contacts, vendor accounts ──────────────────────────────────────────────
const skippedContacts = contacts.filter((c) => !orgIds.has(String(c.financeOrgId))).length;
if (skippedContacts) warn(`${skippedContacts} contacts of a deleted organisation skipped (contacts re-sync from Zoho anyway)`);
const contactRows = contacts
  .filter((c) => orgIds.has(String(c.financeOrgId)) && c.contact_id)
  .map((c) => ({
    financeOrgId: uid(c.financeOrgId),
    contactId: c.contact_id,
    contactName: c.contact_name || '',
    gstNo: c.gst_no || '',
    status: c.status || '',
    lastModifiedTime: c.last_modified_time || '',
    syncedAt: date(c.synced_at),
  }));
for (let i = 0; i < contactRows.length; i += 500) {
  await upsert(t.contacts, contactRows.slice(i, i + 500), [t.contacts.financeOrgId, t.contacts.contactId]);
}
const skippedMaps = vendorMaps.filter((m) => !userById.has(String(m.userId))).length;
if (skippedMaps) warn(`${skippedMaps} vendor-account choices of deleted users skipped`);
const mapRows = vendorMaps
  .filter((m) => userById.has(String(m.userId)) && m.vendorId && m.account_id)
  .map((m) => ({ userId: uid(m.userId), vendorId: m.vendorId, accountId: m.account_id, updatedAt: date(m.updatedAt) }));
await upsert(t.vendorAccountMaps, mapRows, [t.vendorAccountMaps.userId, t.vendorAccountMaps.vendorId]);

// ── learning log (file ids follow the files) + extraction cache ──────────────
const skippedLogs = logs.filter((l) => !orgOf(l.financeOrgId)).length;
if (skippedLogs) warn(`${skippedLogs} extraction logs of a deleted organisation skipped (use --adopt-orphans to keep them for learning)`);
const logRows = logs
  .filter((l) => orgOf(l.financeOrgId))
  .map((l) => ({
    id: uid(l._id),
    financeOrgId: uid(orgOf(l.financeOrgId)),
    fileId: gridIds.has(String(l.fileId)) || /^[0-9a-f]{24}$/.test(String(l.fileId)) ? uid(l.fileId) : String(l.fileId),
    vendorGstin: l.vendorGstin || '',
    provider: l.provider || '',
    ocrText: l.ocrText || '',
    aiOutput: l.aiOutput ?? null,
    finalOutput: l.finalOutput ?? null,
    corrections: l.corrections || {},
    hasCorrections: Boolean(l.hasCorrections),
    submitted: Boolean(l.submitted),
    createdAt: date(l.createdAt),
  }));
await upsert(t.extractionLogs, logRows, t.extractionLogs.id);

let cacheRows = [];
if (fs.existsSync(STORE_FILE)) {
  const store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  const byHash = new Map(Object.entries(store.byHash || {}).map(([hash, data]) => [hash, { hash, invoiceKey: null, data }]));
  for (const [key, { hash, data }] of Object.entries(store.byInvoice || {})) {
    if (byHash.has(hash)) byHash.get(hash).invoiceKey = key;
    else byHash.set(hash, { hash, invoiceKey: key, data });
  }
  cacheRows = [...byHash.values()];
  await upsert(t.extractionCache, cacheRows, t.extractionCache.hash);
}

// ── report ──────────────────────────────────────────────────────────────────
const pgCount = async (table) => (DRY ? '-' : (await db.select({ n: sql`count(*)::int` }).from(table))[0].n);
const report = [
  ['organisations', orgs.length, await pgCount(t.financeOrgs)],
  ['users', users.length, await pgCount(t.users)],
  ['bills', bills.length, await pgCount(t.bills)],
  ['  line items', bills.reduce((s, b) => s + (b.lineItems?.length || 0), 0), await pgCount(t.billLineItems)],
  ['  allocations', bills.reduce((s, b) => s + (b.allocations?.length || 0), 0), await pgCount(t.billAllocations)],
  ['  history entries', bills.reduce((s, b) => s + (b.history?.length || 0), 0), await pgCount(t.billHistory)],
  [`files (GridFS ${gridFiles.length}, used by bills ${usedFiles.size})`, usedFiles.size, await pgCount(t.files)],
  ['contacts', contacts.length, await pgCount(t.contacts)],
  ['vendor accounts', vendorMaps.length, await pgCount(t.vendorAccountMaps)],
  ['extraction logs', logs.length, await pgCount(t.extractionLogs)],
  ['extraction cache', cacheRows.length, await pgCount(t.extractionCache)],
];
console.log('\n' + 'what'.padEnd(46) + 'mongo'.padStart(7) + 'postgres'.padStart(10));
for (const [what, m, p] of report) console.log(what.padEnd(46) + String(m).padStart(7) + String(p).padStart(10));
console.log(`\ncopied: ${billsCopied} bills, ${filesCopied} files`);
if (warnings.length) console.log(`\nnotes (${warnings.length}):\n  ` + warnings.join('\n  '));

await mongo.close();
await closeDb();
