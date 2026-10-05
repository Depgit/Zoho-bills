// DeepSeek and Groq: both speak the OpenAI chat-completions API
import { DEEPSEEK_MAX_INPUT_TOKENS, DEEPSEEK_MODEL, GROQ_MAX_INPUT_TOKENS, GROQ_MODEL } from '../config.js';
import { extractJson, SYSTEM_PROMPT, textPrompt } from '../prompt.js';

// Rough token count (≈ 3.5 characters per token for this kind of text)
const tokensIn = (text) => Math.ceil(text.length / 3.5);

async function chatJson(name, url, apiKey, model, ocrText, regexFields, examples, maxInputTokens) {
  const prompt = textPrompt(ocrText, regexFields, examples);
  const estimate = tokensIn(SYSTEM_PROMPT + prompt);
  if (estimate > maxInputTokens) {
    throw Object.assign(new Error(`${name} skipped: document too large (~${estimate} tokens, limit ${maxInputTokens})`), { status: 'skipped' });
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 8000,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!r.ok) {
    const body = (await r.text().catch(() => '')).slice(0, 200);
    throw Object.assign(new Error(`${name} HTTP ${r.status}: ${body}`), { status: r.status });
  }
  const json = await r.json();
  return extractJson(json?.choices?.[0]?.message?.content);
}

export const viaDeepSeek = (ocrText, regexFields, examples) =>
  chatJson(
    'DeepSeek',
    'https://api.deepseek.com/chat/completions',
    process.env.DEEPSEEK_API_KEY,
    DEEPSEEK_MODEL,
    ocrText,
    regexFields,
    examples,
    DEEPSEEK_MAX_INPUT_TOKENS,
  );

export const viaGroq = (ocrText, regexFields, examples) =>
  chatJson(
    'Groq',
    'https://api.groq.com/openai/v1/chat/completions',
    process.env.GROQ_API_KEY,
    GROQ_MODEL,
    ocrText,
    regexFields,
    examples,
    GROQ_MAX_INPUT_TOKENS,
  );
