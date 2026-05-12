import mongoose from 'mongoose';

 // Order schema — mirrors dashboard/lib/models/Order.ts exactly

const orderItemSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true },
    quantity: { type: Number, required: true },
    price:    { type: Number, required: true },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    customerId:    { type: String },
    customer:      { type: String, required: true },
    date:          { type: String },
    items:         [orderItemSchema],
    total:         { type: Number, required: true },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'CIB', 'Dahabia'],
      required: true,
    },
    status: {
      type:    String,
      enum:    ['completed', 'pending', 'cancelled', 'refunded'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

export default mongoose.models?.Order ?? mongoose.model('Order', orderSchema);
