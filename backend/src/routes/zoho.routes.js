import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { loadOrg } from '../middleware/loadOrg.js';
import { UPLOAD_ROLES } from '../services/hierarchy.service.js';
import * as zoho from '../controllers/zoho.controller.js';

const router = Router();
router.get('/accounts', auth(...UPLOAD_ROLES), loadOrg, asyncHandler(zoho.accounts));
router.get('/contacts', auth(...UPLOAD_ROLES), loadOrg, asyncHandler(zoho.contacts));
router.get('/taxes', auth(), loadOrg, asyncHandler(zoho.taxes));
router.get('/locations', auth(), loadOrg, asyncHandler(zoho.locations));
router.post('/sync', auth('ADMIN', 'FM'), loadOrg, asyncHandler(zoho.sync));
export default router;
