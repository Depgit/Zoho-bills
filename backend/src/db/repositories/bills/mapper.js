// Bill rows ↔ the bill object the services work with.
// Field names match the API (pdfFile, lineItems, allocations, history, location_id …).
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateOrNull = (v) => (DATE.test(String(v || '')) ? String(v) : null);
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : fallback);

// Bills saved before discount rows existed: their single discount as one row
const legacyDiscounts = (r) =>
  r.discountAmount > 0
    ? [{ description: 'Discount', type: 'amount', value: r.discountAmount }]
    : r.discountPercent > 0
      ? [{ description: 'Discount', type: 'percent', value: r.discountPercent }]
      : [];

export const toBill = (r, { lineItems = [], allocations = [], history = [], people = new Map() } = {}) => ({
  id: r.id,
  financeOrgId: r.financeOrgId,
  pdfFile: r.fileId,
  fileType: r.fileType,
  extracted: r.extracted,
  vendorId: r.vendorId,
  vendorName: r.vendorName,
  billNumber: r.billNumber,
  date: r.billDate || '',
  dueDate: r.dueDate || '',
  discount_amount: r.discountAmount,
  discount_percent: r.discountPercent,
  discounts: Array.isArray(r.discounts) && r.discounts.length ? r.discounts : legacyDiscounts(r),
  location_id: r.locationId,
  location_name: r.locationName,
  source_of_supply: r.sourceOfSupply,
  status: r.status,
  stage: r.stage,
  firstStage: r.firstStage,
  approverId: r.approverId,
  createdBy: r.createdBy,
  ownerId: r.ownerId,
  vendorGstin: r.vendorGstin,
  zohoBillId: r.zohoBillId,
  zohoError: r.zohoError,
  total: r.total,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  lineItems: lineItems.map((l) => ({
    name: l.name,
    description: l.description,
    quantity: l.quantity,
    rate: l.rate,
    account_id: l.accountId,
    tax_id: l.taxId,
    tax_percentage: l.taxPercentage,
  })),
  allocations: allocations.map((a) => ({ pmId: a.pmId, amount: a.amount, pm: people.get(a.pmId) || null })),
  history: history.map((h) => ({
    id: h.id,
    by: h.byName,
    byId: h.byId,
    role: h.role,
    action: h.action,
    comment: h.comment,
    at: h.at,
  })),
  // The people on the bill (name / role) for display
  owner: people.get(r.ownerId) || null,
  creator: people.get(r.createdBy) || null,
  approver: people.get(r.approverId) || null,
});

export const toBillRow = (b) => ({
  financeOrgId: b.financeOrgId,
  fileId: b.pdfFile || null,
  fileType: b.fileType || 'application/pdf',
  extracted: b.extracted ?? null,
  vendorId: b.vendorId || '',
  vendorName: b.vendorName || '',
  billNumber: b.billNumber || '',
  billDate: dateOrNull(b.date),
  dueDate: dateOrNull(b.dueDate),
  discountAmount: num(b.discount_amount),
  discountPercent: num(b.discount_percent),
  discounts: Array.isArray(b.discounts) ? b.discounts : [],
  locationId: b.location_id || '',
  locationName: b.location_name || '',
  sourceOfSupply: b.source_of_supply || '',
  status: b.status || 'DRAFT',
  stage: b.stage || '',
  firstStage: b.firstStage || '',
  approverId: b.approverId || null,
  createdBy: b.createdBy || null,
  ownerId: b.ownerId || null,
  vendorGstin: b.vendorGstin || '',
  zohoBillId: b.zohoBillId || null,
  zohoError: b.zohoError || null,
  total: num(b.total),
});

export const toLineRows = (billId, lines = []) =>
  lines.map((l, position) => ({
    billId,
    position,
    name: l.name || '',
    description: l.description || '',
    quantity: num(l.quantity, 1),
    rate: num(l.rate),
    accountId: l.account_id || '',
    taxId: l.tax_id || '',
    taxPercentage: num(l.tax_percentage),
  }));

export const toAllocationRows = (billId, allocations = []) =>
  allocations.map((a, position) => ({ billId, position, pmId: a.pmId || null, amount: num(a.amount) }));

export const toHistoryRow = (billId, h) => ({
  billId,
  byName: h.by || '',
  byId: h.byId || null,
  role: h.role || '',
  action: h.action,
  comment: h.comment || '',
  ...(h.at ? { at: new Date(h.at) } : {}),
});
