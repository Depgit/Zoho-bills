// One authenticated call to the Zoho Books v3 API for an org
import { zohoHttp } from './http.js';
import { getToken } from './token.js';

export async function zohoRequest(org, method, path, { params, data, headers } = {}) {
  const r = await zohoHttp({
    method,
    url: `${org.zohoApiUrl}/books/v3${path}`,
    params: { organization_id: org.zohoOrgId, ...params },
    data,
    headers: { Authorization: `Zoho-oauthtoken ${await getToken(org)}`, ...headers },
  });
  return r.data;
}
