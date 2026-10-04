import 'dotenv/config';
import tls from 'tls';
import { constants as cryptoConstants } from 'crypto';

// ── Global TLS compatibility patch ───────────────────────────────────────────
// Fixes: MongoNetworkError: SSL alert number 80 (tlsv1 alert internal error)
// on Render / Node 18+ with OpenSSL 3.x strict defaults.
// This relaxes cipher security level for ALL outbound TLS (MongoDB + Zoho).
tls.DEFAULT_CIPHERS = 'DEFAULT:@SECLEVEL=0';
tls.DEFAULT_MIN_VERSION = 'TLSv1.2';
// Allow legacy TLS renegotiation (needed by some Mongo/Zoho endpoints)
try {
  // secureOptions is not directly settable on the tls module, but we can
  // patch it via the underlying SecureContext defaults where supported.
  const origCreateSecureContext = tls.createSecureContext.bind(tls);
  tls.createSecureContext = (opts = {}) =>
    origCreateSecureContext({
      secureOptions: cryptoConstants.SSL_OP_LEGACY_SERVER_CONNECT,
      ...opts,
    });
} catch { /* non-fatal — patch is best-effort */ }
// ─────────────────────────────────────────────────────────────────────────────

import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import auth from './routes/auth.js';
import zohoRoutes from './routes/zoho.js';
import bills from './routes/bills.js';
import { Bill, FinanceOrg } from './models.js';
import admin from './routes/admin.js';
import { fullSync } from './zoho.js';
import { orphanFiles, deleteFile } from './files.js';
const app = express();
app.use(cors()); app.use(express.json());
// Health check for uptime pings — no auth, no DB query (cheap enough to hit every few seconds).
// 200 when MongoDB is connected, 503 otherwise.
app.get(['/health', '/api/health'], (req, res) => {
  const db = ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';
  res.set('Cache-Control', 'no-store').status(db === 'connected' ? 200 : 503)
    .json({ status: db === 'connected' ? 'ok' : 'degraded', db, uptime: Math.round(process.uptime()), time: new Date().toISOString() });
});
app.use('/api/auth', auth); app.use('/api/admin', admin); app.use('/api/zoho', zohoRoutes); app.use('/api/bills', bills);
// Every error goes back as { error } so the app can show it in a popup
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') err = Object.assign(new Error('That file is too large — the limit is 10 MB'), { status: 400 });
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong on the server: ' + err.message });
});
// remove GridFS files that were never submitted as a bill (older than 1 hour)
setInterval(async () => {
  try {
    for (const id of await orphanFiles(36e5, id => Bill.exists({ pdfFile: id }))) await deleteFile(id);
  } catch (e) { console.error('File cleanup failed:', e.message); }
}, 36e5);
await mongoose.connect(process.env.MONGO_URI);
// Sync Zoho contacts for every registered organisation
const orgs = await FinanceOrg.find({});
if (orgs.length === 0) {
  console.log('No Finance Orgs registered yet — skipping contact sync');
} else {
  console.log(`Syncing Zoho contacts for ${orgs.length} Finance Org(s)...`);
  await Promise.all(orgs.map(org =>
    fullSync(org).catch(e => console.error(`Contacts sync failed for org ${org.zohoOrgId}:`, e.message))
  ));
  console.log('Contacts synced');
}
app.listen(process.env.PORT || 5000, () => console.log('API up'));
