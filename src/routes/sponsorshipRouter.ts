import express from 'express';
import { sponsorTransaction, prepareFeeTransaction, getCurrentFeeRates } from "../controllers/sponsorshipController";

const router = express.Router();

router.post('/sponsor-transaction', sponsorTransaction);
router.post('/prepare-transaction', prepareFeeTransaction);
router.get('/fee-rates', getCurrentFeeRates);

export default router;