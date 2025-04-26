import express from 'express';
import { sponsorTransaction, prepareFeeTransaction } from "../controllers/sponsorshipController";

const router = express.Router();

router.post('/sponsor-transaction', sponsorTransaction);
router.post('/prepare-transaction', prepareFeeTransaction);

export default router;