// Extraction settings from .env
//   GEMINI_API_KEY / DEEPSEEK_API_KEY / GROQ_API_KEY   at least one is required
//   GEMINI_MODEL=gemini-flash-latest   DEEPSEEK_MODEL=deepseek-chat   GROQ_MODEL=openai/gpt-oss-120b
//   GEMINI_MIN_GAP_MS=4500             gap between Gemini calls (~13 calls/min)
//   EXTRACT_STORE=./data/extract-store.json
//   EXTRACT_CACHE=off                  off = always extract fresh, never read/write the store
//   DEBUG_OCR=true                     logs OCR text and AI answers
import { flag } from '../../config/env.js';

export const DEBUG_OCR = flag(process.env.DEBUG_OCR);
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
export const GEMINI_MIN_GAP_MS = Number(process.env.GEMINI_MIN_GAP_MS || 4500);
export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
export const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
export const STORE_FILE = process.env.EXTRACT_STORE || './data/extract-store.json';
export const USE_CACHE = !/^(off|false|0|no)$/i.test(process.env.EXTRACT_CACHE || '');

export const VALID_GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/i;
