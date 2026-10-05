// Gemini, called one request at a time with a minimum gap so parallel uploads
// don't blow through the free-tier per-minute limit
import { GoogleGenAI } from '@google/genai';
import { GEMINI_FALLBACK_MODEL, GEMINI_MIN_GAP_MS, GEMINI_MODEL } from '../config.js';
import { extractJson, textPrompt } from '../prompt.js';

let client;
const gemini = () => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let queue = Promise.resolve();
let lastCallAt = 0;

function enqueue(fn) {
  const run = queue.then(async () => {
    const wait = lastCallAt + GEMINI_MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return fn();
  });
  queue = run.catch(() => {}); // one failure must not block the queue
  return run;
}

// Busy / rate-limited / server error → worth trying again
const retryable = (e) => [429, 500, 502, 503, 504].includes(Number(e?.status)) || /UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand/i.test(e?.message || '');

const ask = (model, prompt) =>
  enqueue(() =>
    gemini().models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        temperature: 0,
        maxOutputTokens: 32768, // room for "thinking" + long item lists (100+ rows)
      },
    }),
  );

// The main model, retried twice when busy (2 s, then 6 s); then the lighter fallback model
async function askWithRetry(prompt) {
  const attempts = [
    [GEMINI_MODEL, 0],
    [GEMINI_MODEL, 2000],
    [GEMINI_MODEL, 6000],
    [GEMINI_FALLBACK_MODEL, 0],
  ];
  let last;
  for (const [model, wait] of attempts) {
    if (wait) await sleep(wait);
    try {
      return await ask(model, prompt);
    } catch (e) {
      last = e;
      if (!retryable(e)) throw e;
      console.warn(`[gemini] ${model} busy (${e.status ?? ''}) — ${wait || model !== GEMINI_MODEL ? 'trying again' : 'retrying'}`);
    }
  }
  throw last;
}

export async function viaGemini(ocrText, regexFields, examples) {
  const res = await askWithRetry(textPrompt(ocrText, regexFields, examples));
  const text = res.text ?? '';
  if (!text.trim()) {
    throw new Error(`Gemini returned empty response (finishReason: ${res.candidates?.[0]?.finishReason ?? 'unknown'})`);
  }
  return extractJson(text);
}
