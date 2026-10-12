import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { resolvePeriod, getFinanceMetrics, getLiveBalanceSheet } from "../utils/financeAggregator.js";

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

// Financial Ratios Schema
const financialRatiosSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  companyName: { type: String, required: true },
  period: { type: String, required: true },
  currentAssets: { type: Number, required: true },
  currentLiabilities: { type: Number, required: true },
  totalAssets: { type: Number, required: true },
  totalLiabilities: { type: Number, required: true },
  equity: { type: Number, required: true },
  totalEquity: { type: Number, required: true },
  revenue: { type: Number, required: true },
  expenses: { type: Number, required: true },
  netIncome: { type: Number, required: true },
  totalDebt: { type: Number, required: true },
  sharesOutstanding: { type: Number, required: true },
  inventory: { type: Number, required: true },
  ratios: {
    currentRatio: Number,
    debtToEquity: Number,
    debtRatio: Number,
    quickRatio: Number,
    grossProfitMargin: Number,
    netProfitMargin: Number,
    roe: Number,
    roa: Number,
    assetsTurnover: Number,
    eps: Number
  },
  createdAt: { type: Date, default: Date.now },
});

financialRatiosSchema.index({ userId: 1, createdAt: -1 });

const FinancialRatios = mongoose.model("FinancialRatios", financialRatiosSchema);

// POST route to calculate and store financial ratios
router.post("/calculate", verifyToken, async (req, res) => {
  try {
    const financialData = req.body;
    
    // Calculate ratios
    const ratios = {
      currentRatio: financialData.currentLiabilities ? financialData.currentAssets / financialData.currentLiabilities : 0,
      debtToEquity: financialData.totalEquity ? financialData.totalDebt / financialData.totalEquity : 0,
      debtRatio: financialData.totalAssets ? financialData.totalDebt / financialData.totalAssets : 0,
      quickRatio: financialData.currentLiabilities ? (financialData.currentAssets - financialData.inventory) / financialData.currentLiabilities : 0,
      grossProfitMargin: financialData.revenue ? ((financialData.revenue - financialData.expenses) / financialData.revenue) * 100 : 0,
      netProfitMargin: financialData.revenue ? (financialData.netIncome / financialData.revenue) * 100 : 0,
      roe: financialData.totalEquity ? (financialData.netIncome / financialData.totalEquity) * 100 : 0,
      roa: financialData.totalAssets ? (financialData.netIncome / financialData.totalAssets) * 100 : 0,
      assetsTurnover: financialData.totalAssets ? financialData.revenue / financialData.totalAssets : 0,
      eps: financialData.sharesOutstanding ? financialData.netIncome / financialData.sharesOutstanding : 0,
    };

    const financialRecord = new FinancialRatios({
      ...financialData,
      userId: req.user.id,
      ratios: ratios
    });

    await financialRecord.save();
    res.status(201).json({ 
      message: "Financial ratios calculated and saved successfully!",
      ratios: ratios
    });
  } catch (error) {
    console.error("Error calculating financial ratios:", error);
    res.status(500).json({ message: "Error calculating financial ratios", error });
  }
});

// GET route to fetch financial ratios history
router.get("/history", verifyToken, async (req, res) => {
  try {
    const financialRatios = await FinancialRatios.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
    res.json(financialRatios);
  } catch (error) {
    console.error("Error fetching financial ratios:", error);
    res.status(500).json({ message: "Error fetching financial ratios" });
  }
});

