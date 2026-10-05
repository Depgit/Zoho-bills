// Ask every AI at once; the first usable answer wins — the rest aren't waited for.
// A failure (error or empty answer) just drops out. If nobody gives a usable answer,
// the first answer at all is returned (or nothing). `took` records each provider's time.
// `judge(raw)` → { data, usable } decides what counts as a usable answer (the caller's rules).
import { DEBUG_OCR } from '../../config/env.js';

const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;

export function raceProviders(providers, { ocrText, regexFields, examples }, judge, took) {
  return new Promise((resolve) => {
    let winner = null;
    let fallback = null;
    let pending = providers.length;
    const done = () => {
      if (--pending === 0) resolve(winner || fallback);
    };
    if (!pending) return resolve(null);

    providers.forEach((p) => {
      const started = Date.now();
      p.run(ocrText, regexFields, examples)
        .then(
          (raw) => {
            took[p.name] = secs(Date.now() - started);
            if (winner) return; // someone already won
            const { data: result, usable } = judge(raw);
            if (DEBUG_OCR) console.log(`[${p.name}] result:`, JSON.stringify(result, null, 2));
            if (usable) {
              winner = { data: result, source: p.name };
              resolve(winner);
            } else {
              console.warn(`[${p.name}] returned no usable fields`);
              fallback ??= { data: result, source: p.name };
            }
          },
          (e) => {
            took[p.name] = 'failed';
            if (!winner) console.error(`[${p.name}] FAILED:`, e?.status ?? '', e?.message);
          },
        )
        .finally(done);
    });
  });
}
