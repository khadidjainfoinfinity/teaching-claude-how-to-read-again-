import express from 'express';
import Product from '../models/Product.js';
import { enrichProductWithAI } from '../services/claudeService.js';

const router = express.Router();

// ── OpenFoodFacts integration ────────────────────────────────────────────────

const OFF_BASE = 'https://world.openfoodfacts.org/api/v0/product';

const ALLERGEN_MAP = {
  'en:gluten':          'Gluten',
  'en:wheat':           'Gluten',
  'en:milk':            'Dairy',
  'en:eggs':            'Eggs',
  'en:egg':             'Eggs',
  'en:peanuts':         'Peanuts',
  'en:peanut':          'Peanuts',
  'en:nuts':            'Tree Nuts',
  'en:tree-nuts':       'Tree Nuts',
  'en:soybeans':        'Soy',
  'en:soy':             'Soy',
  'en:fish':            'Seafood',
  'en:crustaceans':     'Seafood',
  'en:shellfish':       'Seafood',
  'en:molluscs':        'Molluscs',
  'en:mollusks':        'Molluscs',
  'en:celery':          'Celery',
  'en:mustard':         'Mustard',
  'en:sesame':          'Sesame',
  'en:sesame-seeds':    'Sesame',
  'en:lupin':           'Lupin',
  'en:sulphur-dioxide': 'Sulfites',
  'en:sulphites':       'Sulfites',
  'en:sulfites':        'Sulfites',
};

const LIFESTYLE_MAP = {
  'en:vegan':        'VEGAN',
  'en:vegetarian':   'VEGETARIAN',
  'en:pescatarian':  'PESCATARIAN',
  'en:keto':         'KETO',
  'en:ketogenic':    'KETO',
  'en:paleo':        'PALEO',
  'en:low-carb':     'LOW-CARB',
  'en:diabetic':     'DIABETIC',
  'en:high-protein': 'PROTEIN',
};

