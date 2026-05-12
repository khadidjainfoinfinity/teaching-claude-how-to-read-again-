import jwt from 'jsonwebtoken';

/**
 * Protect routes that require a signed-in customer.
 *
 * Reads the Bearer token from the Authorization header,
 * verifies it, and attaches the decoded payload to req.customer.
 *
 * Usage:
 *   router.post('/protected', protect, handler);
 */
export const protect = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer '))
    return res.status(401).json({ message: 'No token provided' });

  try {
    const token   = authHeader.split(' ')[1];
    req.customer  = jwt.verify(token, process.env.JWT_SECRET || 'SECRET_KEY');
    next();
    console.log(token);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};
