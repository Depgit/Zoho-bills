// Loads .env (from the folder the server is started in) and exposes the core settings.
import 'dotenv/config';

export const PORT = process.env.PORT || 5000;
export const DATABASE_URL = process.env.DATABASE_URL;
export const JWT_SECRET = () => process.env.JWT_SECRET;

// File storage: 'local' (disk, for development) or 'supabase'
export const STORAGE = {
  driver: (process.env.STORAGE_DRIVER || 'local').toLowerCase(),
  localDir: process.env.STORAGE_LOCAL_DIR || './data/files',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_KEY,
  bucket: process.env.SUPABASE_BUCKET || 'bill-files',
};

// Rejected bills keep their uploaded file this many days after the rejection, then it's deleted
export const REJECTED_FILE_DAYS = Number(process.env.REJECTED_FILE_DAYS || 10);

// "true" / "1" / "yes" → true; anything else (incl. "false") → false
export const flag = (value) => /^(true|1|yes)$/i.test(value || '');

// DEBUG_OCR=true logs OCR text and AI answers
export const DEBUG_OCR = flag(process.env.DEBUG_OCR);
