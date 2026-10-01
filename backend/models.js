import mongoose from 'mongoose';
const { Schema, model } = mongoose;
export const User = model('User', new Schema({
  name: String, email: { type: String, unique: true }, passwordHash: String,
  role: { type: String, enum: ['PM', 'L1', 'FINANCE'] }
}));
export const Bill = model('Bill', new Schema({
  pdfFile: String,                       // local filename in /uploads, nulled after Zoho upload
  fileType: { type: String, default: 'application/pdf' },
  extracted: Schema.Types.Mixed,
  vendorId: String, vendorName: String, billNumber: String, date: String, dueDate: String,
  lineItems: [{ _id: false, name: String, quantity: Number, rate: Number, account_id: String, tax_id: String }],
  status: { type: String, default: 'PENDING_L1',
    enum: ['PENDING_L1', 'PENDING_FINANCE', 'POSTED', 'REJECTED_L1', 'REJECTED_FINANCE'] },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  history: [{ _id: false, by: String, action: String, comment: String, at: { type: Date, default: Date.now } }],
  zohoBillId: String, zohoError: String
}, { timestamps: true }));
