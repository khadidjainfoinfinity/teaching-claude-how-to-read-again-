from ml_safety import predict_suitable_for


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def normalize(text: str) -> str:
    return (text or "").lower()


def normalize_tag(tag: str) -> str:
    return tag.lower().replace("-", "").replace(" ", "").replace("_", "")


def contains_keywords(text: str, keywords: list[str]) -> list[str]:
    text = normalize(text)
    return [k for k in keywords if k in text]


def is_food_product(product: dict) -> bool:
    FOOD_CATEGORIES = {"groceries", "beverages", "dairy", "meat", "bakery"}
    return (product.get("category") or "").lower() in FOOD_CATEGORIES


# ─────────────────────────────────────────────
# LIFESTYLE → AGAINST KEYWORDS MAP
# ─────────────────────────────────────────────

LIFESTYLE_RULES = {
    "diabetic":      ["sugar", "glucose", "fructose", "syrup", "sweetener",
                      "dextrose", "maltose", "corn syrup", "honey", "molasses"],
    "low_salt":      ["salt", "sodium", "soy sauce", "brine", "msg",
                      "monosodium", "pickle"],
    "keto":          ["sugar", "flour", "starch", "bread", "rice", "oat",
                      "corn", "potato", "wheat", "carb", "pasta", "cereal"],
    "low_fat":       ["fat", "oil", "butter", "cream", "lard", "margarine",
                      "shortening", "grease"],
    "halal":         ["alcohol", "ethanol", "gelatin", "lard", "pork",
                      "wine", "beer", "rum", "bacon", "ham"],
    "vegan":         ["milk", "cheese", "egg", "butter", "honey", "cream",
                      "whey", "casein", "lactose", "gelatin", "beef", "chicken",
                      "pork", "fish", "shrimp", "meat"],
    "vegetarian":    ["beef", "chicken", "pork", "fish", "shrimp", "lamb",
                      "meat", "gelatin", "lard"],
    "gluten_free":   ["wheat", "gluten", "barley", "rye", "flour", "bread",
                      "pasta", "oat", "semolina", "spelt"],
    "lactose_free":  ["milk", "lactose", "cheese", "butter", "cream",
                      "whey", "casein", "yogurt"],
    "heart_healthy": ["sodium", "salt", "saturated fat", "trans fat",
                      "cholesterol", "lard", "butter", "palm oil"],
    "low_sugar":     ["sugar", "glucose", "fructose", "syrup", "dextrose",
                      "maltose", "sweetener", "candy", "chocolate"],
}

# Human-readable lifestyle labels used in warning messages
LIFESTYLE_LABELS = {
    "diabetic":      "diabetic",
    "low_salt":      "low-salt",
    "keto":          "keto",
    "low_fat":       "low-fat",
    "halal":         "halal",
    "vegan":         "vegan",
    "vegetarian":    "vegetarian",
    "gluten_free":   "gluten-free",
    "lactose_free":  "lactose-free",
    "heart_healthy": "heart-healthy",
    "low_sugar":     "low-sugar",
}


def _build_health_warning(lifestyle: str, matched: list[str]) -> str:
    """Return a single human-readable warning sentence."""
    label = LIFESTYLE_LABELS.get(lifestyle, lifestyle.replace("_", " "))
    ingredients = ", ".join(matched)
    return f"This product contains: {ingredients} — against your {label} lifestyle"


# ─────────────────────────────────────────────
# CORE LOGIC
# ─────────────────────────────────────────────

def _match_keywords_list(product_keywords: list[str], rule_keywords: list[str]) -> list[str]:
    """Exact-match product.keywords list against a lifestyle's rule keywords (case-insensitive)."""
    pk_normalized = {normalize(k) for k in product_keywords}
    return [r for r in rule_keywords if normalize(r) in pk_normalized]


def lifestyle_decision(user_lifestyles: set[str], product: dict):

    user_lifestyles = {normalize_tag(x) for x in (user_lifestyles or [])}

    # Free-text fields for substring matching
    product_text = " ".join([
        product.get("name", ""),
        product.get("description", ""),
        product.get("ingredients_text", "")
    ]).lower()

    # Structured keywords list for direct intersection
    product_keywords = [str(k) for k in (product.get("keywords") or [])]

    conflicts = []
    warnings = []
    health_warnings = []

    for lifestyle in user_lifestyles:
        rule_keywords = LIFESTYLE_RULES.get(lifestyle, [])

        # Source 1: substring match on text fields
        matched_text = contains_keywords(product_text, rule_keywords)

        # Source 2: direct intersection with product.keywords list
        matched_kw = _match_keywords_list(product_keywords, rule_keywords)

        # Merge and deduplicate, preserving order
        matched = list(dict.fromkeys(matched_text + matched_kw))

        if matched:
            conflicts.append(lifestyle)
            warnings.append({
                "lifestyle": lifestyle,
                "triggered_by": matched,
                "source": "keywords" if not matched_text else "text+keywords" if matched_kw else "text",
                "message": _build_health_warning(lifestyle, matched)
            })
            health_warnings.append(_build_health_warning(lifestyle, matched))

    # ML fallback (only used when rule engine finds no conflict)
    try:
        predicted = predict_suitable_for(product)
        predicted = {normalize_tag(x) for x in predicted}
    except Exception:
        predicted = set()

    if conflicts:
        return {
            "status": "not_recommended",
            "level": "strong_conflict",
            "conflicts": conflicts,
            "warnings": warnings,
            "health_warnings": health_warnings
        }

    if user_lifestyles and not (user_lifestyles & predicted):
        return {
            "status": "caution",
            "level": "unknown",
            "conflicts": [],
            "warnings": [{"lifestyle": None, "triggered_by": [], "message": "No strong lifestyle match"}],
            "health_warnings": []
        }

    return {
        "status": "safe",
        "level": "positive",
        "conflicts": [],
        "warnings": [],
        "health_warnings": []
    }


# ─────────────────────────────────────────────
# MAIN ANALYZER (USED IN API)
# ─────────────────────────────────────────────

def analyze_product(product: dict, user: dict | None):

    user = user or {}

    # ───── ALLERGIES ─────
    product_allergens = {a.lower() for a in (product.get("allergens") or [])}
    user_allergies = {a.lower() for a in (user.get("allergies") or [])}
    matched_allergens = product_allergens & user_allergies

    # ───── LIFESTYLES ─────
    user_lifestyles = set(user.get("lifestyles") or [])

    if not is_food_product(product):
        return {
            "status": "safe",
            "type": "non_food",
            "warning_allergy": bool(matched_allergens),
            "matched_allergens": list(matched_allergens),
            "lifestyle": None,
            "health_warnings": []
        }

    lifestyle_result = lifestyle_decision(user_lifestyles, product)

    return {
        "status": lifestyle_result["status"],
        "lifestyle": lifestyle_result,
        "warning_allergy": bool(matched_allergens),
        "matched_allergens": list(matched_allergens),
        "health_warnings": lifestyle_result["health_warnings"]
    }
