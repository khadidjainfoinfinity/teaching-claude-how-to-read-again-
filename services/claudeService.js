const VALID_ALLERGENS = [
  'Gluten', 'Dairy', 'Eggs', 'Peanuts', 'Tree Nuts',
  'Soy', 'Seafood', 'Molluscs', 'Celery', 'Mustard',
  'Sesame', 'Lupin', 'Sulfites',
];

const VALID_SUITABLE_FOR = [
  'VEGAN', 'VEGETARIAN', 'PESCATARIAN',
  'KETO', 'PALEO', 'LOW-CARB', 'DIABETIC', 'PROTEIN',
];

const FOOD_CATEGORIES = new Set(['Groceries', 'Dairy', 'Bakery', 'Beverages', 'Meat']);

async function callGroq(apiKey, prompt) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 512,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Groq API error ${res.status}: ${data?.error?.message ?? JSON.stringify(data)}`);
  }
  return data.choices?.[0]?.message?.content ?? '';
}

export async function enrichProductWithAI(product) {
  const apiKey = process.env.GROQ_API_KEY;
  const isFood = FOOD_CATEGORIES.has(product.category);

  const prompt = `You are a product data expert. Analyze this product and return structured JSON.

Product:
- Name: ${product.name}
- Brand: ${product.brand || 'N/A'}
- Category: ${product.category}
- Description: ${product.description || 'N/A'}
- Barcode: ${product.barcode || 'N/A'}

${isFood
  ? `For this food product, you MUST fill:
1. allergens: list every likely allergen from [${VALID_ALLERGENS.join(', ')}] based on the product name, brand, and category. Be inclusive — if in doubt, add it. Example: bread → Gluten; cheese → Dairy; cookies → Gluten, Eggs, Dairy.
2. suitableFor: list every applicable diet from [${VALID_SUITABLE_FOR.join(', ')}]. Example: olive oil → VEGAN, VEGETARIAN, KETO, PALEO, LOW-CARB.`
  : `This is a non-food product — set allergens and suitableFor to [].`}
3. keywords: 6-10 relevant search terms in the product's language.

Reply ONLY with raw JSON — no prose, no markdown code fences:
{"allergens":[],"suitableFor":[],"keywords":[]}`;

  const text = await callGroq(apiKey, prompt);

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Unexpected AI response format');

  const json = JSON.parse(match[0]);

  return {
    allergens:   (json.allergens   || []).filter(a => VALID_ALLERGENS.includes(a)),
    suitableFor: (json.suitableFor || []).filter(s => VALID_SUITABLE_FOR.includes(s)),
    keywords:    (json.keywords    || []).map(k => String(k).trim()).filter(Boolean).slice(0, 10),
  };
}
