import express from 'express';
import { getWalletInfo, transfer, signMessage, requestAirdrop } from '../controllers/walletController';

const router = express.Router();

// Routes
router.post('/info', getWalletInfo);
router.post('/transfer', transfer);
router.post('/sign', signMessage);
router.post('/airdrop', requestAirdrop);

export default router;