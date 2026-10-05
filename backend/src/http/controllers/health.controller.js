import { dbState } from '../../db/index.js';

// Uptime ping: no auth, no query. 200 when the database is connected, 503 otherwise.
export function health(req, res) {
  const db = dbState();
  res
    .set('Cache-Control', 'no-store')
    .status(db === 'connected' ? 200 : 503)
    .json({ status: db === 'connected' ? 'ok' : 'degraded', db, uptime: Math.round(process.uptime()), time: new Date().toISOString() });
}
