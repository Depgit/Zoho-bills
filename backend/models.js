import mongoose from 'mongoose';
const { Schema, model } = mongoose;

// One per organisation — created when the Admin registers; stores the Zoho credentials
export const FinanceOrg = model('FinanceOrg', new Schema({
  userId:           { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },  // the org's Admin
  zohoClientId:     { type: String, required: true },
  zohoClientSecret: { type: String, required: true },
  zohoRefreshToken: { type: String, required: true },
  zohoOrgId:        { type: String, required: true },
  zohoAccountsUrl:  { type: String, default: 'https://accounts.zoho.in' },
  zohoApiUrl:       { type: String, default: 'https://www.zohoapis.in' },
  displayName:      { type: String },          // fetched from Zoho org at registration
}, { timestamps: true }));

export const Contact = model('Contact', new Schema({
  financeOrgId: { type: Schema.Types.ObjectId, ref: 'FinanceOrg', required: true },
  contact_id: String,
  contact_name: String,
  gst_no: String,
  status: String,
  last_modified_time: String,
  synced_at: Date
}, { timestamps: true }));

export const User = model('User', new Schema({
  name: String, email: { type: String, unique: true }, passwordHash: String,
  // PM → CM → OM → FM (see hierarchy.js). ADMIN: exactly one per org, created at registration.
  role: { type: String, enum: ['PM', 'CM', 'OM', 'FM', 'ADMIN'] },
  managerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },  // who this user reports to
  // Default bill location; its state (source_of_supply) decides GST vs IGST. Required for PMs.
  location_id: { type: String, default: '' },
  location_name: { type: String, default: '' },
  source_of_supply: { type: String, default: '' },
  financeOrgId: { type: Schema.Types.ObjectId, ref: 'FinanceOrg', default: null },
}));

export const Bill = model('Bill', new Schema({
  pdfFile: String,                       // GridFS file id, nulled after Zoho upload
  fileType: { type: String, default: 'application/pdf' },
  extracted: Schema.Types.Mixed,
  vendorId: String, vendorName: String, billNumber: String, date: String, dueDate: String,
  discount_amount: { type: Number, default: 0 },
  discount_percent: { type: Number, default: 0 },
  // Location picked on the form; its state decides GST vs IGST
  location_id: { type: String, default: '' },
  location_name: { type: String, default: '' },
  source_of_supply: { type: String, default: '' },
  lineItems: [{ _id: false, name: String, description: String, quantity: Number, rate: Number, account_id: String, tax_id: String, tax_percentage: { type: Number, default: 0 } }],
  // DRAFT → PENDING (stage CM/OM/FM, waiting on approverId) → POSTED, or REJECTED (stage = who rejected)
  status: { type: String, default: 'DRAFT', enum: ['DRAFT', 'PENDING', 'REJECTED', 'POSTED'] },
  stage: { type: String, enum: ['', 'CM', 'OM', 'FM'], default: '' },
  approverId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  firstStage: { type: String, default: '' },     // where the chain starts for this owner (owner can edit until it moves on)
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },   // who uploaded (audit only)
  ownerId: { type: Schema.Types.ObjectId, ref: 'User' },     // who can edit/resubmit — moves on transfer
  // Which PMs the bill belongs to and how much each (sum = bill total). A PM's own bill: just them.
  allocations: [{ _id: false, pmId: { type: Schema.Types.ObjectId, ref: 'User' }, amount: Number }],
  financeOrgId: { type: Schema.Types.ObjectId, ref: 'FinanceOrg', required: true },
  history: [{ _id: false, by: String, byId: Schema.Types.ObjectId, role: String, action: String, comment: String, at: { type: Date, default: Date.now } }],
  vendorGstin: { type: String, default: '' },    // stamped when posted to Zoho; empty = no GST
  zohoBillId: String, zohoError: String
}, { timestamps: true }));
// Persists vendor → default expense account mapping per user
export const VendorAccountMap = model('VendorAccountMap', new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  vendorId: { type: String, required: true },
  account_id: { type: String, required: true },
}, { timestamps: true }));

