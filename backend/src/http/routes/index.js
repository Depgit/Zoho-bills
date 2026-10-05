import { Router } from 'express';
import { health } from '../controllers/health.controller.js';
import authRoutes from './auth.routes.js';
import adminRoutes from './admin.routes.js';
import billRoutes from './bills.routes.js';
import zohoRoutes from './zoho.routes.js';

const router = Router();
router.get('/health', health);
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/bills', billRoutes);
router.use('/zoho', zohoRoutes);
export default router;
