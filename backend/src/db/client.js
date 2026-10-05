// The PostgreSQL connection pool and the drizzle instance used by every repository
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DATABASE_URL } from '../config/env.js';
import * as schema from './schema/index.js';

// Supabase / hosted Postgres need TLS; local Docker doesn't
const needsSsl = DATABASE_URL && !/@(localhost|127\.0\.0\.1|postgres)[:/]/.test(DATABASE_URL);

export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 10),
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

export const db = drizzle(pool, { schema });

let state = 'disconnected';
pool.on('error', (e) => {
  state = 'error';
  console.error('PostgreSQL pool error:', e.message);
});

export async function connectDb() {
  state = 'connecting';
  await pool.query('select 1');
  state = 'connected';
}

// 'connected' | 'connecting' | 'disconnected' | 'error'
export const dbState = () => state;

export const closeDb = () => pool.end();

// Run `fn(tx)` in one transaction — everything or nothing
export const transaction = (fn) => db.transaction(fn);
