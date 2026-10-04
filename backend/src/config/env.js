// Loads .env (from the folder the server is started in) and exposes the core settings.
import 'dotenv/config';

export const PORT = process.env.PORT || 5000;
export const MONGO_URI = process.env.MONGO_URI;
export const JWT_SECRET = () => process.env.JWT_SECRET;

// "true" / "1" / "yes" → true; anything else (incl. "false") → false
export const flag = (value) => /^(true|1|yes)$/i.test(value || '');
