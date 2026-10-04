import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as admin from '../controllers/admin.controller.js';

const router = Router();
router.use(auth('ADMIN'));
router.get('/users', asyncHandler(admin.listUsers));
router.post('/users', asyncHandler(admin.createUser));
router.patch('/users/:id', asyncHandler(admin.updateUser));
router.post('/users/:id/transfer', asyncHandler(admin.transferUser));
router.delete('/users/:id', asyncHandler(admin.deleteUser));
export default router;
