// Copy all data from one PostgreSQL database to another (e.g. local → production), keeping every id.
//
//   TARGET_DATABASE_URL="<prod url>" TARGET_ENCRYPTION_KEY="<prod key>" npm run db:copy -- --dry-run
//   TARGET_DATABASE_URL="<prod url>" TARGET_ENCRYPTION_KEY="<prod key>" npm run db:copy
//
//   Source: DATABASE_URL + ENCRYPTION_KEY from .env (or SOURCE_DATABASE_URL / SOURCE_ENCRYPTION_KEY).
//   Target: TARGET_DATABASE_URL, TARGET_ENCRYPTION_KEY (defaults to the source key).
//
// Copies organisations, users (with reporting lines), bills (lines, allocations, history),
// contacts, vendor accounts, extraction logs and cache. Uploaded FILES are not copied:
// bills arrive without a file (file storage isn't touched).
// Zoho credentials are decrypted with the source key and encrypted again with the target key.
//
// Safety: the target's tables are created/updated first (migrations); then the copy only runs
// when the target holds no organisations, users or bills — or with --wipe-target, which empties
// the target first. Everything is written in ONE transaction: it all lands, or nothing does.
import 'dotenv/config';
import pg from 'pg';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import * as t from '../src/db/schema/index.js';

const DRY = process.argv.includes('--dry-run');
const WIPE = process.argv.includes('--wipe-target');
const SOURCE_URL = process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL;
const TARGET_URL = process.env.TARGET_DATABASE_URL;
const SOURCE_KEY = process.env.SOURCE_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
const TARGET_KEY = process.env.TARGET_ENCRYPTION_KEY || SOURCE_KEY;
const BATCH = 500;

if (!SOURCE_URL || !TARGET_URL) throw new Error('Set TARGET_DATABASE_URL (the source is DATABASE_URL from .env)');
if (SOURCE_URL === TARGET_URL) throw new Error('Source and target are the same database');

// ── encryption (same format as src/security/secrets.js, but with two different keys) ──
const PREFIX = 'enc:v1:';
const keyOf = (raw, name) => {
  const buf = /^[0-9a-f]{64}$/i.test(raw || '') ? Buffer.from(raw, 'hex') : Buffer.from(raw || '', 'base64');
  if (buf.length !== 32) throw new Error(`${name} must be 32 bytes (base64 or hex)`);
  return buf;
};
const sourceKey = keyOf(SOURCE_KEY, 'Source ENCRYPTION_KEY');
const targetKey = keyOf(TARGET_KEY, 'TARGET_ENCRYPTION_KEY');
function decrypt(value) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value; // plain text
  const [iv, tag, data] = value.slice(PREFIX.length).split(':').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', sourceKey, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}
function encrypt(plain) {
  if (plain == null || plain === '') return plain;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', targetKey, iv);
  const data = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return PREFIX + [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join(':');
}
const SECRET_FIELDS = ['zohoClientId', 'zohoClientSecret', 'zohoRefreshToken'];

// ── connections ─────────────────────────────────────────────────────────────
const local = (url) => /@(localhost|127\.0\.0\.1|postgres)[:/]/.test(url);
const connect = (url) => {
  const pool = new pg.Pool({ connectionString: url, max: 2, ...(local(url) ? {} : { ssl: { rejectUnauthorized: false } }) });
  return { pool, db: drizzle(pool, { schema: t }) };
};
const host = (url) => url.replace(/\/\/[^@]*@/, '//***@');
const source = connect(SOURCE_URL);
const target = connect(TARGET_URL);
console.log(`Copy ${host(SOURCE_URL)}  →  ${host(TARGET_URL)}${DRY ? '   (dry run — nothing is written)' : ''}`);

// Tables in the order they must be filled (parents before children). Files are left out.
const TABLES = [
  ['organisations', t.financeOrgs],
  ['users', t.users],
  ['bills', t.bills],
  ['bill line items', t.billLineItems],
  ['bill allocations', t.billAllocations],
  ['bill history', t.billHistory],
  ['contacts', t.contacts],
  ['vendor accounts', t.vendorAccountMaps],
  ['extraction logs', t.extractionLogs],
  ['extraction cache', t.extractionCache],
];
const count = async (db, table) => (await db.select({ n: sql`count(*)::int` }).from(table))[0].n;

try {
  // 1. Read everything from the source
  const data = {};
  for (const [name, table] of TABLES) data[name] = await source.db.select().from(table);

  // Shape rows for the target: credentials re-encrypted, no files, managers set in a second pass
  data.organisations = data.organisations.map((o) => ({ ...o, ...Object.fromEntries(SECRET_FIELDS.map((f) => [f, encrypt(decrypt(o[f]))])) }));
  const managers = data.users.filter((u) => u.managerId).map((u) => [u.id, u.managerId]);
  data.users = data.users.map((u) => ({ ...u, managerId: null }));
  const billsWithFile = data.bills.filter((b) => b.fileId).length;
  data.bills = data.bills.map((b) => ({ ...b, fileId: null }));

  // 2. Target: create / update its tables, then make sure it's safe to write
  if (!DRY) await migrate(target.db, { migrationsFolder: path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/db/migrations') });
  const existing = {};
  for (const [name, table] of TABLES.slice(0, 3)) existing[name] = await count(target.db, table).catch(() => 0);
  const occupied = Object.values(existing).some((n) => n > 0);
  if (occupied && !WIPE) {
    throw new Error(
      `The target already has data (${Object.entries(existing).map(([k, n]) => `${n} ${k}`).join(', ')}). ` +
        'Re-run with --wipe-target to replace it with the source data.',
    );
  }

  // 3. Copy in one transaction
  if (!DRY) {
    await target.db.transaction(async (tx) => {
      if (WIPE) {
        await tx.execute(sql`truncate finance_orgs, users, files, bills, bill_line_items, bill_allocations, bill_history,
                                       contacts, vendor_account_maps, extraction_logs, extraction_cache cascade`);
      }
      for (const [name, table] of TABLES) {
        const rows = data[name];
        for (let i = 0; i < rows.length; i += BATCH) await tx.insert(table).values(rows.slice(i, i + BATCH));
      }
      for (const [id, managerId] of managers) await tx.update(t.users).set({ managerId }).where(eq(t.users.id, id));
      // bill_history ids are a sequence: continue after the copied ids
      await tx.execute(sql`select setval(pg_get_serial_sequence('bill_history', 'id'), coalesce((select max(id) from bill_history), 0) + 1, false)`);
    });
  }

  // 4. Report
  console.log('\n' + 'what'.padEnd(20) + 'source'.padStart(8) + 'target'.padStart(9));
  for (const [name, table] of TABLES) {
    const after = DRY ? '-' : await count(target.db, table);
    console.log(name.padEnd(20) + String(data[name].length).padStart(8) + String(after).padStart(9));
  }
  console.log(`\nFiles not copied: ${billsWithFile} bill(s) had a file — they arrive without one (owners can upload it again when editing).`);
  if (WIPE && !DRY) console.log('The target was emptied first (--wipe-target).');
  console.log(DRY ? '\nDry run done — nothing written.' : '\nDone. Everyone signs in with the same email and password as before.');
} catch (e) {
  console.error('\nCopy failed — no data was written to the target:', e.message);
  process.exitCode = 1;
} finally {
  await source.pool.end();
  await target.pool.end();
}
