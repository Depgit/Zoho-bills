// Encrypting secrets stored in the database (Zoho client secret, refresh token, client id).
// AES-256-GCM with ENCRYPTION_KEY from the environment — the key never goes into the database,
// so a database dump / the Supabase table editor only shows "enc:v1:…". Values are decrypted in
// memory just before they're used, so Zoho still receives the real credentials.
//
//   ENCRYPTION_KEY = 32 random bytes as base64 or hex. Make one:  openssl rand -base64 32
//   Keep it safe: without it the stored credentials can't be read (re-register the org).
import crypto from 'crypto';

const PREFIX = 'enc:v1:';

function key() {
  const raw = process.env.ENCRYPTION_KEY || '';
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes (base64 or hex) — create one with: openssl rand -base64 32');
  return buf;
}

// Throws at start-up instead of on the first Zoho call
export const checkEncryptionKey = () => key();

export const isEncrypted = (value) => typeof value === 'string' && value.startsWith(PREFIX);

export function encrypt(plain) {
  if (plain == null || plain === '' || isEncrypted(plain)) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join(':');
}

// Old plain-text values pass through unchanged (they get encrypted by `npm run secrets:encrypt`)
export function decrypt(value) {
  if (!isEncrypted(value)) return value;
  const [iv, tag, data] = value.slice(PREFIX.length).split(':').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
