import mongoose from 'mongoose';

/**
 * Website (manager) : full access — all fields below.
 * Mobile app (client): name · category · price · stock · expiry · aisle · barcode
                       + imageUrl · brand · allergens · suitableFor (recommender)
 */
const productSchema = new mongoose.Schema(
  {
    // ── Identity ─────────────────────────────────── web + mobile ──
    name: {
      type:      String,
      required:  [true, 'Product name is required'],
      trim:      true,
      maxLength: [100, 'Name cannot exceed 100 characters'],
    },

    brand: {
      type:    String,           
      trim:    true,
      default: '',
    },

    description: {
      type:    String,           
      trim:    true,
      default: '',
    },

    category: {
      type:     String,
      required: [true, 'Category is required'],
      enum: [
        'Groceries', 'Dairy', 'Bakery', 'Beverages', 'Meat',
        'Beauty', 'Electronics', 'Clothing', 'Sports', 'Home', 'Other',
      ],
      default: 'Other',
    },

    price: {
      type:     Number,
      required: [true, 'Price is required'],
      min:      [0, 'Price cannot be negative'],
    },

    unit: {
      type:    String,          // e.g. "kg", "piece", "L" 
      default: '',
      trim:    true,
    },

    stock: {
      type:     Number,
      required: true,
      default:  0,
      min:      [0, 'Stock cannot be negative'],
    },

    status: {
      type:    String,
      enum:    ['active', 'low-stock', 'out-of-stock', 'expiring-soon'],
      default: 'active',
    },

    expiry: {
      type: String,             // "2025-12-31"
    },

    aisle: {
      type:    String,         
      default: '',
      trim:    true,
    },

    barcode: {
      type:    String,          
      default: '',
      trim:    true,
    },

    imageUrl: {
      type:    String,          
      default: '',
    },

    allergens: {
      type:    [String],        
      default: [],
    },

    suitableFor: {
      type:    [String],        // l programme t3 makla li luser selectionna f preferences
      default: [],
    },

    keywords: {
      type:    [String],
      default: [],
    },

    discount: {
      type:    Number,
      default: 0,
      min:     0,
      max:     100,             // percentage, e.g. 20 = 20% off
    },

    isAvailable: {
      type:    Boolean,
      default: true,
    },

    avgRating: {
      type:    Number,
      default: 0,
      min:     0,
      max:     5,
    },

    ratingsCount: {
      type:    Number,
      default: 0,
    },
  },
  {
    timestamps: true,           // createdAt · updatedAt
  }
);

productSchema.index({ name: 'text', brand: 'text', description: 'text' });

export default mongoose.models?.Product || mongoose.model('Product', productSchema);
