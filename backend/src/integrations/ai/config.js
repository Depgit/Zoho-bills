// AI provider settings from .env
//   GEMINI_API_KEY / DEEPSEEK_API_KEY / GROQ_API_KEY   at least one is required
//   GEMINI_MODEL=gemini-flash-latest   DEEPSEEK_MODEL=deepseek-chat   GROQ_MODEL=openai/gpt-oss-120b
//   GEMINI_MIN_GAP_MS=4500             gap between Gemini calls (~13 calls/min)
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
export const GEMINI_MIN_GAP_MS = Number(process.env.GEMINI_MIN_GAP_MS || 4500);
export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
export const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
