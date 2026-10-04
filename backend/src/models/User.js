import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const User = model(
  'User',
  new Schema({
    name: String,
    email: { type: String, unique: true },
    passwordHash: String,
    // PM → CM → OM → FM (see services/hierarchy.service.js). ADMIN: exactly one per org.
    role: { type: String, enum: ['PM', 'CM', 'OM', 'FM', 'ADMIN'] },
    managerId: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // who this user reports to
    // Default bill location; its state (source_of_supply) decides GST vs IGST. Required for PMs.
    location_id: { type: String, default: '' },
    location_name: { type: String, default: '' },
    source_of_supply: { type: String, default: '' },
    financeOrgId: { type: Schema.Types.ObjectId, ref: 'FinanceOrg', default: null },
  }),
);
