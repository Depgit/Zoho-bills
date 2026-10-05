// Summary of a bulk approval: "✓ 5 approved (2 posted to Zoho)" or the ones that failed and why
export function bulkResultMessage(results) {
  const done = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const posted = done.filter((r) => r.status === 'POSTED').length;
  const head = `✓ ${done.length} approved${posted ? ` (${posted} posted to Zoho Books)` : ''}`;
  if (!failed.length) return { text: `${head}.`, failed: 0 };
  const lines = failed.map((r) => `• ${r.billNumber || 'Bill'}: ${r.error}`).join('\n');
  return { text: `${done.length ? `${head}. ` : ''}${failed.length} could not be approved and stay ticked:\n${lines}`, failed: failed.length };
}
