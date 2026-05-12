"""
ML-based suitableFor predictor.
Uses TF-IDF + MultiOutputClassifier(LogisticRegression).
Trains on a seed dataset; auto-trains on first import if no saved model exists.
"""

import os
import pickle
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.multioutput import MultiOutputClassifier
from sklearn.preprocessing import MultiLabelBinarizer

MODEL_PATH = os.path.join(os.path.dirname(__file__), "safety_model.pkl")

LIFESTYLES = ["VEGAN", "VEGETARIAN", "PESCATARIAN", "KETO",
              "LOW-CARB", "PALEO", "DIABETIC", "PROTEIN"]

# ── Seed dataset ──────────────────────────────────────────────────────────────
SEED: list[tuple[str, list[str]]] = [
    # VEGAN
    ("tofu soy protein plant-based vegan",                      ["VEGAN","VEGETARIAN","PROTEIN"]),
    ("almond milk dairy-free plant beverage",                   ["VEGAN","VEGETARIAN"]),
    ("chickpea lentil legume plant protein",                    ["VEGAN","VEGETARIAN","PROTEIN"]),
    ("oat oatmeal porridge whole grain cereals",                ["VEGAN","VEGETARIAN","LOW-CARB"]),
    ("quinoa grain superfood complete protein",                 ["VEGAN","VEGETARIAN","PROTEIN","PALEO"]),
    ("tempeh fermented soy vegan protein",                      ["VEGAN","VEGETARIAN","PROTEIN"]),
    ("coconut oil vegan fat cooking",                           ["VEGAN","VEGETARIAN","KETO","PALEO"]),
    ("spinach kale leafy greens vegetable",                     ["VEGAN","VEGETARIAN","DIABETIC","PALEO"]),
    ("avocado healthy fat plant",                               ["VEGAN","VEGETARIAN","KETO","PALEO"]),
    ("dark chocolate 85% cacao vegan",                          ["VEGAN","VEGETARIAN"]),

    # VEGETARIAN (not vegan)
    ("greek yogurt probiotic dairy",                            ["VEGETARIAN","PROTEIN","DIABETIC"]),
    ("cheese mozzarella dairy milk",                            ["VEGETARIAN"]),
    ("egg protein dairy vegetarian",                            ["VEGETARIAN","PROTEIN"]),
    ("butter ghee dairy fat cooking",                           ["VEGETARIAN","KETO","PALEO"]),
    ("honey natural sweetener",                                 ["VEGETARIAN"]),
    ("milk whole dairy calcium",                                ["VEGETARIAN"]),
    ("cream cheese soft dairy",                                 ["VEGETARIAN","KETO"]),

    # PESCATARIAN
    ("salmon fish omega-3 seafood",                             ["PESCATARIAN","PROTEIN","PALEO","DIABETIC"]),
    ("tuna canned fish protein",                                ["PESCATARIAN","PROTEIN","DIABETIC"]),
    ("shrimp prawn seafood protein",                            ["PESCATARIAN","PROTEIN","PALEO"]),
    ("sardine mackerel oily fish",                              ["PESCATARIAN","PROTEIN","PALEO"]),
    ("tilapia white fish lean protein",                         ["PESCATARIAN","PROTEIN","DIABETIC"]),
    ("cod halibut white fish",                                  ["PESCATARIAN","PROTEIN","DIABETIC"]),

    # KETO
    ("bacon pork fat low carb keto",                            ["KETO","PALEO"]),
    ("almond flour low carb baking keto",                       ["KETO","DIABETIC"]),
    ("heavy cream whipping cream fat keto",                     ["KETO"]),
    ("macadamia nuts fat low carb",                             ["KETO","VEGAN","VEGETARIAN"]),
    ("beef jerky high protein low carb",                        ["KETO","PALEO","PROTEIN"]),
    ("cream cheese keto fat",                                   ["KETO"]),
    ("pork rinds snack keto low carb",                          ["KETO","PALEO"]),
    ("cauliflower low carb vegetable substitute",               ["KETO","VEGAN","VEGETARIAN","DIABETIC"]),

    # LOW-CARB / DIABETIC
    ("stevia sweetener zero sugar diabetic",                    ["DIABETIC","KETO","LOW-CARB","VEGAN","VEGETARIAN"]),
    ("erythritol sugar substitute diabetic",                    ["DIABETIC","KETO","LOW-CARB"]),
    ("whole wheat bread fiber low glycemic",                    ["DIABETIC","VEGETARIAN"]),
    ("brown rice whole grain low glycemic",                     ["DIABETIC","VEGAN","VEGETARIAN"]),
    ("broccoli low carb fiber vegetable",                       ["DIABETIC","VEGAN","VEGETARIAN","KETO","LOW-CARB"]),
    ("blueberry low sugar antioxidant fruit",                   ["DIABETIC","VEGAN","VEGETARIAN"]),
    ("chia seeds fiber low carb omega-3",                       ["DIABETIC","VEGAN","VEGETARIAN","KETO","LOW-CARB"]),
    ("flaxseed fiber omega low carb",                           ["DIABETIC","VEGAN","VEGETARIAN","KETO"]),
    ("celery low calorie low carb",                             ["DIABETIC","VEGAN","VEGETARIAN","KETO","LOW-CARB"]),
    ("cucumber low carb refreshing vegetable",                  ["DIABETIC","VEGAN","VEGETARIAN","KETO","LOW-CARB"]),

    # PALEO
    ("grass-fed beef lean meat protein paleo",                  ["PALEO","PROTEIN"]),
    ("free-range chicken breast lean protein",                  ["PALEO","PROTEIN","DIABETIC"]),
    ("sweet potato paleo carb natural",                         ["PALEO","VEGAN","VEGETARIAN"]),
    ("almond raw nut snack paleo",                              ["PALEO","VEGAN","VEGETARIAN","KETO"]),
    ("berries fresh fruit antioxidant paleo",                   ["PALEO","VEGAN","VEGETARIAN","DIABETIC"]),
    ("olive oil healthy fat paleo",                             ["PALEO","VEGAN","VEGETARIAN","KETO"]),
    ("turkey breast lean white meat protein",                   ["PALEO","PROTEIN","DIABETIC"]),

    # PROTEIN
    ("whey protein powder supplement",                          ["PROTEIN"]),
    ("casein protein slow release",                             ["PROTEIN","VEGETARIAN"]),
    ("plant protein pea hemp vegan",                            ["PROTEIN","VEGAN","VEGETARIAN"]),
    ("chicken thigh high protein meat",                         ["PROTEIN","PALEO"]),
    ("tuna protein high lean fish",                             ["PROTEIN","PESCATARIAN","DIABETIC"]),
    ("cottage cheese protein dairy low fat",                    ["PROTEIN","VEGETARIAN","DIABETIC"]),
    ("lentils plant protein fiber",                             ["PROTEIN","VEGAN","VEGETARIAN","DIABETIC"]),
    ("black beans protein fiber legume",                        ["PROTEIN","VEGAN","VEGETARIAN","DIABETIC"]),
    ("turkey meat lean high protein",                           ["PROTEIN","PALEO","DIABETIC"]),
    ("edamame soy protein vegan",                               ["PROTEIN","VEGAN","VEGETARIAN"]),

    # NOT suitable (bad products)
    ("white bread sugar flour refined carbs",                   []),
    ("candy sugar glucose fructose syrup sweet",                []),
    ("soda cola carbonated sugar drink",                        []),
    ("cake pastry flour butter sugar dessert",                  []),
    ("instant noodles pasta refined starch",                    []),
    ("ice cream dairy sugar cream dessert",                     []),
    ("potato chips fried snack starch salt",                    []),
    ("donut glazed sugar fried pastry",                         []),
    ("milk chocolate candy bar sugar",                          []),
    ("white rice refined starch high carb",                     []),
    ("french fries fried potato starch",                        []),
    ("processed meat hot dog nitrates",                         []),
    ("juice fruit sweetened sugar drink",                       []),
    ("breakfast cereal sugar corn flakes",                      []),
    ("mayonnaise processed fat egg",                            []),
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def product_to_text(product: dict) -> str:
    parts = [
        product.get("name")        or "",
        product.get("description") or "",
        product.get("category")    or "",
        " ".join(product.get("allergens") or []),
    ]
    return " ".join(parts).lower()


# ── Model cache ───────────────────────────────────────────────────────────────

_model: dict | None = None


def _load_or_train() -> dict:
    global _model
    if _model is not None:
        return _model

    if os.path.exists(MODEL_PATH):
        with open(MODEL_PATH, "rb") as f:
            _model = pickle.load(f)
        print("[ml_safety] Model loaded from disk.")
    else:
        print("[ml_safety] No saved model found — training from seed dataset...")
        _model = _train_internal()

    return _model


def _train_internal() -> dict:
    texts  = [t for t, _ in SEED]
    labels = [l for _, l in SEED]

    mlb = MultiLabelBinarizer(classes=LIFESTYLES)
    Y   = mlb.fit_transform(labels)

    vec = TfidfVectorizer(ngram_range=(1, 2), max_features=3000)
    X   = vec.fit_transform(texts)

    clf = MultiOutputClassifier(LogisticRegression(max_iter=500, C=1.0))
    clf.fit(X, Y)

    model = {"vec": vec, "clf": clf, "mlb": mlb}
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(model, f)

    print(f"[ml_safety] Model trained on {len(texts)} samples and saved.")
    return model


# ── Public API ────────────────────────────────────────────────────────────────

def train():
    """Force retrain from seed dataset (called by /retrain-safety endpoint)."""
    global _model
    _model = _train_internal()


def predict_suitable_for(product: dict) -> list[str]:
    """Return predicted lifestyle labels for a product."""
    try:
        m    = _load_or_train()
        text = product_to_text(product)
        X    = m["vec"].transform([text])
        Y    = m["clf"].predict(X)
        return list(m["mlb"].inverse_transform(Y)[0])
    except Exception as e:
        print(f"[ml_safety] Prediction error: {e}")
        return []
