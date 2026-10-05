// Gemini, called one request at a time with a minimum gap so parallel uploads
// don't blow through the free-tier per-minute limit
import { GoogleGenAI } from '@google/genai';
import { GEMINI_MIN_GAP_MS, GEMINI_MODEL } from '../config.js';
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

export async function viaGemini(ocrText, regexFields, examples) {
  const res = await enqueue(() =>
    gemini().models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts: [{ text: textPrompt(ocrText, regexFields, examples) }] }],
      config: {
        responseMimeType: 'application/json',
        temperature: 0,
        maxOutputTokens: 8192, // room for "thinking" + long item lists
      },
    }),
  );
  const text = res.text ?? '';
  if (!text.trim()) {
    throw new Error(`Gemini returned empty response (finishReason: ${res.candidates?.[0]?.finishReason ?? 'unknown'})`);
  }
  return extractJson(text);
}
