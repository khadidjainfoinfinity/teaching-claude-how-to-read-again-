from fastapi import FastAPI, HTTPException, Path
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from dotenv import load_dotenv
from bson import ObjectId
import os
import re
import logging

from recommender_system import (
    recommend_products,
    get_similar_users,
    build_user_product_matrix
)
from safety import analyze_product
from ml_safety import train as retrain_model

# ─────────────────────────────────────────────
# CONFIG + LOGGING
# ─────────────────────────────────────────────

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("novashop")

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME")

if not MONGO_URI or not DB_NAME:
    raise RuntimeError("❌ Missing MONGO_URI or DB_NAME in environment variables")

app = FastAPI(title="NovaShop Recommender API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # in production -> restrict this
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# DB CONNECTION (SAFE)
# ─────────────────────────────────────────────

try:
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]

    customers = db.customers
    products = db.products
    feedbacks = db.feedbacks

    logger.info("✅ Connected to MongoDB successfully")

except Exception as e:
    logger.error(f"❌ MongoDB connection failed: {e}")
    raise


# ─────────────────────────────────────────────
# UTIL: SAFE OBJECTID
# ─────────────────────────────────────────────

def safe_objectid(id_str: str):
    try:
        return ObjectId(id_str)
    except Exception:
        return id_str  # fallback if already string ID


# ─────────────────────────────────────────────
# ROOT
# ─────────────────────────────────────────────

@app.get("/")
def home():
    return {"message": "NovaShop Recommender API is running"}


# ─────────────────────────────────────────────
# FALLBACK CATEGORY RECOMMENDATION
# ─────────────────────────────────────────────

def _suggest_by_categories(user_doc: dict, products_collection, limit: int = 10):
    shopping_categories = [c.strip() for c in (user_doc.get("shoppingCategories") or []) if c]

    logger.info(f"[COLD-START] shoppingCategories = {shopping_categories}")

    if shopping_categories:
        # Case-insensitive match so "groceries" == "Groceries" == "GROCERIES"
        query = {
            "$or": [
                {"category": {"$regex": f"^{re.escape(c)}$", "$options": "i"}}
                for c in shopping_categories
            ]
        }
    else:
        # No categories set → return top products by stock as a generic fallback
        query = {}

    try:
        docs = list(products_collection.find(query).limit(limit))
    except Exception as e:
        logger.error(f"Category cold-start error: {e}")
        return []

    logger.info(f"[COLD-START] Found {len(docs)} products for categories {shopping_categories}")

    result = []
    for doc in docs:
        doc["_id"] = str(doc["_id"])
        doc["safety"] = analyze_product(doc, user_doc)
        result.append(doc)

    return result


# ─────────────────────────────────────────────
# RECOMMEND ENDPOINT
# ─────────────────────────────────────────────

@app.get("/recommend/{user_id}")
def recommend(user_id: str = Path(..., min_length=5)):

    user_oid = safe_objectid(user_id)

    user_doc = customers.find_one({"_id": user_oid})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    # ── Cold-start: skip the CF pipeline entirely when the user has no purchases ──
    purchased = user_doc.get("purchasedProducts") or []
    if not purchased:
        logger.info(f"[COLD-START] user {user_id} has no purchases → recommending by shoppingCategories")
        cold_recs = _suggest_by_categories(user_doc, products)
        return {
            "user_id": user_id,
            "name": user_doc.get("name", "Unknown"),
            "source": "cold_start_categories",
            "recommendations": cold_recs
        }

    # ── Normal CF pipeline ──
    try:
        recs = recommend_products(
            customers,
            products,
            str(user_id),
            feedbacks_collection=feedbacks
        )
    except Exception as e:
        logger.error(f"Recommendation error: {e}")
        raise HTTPException(status_code=500, detail="Recommendation failed")

    enriched = []

    for rec in recs:
        pid = rec.get("productId")
        if not pid:
            continue

        product_oid = safe_objectid(pid)
        product_doc = products.find_one({"_id": product_oid})

        if not product_doc:
            continue

        product_doc["_id"] = str(product_doc["_id"])
        product_doc["safety"] = analyze_product(product_doc, user_doc)
        enriched.append(product_doc)

    # CF returned nothing (e.g. no neighbours cleared the threshold) → category fallback
    if not enriched:
        logger.info(f"[FALLBACK] CF produced no results for user {user_id} → using shoppingCategories")
        enriched = _suggest_by_categories(user_doc, products)
        source = "category_fallback"
    else:
        source = "collaborative_filtering"

    return {
        "user_id": user_id,
        "name": user_doc.get("name", "Unknown"),
        "source": source,
        "recommendations": enriched
    }


# ─────────────────────────────────────────────
# RETRAIN MODEL
# ─────────────────────────────────────────────

@app.post("/retrain-safety")
def retrain_safety():
    try:
        retrain_model()
        return {"message": "Safety model retrained successfully"}
    except Exception as e:
        logger.error(f"Retrain failed: {e}")
        raise HTTPException(status_code=500, detail="Retraining failed")


# ─────────────────────────────────────────────
# SIMILAR USERS
# ─────────────────────────────────────────────

@app.get("/similar/{user_id}")
def similar(user_id: str = Path(..., min_length=5)):

    matrix = build_user_product_matrix(customers, products)

    if str(user_id) not in matrix:
        raise HTTPException(status_code=404, detail="User not found in matrix")

    neighbors = get_similar_users(str(user_id), matrix)

    user_oid = safe_objectid(user_id)
    user_doc = customers.find_one({"_id": user_oid})

    return {
        "user_id": user_id,
        "name": user_doc.get("name", "Unknown") if user_doc else "Unknown",
        "similar_users": neighbors
    }