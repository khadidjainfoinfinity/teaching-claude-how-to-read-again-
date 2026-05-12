from bson import ObjectId

# function to convert any ID format to string 

def _to_str_id(raw_id) -> str | None:
    if raw_id is None:
        return None
    if isinstance(raw_id, ObjectId):
        return str(raw_id)
    if isinstance(raw_id, dict):
        val = raw_id.get("$oid") or raw_id.get("_id") or raw_id.get("id")
        return str(val) if val else None
    return str(raw_id)


#  USER-PRODUCT MATRIX :
# les lignes pour les utilisateurs, les colonnes pour les produits
#  valeur : 1 si l'utilisateur a acheté le produit, 0 sinon

def build_user_product_matrix(customers_collection, products_collection):
    # all product IDs NDirohom f les colonnes 
    all_product_ids = [
        str(p["_id"])
        for p in products_collection.find({}, {"_id": 1})
    ]
    print(f"[DEBUG] Total products in DB : {len(all_product_ids)}")

    #  all customers f les lignes : 
    users = list(customers_collection.find({}, {"_id": 1, "purchasedProducts": 1}))
    print(f"[DEBUG] Total users in DB    : {len(users)}")

    matrix = {}

    for user in users:
        user_id   = str(user["_id"])
        purchased = user.get("purchasedProducts") or []

        bought = set()
        for item in purchased:
            if not isinstance(item, dict):
                continue
            raw_id     = item.get("productId") or item.get("product_id") or item.get("_id")
            product_id = _to_str_id(raw_id)
            if product_id:
                bought.add(product_id)

        matrix[user_id] = {pid: (1 if pid in bought else 0) for pid in all_product_ids}

    # Display matrix in terminal
    """ user_ids = list(matrix.keys())
    print("\n" + "="*60)
    print("  USER x PRODUCT BINARY MATRIX")
    print("="*60)
    print(f"{'':10}", end="")
    for j in range(len(all_product_ids)):
        print(f"{'P'+str(j+1):>6}", end="")
    print()

    for i, uid in enumerate(user_ids):
        print(f"{'U'+str(i+1):10}", end="")
        for pid in all_product_ids:
            print(f"{'1' if matrix[uid][pid] else '0':>6}", end="")
        print()
    print("="*60 + "\n") """

    return matrix


# l7sab t3 JACCARD SIMILARITY between 2 users :

def jaccard_similarity(set_a: set, set_b: set) -> float:
    """
    Sim(A, B) = |A ∩ B| / |A ∪ B|
    Sets contain only the product IDs where value = 1 (bought).
    """
    if not set_a or not set_b:
        return 0.0
    intersection = len(set_a & set_b)
    union        = len(set_a | set_b)
    return intersection / union if union > 0 else 0.0


#  SIMILAR USERS  (K = 10) we can change 10 nrml 

def get_similar_users(target_user_id: str, matrix: dict, top_k: int = 10) -> list:
  
    target_user_id = str(target_user_id)

    if target_user_id not in matrix:
        print(f"[DEBUG] User {target_user_id} not found in matrix.")
        return []

    target_bought = {pid for pid, val in matrix[target_user_id].items() if val == 1}
    print(f"\n[KNN] Active user bought {len(target_bought)} product(s)")

    if not target_bought:
        print("[KNN] Cold-start: no purchases -> skip KNN.")
        return []

    # Compute similarity with every other user
    similarities = []
    for user_id, row in matrix.items():
        if user_id == target_user_id:
            continue
        user_bought = {pid for pid, val in row.items() if val == 1}
        if not user_bought:
            continue
        sim = jaccard_similarity(target_bought, user_bought)
        if sim > 0:
            similarities.append((user_id, sim))

    similarities.sort(key=lambda x: x[1], reverse=True)
    top_neighbors = similarities[:top_k]

    # Display similarity table
    user_ids = list(matrix.keys())
    uid_to_label = {uid: f"U{i+1}" for i, uid in enumerate(user_ids)}

    """ print("\n" + "="*60)
    print("  JACCARD SIMILARITY — ALL USERS vs ACTIVE USER")
    print("="*60)
    print(f"  {'User':<10} {'Label':<8} {'Similarity':>12}")
    print("-"*60) """
    for uid, sim in similarities:
        label = uid_to_label.get(uid, uid)
        """ print(f"  {uid[:24]:<10} {label:<8} {sim:>12.4f}") """
    """ print("="*60) """

    result = [{"user_id": uid, "score": round(score, 4)} for uid, score in top_neighbors]

    print(f"\n[KNN] Top-{top_k} neighbours selected:")
    for nb in result:
        label = uid_to_label.get(nb["user_id"], nb["user_id"])
        print(f"  {label}  score={nb['score']:.4f}")
    print()

    return result


# SEUIL_CF = 0.6 bzf mrahomch ykhrjou bih les produits recommendés 
SEUIL_CF = 0.6 # 0.2 rahom ykhrjou , apres ma nzidou Dataset nsyiwh b 0.6 0.7 0.8


