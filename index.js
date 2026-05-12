import express             from 'express';
import cors               from 'cors';
import dotenv             from 'dotenv';
import connectDB          from './config/db.js';
import customerRoutes     from './routes/customerRoutes.js';
import productRoutes      from './routes/productRoutes.js';
import recommendRoute     from './routes/recommend.js';
import feedbackRoutes     from './routes/feedbackRoutes.js';
import { chargilyWebhook } from './controllers/customerController.js';

import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');

dotenv.config();
connectDB();

const app = express();

// ── CORS ──────────────────────────────────────────────────────────
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }));

// ── Chargily webhook — raw body MUST come before express.json() ──
// express.raw() preserves the raw Buffer so we can verify the
// HMAC-SHA256 signature that Chargily sends in the Signature header.
app.post(
  '/api/webhook/chargily',
  express.raw({ type: 'application/json' }),
  chargilyWebhook,
);

// ── JSON middleware for all other routes ──────────────────────────
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────
app.get('/', (_req, res) => res.json({ service: 'NovaShop API', status: 'running' }));

// ── Customer routes (mobile app) ──────────────────────────────────
// POST /api/signup
// POST /api/login
// POST /api/forgot-password
// POST /api/verify-otp
// POST /api/reset-password
// POST /api/update-preferences  (protected)
app.use('/api', customerRoutes);

// ── Product routes ────────────────────────────────────────────────
// GET  /api/products
// GET  /api/products/:id
// POST /api/products
// PUT  /api/products/:id
// DELETE /api/products/:id
app.use('/api/products', productRoutes);

// ── Recommendation routes ─────────────────────────────────────────
// GET  /api/recommendations        (protected)
// POST /api/recommendations/purchase (protected)
app.use("/api/recommendations", recommendRoute);

// ── Feedback routes ───────────────────────────────────────────────
// GET  /api/feedback/:productId    (public)
// POST /api/feedback/:productId    (protected)
app.use('/api/feedback', feedbackRoutes);

// ── Start server ──────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 NovaShop API running on port ${PORT}`));
