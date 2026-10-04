// Id of a value that may be a populated document, an ObjectId or a string
export const idOf = (x) => String(x?._id || x || '');
