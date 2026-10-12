import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { getGstAnalytics } from "../utils/financeAggregator.js";

const router = express.Router();

const verifyTokenOptional = (req, res, next) => {
  if (process.env.SKIP_DUPLICATE_JWT !== "false" && req.user && req.user.id !== "000000000000000000000000") return next();
  const token = req.headers.authorization?.split(" ")[1];
  const JWT_SECRET = process.env.JWT_SECRET || "fallback_jwt_secret_2024_finance_app";

  if (!token || token === "null" || token === "undefined") {
    req.user = { id: "000000000000000000000000" };
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    req.user = { id: "000000000000000000000000" };
    next();
  }
};

// ✅ Define GST Schema
const gstSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  invoiceNumber: { type: String },
  invoiceDate: { type: String },
  baseAmount: { type: Number, required: true }, // frontend sends baseAmount
  gstRate: { type: Number, required: true },
  transactionType: { type: String, enum: ["intrastate", "interstate"], required: true },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  igst: { type: Number, default: 0 },
  total: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

// ✅ Create model safely
const TaxGST = mongoose.models.TaxGST || mongoose.model("TaxGST", gstSchema);

// ✅ POST route to save GST calculation
router.post("/add", verifyTokenOptional, async (req, res) => {
  try {
    const gstData = req.body;
    if (req.user) {
      gstData.userId = req.user.id;
    }

    if (gstData.baseAmount === undefined) {
      return res.status(400).json({ message: "baseAmount is required" });
    }

    const newGst = new TaxGST(gstData);
    await newGst.save();

    res.status(201).json({ message: "✅ GST data saved successfully!", gstData: newGst });
  } catch (error) {
    console.error("❌ Error saving GST data:", error);
    res.status(500).json({ message: "Error saving GST data", error: error.message });
  }
});

// ✅ GET route to fetch stored GST data for user
router.get("/all", verifyTokenOptional, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(200).json([]);
    }
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);
    const data = await TaxGST.find({
      $or: [{ userId: userObjectId }, { userId: req.user.id }]
    }).sort({ createdAt: -1 });
    res.status(200).json(data);
  } catch (error) {
    console.error("❌ Error fetching GST data:", error);
    res.status(500).json({ message: "Error fetching GST data", error: error.message });
  }
});

// ✅ GET route for Centralized GST Analytics
router.get("/analytics", verifyTokenOptional, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(200).json({
        period: req.query.period || "this-month",
        gstSummary: { outputGst: 0, inputGst: 0, gstPayable: 0, gstReceivable: 0 },
        taxBreakdown: {
          cgst: { output: 0, input: 0, net: 0 },
          sgst: { output: 0, input: 0, net: 0 },
          igst: { output: 0, input: 0, net: 0 }
        },
        transactionSummary: { taxableSales: 0, taxablePurchases: 0, salesGst: 0, purchaseGst: 0 }
      });
    }
    const period = req.query.period || "this-month";
    const analytics = await getGstAnalytics(req.user.id, period);
    res.status(200).json(analytics);
  } catch (error) {
    console.error("❌ Error generating GST analytics:", error);
    res.status(500).json({ message: "Error generating GST analytics", error: error.message });
  }
});

export default router;
