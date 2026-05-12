import express   from "express";
import axios     from "axios";
import jwt       from "jsonwebtoken";
import Customer  from "../models/Customer.js";
import mongoose  from "mongoose";

const router = express.Router();

const RECOMMENDER_URL = process.env.RECOMMENDER_URL || "http://localhost:8000";

// GET /api/recommendations  — proxies to FastAPI recommender
router.get("/", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId  = decoded.id;

    const response = await axios.get(
      `${RECOMMENDER_URL}/recommend/${userId}`,
      { timeout: 10000 }
    );

    const recs = response.data?.recommendations;
    res.json({ recommendations: recs || [] });

  } catch (err) {
    console.error("Recommendations error:", err.message);
    res.json({ recommendations: [] });
  }
});

// POST /api/recommendations/purchase — records a product interaction in MongoDB
router.post("/purchase", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token" });

    const decoded   = jwt.verify(token, process.env.JWT_SECRET);
    const userId    = decoded.id;
    const { productId } = req.body;

    if (!productId) return res.status(400).json({ message: "productId is required" });

    const productObjId = new mongoose.Types.ObjectId(productId);

    // Increment count if already purchased, otherwise push a new entry
    const updated = await Customer.findOneAndUpdate(
      { _id: userId, "purchasedProducts.productId": productObjId },
      { $inc: { "purchasedProducts.$.count": 1 } }
    );

    if (!updated) {
      await Customer.findByIdAndUpdate(
        userId,
        { $push: { purchasedProducts: { productId: productObjId, count: 1 } } }
      );
    }

    res.json({ ok: true });
  } catch (err) {
    // Non-fatal — never break the app over a purchase recording failure
    console.error("Record purchase error:", err.message);
    res.json({ ok: true });
  }
});

export default router;
