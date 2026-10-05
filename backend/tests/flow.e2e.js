// End-to-end flow test against the real app and a throwaway Postgres database.
//   npm run test:e2e   (needs `docker compose up -d`; uses database zoho_bills_test, wiped each run)
// Zoho calls point at a closed port, so anything that reaches Zoho fails — those are expected errors.
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://zoho:zoho@127.0.0.1:5433/zoho_bills_test';
process.env.ENCRYPTION_KEY ||= 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
process.env.JWT_SECRET = 'test';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'zb-files-'));

const { pool, closeDb, connectDb } = await import('../src/db/client.js');
const { runMigrations, usersRepo, orgsRepo } = await import('../src/db/index.js');
const { createApp } = await import('../src/http/app.js');
const { saveFile, fileExists } = await import('../src/services/files.service.js');
const { removeStaleRejectedFiles } = await import('../src/services/bills/fileRetention.js');
const { signToken } = await import('../src/security/tokens.js');
const { hashPassword } = await import('../src/security/passwords.js');

await connectDb();
await runMigrations();
await pool.query(`truncate finance_orgs, users, files, bills, contacts, extraction_logs, extraction_cache cascade`);
const PORT = 5091;
const srv = createApp().listen(PORT);

// ── fixtures ────────────────────────────────────────────────────────────────
const { org, admin: ADMIN } = await orgsRepo.createWithAdmin(
  { zohoClientId: 'x', zohoClientSecret: 'x', zohoRefreshToken: 'x', zohoOrgId: 'x', zohoApiUrl: 'http://127.0.0.1:9', zohoAccountsUrl: 'http://127.0.0.1:9' },
  { name: 'Admin', email: 'admin@test.local', passwordHash: await hashPassword('test1234') },
);
const loc = { location_id: 'L1', location_name: 'Delhi', source_of_supply: 'DL', financeOrgId: org.id };
// Every test user can sign in with TEST_PASSWORD (handy for trying the API with curl after a run)
const TEST_PASSWORD = 'test1234';
const testHash = await hashPassword(TEST_PASSWORD);
const mk = (name, role, managerId = null, extra = {}) =>
  usersRepo.create({ name, email: `${name.toLowerCase()}@test.local`, passwordHash: testHash, role, managerId, ...loc, ...extra });
const FM1 = await mk('FM1', 'FM');
const FM2 = await mk('FM2', 'FM');
const OM1 = await mk('OM1', 'OM', FM1.id);
const OM2 = await mk('OM2', 'OM', FM1.id);
const CM1 = await mk('CM1', 'CM', OM1.id);
const CM2 = await mk('CM2', 'CM', OM1.id);
const PM1 = await mk('PM1', 'PM', CM1.id, { location_name: 'Saket' });
const PM2 = await mk('PM2', 'PM', CM1.id, { location_name: 'Dwarka' });
const PM3 = await mk('PM3', 'PM', CM2.id, { location_name: 'Noida' });

const tok = (u) => 'Bearer ' + signToken({ id: u.id, name: u.name, role: u.role, financeOrgId: org.id });
async function call(u, method, url, body) {
  const r = await fetch(`http://localhost:${PORT}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(u ? { Authorization: tok(u) } : {}) },
    body: body && JSON.stringify(body),
  });
  const j = await r.json().catch(() => null);
  return { st: r.status, j, err: j?.error };
}
const list = async (u, qs = '') => (await call(u, 'GET', `/api/bills${qs}`)).j;

const tmp = path.join(os.tmpdir(), 'zb-test.pdf');
fs.writeFileSync(tmp, '%PDF test');
let n = 0;
const bill = async (extra = {}) => ({
  pdfFile: await saveFile(tmp, 't.pdf', 'application/pdf'),
  vendorId: 'v',
  vendorName: 'Acme Supplies',
  billNumber: `B${++n}`,
  date: '2026-10-01',
  location_id: 'L1',
  lineItems: [{ name: 'x', quantity: 1, rate: 100000, account_id: 'a', tax_percentage: 0 }],
  ...extra,
});
const editable = (b) => ({ ...b, pdfFile: b.pdfFile }); // send a bill back as-is

let fails = 0;
const ok = (label, cond) => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`);
};

