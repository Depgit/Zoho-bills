import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const lineItem = new Schema(
  {
    name: String,
    description: String,
    quantity: Number,
    rate: Number,
    account_id: String,
    tax_id: String,
    tax_percentage: { type: Number, default: 0 },
  },
  { _id: false },
);

const allocation = new Schema(
  { pmId: { type: Schema.Types.ObjectId, ref: 'User' }, amount: Number },
  { _id: false },
);

const historyEntry = new Schema(
  {
    by: String,
    byId: Schema.Types.ObjectId,
    role: String,
    action: String, // DRAFT_SAVED | SUBMITTED | RESUBMITTED | APPROVED | REJECTED | POSTED
    comment: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

export const Bill = model(
  'Bill',
  new Schema(
    {
      pdfFile: String, // GridFS file id, nulled after Zoho upload
      fileType: { type: String, default: 'application/pdf' },
      extracted: Schema.Types.Mixed,
      vendorId: String,
      vendorName: String,
      billNumber: String,
      date: String,
      dueDate: String,
      discount_amount: { type: Number, default: 0 },
      discount_percent: { type: Number, default: 0 },
      // Location picked on the form; its state decides GST vs IGST
      location_id: { type: String, default: '' },
      location_name: { type: String, default: '' },
      source_of_supply: { type: String, default: '' },
      lineItems: [lineItem],
      // DRAFT → PENDING (stage CM/OM/FM, waiting on approverId) → POSTED, or REJECTED (stage = who rejected)
      status: { type: String, default: 'DRAFT', enum: ['DRAFT', 'PENDING', 'REJECTED', 'POSTED'] },
      stage: { type: String, enum: ['', 'CM', 'OM', 'FM'], default: '' },
      approverId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      firstStage: { type: String, default: '' }, // owner can edit until the bill moves past this stage
      createdBy: { type: Schema.Types.ObjectId, ref: 'User' }, // who uploaded (audit only)
      ownerId: { type: Schema.Types.ObjectId, ref: 'User' }, // who can edit/resubmit — moves on transfer
      // Which PMs the bill belongs to and how much each (sum = bill total)
      allocations: [allocation],
      financeOrgId: { type: Schema.Types.ObjectId, ref: 'FinanceOrg', required: true },
      history: [historyEntry],
      vendorGstin: { type: String, default: '' }, // stamped when posted to Zoho; empty = no GST
      zohoBillId: String,
      zohoError: String,
    },
    { timestamps: true },
  ),
);
