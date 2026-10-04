// OAuth access token per org, cached until 2 minutes before expiry
import { zohoHttp } from './http.js';

const cache = {}; // orgId → { token, exp }

export async function getToken(org) {
  const key = String(org._id);
  const cached = cache[key];
  if (cached && Date.now() < cached.exp) return cached.token;
  const r = await zohoHttp.post(`${org.zohoAccountsUrl}/oauth/v2/token`, null, {
    params: {
      refresh_token: org.zohoRefreshToken,
      client_id: org.zohoClientId,
      client_secret: org.zohoClientSecret,
      grant_type: 'refresh_token',
    },
  });
  if (!r.data.access_token) throw new Error('Zoho token error: ' + JSON.stringify(r.data));
  cache[key] = { token: r.data.access_token, exp: Date.now() + (r.data.expires_in - 120) * 1000 };
  return cache[key].token;
}
