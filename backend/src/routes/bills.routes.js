import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { uploadBillFile } from '../middleware/upload.js';
import { UPLOAD_ROLES } from '../services/hierarchy.service.js';
import { extractBill } from '../controllers/extract.controller.js';
import * as bills from '../controllers/bills.controller.js';
import { getVendorAccounts, saveVendorAccount } from '../controllers/vendorAccounts.controller.js';

const uploaders = auth(...UPLOAD_ROLES);
const router = Router();

router.post('/extract', uploaders, uploadBillFile, asyncHandler(extractBill));
router.get('/assignable-pms', uploaders, asyncHandler(bills.listAssignablePms));
router.get('/team', auth('CM', 'OM', 'FM', 'ADMIN'), asyncHandler(bills.listTeam));
router.get('/vendor-account-map', uploaders, asyncHandler(getVendorAccounts));
router.post('/vendor-account-map', uploaders, asyncHandler(saveVendorAccount));

router.get('/', auth(), asyncHandler(bills.listBills));
router.post('/', uploaders, asyncHandler(bills.createBill));
router.put('/:id', uploaders, asyncHandler(bills.updateBill));
router.delete('/:id', auth(), asyncHandler(bills.deleteBill));
router.get('/:id/pdf', auth(), asyncHandler(bills.billFile));
router.post('/:id/:act(approve|reject)', auth('CM', 'OM', 'FM', 'ADMIN'), asyncHandler(bills.decide));
export default router;
