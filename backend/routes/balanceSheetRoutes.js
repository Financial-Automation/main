import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { getLiveBalanceSheet } from "../utils/financeAggregator.js";

const router = express.Router();

const verifyToken = (req, res, next) => {
  if (req.user && (req.user.id || req.user._id) && req.user.id !== "000000000000000000000000") {
    return next();
  }
  const token = req.headers.authorization?.split(" ")[1];
  const JWT_SECRET = process.env.JWT_SECRET || "fallback_jwt_secret_2024_finance_app";

  if (!token || token === "null" || token === "undefined") {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      ...decoded,
      id: decoded.id || decoded._id?.toString()
    };
    if (!req.user.id || req.user.id === "000000000000000000000000") {
      return res.status(401).json({ message: "Invalid authorization token." });
    }
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired. Please log in again." });
    }
    return res.status(401).json({ message: "Invalid authorization token." });
  }
};

// ✅ Define Balance Sheet Schema - Updated to match Python file structure
const balanceSheetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  companyName: { type: String },
  financialYear: { type: String },
  // Assets
  currentAssets: { type: Number, required: true, default: 0 },
  nonCurrentAssets: { type: Number, required: true, default: 0 },
  totalAssets: { type: Number, required: true, default: 0 },
  
  // Liabilities
  currentLiabilities: { type: Number, required: true, default: 0 },
  nonCurrentLiabilities: { type: Number, required: true, default: 0 },
  totalLiabilities: { type: Number, required: true, default: 0 },
  
  // Equity
  equity: { type: Number, required: true, default: 0 },
  
  // Results
  totalLiabilitiesEquity: { type: Number, required: true, default: 0 },
  balanced: { type: Boolean, default: false },
  breakdown: {
    assets: {
      currentAssets: [{ label: String, value: Number }],
      nonCurrentAssets: [{ label: String, value: Number }],
    },
    liabilities: {
      currentLiabilities: [{ label: String, value: Number }],
      nonCurrentLiabilities: [{ label: String, value: Number }],
    },
    equity: [{ label: String, value: Number }],
  },
  createdAt: { type: Date, default: Date.now },
});

balanceSheetSchema.index({ userId: 1, createdAt: -1 });

const BalanceSheet = mongoose.model("BalanceSheet", balanceSheetSchema);

// ✅ POST route — Save balance sheet data
router.post("/add", verifyToken, async (req, res) => {
  try {
    const balanceData = req.body;

    // Fill missing fields with 0 to avoid validation errors
    const dataToSave = {
      userId: req.user.id,
      companyName: balanceData.companyName || "",
      financialYear: balanceData.financialYear || "",
      // Assets
      currentAssets: balanceData.currentAssets || 0,
      nonCurrentAssets: balanceData.nonCurrentAssets || 0,
      totalAssets: balanceData.totalAssets || 0,
      
      // Liabilities
      currentLiabilities: balanceData.currentLiabilities || 0,
      nonCurrentLiabilities: balanceData.nonCurrentLiabilities || 0,
      totalLiabilities: balanceData.totalLiabilities || 0,
      
      // Equity
      equity: balanceData.equity || 0,
      
      // Results
      totalLiabilitiesEquity: balanceData.totalLiabilitiesEquity || 0,
      balanced: balanceData.balanced || false,
      breakdown: balanceData.breakdown || {
        assets: { currentAssets: [], nonCurrentAssets: [] },
        liabilities: { currentLiabilities: [], nonCurrentLiabilities: [] },
        equity: [],
      },
    };

    const newBalance = new BalanceSheet(dataToSave);
    await newBalance.save();
    
    res.status(201).json({ 
      message: "Balance sheet saved successfully!",
      data: newBalance 
    });
  } catch (error) {
    console.error("Error saving balance sheet:", error);
    res.status(500).json({ 
      message: "Error saving balance sheet data", 
      error: error.message 
    });
  }
});

// ✅ GET route — Fetch all balance sheets for authenticated user
router.get("/", verifyToken, async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);
    const sheets = await BalanceSheet.find({
      $or: [
        { userId: userObjectId },
        { userId: req.user.id }
      ]
    }).sort({ createdAt: -1 }).lean();
    res.status(200).json(sheets);
  } catch (error) {
    console.error("Error fetching balance sheets:", error);
    res.status(500).json({ 
      message: "Error fetching balance sheets", 
      error: error.message 
    });
  }
});

// ✅ GET route — Fetch balance sheet summary for authenticated user
router.get("/summary", verifyToken, async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);
    const summary = await BalanceSheet.aggregate([
      {
        $match: {
          $or: [
            { userId: userObjectId },
            { userId: req.user.id }
          ]
        }
      },
      {
        $group: {
          _id: null,
          totalAssets: { $sum: "$totalAssets" },
          totalLiabilities: { $sum: "$totalLiabilities" },
          totalEquity: { $sum: "$equity" },
          balancedCount: {
            $sum: { $cond: ["$balanced", 1, 0] }
          },
          totalRecords: { $sum: 1 }
        }
      }
    ]);

    res.json(summary[0] || { totalAssets: 0, totalLiabilities: 0, totalEquity: 0, balancedCount: 0, totalRecords: 0 });
  } catch (error) {
    console.error("Error fetching balance sheet summary:", error);
    res.status(500).json({ 
      message: "Error fetching balance sheet summary", 
      error: error.message 
    });
  }
});

// ✅ GET route — Generate Live Balance Sheet connected to centralized finance flow
router.get("/generate", verifyToken, async (req, res) => {
  try {
    const period = req.query.period || "this-month";
    const liveBS = await getLiveBalanceSheet(req.user.id, period);
    res.status(200).json(liveBS);
  } catch (error) {
    console.error("Error generating live balance sheet:", error);
    res.status(500).json({ message: "Error generating live balance sheet", error: error.message });
  }
});

export default router;
