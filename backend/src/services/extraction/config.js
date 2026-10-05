// Extraction settings from .env
//   EXTRACT_CACHE=off   off = always extract fresh, never read/write the extraction cache
export const USE_CACHE = !/^(off|false|0|no)$/i.test(process.env.EXTRACT_CACHE || '');

export const VALID_GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/i;
