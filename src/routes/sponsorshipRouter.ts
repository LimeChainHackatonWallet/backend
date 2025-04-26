import express from 'express';
import { sponsorTransaction } from "../controllers/sponsorshipController";

const router = express.Router();

router.post('/sponsor-transaction', sponsorTransaction);

export default router;