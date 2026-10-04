// Compare two ids that may be ObjectIds, strings or populated documents
export const sameId = (a, b) => Boolean(a && b && String(a._id || a) === String(b._id || b));
