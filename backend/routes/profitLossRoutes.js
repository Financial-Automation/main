import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { resolvePeriod, getFinanceMetrics } from "../utils/financeAggregator.js";

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

// ✅ Define ProfitLoss schema with tenant isolation
const profitLossSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  companyName: { type: String },
  financialYear: { type: String },
  // Revenue fields
  sales: { type: Number, required: true, default: 0 },
  serviceIncome: { type: Number, required: true, default: 0 },
  interestIncome: { type: Number, required: true, default: 0 },
  otherIncome: { type: Number, required: true, default: 0 },
  totalRevenue: { type: Number, required: true, default: 0 },
  
  // Expense fields
  costOfMaterials: { type: Number, required: true, default: 0 },
  salaries: { type: Number, required: true, default: 0 },
  rent: { type: Number, required: true, default: 0 },
  utilities: { type: Number, required: true, default: 0 },
  financeCost: { type: Number, required: true, default: 0 },
  depreciation: { type: Number, required: true, default: 0 },
  amortization: { type: Number, required: true, default: 0 },
  otherExpenses: { type: Number, required: true, default: 0 },
  totalExpenses: { type: Number, required: true, default: 0 },
  
  // Result fields
  netProfit: { type: Number, required: true, default: 0 },
  profitMargin: { type: Number, required: true, default: 0 },
  profitable: { type: Boolean, required: true, default: false },
  
  // AI Insights
  aiInsights: { type: [String], default: [] },
  aiRecommendations: { type: [String], default: [] },
  
  createdAt: { type: Date, default: Date.now },
});

profitLossSchema.index({ userId: 1, createdAt: -1 });

const ProfitLoss = mongoose.model("ProfitLoss", profitLossSchema);

// ✅ Helper function to generate AI insights
function generateAIInsights(revenue, expenses, netProfit, profitMargin, cogs) {
  const insights = [];
  const recommendations = [];
  
  if (netProfit < 0) {
    insights.push("⚠️ Business is operating at a LOSS");
    recommendations.push("Review all expenses immediately");
    recommendations.push("Consider cost reduction measures");
    recommendations.push("Increase revenue streams");
  } else if (profitMargin < 15) {
    insights.push("⚠️ Low Profit Margin business (below 15%)");
    recommendations.push("Improve pricing strategy");
    recommendations.push("Reduce operational expenses by 10-15%");
    recommendations.push("Focus on high-margin products/services");
  } else if (profitMargin < 25) {
    insights.push("✅ Moderate Profit Margin (15-25%)");
    recommendations.push("Maintain current cost structure");
    recommendations.push("Explore expansion opportunities");
  } else {
    insights.push("🎉 Excellent Profit Margin (above 25%)");
    recommendations.push("Consider reinvesting profits");
    recommendations.push("Scale successful operations");
  }
  
  const expenseRatio = (expenses / revenue * 100) || 0;
  if (expenseRatio > 70) {
    insights.push(`⚠️ Expenses are ${expenseRatio.toFixed(1)}% of revenue - too high`);
    recommendations.push("Identify top 3 expense categories for reduction");
  } else if (expenseRatio > 50) {
    insights.push(`📊 Expenses are ${expenseRatio.toFixed(1)}% of revenue - moderate`);
    recommendations.push("Monitor expense growth closely");
  } else {
    insights.push(`✅ Excellent cost control - expenses only ${expenseRatio.toFixed(1)}% of revenue`);
  }
  
  if (cogs && revenue && cogs > revenue * 0.6) {
    insights.push("⚠️ COGS is high compared to revenue");
    recommendations.push("Negotiate supplier costs");
    recommendations.push("Explore alternative vendors");
  }
  
  return { insights, recommendations };
}