async function fetchOpenFoodFacts(barcode) {
  try {
    const res = await fetch(`${OFF_BASE}/${barcode}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.status === 1 ? data.product : null;
  } catch {
    return null;
  }
}

function parseAllergens(offProduct) {
  const tags = offProduct.allergens_tags || [];
  const found = new Set();
  for (const tag of tags) {
    const mapped = ALLERGEN_MAP[tag.toLowerCase()];
    if (mapped) found.add(mapped);
  }
  return [...found];
}

function parseSuitableFor(offProduct) {
  const tags = [
    ...(offProduct.labels_tags               || []),
    ...(offProduct.ingredients_analysis_tags || []),
  ];
  const found = new Set();
  for (const tag of tags) {
    const mapped = LIFESTYLE_MAP[tag.toLowerCase()];
    if (mapped) found.add(mapped);
  }

  // Detect DIABETIC / KETO / LOW-CARB from nutritional data
  const n       = offProduct.nutriments || {};
  const sugars  = n['sugars_100g']        ?? n['sugars']          ?? null;
  const carbs   = n['carbohydrates_100g'] ?? n['carbohydrates']   ?? null;

  if (sugars !== null && sugars < 5)  found.add('DIABETIC');
  if (carbs  !== null && carbs  < 10) { found.add('KETO'); found.add('LOW-CARB'); }

  return [...found];
}

// Default image per category — used when a product has no imageUrl
// (e.g. products created by the dashboard which has no image field)
const CATEGORY_IMAGES = {
  Groceries:   'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&q=80',
  Dairy:       'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400&q=80',
  Bakery:      'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&q=80',
  Beverages:   'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400&q=80',
  Meat:        'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=400&q=80',
  Beauty:      'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&q=80',
  Electronics: 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=400&q=80',
  Clothing:    'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=400&q=80',
  Sports:      'https://images.unsplash.com/photo-1461897104016-0b3b00cc81ee?w=400&q=80',
  Home:        'https://images.unsplash.com/photo-1484101403633-562f891dc89a?w=400&q=80',
  Other:       'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&q=80',
};

// Attach a default imageUrl when the product doesn't have one
function withDefaultImage(product) {
  const p = product.toObject ? product.toObject() : { ...product };
  if (!p.imageUrl) {
    p.imageUrl = CATEGORY_IMAGES[p.category] || CATEGORY_IMAGES.Other;
  }
  return p;
}

// ── GET /api/products ────────────────────────────────────────────
// Query params: category, search, barcode, discount=true
router.get('/', async (req, res) => {
  try {
    const { category, search, barcode, discount } = req.query;

    // { $ne: false } matches documents where isAvailable is true OR
    // where the field doesn't exist (products created by the dashboard)
    const filter = { isAvailable: { $ne: false } };

    if (barcode && barcode.trim() !== '') {
      filter.barcode = barcode.trim();
    }

    if (category && category !== 'All') {
      filter.category = category;
    }

    if (search && search.trim() !== '') {
      filter.$or = [
        { name:  { $regex: search.trim(), $options: 'i' } },
        { brand: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    if (discount === 'true') {
      filter.discount = { $gt: 0 };
    }

    const query = Product.find(filter).sort({ discount: -1, createdAt: -1 });
    if (discount === 'true') query.limit(10);

    const products = await query;

    return res.json({ products: products.map(withDefaultImage) });
  } catch (err) {
    console.error('Get products error:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/products/barcode-lookup/:barcode ────────────────────
// Preview allergens + suitableFor from OpenFoodFacts before saving
router.get('/barcode-lookup/:barcode', async (req, res) => {
  try {
    const offProduct = await fetchOpenFoodFacts(req.params.barcode);
    if (!offProduct) {
      return res.status(404).json({ message: 'Product not found on OpenFoodFacts' });
    }
    return res.json({
      allergens:   parseAllergens(offProduct),
      suitableFor: parseSuitableFor(offProduct),
      name:        offProduct.product_name || '',
      imageUrl:    offProduct.image_url    || '',
    });
  } catch (err) {
    console.error('Barcode lookup error:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/products/:id ────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    return res.json({ product: withDefaultImage(product) });
  } catch (err) {
    console.error('Get product error:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/products ───────────────────────────────────────────
// Create product (internal/manager use)
router.post('/', async (req, res) => {
  try {
    const body = { ...req.body };

    if (body.barcode && body.barcode.trim() !== '') {
      const noAllergens   = !body.allergens   || body.allergens.length   === 0;
      const noSuitableFor = !body.suitableFor || body.suitableFor.length === 0;

      if (noAllergens || noSuitableFor) {
        const offProduct = await fetchOpenFoodFacts(body.barcode.trim());
        if (offProduct) {
          if (noAllergens)   body.allergens   = parseAllergens(offProduct);
          if (noSuitableFor) body.suitableFor = parseSuitableFor(offProduct);
          console.log(`[OpenFoodFacts] ${body.barcode} → allergens: ${body.allergens}, suitableFor: ${body.suitableFor}`);
        }
      }
    }

    const product = await Product.create(body);
    return res.status(201).json({ message: 'Product created', product });
  } catch (err) {
    console.error('Create product error:', err.message);
    return res.status(400).json({ message: err.message });
  }
});

// ── POST /api/products/:id/enrich ────────────────────────────────
// Use Claude AI to fill allergens, suitableFor, and keywords
router.post('/:id/enrich', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ message: 'GEMINI_API_KEY not configured' });
    }

    const enriched = await enrichProductWithAI(product);

    const updates = {
      allergens:   enriched.allergens,
      suitableFor: enriched.suitableFor,
      keywords:    enriched.keywords,
    };

    const updated = await Product.findByIdAndUpdate(req.params.id, updates, { new: true });
    console.log(`[Claude] Enriched ${product.name} → allergens: ${updated.allergens}, suitableFor: ${updated.suitableFor}, keywords: ${updated.keywords}`);
    return res.json({ message: 'Product enriched', product: withDefaultImage(updated) });
  } catch (err) {
    console.error('Enrich error:', err.message);
    return res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/products/:id ────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new:          true,
      runValidators: true,
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    return res.json({ message: 'Product updated', product });
  } catch (err) {
    console.error('Update product error:', err.message);
    return res.status(400).json({ message: err.message });
  }
});

// ── DELETE /api/products/:id ─────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    return res.json({ message: 'Product deleted' });
  } catch (err) {
    console.error('Delete product error:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
