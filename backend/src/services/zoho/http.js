// axios instance with a relaxed TLS agent for Zoho
// (fixes ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR / alert 80 on OpenSSL 3)
import axios from 'axios';
import https from 'https';
import { constants } from 'crypto';

const agent = new https.Agent({
  ciphers: 'DEFAULT:@SECLEVEL=0',
  minVersion: 'TLSv1.2',
  secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT, // "unsafe legacy renegotiation disabled"
});

export const zohoHttp = axios.create({ httpsAgent: agent });
