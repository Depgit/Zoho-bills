import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// Zoho vendor contacts, synced per org (services/zoho/contacts.js)
export const Contact = model(
  'Contact',
  new Schema(
    {
      financeOrgId: { type: Schema.Types.ObjectId, ref: 'FinanceOrg', required: true },
      contact_id: String,
      contact_name: String,
      gst_no: String,
      status: String,
      last_modified_time: String,
      synced_at: Date,
    },
    { timestamps: true },
  ),
);
