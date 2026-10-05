// AI providers. Each one is used only if its API key is set.
import { DEEPSEEK_MODEL, GEMINI_MODEL, GROQ_MODEL } from '../config.js';
import { viaGemini } from './gemini.js';
import { viaDeepSeek, viaGroq } from './openaiCompatible.js';

export const PROVIDERS = [
  { name: 'gemini', key: 'GEMINI_API_KEY', model: GEMINI_MODEL, run: viaGemini },
  { name: 'deepseek', key: 'DEEPSEEK_API_KEY', model: DEEPSEEK_MODEL, run: viaDeepSeek },
  { name: 'groq', key: 'GROQ_API_KEY', model: GROQ_MODEL, run: viaGroq },
];

export const activeProviders = () => PROVIDERS.filter((p) => process.env[p.key]);
