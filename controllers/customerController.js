import crypto               from 'crypto';
import mongoose             from 'mongoose';
import Customer             from '../models/Customer.js';
import Order                from '../models/Order.js';
import { signToken, customerPayload } from '../utils/tokenUtils.js';
import { sendOtpEmail }    from '../services/emailService.js';
import { sendOtpWhatsApp } from '../services/whatsappService.js';
import { OAuth2Client }    from 'google-auth-library';

const isEmail = (v) => /\S+@\S+\.\S+/.test(v);
const isPhone = (v) => /^(05|06|07)[0-9]{8}$/.test(v);

// ── Hadi for SIGN UP  POST /api/signup ────────────────────────────────────
// Body: { name, email, password, numberPhone }
export const signup = async (req, res) => {
  const { name, email, password, numberPhone } = req.body;

  if (!name || !email || !password || !numberPhone)
    return res.status(400).json({ message: 'All fields are required' });

  try {
    const byEmail = await Customer.findOne({ email: email.toLowerCase().trim() });
    if (byEmail)
      return res.status(400).json({ message: 'Email already registered' });

    const byPhone = await Customer.findOne({ numberPhone: numberPhone.trim() });
    if (byPhone)
      return res.status(400).json({ message: 'Phone number already registered' });

    const customer = await Customer.create({
      name:        name.trim(),
      email:       email.toLowerCase().trim(),
      password,
      numberPhone: numberPhone.trim(),
      role:        'client',
    });

    return res.status(201).json({
      message: 'Account created successfully',
      token:   signToken(customer),
      user:    customerPayload(customer),
    });
  } catch (err) {
    console.error('Signup error:', err.message);
    return res.status(500).json({ message: err.message });
  }
};


