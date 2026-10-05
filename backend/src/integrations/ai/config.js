// AI provider settings from .env
//   GEMINI_API_KEY / DEEPSEEK_API_KEY / GROQ_API_KEY   at least one is required
//   GEMINI_MODEL=gemini-flash-latest   DEEPSEEK_MODEL=deepseek-chat   GROQ_MODEL=openai/gpt-oss-120b
//   GEMINI_MIN_GAP_MS=4500             gap between Gemini calls (~13 calls/min)
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
// Used when GEMINI_MODEL stays busy / rate-limited after retries
export const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest';
// Groq's free tier allows ~8000 tokens per minute: bigger documents are skipped instead of failing
export const GROQ_MAX_INPUT_TOKENS = Number(process.env.GROQ_MAX_INPUT_TOKENS || 7500);
export const DEEPSEEK_MAX_INPUT_TOKENS = Number(process.env.DEEPSEEK_MAX_INPUT_TOKENS || 60000);
export const GEMINI_MIN_GAP_MS = Number(process.env.GEMINI_MIN_GAP_MS || 4500);
export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
export const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
