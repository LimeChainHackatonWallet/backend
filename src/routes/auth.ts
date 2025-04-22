import express from 'express';
import { register, verifyRegistration, login, verifyAuthentication } from '../controllers/authController';

const router = express.Router();

// Routes
router.post('/register', register);
router.post('/register/verify', verifyRegistration);
router.post('/login', login);
router.post('/login/verify', verifyAuthentication);

export default router;