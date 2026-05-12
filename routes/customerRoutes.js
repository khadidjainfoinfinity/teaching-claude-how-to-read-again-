import express from 'express';
import {
  signup,
  login,
  googleSignIn,
  updatePreferences,
  updateProfile,
  forgotPassword,
  verifyOtp,
  resetPassword,
  getMyOrders,
  placeOrder,
  getMe,
} from '../controllers/customerController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// ── Public routes (no token needed) ──────────────────────────────
router.post('/signup',           signup);
router.post('/login',            login);
router.post('/google-signin',    googleSignIn);
router.post('/forgot-password',  forgotPassword);
router.post('/verify-otp',       verifyOtp);
router.post('/reset-password',   resetPassword);

// ── Protected routes (Bearer token required) ─────────────────────
router.get('/me',                  protect, getMe);
router.put('/update-profile',      protect, updateProfile);
router.post('/update-preferences', protect, updatePreferences);
router.post('/place-order',        protect, placeOrder);
router.get('/my-orders',           protect, getMyOrders);

export default router;