// ── Zoho credentials are encrypted at rest ──────────────────────────────────
const raw = (await pool.query('select zoho_client_secret, zoho_refresh_token, zoho_client_id from finance_orgs where id = $1', [org.id])).rows[0];
ok('credentials stored encrypted', Object.values(raw).every((v) => v.startsWith('enc:v1:')));
const back = await orgsRepo.findById(org.id);
ok('credentials read back decrypted', back.zohoClientSecret === 'x' && back.zohoRefreshToken === 'x' && back.zohoClientId === 'x');

// ── approval chain ──────────────────────────────────────────────────────────
ok('health', (await call(null, 'GET', '/health')).j?.status === 'ok' && (await call(null, 'GET', '/api/health')).st === 200);
ok('no token → 401 JSON', (await call(null, 'GET', '/api/bills')).st === 401);
let r = await call(PM1, 'POST', '/api/bills', await bill());
ok('PM submit → pending CM1', r.j.status === 'PENDING' && r.j.stage === 'CM' && r.j.approverId === CM1.id);
ok('PM bill auto-assigned to PM1', r.j.allocations.length === 1 && r.j.allocations[0].amount === 100000 && r.j.allocations[0].pm?.name === 'PM1');
ok('bill has people + total', r.j.owner?.name === 'PM1' && r.j.approver?.name === 'CM1' && r.j.total === 100000);
const b1 = r.j.id;
ok('CM2 cannot approve', (await call(CM2, 'POST', `/api/bills/${b1}/approve`, {})).st === 409);
r = await call(CM1, 'POST', `/api/bills/${b1}/approve`, {});
ok('CM1 approve → OM1', r.j.stage === 'OM' && r.j.approverId === OM1.id);
ok('reject needs reason', (await call(OM1, 'POST', `/api/bills/${b1}/reject`, {})).st === 400);
r = await call(OM1, 'POST', `/api/bills/${b1}/reject`, { comment: 'wrong amount' });
ok('OM1 reject', r.j.status === 'REJECTED' && r.j.stage === 'OM' && r.j.history.at(-1).comment === 'wrong amount');
r = await call(PM1, 'PUT', `/api/bills/${b1}`, editable(r.j));
ok('PM resubmit → CM1', r.j.status === 'PENDING' && r.j.stage === 'CM' && r.j.history.at(-1).action === 'RESUBMITTED');
ok('history kept in order', r.j.history.map((h) => h.action).join() === 'SUBMITTED,APPROVED,REJECTED,RESUBMITTED');
await call(CM1, 'POST', `/api/bills/${b1}/approve`, {});
r = await call(OM1, 'POST', `/api/bills/${b1}/approve`, {});
ok('OM1 approve → FM1', r.j.stage === 'FM');
ok('PM cannot edit after approval', (await call(PM1, 'PUT', `/api/bills/${b1}`, { draft: true })).st === 409);
r = await call(FM1, 'POST', `/api/bills/${b1}/approve`, {});
ok('FM approve → Zoho error as JSON, bill unchanged', r.st >= 400 && !!r.err);