// ── Hadi forLOGIN  POST /api/login ───────────────────────────────────────
// Body: { loginInput (email or phone), password }
export const login = async (req, res) => {
  const { loginInput, password } = req.body;

  if (!loginInput || !password)
    return res.status(400).json({ message: 'loginInput and password are required' });

  try {
    const input = loginInput.trim();
    const query = input.includes('@')
      ? { email: input.toLowerCase() }
      : { $or: [{ numberPhone: input }, { phone: input }] };

    const customer = await Customer.findOne(query).select('+password');

    if (!customer)
      return res.status(400).json({ message: 'User not found' });

    if (!customer.password)
      return res.status(400).json({ message: 'This account has no password. Please sign up via the mobile app.' });

    const matched = await customer.matchPassword(password);
    if (!matched)
      return res.status(400).json({ message: 'Wrong password' });

    return res.json({
      message: 'Login successful',
      token:   signToken(customer),
      user:    customerPayload(customer),
    });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
};


// ── UPDATE PREFERENCES  POST /api/update-preferences ────────────
// Protected — requires Bearer token (req.customer set by middleware)
// Body: { lifestyles, allergies, shoppingCategories }
export const updatePreferences = async (req, res) => {
  try {
    const { lifestyles = [], allergies = [], shoppingCategories = [] } = req.body;

    const customer = await Customer.findByIdAndUpdate(
      req.customer.id,
      { lifestyles, allergies, shoppingCategories, categoriesCompleted: true },
      { new: true }
    );

    if (!customer)
      return res.status(404).json({ message: 'Customer not found' });

    return res.json({
      message: 'Preferences updated successfully',
      user:    customerPayload(customer),
    });
  } catch (err) {
    console.error('Update preferences error:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
};


// ── Hadi forFORGOT PASSWORD  POST /api/forgot-password ──────────────────
// Body: { loginInput (email or phone), method? ('whatsapp' | 'email') }
export const forgotPassword = async (req, res) => {
  const { loginInput, method } = req.body;

  if (!loginInput)
    return res.status(400).json({ message: 'Email or phone required' });

  try {
    let customer;
    if (isEmail(loginInput))
      customer = await Customer.findOne({ email: loginInput.toLowerCase().trim() });
    else if (isPhone(loginInput))
      customer = await Customer.findOne({ numberPhone: loginInput.trim() });
    else
      return res.status(400).json({ message: 'Invalid format' });

    if (!customer)
      return res.status(404).json({ message: 'Account not found' });

    const otp = Math.floor(100_000 + Math.random() * 900_000).toString();
    customer.otpCode    = otp;
    customer.otpExpires = Date.now() + 5 * 60 * 1000;
    await customer.save();

    console.log(`[OTP] Generated for ${loginInput}: ${otp}`);

    if (isEmail(loginInput)) {
      try {
        await sendOtpEmail(customer.email, otp);
        console.log('✅ OTP email sent to:', customer.email);
      } catch (mailErr) {
        console.error('❌ Email error:', mailErr.message);
        return res.status(500).json({ message: 'Failed to send OTP email' });
      }
    } else if (isPhone(loginInput)) {
      if (method === 'email') {
        try {
          await sendOtpEmail(customer.email, otp);
          console.log('✅ OTP email sent to:', customer.email);
        } catch (mailErr) {
          console.error('❌ Email error:', mailErr.message);
          return res.status(500).json({ message: 'Failed to send OTP email' });
        }
      } else {
        try {
          await sendOtpWhatsApp(loginInput.trim(), otp);
          console.log('✅ OTP WhatsApp sent to:', loginInput);
        } catch (waErr) {
          console.error('❌ WhatsApp error:', waErr.message);
          return res.status(500).json({ message: 'Failed to send OTP via WhatsApp' });
        }
      }
    }

    return res.json({ message: 'OTP sent successfully' });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
};


// ── Hadi for VERIFY OTP  POST /api/verify-otp ────────────────────────────
// Body: { loginInput, otp }
export const verifyOtp = async (req, res) => {
  const { loginInput, otp } = req.body;

  if (!loginInput || !otp)
    return res.status(400).json({ message: 'loginInput and otp are required' });

  try {
    const query = isEmail(loginInput)
      ? { email:       loginInput.toLowerCase().trim() }
      : { numberPhone: loginInput.trim() };

    const customer = await Customer.findOne(query).select('+otpCode +otpExpires');

    if (!customer || customer.otpCode !== otp)
      return res.status(400).json({ message: 'Invalid OTP' });

    if (customer.otpExpires < Date.now())
      return res.status(400).json({ message: 'OTP expired' });

    return res.json({ message: 'OTP valid' });
  } catch (err) {
    console.error('Verify OTP error:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
};


// ── Hadi forRESET PASSWORD  POST /api/reset-password ────────────────────
// Body: { loginInput, newPassword }
export const resetPassword = async (req, res) => {
  const { loginInput, newPassword } = req.body;

  if (!newPassword || newPassword.length < 6)
    return res.status(400).json({ message: 'Password must be at least 6 characters' });

  try {
    const query = isEmail(loginInput)
      ? { email:       loginInput.toLowerCase().trim() }
      : { numberPhone: loginInput.trim() };

    const customer = await Customer.findOne(query).select('+password +otpCode +otpExpires');

    if (!customer)
      return res.status(400).json({ message: 'Account not found' });

    customer.password   = newPassword;
    customer.otpCode    = undefined;
    customer.otpExpires = undefined;
    await customer.save();

    return res.json({ message: 'Password reset successful' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
};


// ── PLACE ORDER  POST /api/place-order ──────────────────────────
// Protected — requires Bearer token
// Body: { items: [{name, quantity, price}], total, paymentMethod }
export const placeOrder = async (req, res) => {
  try {
    const { items, total, paymentMethod } = req.body;

    if (!items?.length || !total || !paymentMethod)
      return res.status(400).json({ message: 'items, total and paymentMethod are required' });

    const customer = await Customer.findById(req.customer.id);
    if (!customer)
      return res.status(404).json({ message: 'Customer not found' });

    const today = new Date().toISOString().split('T')[0];

    const order = await Order.create({
      customerId:    req.customer.id,
      customer:      customer.name,
      date:          today,
      items,
      total,
      paymentMethod,
      // Always start as pending.
      // Cash orders: admin marks completed on delivery.
      // Electronic orders (Dahabia/CIB): the Chargily webhook sets 'completed'.
      status: 'pending',
    });

    await Customer.findByIdAndUpdate(req.customer.id, {
      $inc: { totalOrders: 1, totalSpent: total },
    });

    return res.status(201).json({ message: 'Order placed successfully', order });
  } catch (err) {
    console.error('Place order error:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
};


// ── MY ORDERS  GET /api/my-orders ────────────────────────────────
// Protected — requires Bearer token (req.customer set by middleware)
// Returns all orders belonging to the authenticated customer,
// sorted newest first.
export const getMyOrders = async (req, res) => {
  try {
    const id = req.customer.id;

    // Some orders may have customerId stored as ObjectId (inserted outside Mongoose),
    // others as a plain string — match both forms so no records are missed.
    const customerIdQuery = mongoose.isValidObjectId(id)
      ? { $in: [id, new mongoose.Types.ObjectId(id)] }
      : id;

    const orders = await Order.find({ customerId: customerIdQuery })
      .sort({ createdAt: -1 });

    return res.json({ orders });
  } catch (err) {
    console.error('Get my orders error:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
};


// ── GET MY PROFILE  GET /api/me ──────────────────────────────────
// Protected — returns allergies, lifestyles, shoppingCategories for the app
export const getMe = async (req, res) => {
  try {
    const customer = await Customer.findById(req.customer.id);
    if (!customer) return res.status(404).json({ message: 'User not found' });
    return res.json({ user: customerPayload(customer) });
  } catch (err) {
    console.error('Get me error:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
};


// ── CHARGILY WEBHOOK  POST /api/webhook/chargily ─────────────────
// Called by Chargily Pay after every checkout event.
// This route receives a raw Buffer (registered with express.raw in index.js)
// so we can verify the HMAC-SHA256 signature before trusting the payload.
//
// Chargily Signature header format:  t=<unix_ts>,v1=<hex_hmac>
// where the HMAC is computed as:     HMAC-SHA256("<t>.<rawBody>", secretKey)
//
// Set CHARGILY_SECRET_KEY in your .env file.
export const chargilyWebhook = async (req, res) => {
  const secret = process.env.CHARGILY_SECRET_KEY;

  // ── 1. Guard: secret must be configured ──────────────────────────
  if (!secret) {
    console.error('[Chargily] CHARGILY_SECRET_KEY is not set in .env');
    return res.status(500).json({ message: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : JSON.stringify(req.body);

  // ── 2. Verify Chargily signature ──────────────────────────────────
  const sigHeader = req.headers['signature'] ?? '';

  const sigParts = Object.fromEntries(
    sigHeader.split(',').map((part) => {
      const idx = part.indexOf('=');
      return [part.substring(0, idx), part.substring(idx + 1)];
    }),
  );

  const timestamp    = sigParts['t'];
  const receivedHash = sigParts['v1'];

  if (!timestamp || !receivedHash) {
    console.warn('[Chargily] Missing or malformed Signature header');
    return res.status(400).json({ message: 'Invalid signature format' });
  }

  // Reject webhooks older than 5 minutes (replay attack protection)
  const ageSeconds = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
  if (ageSeconds > 300) {
    console.warn(`[Chargily] Stale webhook: ${ageSeconds}s old`);
    return res.status(400).json({ message: 'Webhook timestamp too old' });
  }

  const expectedHash = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  // timingSafeEqual requires equal-length buffers
  if (
    expectedHash.length !== receivedHash.length ||
    !crypto.timingSafeEqual(
      Buffer.from(expectedHash),
      Buffer.from(receivedHash),
    )
  ) {
    console.warn('[Chargily] Signature mismatch — request rejected');
    return res.status(403).json({ message: 'Signature verification failed' });
  }

  // ── 3. Parse event ────────────────────────────────────────────────
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ message: 'Invalid JSON body' });
  }

  const { type, data } = event;
  console.log(`[Chargily] Event: ${type}`);

  // ── 4. checkout.paid → mark order completed ───────────────────────
  if (type === 'checkout.paid') {
    const orderId = data?.metadata?.order_id;

    if (!orderId) {
      console.warn('[Chargily] checkout.paid — no order_id in metadata, skipping');
      return res.status(200).json({ received: true, action: 'skipped' });
    }

    try {
      const updated = await Order.findByIdAndUpdate(
        orderId,
        { status: 'completed' },
        { new: true },
      );

      if (!updated) {
        console.warn(`[Chargily] Order not found: ${orderId}`);
      } else {
        console.log(`[Chargily] ✅ Order ${orderId} → completed`);
      }
    } catch (err) {
      console.error('[Chargily] DB error:', err.message);
      return res.status(500).json({ message: 'Database error' });
    }
  }

  // ── 5. checkout.failed → mark order cancelled ─────────────────────
  if (type === 'checkout.failed') {
    const orderId = data?.metadata?.order_id;
    if (orderId) {
      await Order.findByIdAndUpdate(orderId, { status: 'cancelled' }).catch(
        (e) => console.error('[Chargily] Failed to cancel order:', e.message),
      );
      console.log(`[Chargily] ❌ Order ${orderId} → cancelled (payment failed)`);
    }
  }

  return res.status(200).json({ received: true });
};


// ── UPDATE PROFILE  PUT /api/update-profile ─────────────────────
// Protected — requires Bearer token
// Body: { name?, email?, numberPhone? }
export const updateProfile = async (req, res) => {
  try {
    const { name, email, numberPhone } = req.body;

    const updates = {};
    if (name)        updates.name        = name.trim();
    if (email)       updates.email       = email.toLowerCase().trim();
    if (numberPhone) updates.numberPhone = numberPhone.trim();

    if (Object.keys(updates).length === 0)
      return res.status(400).json({ message: 'Nothing to update' });

    if (updates.email) {
      const existing = await Customer.findOne({
        email: updates.email,
        _id:   { $ne: req.customer.id },
      });
      if (existing)
        return res.status(400).json({ message: 'Email already in use' });
    }

    if (updates.numberPhone) {
      const existing = await Customer.findOne({
        numberPhone: updates.numberPhone,
        _id:         { $ne: req.customer.id },
      });
      if (existing)
        return res.status(400).json({ message: 'Phone number already in use' });
    }

    const customer = await Customer.findByIdAndUpdate(
      req.customer.id,
      updates,
      { new: true }
    );

    if (!customer)
      return res.status(404).json({ message: 'Customer not found' });

    return res.json({
      message: 'Profile updated successfully',
      user:    customerPayload(customer),
    });
  } catch (err) {
    console.error('Update profile error:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
};


// ── GOOGLE SIGN-IN  POST /api/google-signin ──────────────────────
// Body: { idToken }  — the Google ID token from the Flutter app
export const googleSignIn = async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ message: 'idToken required' });

  try {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const { email, name } = ticket.getPayload();

    // Find existing customer or create a new one (no phone/password for Google users)
    let customer = await Customer.findOne({ email: email.toLowerCase() });
    if (!customer) {
      customer = await Customer.create({
        name,
        email: email.toLowerCase(),
        role: 'client',
      });
    }

    return res.json({
      message: 'Login successful',
      token:   signToken(customer),
      user:    customerPayload(customer),
    });
  } catch (err) {
    console.error('Google sign-in error:', err.message);
    return res.status(401).json({ message: 'Invalid Google token' });
  }
};
