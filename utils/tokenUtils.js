import jwt from 'jsonwebtoken';

/**
 * Sign a JWT for a customer.
 * Payload mirrors what dashboard/lib/auth-server.ts embeds so tokens
 * carry the same fields across both apps.
 */
export const signToken = (customer) =>
  jwt.sign(
    { id: customer._id, email: customer.email, role: customer.role },
    process.env.JWT_SECRET || 'SECRET_KEY',
    { expiresIn: '7d' }
  );

/**
 * Shape the customer object that is returned to the mobile app.
 * Keeps sensitive fields (password, OTP) out of responses.
 */
export const customerPayload = (customer) => ({
  id:                  customer._id,
  name:                customer.name,
  email:               customer.email,
  phone:               customer.numberPhone,
  role:                customer.role,
  profileImageUrl:     customer.profileImageUrl,
  lifestyles:          customer.lifestyles,
  allergies:           customer.allergies,
  shoppingCategories:  customer.shoppingCategories,
  categoriesCompleted: customer.categoriesCompleted,
});
