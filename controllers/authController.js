/**
 * Staff authentication is handled exclusively by the dashboard (Next.js).
 *
 * Dashboard endpoints:
 *   POST /api/auth/signup  → creates a user in the 'users' collection
 *   POST /api/auth/login   → authenticates from the 'users' collection
 *
 * This backend serves the MOBILE app only.
 * Mobile customer auth lives in controllers/customerController.js.
 */
