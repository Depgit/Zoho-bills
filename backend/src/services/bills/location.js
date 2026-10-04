// Bill location: picked on the form, default the owner's profile location.
// Its state (source_of_supply) decides GST vs IGST.
import { httpError } from '../../utils/httpError.js';
import { findLocation } from '../locations.service.js';

export async function resolveBillLocation(owner, wantedLocationId) {
  const id = wantedLocationId || owner.location_id;
  if (!id) throw httpError(400, 'Select the location this bill is for');
  if (id === owner.location_id && owner.source_of_supply) {
    return { location_id: id, location_name: owner.location_name, source_of_supply: owner.source_of_supply };
  }
  return findLocation(owner.financeOrgId, id);
}