// ✅ POST route to store Profit & Loss data for authenticated user
router.post("/add", verifyToken, async (req, res) => {
  try {
    const plData = req.body;

    const totalRevenue = (plData.sales || 0) + (plData.serviceIncome || 0) + 
                         (plData.interestIncome || 0) + (plData.otherIncome || 0);
    
    const totalExpenses = (plData.costOfMaterials || 0) + (plData.salaries || 0) + 
                           (plData.rent || 0) + (plData.utilities || 0) +
                           (plData.financeCost || 0) + (plData.depreciation || 0) +
                           (plData.amortization || 0) + (plData.otherExpenses || 0);
    
    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = (netProfit / totalRevenue * 100) || 0;
    const profitable = netProfit > 0;
    
    const { insights, recommendations } = generateAIInsights(
      totalRevenue, totalExpenses, netProfit, profitMargin, plData.costOfMaterials || 0
    );

    const dataToSave = {
      userId: req.user.id,
      companyName: plData.companyName || "",
      financialYear: plData.financialYear || "",
      sales: plData.sales || 0,
      serviceIncome: plData.serviceIncome || 0,
      interestIncome: plData.interestIncome || 0,
      otherIncome: plData.otherIncome || 0,
      totalRevenue: totalRevenue,
      
      costOfMaterials: plData.costOfMaterials || 0,
      salaries: plData.salaries || 0,
      rent: plData.rent || 0,
      utilities: plData.utilities || 0,
      financeCost: plData.financeCost || 0,
      depreciation: plData.depreciation || 0,
      amortization: plData.amortization || 0,
      otherExpenses: plData.otherExpenses || 0,
      totalExpenses: totalExpenses,
      
      netProfit: netProfit,
      profitMargin: profitMargin,
      profitable: profitable,
      
      aiInsights: insights,
      aiRecommendations: recommendations,
    };

    const newPL = new ProfitLoss(dataToSave);
    await newPL.save();

    res.status(201).json({ 
      message: "✅ Profit & Loss data saved successfully!",
      data: dataToSave,
      insights,
      recommendations
    });
  } catch (error) {
    console.error("❌ Error saving P&L data:", error);
    res.status(500).json({ message: "Error saving Profit & Loss data", error });
  }
});

// ✅ GET route to fetch all P&L records for authenticated user
router.get("/all", verifyToken, async (req, res) => {
  try {
    const records = await ProfitLoss.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
    res.json(records);
  } catch (error) {
    console.error("❌ Error fetching P&L data:", error);
    res.status(500).json({ message: "Error fetching Profit & Loss data", error });
  }
});

// ✅ GET route to fetch P&L summary for authenticated user
router.get("/summary", verifyToken, async (req, res) => {
  try {
    const summary = await ProfitLoss.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.user.id) } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalRevenue" },
          totalExpenses: { $sum: "$totalExpenses" },
          totalNetProfit: { $sum: "$netProfit" },
          avgProfitMargin: { $avg: "$profitMargin" },
          profitableCount: {
            $sum: { $cond: ["$profitable", 1, 0] }
          },
          totalRecords: { $sum: 1 }
        }
      }
    ]);

    res.json(summary[0] || {});
  } catch (error) {
    console.error("❌ Error fetching P&L summary:", error);
    res.status(500).json({ message: "Error fetching Profit & Loss summary", error });
  }
});

// ✅ GET route to fetch AI insights for a specific record for authenticated user
router.get("/insights/:id", verifyToken, async (req, res) => {
  try {
    const record = await ProfitLoss.findOne({ _id: req.params.id, userId: req.user.id });
    if (!record) {
      return res.status(404).json({ message: "Record not found or access denied" });
    }
    res.json({
      insights: record.aiInsights,
      recommendations: record.aiRecommendations,
      profitMargin: record.profitMargin,
      netProfit: record.netProfit
    });
  } catch (error) {
    console.error("❌ Error fetching AI insights:", error);
    res.status(500).json({ message: "Error fetching insights", error });
  }
});

// ✅ GET route to dynamically generate Profit & Loss statement based on all modules
router.get("/generate", verifyToken, async (req, res) => {
  try {
    const { period, startDate: startQuery, endDate: endQuery, companyName, financialYear } = req.query;
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

    const { insights, recommendations } = generateAIInsights(
      metrics.revenue.total,
      metrics.expense.total,
      metrics.netProfit,
      metrics.profitMargin,
      metrics.expense.cogs
    );

    const otherIncome = Math.max(0, metrics.revenue.total - metrics.revenue.sales);

    res.json({
      companyName: companyName || "Your Company",
      financialYear: financialYear || `${start.getFullYear()}-${end.getFullYear()}`,
      sales: metrics.revenue.sales,
      serviceIncome: 0,
      interestIncome: 0,
      otherIncome: otherIncome,
      totalRevenue: metrics.revenue.total,
      
      costOfMaterials: metrics.expense.costOfMaterials + metrics.expense.cogs,
      salaries: metrics.expense.salaries,
      rent: metrics.expense.rent,
      utilities: metrics.expense.utilities,
      financeCost: metrics.expense.financeCost,
      depreciation: metrics.expense.depreciation,
      amortization: metrics.expense.amortization,
      otherExpenses: metrics.expense.otherExpenses,
      totalExpenses: metrics.expense.total,
      
      netProfit: metrics.netProfit,
      profitMargin: metrics.profitMargin,
      profitable: metrics.netProfit > 0,
      aiInsights: insights,
      aiRecommendations: recommendations
    });
  } catch (error) {
    console.error("Error generating Profit & Loss statement:", error);
    res.status(500).json({ message: "Error generating statement", error: error.message });
  }
});

export default router;
