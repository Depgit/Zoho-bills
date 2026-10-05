// Ids are UUIDs. Anything else (bad URL param, old Mongo id) can't match a row.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (id) => typeof id === 'string' && UUID.test(id);

// Plain id from a value that may be an id string or an object with `id`
export const idOf = (x) => (x && typeof x === 'object' ? x.id : x) || null;