// ── CM uploads, allocations, drafts ────────────────────────────────────────
r = await call(CM1, 'POST', '/api/bills', await bill({ draft: true, vendorName: 'Zeta Traders', lineItems: [{ name: 'y', quantity: 1, rate: 400000, account_id: 'a' }], allocations: [{ pmId: PM1.id, amount: 100000 }, { pmId: PM2.id, amount: 200000 }] }));
ok('CM draft with partial split', r.j.status === 'DRAFT' && r.j.allocations.length === 2);
const d = r.j;
ok('PM2 sees draft (own share)', (await list(PM2, '?scope=history')).rows.some((b) => b.id === d.id && b.status === 'DRAFT' && b.amount === 200000));
ok('PM3 does not', !(await list(PM3, '?scope=history')).rows.some((b) => b.id === d.id));
ok('wrong sum blocked', /add up/.test((await call(CM1, 'PUT', `/api/bills/${d.id}`, editable(d))).err || ''));
ok('other CM PM blocked', (await call(CM1, 'PUT', `/api/bills/${d.id}`, { draft: true, allocations: [{ pmId: PM3.id, amount: 1 }] })).st === 400);
r = await call(CM1, 'PUT', `/api/bills/${d.id}`, { ...editable(d), allocations: [{ pmId: PM1.id, amount: 100000 }, { pmId: PM2.id, amount: 300000 }] });
ok('CM submit → OM1', r.j.status === 'PENDING' && r.j.stage === 'OM');
r = await call(OM1, 'POST', '/api/bills', await bill({ allocations: [{ pmId: PM3.id, amount: 100000 }] }));
ok('OM upload → FM1', r.j.stage === 'FM');
ok('assignable OM1 = 3', (await call(OM1, 'GET', '/api/bills/assignable-pms')).j.length === 3);
ok('FM upload → Zoho error as JSON', !!(await call(FM1, 'POST', '/api/bills', await bill({ allocations: [{ pmId: PM1.id, amount: 100000 }] }))).err);
ok('duplicate bill number blocked', (await call(PM1, 'POST', '/api/bills', await bill({ billNumber: 'B1' }))).st === 409);

