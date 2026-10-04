import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// One per organisation — created when the Admin registers; stores the Zoho credentials
export const FinanceOrg = model(
  'FinanceOrg',
  new Schema(
    {
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true }, // the org's Admin
      zohoClientId: { type: String, required: true },
      zohoClientSecret: { type: String, required: true },
      zohoRefreshToken: { type: String, required: true },
      zohoOrgId: { type: String, required: true },
      zohoAccountsUrl: { type: String, default: 'https://accounts.zoho.in' },
      zohoApiUrl: { type: String, default: 'https://www.zohoapis.in' },
      displayName: { type: String }, // fetched from Zoho at registration
    },
    { timestamps: true },
  ),
);
