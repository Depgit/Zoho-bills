// POST /bills/extract — store the uploaded file and read the invoice
import { extractUpload } from '../../services/extraction/upload.js';

export const extractBill = async (req, res) => res.json(await extractUpload(req.user.financeOrgId, req.file, req.body.pages));
