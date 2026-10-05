// Id of a value that may be an object with `id` or already an id string
export const idOf = (x) => String((x && typeof x === 'object' ? x.id : x) || '');
