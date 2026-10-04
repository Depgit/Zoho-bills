// Find the Zoho contact that best matches an extracted invoice.
// Priority: exact GSTIN → same PAN part of the GSTIN → fuzzy name.
const normGstin = (v) => (v || '').toUpperCase().replace(/\s/g, '');
const coreName = (v) =>
  v
    .toLowerCase()
    .replace(/pvt|ltd|private|limited|llp|\./g, '')
    .trim();

export function matchVendor(contacts, gstin, vendorName) {
  const extracted = normGstin(gstin);
  if (extracted) {
    const exact = contacts.find((c) => normGstin(c.gst_no) === extracted);
    if (exact) return exact;
    const samePan = contacts.find((c) => {
      const cg = normGstin(c.gst_no);
      return cg.length === 15 && extracted.length === 15 && cg.slice(2, 12) === extracted.slice(2, 12);
    });
    if (samePan) return samePan;
  }
  if (vendorName) {
    const core = coreName(vendorName);
    const byName = contacts.find((c) => {
      const cn = coreName(c.contact_name);
      return cn.includes(core) || core.includes(cn);
    });
    if (byName) return byName;
  }
  return null;
}

export const sameGstin = (a, b) => Boolean(a) && normGstin(a) === normGstin(b);