def compute_score_cf(target_user_id: str, matrix: dict, neighbors: list,
                     customers_collection, feedbacks_collection=None) -> dict:

    target_user_id = str(target_user_id)
    target_row     = matrix.get(target_user_id, {})
    target_bought  = {pid for pid, val in target_row.items() if val == 1}

    if not neighbors:
        print("[CF] No neighbours -> empty CF scores.")
        return {}

    neighbor_ids_obj = []
    for nb in neighbors:
        try:
            neighbor_ids_obj.append(ObjectId(nb["user_id"]))
        except Exception:
            neighbor_ids_obj.append(nb["user_id"])

    # Build ratings dict: uid -> { productId -> rating (1-5) }
    ratings = {nb["user_id"]: {} for nb in neighbors}

    if feedbacks_collection is not None:
        # Use real user ratings from the Feedback collection
        for fb in feedbacks_collection.find(
            {"userId": {"$in": neighbor_ids_obj}},
            {"userId": 1, "productId": 1, "rating": 1},
        ):
            uid = str(fb["userId"])
            pid = str(fb["productId"])
            if uid in ratings:
                ratings[uid][pid] = fb["rating"]
        print(f"[CF] Loaded ratings from feedbacks collection for {len(neighbor_ids_obj)} neighbours")
    else:
        # Fallback: read rating field from purchasedProducts (legacy)
        for doc in customers_collection.find(
            {"_id": {"$in": neighbor_ids_obj}},
            {"_id": 1, "purchasedProducts": 1},
        ):
            uid = str(doc["_id"])
            for item in (doc.get("purchasedProducts") or []):
                if not isinstance(item, dict):
                    continue
                raw_id     = item.get("productId") or item.get("product_id") or item.get("_id")
                product_id = _to_str_id(raw_id)
                r          = item.get("rating")
                if product_id and r is not None:
                    ratings[uid][product_id] = r

    # Collect all products bought by neighbours but NOT by active user
    candidate_products: set[str] = set()
    for nb in neighbors:
        nb_row = matrix.get(nb["user_id"], {})
        for pid, val in nb_row.items():
            if val == 1 and pid not in target_bought:
                candidate_products.add(pid)

    print(f"\n[CF] Candidate products from neighbours: {len(candidate_products)}")

    # Compute ScoreCF for each candidate
    raw_scores: dict[str, float] = {}
    for pid in candidate_products:
        numerator   = 0.0
        denominator = 0.0

        for nb in neighbors:
            uid        = nb["user_id"]
            sim        = nb["score"]
            nb_row     = matrix.get(uid, {})
            nb_ratings = ratings.get(uid, {})

            if nb_row.get(pid, 0) == 1:
                r = nb_ratings.get(pid)
                v = float(r) / 5.0 if r is not None else 0.5
            else:
                v = 0.0

            numerator   += sim * v
            denominator += sim

        raw_scores[pid] = numerator / denominator if denominator > 0 else 0.0

    # Apply seuil >= 0.6 -> intermediate list
    intermediate = {pid: s for pid, s in raw_scores.items() if s >= SEUIL_CF}

    # Display CF results
    """ print("\n" + "="*60)
    print("  CF SCORES — ALL CANDIDATE PRODUCTS")
    print("="*60)
    print(f"  {'Product ID':<28} {'ScoreCF':>10}  {'Status'}")
    print("-"*60)
    for pid, score in sorted(raw_scores.items(), key=lambda x: x[1], reverse=True):
        status = f"KEPT (>= {SEUIL_CF})" if score >= SEUIL_CF else f"dropped (< {SEUIL_CF})"
        print(f"  {pid:<28} {score:>10.4f}  {status}")
    print("="*60)
    print(f"\n[CF] Intermediate list: {len(intermediate)}/{len(raw_scores)} products kept (seuil >= {SEUIL_CF})") """
    print(f"[CF] Products in intermediate list: {list(intermediate.keys())}\n")

    return intermediate


# ─────────────────────────────────────────────
# MAIN — CF PIPELINE ONLY (CB + hybrid later)
# ─────────────────────────────────────────────

def recommend_products(
    customers_collection,
    products_collection,
    user_id: str,
    top_k_users: int = 10,
    feedbacks_collection=None,
) -> list:
    """
    Current pipeline (CF only):
      Step 1 — Build binary USER x PRODUCT matrix.
      Step 2 — Jaccard similarity + KNN (K=10).
      Step 3 — Collect neighbour products, compute ScoreCF.
      Step 4 — Keep only ScoreCF >= 0.6 -> intermediate list.

    CB + hybrid scoring will be added in the next step.
    """
    user_id = str(user_id)

    # Step 1
    matrix = build_user_product_matrix(customers_collection, products_collection)

    target_bought = {pid for pid, val in matrix.get(user_id, {}).items() if val == 1}

    if not target_bought:
        print(f"[INFO] Cold-start for user {user_id} — no purchases, skipping CF.")
        return []

    # Steps 2 & 3
    neighbors = get_similar_users(user_id, matrix, top_k=top_k_users)

    # Step 4 — CF + intermediate list (uses real ratings if feedbacks_collection provided)
    intermediate = compute_score_cf(user_id, matrix, neighbors, customers_collection, feedbacks_collection)

    # Return intermediate list as-is (CB + hybrid not yet implemented)
    sorted_recs = sorted(intermediate.items(), key=lambda x: x[1], reverse=True)
    return [{"productId": pid, "score": round(score, 4)} for pid, score in sorted_recs]