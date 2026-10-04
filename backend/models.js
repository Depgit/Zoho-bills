import mongoose from 'mongoose';
const { Schema, model } = mongoose;

// One document per Finance Manager registration — stores Zoho credentials for that org
export const FinanceOrg = model('FinanceOrg', new Schema({
  userId:           { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
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
  role: { type: String, enum: ['PM', 'L1', 'FINANCE'] },
  source_of_supply: { type: String, default: '' },
  location_id: { type: String, default: '' },
  location_name: { type: String, default: '' },
  // For PM/L1: the FinanceOrg they belong to. For FINANCE: their own FinanceOrg.
  financeOrgId: { type: Schema.Types.ObjectId, ref: 'FinanceOrg', default: null },
}));
export const Bill = model('Bill', new Schema({
  pdfFile: String,                       // local filename in /uploads, nulled after Zoho upload
  fileType: { type: String, default: 'application/pdf' },
  extracted: Schema.Types.Mixed,
  vendorId: String, vendorName: String, billNumber: String, date: String, dueDate: String,
  discount_amount: { type: Number, default: 0 },
  discount_percent: { type: Number, default: 0 },
  tax_name: { type: String, default: '' },
  location_id: { type: String, default: '' },
  source_of_supply: { type: String, default: '' },
  lineItems: [{ _id: false, name: String, description: String, quantity: Number, rate: Number, account_id: String, tax_id: String, tax_percentage: { type: Number, default: 0 } }],
  status: {
    type: String, default: 'PENDING_L1',
    enum: ['PENDING_L1', 'PENDING_FINANCE', 'POSTED', 'REJECTED_L1', 'REJECTED_FINANCE']
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  financeOrgId: { type: Schema.Types.ObjectId, ref: 'FinanceOrg', required: true },
  history: [{ _id: false, by: String, action: String, comment: String, at: { type: Date, default: Date.now } }],
  vendorGstin: { type: String, default: '' },    // stamped at Finance approval; empty = no GST
  zohoBillId: String, zohoError: String
}, { timestamps: true }));
// Persists vendor → default expense account mapping per user
export const VendorAccountMap = model('VendorAccountMap', new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  vendorId: { type: String, required: true },
  account_id: { type: String, required: true },
}, { timestamps: true }));

