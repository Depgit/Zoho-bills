import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// Remembers each uploader's default expense account per vendor
export const VendorAccountMap = model(
  'VendorAccountMap',
  new Schema(
    {
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      vendorId: { type: String, required: true },
      account_id: { type: String, required: true },
    },
    { timestamps: true },
  ),
);
