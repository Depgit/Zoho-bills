// Global TLS compatibility patch.
// Fixes "MongoNetworkError: SSL alert number 80" on Render / Node 18+ with OpenSSL 3.x
// strict defaults. Relaxes the cipher security level for ALL outbound TLS (MongoDB + Zoho).
import tls from 'tls';
import { constants as cryptoConstants } from 'crypto';

export function applyTlsPatch() {
  tls.DEFAULT_CIPHERS = 'DEFAULT:@SECLEVEL=0';
  tls.DEFAULT_MIN_VERSION = 'TLSv1.2';
  // Allow legacy TLS renegotiation (needed by some Mongo/Zoho endpoints)
  try {
    const original = tls.createSecureContext.bind(tls);
    tls.createSecureContext = (opts = {}) =>
      original({ secureOptions: cryptoConstants.SSL_OP_LEGACY_SERVER_CONNECT, ...opts });
  } catch {
    /* best-effort */
  }
}
