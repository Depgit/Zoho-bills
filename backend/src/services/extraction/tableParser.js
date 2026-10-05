// Line items straight from `pdftotext -layout` text — no AI.
//
// The layout text keeps the invoice table's columns at fixed character positions, so:
//   1. find the table header ("# | Item & Description | HSN | Qty | Rate | Discount | GST | Amount" …);
//      it's found again on every page, because the columns move a little between pages
//   2. cut every line into pieces (text separated by 2+ spaces) and put each piece in the column
//      whose header is nearest — unknown headers (e.g. "Property Name") become their own columns
//   3. a row starts where the serial-number column has a number (or, with no serial column, where
//      the Amount column has one); the lines below it, up to the next row, belong to it:
//      description lines, and numbers that wrapped ("18,000." + "00")
//   4. the table ends at "Sub Total" / "Total" / "Taxable" …, and starts again at the next header
// Rows are checked against the Sub Total printed on the bill.

const KINDS = [
  ['serial', /^(#|s\.?\s?no\.?|sr\.?(\s?no\.?)?|sl\.?(\s?no\.?)?|no\.)$/i],
  ['hsn', /\b(hsn|sac)\b/i],
  ['qty', /\b(qty|quantity|qnty|nos)\b/i],
  ['discount', /\b(disc(ount)?|disc\.?\s*%?)\b/i],
  ['tax', /\b(gst|igst|cgst|sgst|tax)\b\s*%?|^%$/i],
  ['rate', /\b(rate|price|unit\s*price|mrp)\b/i],
  ['amount', /\b(amount|amt|value|total)\b/i],
  ['desc', /\b(item|description|particulars|product|service|details|goods)\b/i],
];
const END = /^(sub\s*-?\s*total|total|taxable(\s+value|\s+amount)?|grand\s+total|amount\s+(chargeable|in\s+words)|bank\s+details|terms|tax\s+summary|round(ing)?\s*off|igst\d*|cgst\d*|sgst\d*)\b/i;

// Pieces of a line: text separated by 2+ spaces, with their start / end positions
function pieces(line) {
  const out = [];
  for (const m of line.matchAll(/\S+(?: \S+)*/g)) out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

const kindOf = (text) => KINDS.find(([, re]) => re.test(text))?.[0] || null;

// A header line names a quantity, a price and an amount column (and usually the description)
function isHeader(line) {
  const kinds = new Set(pieces(line).flatMap((p) => p.text.split(/\s{1}(?=[A-Z#])/).map(kindOf)));
  return kinds.has('qty') && kinds.has('amount') && (kinds.has('rate') || kinds.has('desc'));
}

// Columns from the header line and the stacked header words just above / below it
function columnsAt(lines, i) {
  const cols = [];
  const add = (p, kind) => cols.push({ kind, label: p.text, center: (p.start + p.end) / 2, start: p.start, end: p.end });
  for (const p of pieces(lines[i])) {
    // a piece like "Qty Rate" separated by one space only: split on known words
    const words = [...p.text.matchAll(/\S+/g)].map((m) => ({ text: m[0], start: p.start + m.index, end: p.start + m.index + m[0].length }));
    const kinds = words.map((w) => kindOf(w.text));
    if (words.length > 1 && kinds.filter(Boolean).length > 1 && !kinds.includes('desc')) words.forEach((w, k) => add(w, kinds[k] || 'other'));
    else add(p, kindOf(p.text) || 'other');
  }
  // Header words on the neighbouring lines ("Property / Name") that sit over empty space are extra columns
  for (const j of [i - 1, i + 1]) {
    const line = lines[j];
    if (!line || !line.trim() || /\d/.test(line) || pieces(line).length > 8) continue;
    for (const p of pieces(line)) {
      const center = (p.start + p.end) / 2;
      const near = cols.find((c) => center >= c.start - 1 && center <= c.end + 1);
      if (near) near.label += ` ${p.text}`;
      else add(p, 'other');
    }
  }
  return cols.sort((a, b) => a.center - b.center);
}

// The column a piece belongs to: the one whose span it overlaps most, else the nearest centre
function columnOf(cols, p) {
  let best = null;
  let bestOverlap = 0;
  for (const c of cols) {
    const overlap = Math.min(p.end, c.end) - Math.max(p.start, c.start);
    if (overlap > bestOverlap) [best, bestOverlap] = [c, overlap];
  }
  if (best) return best;
  const mid = (p.start + p.end) / 2;
  // numbers are usually right-aligned under their header: compare right edges for them
  const numeric = /^[\d.,%()\-₹Rs ]+$/.test(p.text);
  return cols.reduce((a, c) => {
    const d = (x) => (numeric ? Math.abs(p.end - x.end) : Math.abs(mid - x.center));
    return d(c) < d(a) ? c : a;
  });
}

const toNumber = (s) => {
  const clean = String(s ?? '').replace(/rs\.?|₹|inr|,|\s|%/gi, '');
  if (!clean || !/\d/.test(clean)) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
};
const isNumberish = (s) => /^\(?-?[\d,]*\.?\d*\)?%?$/.test(String(s).replace(/\s/g, '')) && /\d|\./.test(s);
const isSerial = (s) => /^\d{1,4}\.?$/.test(s.trim());

function buildRow(cells, cols) {
  const get = (kind) => cells.filter((c) => c.col.kind === kind);
  const joinNum = (kind) => toNumber(get(kind).map((c) => c.text).join('')); // "18,000." + "00"
  const descLines = get('desc').map((c) => c.text);
  const text = descLines.join(' ');
  const hsnCell = get('hsn').map((c) => c.text).join('');
  const hsn = hsnCell || text.match(/\b(?:hsn|sac)\s*(?:code)?\s*[:-]?\s*(\d{4,8})\b/i)?.[1] || '';
  const qty = joinNum('qty');
  const amount = joinNum('amount');
  const listRate = joinNum('rate');
  const discount = get('discount').length ? toNumber(get('discount').map((c) => c.text).join('')) : null;
  const taxCell = get('tax').map((c) => c.text).join(' ');
  const tax = taxCell ? toNumber(taxCell.match(/(\d+(?:\.\d+)?)\s*%?/)?.[1]) : null;
  const quantity = qty && qty > 0 ? qty : 1;
  // Net unit rate: with a discount column (or no rate), Amount ÷ Qty; else the printed rate
  const rate = amount != null && (discount || listRate == null) ? amount / quantity : listRate ?? 0;
  const others = cols
    .filter((c) => c.kind === 'other')
    .map((c) => [c.label, cells.filter((x) => x.col === c).map((x) => x.text).join(' ').replace(/\s*-\s*$/, '')])
    .filter(([, v]) => v.trim());
  const [name, ...rest] = descLines.filter((l) => !/^(?:hsn|sac)\b/i.test(l));
  const description = [...rest, ...others.map(([k, v]) => `${k}: ${v}`)].join(' ').replace(/\s+/g, ' ').trim();
  return {
    name: (name || '').trim(),
    description,
    hsn,
    quantity,
    rate: Math.round(rate * 100) / 100,
    amount: amount ?? Math.round(quantity * rate * 100) / 100,
    tax_percent: tax,
  };
}

// → { items, subtotal, sum, matchesSubtotal }  (items: [{ name, description, hsn, quantity, rate, amount, tax_percent }])
export function parseLineItems(layoutText) {
  const lines = String(layoutText || '').replace(/\f/g, '\n').split('\n');
  const items = [];
  let cols = null;
  let row = null;
  const finish = () => {
    if (row && row.cells.length) {
      const item = buildRow(row.cells, row.cols);
      if (item.name || item.amount) items.push(item);
    }
    row = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isHeader(line)) {
      finish();
      cols = columnsAt(lines, i);
      if (lines[i + 1] && !/\d/.test(lines[i + 1]) && pieces(lines[i + 1]).length <= 8) i++; // stacked header words
      continue;
    }
    if (!cols || !line.trim()) continue;
    const ps = pieces(line);
    if (END.test(ps[0]?.text || '') || ps.some((p) => /^sub\s*total$/i.test(p.text))) {
      finish();
      cols = null; // table over until the next header (next page)
      continue;
    }
    const cells = ps.map((p) => ({ ...p, col: columnOf(cols, p) }));
    const serialCol = cols.find((c) => c.kind === 'serial');
    const starts = serialCol
      ? cells.some((c) => c.col === serialCol && isSerial(c.text))
      : cells.some((c) => c.col.kind === 'amount' && isNumberish(c.text) && toNumber(c.text) > 0) && cells.some((c) => c.col.kind === 'desc');
    if (starts) {
      finish();
      row = { cols, cells: cells.filter((c) => c.col.kind !== 'serial') };
    } else if (row) {
      row.cells.push(...cells.filter((c) => c.col.kind !== 'serial'));
    }
  }
  finish();

  const subtotal = toNumber(
    (layoutText.match(/sub\s*-?\s*total[^\d\n]*([\d,]+\.\d{1,2})/i) || layoutText.match(/taxable\s+(?:value|amount)?[^\d\n]*([\d,]+\.\d{1,2})/i))?.[1],
  );
  const sum = Math.round(items.reduce((s, it) => s + (it.amount || 0), 0) * 100) / 100;
  return { items, subtotal, sum, matchesSubtotal: subtotal != null && Math.abs(subtotal - sum) < 1 };
}
