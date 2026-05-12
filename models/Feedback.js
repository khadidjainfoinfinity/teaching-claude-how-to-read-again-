import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema(
  {
    productId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Product',
      required: true,
      index:    true,
    },
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Customer',
      required: true,
    },
    userName: {
      type:    String,
      default: 'Anonyme',
    },
    rating: {
      type:     Number,
      required: true,
      min:      1,
      max:      5,
    },
    text: {
      type:      String,
      required:  true,
      maxLength: 300,
      trim:      true,
    },
  },
  { timestamps: true }
);

// One review per user per product
feedbackSchema.index({ productId: 1, userId: 1 }, { unique: true });

export default mongoose.models?.Feedback || mongoose.model('Feedback', feedbackSchema);
