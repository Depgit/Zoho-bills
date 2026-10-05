// Timing log for one extraction: total time and each step / provider
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;

export const timer = () => {
  const t0 = Date.now();
  const took = {};
  const log = (source) =>
    console.log(
      `[extract] ${secs(Date.now() - t0)} total (${source}) —`,
      Object.entries(took)
        .map(([k, v]) => `${k} ${v}`)
        .join(', '),
    );
  return { took, log, secs, since: (t) => secs(Date.now() - t) };
};
