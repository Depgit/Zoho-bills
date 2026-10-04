// Zoho locations → the state that decides GST vs IGST for a bill
import { FinanceOrg } from '../models/index.js';
import { httpError } from '../utils/httpError.js';
import { locations } from './zoho/index.js';

// Look a location up in Zoho → { location_id, location_name, source_of_supply }
export async function findLocation(financeOrgId, locationId) {
  const org = await FinanceOrg.findById(financeOrgId);
  const loc = (await locations(org)).find((l) => l.location_id === locationId);
  if (!loc) throw httpError(400, 'Location not found in Zoho');
  if (!loc.state_code) throw httpError(400, `Location "${loc.location_name}" has no state in Zoho — add its address there first`);
  return { location_id: locationId, location_name: loc.location_name, source_of_supply: loc.state_code };
}