// ── lists, filters, totals ─────────────────────────────────────────────────
ok('FM1 queue = 2', (await list(FM1)).total === 2);
ok('Admin queue = 3', (await list(ADMIN)).total === 3);
ok('Admin history = 3', (await list(ADMIN, '?scope=history')).total === 3);
ok('bills have taxInfo', 'taxInfo' in (await list(ADMIN)).rows[0]);
let p = await list(ADMIN, '?scope=history&status=PENDING&stage=OM');
ok('filter status+stage', p.total === 1 && p.rows[0].stage === 'OM');
ok('summary ignores status filter', p.summary.byStatus.PENDING.count === 3 && p.summary.pendingByStage.FM === 2);
ok('search vendor', (await list(ADMIN, '?scope=history&q=zeta')).total === 1);
ok('search PM / property', (await list(ADMIN, '?scope=history&q=noida')).total === 1);
ok('search comment', (await list(ADMIN, '?scope=history&q=wrong amount')).total === 1);
ok('filter by property', (await list(ADMIN, `?scope=history&pmId=${PM2.id}`)).total === 1);
ok('filter by CM area', (await list(ADMIN, `?scope=history&managerId=${CM2.id}`)).total === 1);
ok('filter by OM area', (await list(ADMIN, `?scope=history&managerId=${OM1.id}`)).total === 3);
ok('filter amount range', (await list(ADMIN, '?scope=history&minAmt=200000')).total === 1);
ok('filter date range', (await list(ADMIN, '?scope=history&from=2026-10-01&to=2026-10-01')).total === 3 && (await list(ADMIN, '?scope=history&from=2026-11-01')).total === 0);
p = await list(ADMIN, '?scope=history&sort=amount:desc&pageSize=10&page=1');
ok('sort by amount', p.rows[0].amount === 400000);
p = await list(ADMIN, '?scope=history&pageSize=10&page=2');
ok('pagination', p.rows.length === 0 && p.total === 3 && p.page === 2);
p = await list(ADMIN, '?scope=history&all=1');
ok('all=1 returns the whole scope', p.total === 3 && p.rows.length === 3 && p.truncated === false && p.rows.every((b) => 'amount' in b && 'taxInfo' in b));
ok('all=1 for a PM = own share', (await list(PM2, '?scope=history&all=1')).rows.find((b) => b.billNumber === 'B2')?.amount === 300000);
ok('bad date → 400', (await call(ADMIN, 'GET', '/api/bills?scope=history&from=yesterday')).st === 400);
ok('bad id → 404 not 500', (await call(ADMIN, 'GET', '/api/bills/not-a-uuid/pdf')).st === 404);
ok('pending on me (FM1)', (await list(FM1, '?scope=history&pendingOnMe=1')).total === 2 && (await list(FM1, '?scope=history')).summary.pendingOnMe === 2);
ok('pending on me (CM1) = 0', (await list(CM1, '?scope=history&pendingOnMe=1')).total === 0 && (await list(CM1, '?scope=history')).summary.pendingOnMe === 0);
ok('pending on me (Admin) = all pending', (await list(ADMIN, '?scope=history&pendingOnMe=1')).total === 3);
ok('filter by expense account', (await list(ADMIN, '?scope=history&accountId=a')).total === 3 && (await list(ADMIN, '?scope=history&accountId=zz')).total === 0);
let exp = (await call(ADMIN, 'GET', '/api/bills/expenses?scope=history')).j;
ok('expense totals', exp.length === 1 && exp[0].accountId === 'a' && exp[0].amount === 600000 && exp[0].count === 3);
exp = (await call(ADMIN, 'GET', `/api/bills/expenses?scope=history&pmId=${PM2.id}`)).j;
ok('expense totals for one property = its share', exp[0].amount === 300000);
exp = (await call(PM1, 'GET', '/api/bills/expenses?scope=history')).j;
ok('PM expense totals = own shares', exp[0].amount === 200000);
const props = (await call(ADMIN, 'GET', '/api/bills/properties?scope=history')).j;
ok('property totals', props.find((x) => x.key === PM2.id)?.totalAmt === 300000 && props.find((x) => x.key === PM1.id)?.total === 2);
ok('team below OM1', (await call(OM1, 'GET', '/api/bills/team')).j.length === 5);
ok('file streams for visible bill', (await fetch(`http://localhost:${PORT}/api/bills/${b1}/pdf`, { headers: { Authorization: tok(PM1) } })).status === 200);
ok('file hidden from others', (await fetch(`http://localhost:${PORT}/api/bills/${b1}/pdf`, { headers: { Authorization: tok(PM3) } })).status === 404);

// ── rejected bills lose their file after 10 days ─────────────────────────
r = await call(PM3, 'POST', '/api/bills', await bill({ billNumber: 'OLD-REJ' }));
const oldRej = r.j;
await call(CM2, 'POST', `/api/bills/${oldRej.id}/reject`, { comment: 'fix vendor' });
r = await call(PM3, 'POST', '/api/bills', await bill({ billNumber: 'NEW-REJ' }));
const newRej = r.j;
await call(CM2, 'POST', `/api/bills/${newRej.id}/reject`, { comment: 'fix date' });
await pool.query(`update bill_history set at = now() - interval '11 days' where bill_id = $1 and action = 'REJECTED'`, [oldRej.id]);
ok('stale rejected file removed (only the old one)', (await removeStaleRejectedFiles(10)) === 1);
ok('file gone from storage', !(await fileExists(oldRej.pdfFile)) && (await fileExists(newRej.pdfFile)));
r = (await list(PM3, '?scope=mine&status=REJECTED')).rows.find((b) => b.id === oldRej.id);
ok('bill kept, file detached, history says so', r && !r.pdfFile && r.history.at(-1).action === 'FILE_REMOVED');
ok('resubmit without file blocked', /file is missing/.test((await call(PM3, 'PUT', `/api/bills/${oldRej.id}`, { ...r, pdfFile: '' })).err || ''));
r = await call(PM3, 'PUT', `/api/bills/${oldRej.id}`, { ...r, pdfFile: await saveFile(tmp, 'again.pdf', 'application/pdf') });
ok('resubmit with a new file works', r.j.status === 'PENDING' && !!r.j.pdfFile);
ok('second run removes nothing', (await removeStaleRejectedFiles(10)) === 0);
await call(PM3, 'DELETE', `/api/bills/${newRej.id}`);
await call(ADMIN, 'DELETE', `/api/bills/${oldRej.id}`);

