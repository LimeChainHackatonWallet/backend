import express from 'express';
import { getWalletHealth } from '../controllers/walletController';

const router = express.Router();

router.get('/health', getWalletHealth);

export default router;