// ✅ GET route to dynamically generate Financial Ratios based on Balance Sheet & dynamic P&L
// IMPORTANT: Must be registered BEFORE /:id to avoid Express matching "generate" as an id param
router.get("/generate", verifyToken, async (req, res) => {
  try {
    const { period, startDate: startQuery, endDate: endQuery, companyName } = req.query;
    let start, end;
    
    if (period) {
      const resolved = resolvePeriod(period);
      start = resolved.startDate;
      end = resolved.endDate;
    } else if (startQuery && endQuery) {
      start = new Date(startQuery);
      end = new Date(endQuery);
    } else {
      const resolved = resolvePeriod("this-month");
      start = resolved.startDate;
      end = resolved.endDate;
    }

    const metrics = await getFinanceMetrics(req.user.id, start, end);
    const selectedPeriod = period || "this-month";
    const liveBS = await getLiveBalanceSheet(req.user.id, selectedPeriod);

    // Fetch latest balance sheet for fallback
    let latestBS = null;
    try {
      const BalanceSheet = mongoose.model("BalanceSheet");
      latestBS = await BalanceSheet.findOne({ userId: req.user.id }).sort({ createdAt: -1 });
    } catch (e) {
      latestBS = null;
    }

    const currentAssets = (liveBS.assets.currentAssets > 0 ? liveBS.assets.currentAssets : (latestBS?.currentAssets || 0));
    const currentLiabilities = (liveBS.liabilities.currentLiabilities > 0 ? liveBS.liabilities.currentLiabilities : (latestBS?.currentLiabilities || 0));
    const totalAssets = (liveBS.assets.totalAssets > 0 ? liveBS.assets.totalAssets : (latestBS?.totalAssets || 0));
    const totalLiabilities = (liveBS.liabilities.totalLiabilities > 0 ? liveBS.liabilities.totalLiabilities : (latestBS?.totalLiabilities || 0));
    const equity = (liveBS.equity.totalEquity !== 0 ? liveBS.equity.totalEquity : (latestBS?.equity || 0));
    const totalEquity = equity;
    const totalDebt = totalLiabilities;
    const inventory = liveBS.assets.inventory || 0;

    const revenue = metrics.revenue.total;
    const expenses = metrics.expense.total;
    const netIncome = metrics.netProfit;

    // Check if we have required data
    const hasEnoughData = (currentAssets > 0 || currentLiabilities > 0 || totalAssets > 0 || revenue > 0);

    if (!hasEnoughData) {
      return res.status(200).json({ 
        message: "Not enough data",
        hasEnoughData: false
      });
    }

    // Calculate ratios
    const ratios = {
      currentRatio: currentLiabilities > 0 ? currentAssets / currentLiabilities : (currentAssets > 0 ? 1 : 0),
      debtToEquity: totalEquity > 0 ? totalDebt / totalEquity : 0,
      debtRatio: totalAssets > 0 ? totalDebt / totalAssets : 0,
      quickRatio: currentLiabilities > 0 ? (currentAssets - inventory) / currentLiabilities : (currentAssets > 0 ? 1 : 0),
      grossProfitMargin: revenue > 0 ? ((revenue - metrics.expense.cogs) / revenue) * 100 : 0,
      netProfitMargin: revenue > 0 ? (netIncome / revenue) * 100 : 0,
      roe: totalEquity > 0 ? (netIncome / totalEquity) * 100 : 0,
      roa: totalAssets > 0 ? (netIncome / totalAssets) * 100 : 0,
      assetsTurnover: totalAssets > 0 ? revenue / totalAssets : 0,
      eps: 0,
    };

    res.json({
      hasEnoughData: true,
      companyName: companyName || latestBS?.companyName || "Your Company",
      period: period || `${start.getFullYear()}-${end.getFullYear()}`,
      currentAssets,
      currentLiabilities,
      totalAssets,
      totalLiabilities,
      equity,
      totalEquity,
      revenue,
      expenses,
      netIncome,
      totalDebt,
      sharesOutstanding: 0,
      inventory,
      ratios
    });
  } catch (error) {
    console.error("Error generating financial ratios:", error);
    res.status(500).json({ message: "Error generating financial ratios", error: error.message });
  }
});

// GET route to fetch specific financial ratios by ID
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const financialRatio = await FinancialRatios.findOne({ _id: req.params.id, userId: req.user.id });
    if (!financialRatio) {
      return res.status(404).json({ message: "Financial ratios record not found" });
    }
    res.json(financialRatio);
  } catch (error) {
    console.error("Error fetching financial ratios:", error);
    res.status(500).json({ message: "Error fetching financial ratios" });
  }
});

export default router;