// ── admin ──────────────────────────────────────────────────────────────────
ok('cannot delete FM1 with work', (await call(ADMIN, 'DELETE', `/api/admin/users/${FM1.id}`)).st === 409);
ok('cannot transfer FM → OM', (await call(ADMIN, 'POST', `/api/admin/users/${FM1.id}/transfer`, { toUserId: OM2.id })).st === 400);
r = await call(ADMIN, 'POST', `/api/admin/users/${FM1.id}/transfer`, { toUserId: FM2.id });
ok('transfer FM1→FM2', r.j.approvals === 2 && r.j.reports === 2);
const w = (await call(ADMIN, 'GET', '/api/admin/users')).j.find((u) => u.name === 'FM1').workload;
ok('FM1 nothing left', !w.reports && !w.approvals && !w.owned && !w.allocated);
ok('delete FM1', (await call(ADMIN, 'DELETE', `/api/admin/users/${FM1.id}`)).st === 200);
ok('role change blocked', (await call(ADMIN, 'PATCH', `/api/admin/users/${CM1.id}`, { role: 'OM', managerId: FM2.id })).st === 409);
ok('wrong manager role blocked', (await call(ADMIN, 'PATCH', `/api/admin/users/${PM2.id}`, { managerId: OM1.id })).st === 400);
await call(PM2, 'POST', '/api/bills', await bill());
ok('PM2 → CM2 moves bill', (await call(ADMIN, 'PATCH', `/api/admin/users/${PM2.id}`, { managerId: CM2.id })).j.movedBills === 1);
ok('admin create OM', (await call(ADMIN, 'POST', '/api/admin/users', { name: 'OM3', email: 'om3@test.local', password: 'p', role: 'OM', managerId: FM2.id })).st === 200);
ok('email is case-insensitive', (await call(ADMIN, 'POST', '/api/admin/users', { name: 'OM4', email: 'OM3@TEST.LOCAL', password: 'p', role: 'OM', managerId: FM2.id })).st === 409);
ok('PM without CM blocked', (await call(ADMIN, 'POST', '/api/admin/users', { name: 'PMz', email: 'pmz@test.local', password: 'p', role: 'PM' })).st === 400);
ok('no second ADMIN', (await call(ADMIN, 'POST', '/api/admin/users', { name: 'A2', email: 'a2@test.local', password: 'p', role: 'ADMIN' })).st === 400);
ok('non-admin blocked', (await call(FM2, 'GET', '/api/admin/users')).st === 403);
const pend = (await list(ADMIN)).rows.find((b) => b.stage === 'CM');
ok('Admin approves for CM', (await call(ADMIN, 'POST', `/api/bills/${pend.id}/approve`, {})).j.stage === 'OM');
ok('admin delete bill', (await call(ADMIN, 'DELETE', `/api/bills/${pend.id}`)).st === 200);
ok('vendor account map', (await call(PM1, 'POST', '/api/bills/vendor-account-map', { vendorId: 'v', account_id: 'a1' })).st === 200 && (await call(PM1, 'GET', '/api/bills/vendor-account-map')).j.v === 'a1');
ok('login wrong pw → 401 JSON', (await call(null, 'POST', '/api/auth/login', { email: 'admin@test.local', password: 'wrong' })).err === 'Wrong email or password');
r = await call(null, 'POST', '/api/auth/login', { email: 'ADMIN@test.local', password: 'test1234' });
ok('login works', !!r.j?.token && r.j.user.role === 'ADMIN');

console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
srv.close();
await closeDb();
process.exit(fails ? 1 : 0);
