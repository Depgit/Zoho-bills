import mongoose from 'mongoose';

const { Schema } = mongoose;

// One row per extraction: what the AI read vs what was finally submitted (services/learning)
const schema = new Schema({
  financeOrgId: { type: Schema.Types.ObjectId, required: true },
  fileId: { type: String, required: true }, // = Bill.pdfFile (GridFS id)
  vendorGstin: { type: String, default: '' },
  provider: String,
  ocrText: String,
  aiOutput: Object,
  finalOutput: Object, // set when the bill is submitted
  corrections: { type: Object, default: {} }, // { field: { from, to } }
  hasCorrections: { type: Boolean, default: false },
  submitted: { type: Boolean, default: false }, // true once submitted (stops the TTL below)
  createdAt: { type: Date, default: Date.now },
});
schema.index({ financeOrgId: 1, fileId: 1 }, { unique: true });
schema.index({ financeOrgId: 1, vendorGstin: 1, createdAt: -1 });
// Extractions that never got submitted are auto-deleted after 30 days
// ($exists:false isn't allowed in partial indexes, hence the `submitted` flag)
schema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 3600, partialFilterExpression: { submitted: false } },
);

export const ExtractionLog = mongoose.models.ExtractionLog || mongoose.model('ExtractionLog', schema);
