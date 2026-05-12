import express    from 'express';
import Feedback   from '../models/Feedback.js';
import Product    from '../models/Product.js';
import Customer   from '../models/Customer.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// ── GET /api/feedback/:productId ─────────────────────────────────
// Public — returns all feedback for a product
router.get('/:productId', async (req, res) => {
  try {
    const items = await Feedback.find({ productId: req.params.productId })
      .sort({ createdAt: -1 });
    return res.json({ feedback: items });
  } catch (err) {
    console.error('Get feedback error:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/feedback/:productId ────────────────────────────────
// Protected — submit or update feedback (upsert per user per product)
router.post('/:productId', protect, async (req, res) => {
  try {
    const { rating, text } = req.body;

    if (!rating || rating < 1 || rating > 5)
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    if (!text || !text.trim())
      return res.status(400).json({ message: 'Comment text is required' });

    const customer = await Customer.findById(req.customer.id).select('name');
    const userName = customer?.name || 'Anonyme';

    const fb = await Feedback.findOneAndUpdate(
      { productId: req.params.productId, userId: req.customer.id },
      { rating, text: text.trim(), userName },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // Recalculate and persist avgRating + ratingsCount on the product
    const [agg] = await Feedback.aggregate([
      { $match: { productId: fb.productId } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    if (agg) {
      await Product.findByIdAndUpdate(req.params.productId, {
        avgRating:    Math.round(agg.avg * 10) / 10,
        ratingsCount: agg.count,
      });
    }

    return res.status(201).json({ feedback: fb });
  } catch (err) {
    console.error('Submit feedback error:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ── DELETE /api/feedback/:feedbackId ─────────────────────────────
// Protected — only the author can delete their own review
router.delete('/:feedbackId', protect, async (req, res) => {
  try {
    const fb = await Feedback.findById(req.params.feedbackId);
    if (!fb) return res.status(404).json({ message: 'Review not found' });

    if (fb.userId.toString() !== req.customer.id.toString())
      return res.status(403).json({ message: 'Not allowed to delete this review' });

    await fb.deleteOne();

    // Recalculate avgRating + ratingsCount after deletion
    const [agg] = await Feedback.aggregate([
      { $match: { productId: fb.productId } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    await Product.findByIdAndUpdate(fb.productId, {
      avgRating:    agg ? Math.round(agg.avg * 10) / 10 : 0,
      ratingsCount: agg ? agg.count : 0,
    });

    return res.json({ message: 'Review deleted' });
  } catch (err) {
    console.error('Delete feedback error:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
