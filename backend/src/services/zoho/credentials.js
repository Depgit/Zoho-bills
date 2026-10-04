// Check Zoho credentials at registration: get a token and confirm the org id.
// Returns the organisation's display name.
import { zohoHttp } from './http.js';

export async function validateZohoCredentials({
  zohoClientId,
  zohoClientSecret,
  zohoRefreshToken,
  zohoOrgId,
  zohoAccountsUrl,
  zohoApiUrl,
}) {
  const accountsUrl = zohoAccountsUrl || 'https://accounts.zoho.in';
  const apiUrl = zohoApiUrl || 'https://www.zohoapis.in';

  const tokenRes = await zohoHttp.post(`${accountsUrl}/oauth/v2/token`, null, {
    params: {
      refresh_token: zohoRefreshToken,
      client_id: zohoClientId,
      client_secret: zohoClientSecret,
      grant_type: 'refresh_token',
    },
  });
  const accessToken = tokenRes.data.access_token;
  if (!accessToken) {
    throw new Error('Could not obtain Zoho access token. Check Client ID, Secret, and Refresh Token.');
  }

  const orgRes = await zohoHttp.get(`${apiUrl}/books/v3/organizations`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  const orgs = orgRes.data?.organizations || [];
  const matched = orgs.find((o) => String(o.organization_id) === String(zohoOrgId));
  if (!matched) {
    const available = orgs.map((o) => o.organization_id).join(', ');
    throw new Error(`Org ID "${zohoOrgId}" not found in this Zoho account. Available: ${available}`);
  }
  return matched.name || matched.organization_name || matched.organization_id;
}
