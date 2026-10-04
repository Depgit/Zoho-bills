// GST helpers: vendor state (from its GSTIN) vs bill location state decides the slab —
// same state → GST (CGST+SGST), different → IGST.

// GSTIN state code → [Zoho place-of-supply code, name]
export const GST_STATES = {
  '01': ['JK', 'Jammu and Kashmir'],
  '02': ['HP', 'Himachal Pradesh'],
  '03': ['PB', 'Punjab'],
  '04': ['CH', 'Chandigarh'],
  '05': ['UK', 'Uttarakhand'],
  '06': ['HR', 'Haryana'],
  '07': ['DL', 'Delhi'],
  '08': ['RJ', 'Rajasthan'],
  '09': ['UP', 'Uttar Pradesh'],
  '10': ['BR', 'Bihar'],
  '11': ['SK', 'Sikkim'],
  '12': ['AR', 'Arunachal Pradesh'],
  '13': ['NL', 'Nagaland'],
  '14': ['MN', 'Manipur'],
  '15': ['MZ', 'Mizoram'],
  '16': ['TR', 'Tripura'],
  '17': ['ML', 'Meghalaya'],
  '18': ['AS', 'Assam'],
  '19': ['WB', 'West Bengal'],
  '20': ['JH', 'Jharkhand'],
  '21': ['OR', 'Odisha'],
  '22': ['CG', 'Chhattisgarh'],
  '23': ['MP', 'Madhya Pradesh'],
  '24': ['GJ', 'Gujarat'],
  '26': ['DN', 'Dadra and Nagar Haveli and Daman and Diu'],
  '27': ['MH', 'Maharashtra'],
  '29': ['KA', 'Karnataka'],
  '30': ['GA', 'Goa'],
  '31': ['LD', 'Lakshadweep'],
  '32': ['KL', 'Kerala'],
  '33': ['TN', 'Tamil Nadu'],
  '34': ['PY', 'Puducherry'],
  '35': ['AN', 'Andaman and Nicobar Islands'],
  '36': ['TG', 'Telangana'],
  '37': ['AP', 'Andhra Pradesh'],
  '38': ['LA', 'Ladakh'],
};

// '07AAAAA…' → { code: 'DL', name: 'Delhi' } (null if unknown)
export const gstinState = (gstin) => {
  const s = GST_STATES[String(gstin || '').trim().slice(0, 2)];
  return s ? { code: s[0], name: s[1] } : null;
};

// 'DL', '07' or 'Delhi' → 'DL' ('' if unknown)
export const stateCode = (value) => {
  const x = String(value || '').trim();
  if (GST_STATES[x.padStart(2, '0')]) return GST_STATES[x.padStart(2, '0')][0];
  const hit = Object.values(GST_STATES).find(
    ([code, name]) => code === x.toUpperCase() || name.toLowerCase() === x.toLowerCase(),
  );
  return hit ? hit[0] : '';
};

const isIgst = (t) => t.tax_specific_type === 'igst' || /igst/i.test(t.tax_name || '');

// Tax plan for a bill: no vendor GSTIN → no GST at all (no slab needed).
// Otherwise each line with a % gets the matching GST / IGST slab.
// interState is null when either state is unknown (the FM must pick by hand).
export const taxPlan = (bill, taxes) => {
  const hasGst = !!bill.vendorGstin;
  const vendor = gstinState(bill.vendorGstin)?.code || '';
  const property = stateCode(bill.source_of_supply);
  const interState = hasGst && vendor && property ? vendor !== property : null;
  const needsSlab = (l) => hasGst && Number(l.tax_percentage) > 0;
  const slabFor = (l) => {
    if (!needsSlab(l) || interState === null) return '';
    const slab = taxes.find(
      (t) => Number(t.tax_percentage) === Number(l.tax_percentage) && isIgst(t) === interState,
    );
    return slab?.tax_id || '';
  };
  return { hasGst, vendor, property, interState, slabFor, needsSlab };
};
