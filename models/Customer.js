import mongoose from 'mongoose';
import bcrypt   from 'bcryptjs';

const customerSchema = new mongoose.Schema(
  {
    name: {
      type:     String,
      required: [true, 'Name is required'],
      trim:     true,
    },

    email: {
      type:      String,
      required:  [true, 'Email is required'],
      unique:    true,
      lowercase: true,
      trim:      true,
    },

    numberPhone: {
      type:   String,
      unique: true,
      sparse: true,
      trim:   true,
    },

    password: {
      type:   String,
      select: false,  
    },

    role: {
      type:    String,
      default: 'client',
    },

    profileImageUrl: {
      type:    String,
      default: '',
    },

    // hadi lclient y3mrha ki yselectionner lifestyles f debut t3 l'App
    lifestyles: {
      type:    [String],
      default: [],
    },

    allergies: {
      type:    [String],
      default: [],
    },

    shoppingCategories: {
      type:    [String],
      default: [],
    },

    categoriesCompleted: {
      type:    Boolean,
      default: false,
    },

    //  Purchase history 
    purchasedProducts: {
      type: [
        {
          productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
          count:     { type: Number, default: 1 },
        },
      ],
      default: [],
    },

    //  Dashboard analytics 
    totalOrders: { type: Number,  default: 0 },
    totalSpent:  { type: Number,  default: 0 },
    address:     { type: String,  default: '' }, // hadi mb3da n7ouha meme f dashaboard

    //  Password-reset OTP 
    otpCode:    { type: String, select: false },
    otpExpires: { type: Date,   select: false },
  },
  {
    timestamps: true,  // createdAt · updatedAt
  }
);

// Hash password before save
customerSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  const salt    = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

customerSchema.methods.matchPassword = async function (entered) {
  if (!this.password) return false;
  if (this.password.startsWith('$2')) return bcrypt.compare(entered, this.password);
  return this.password === entered;
};


export default mongoose.models?.Customer ?? mongoose.model('Customer', customerSchema);
