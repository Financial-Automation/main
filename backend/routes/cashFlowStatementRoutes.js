import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { resolvePeriod, getFinanceMetrics } from "../utils/financeAggregator.js";

const router = express.Router();

// ==================== SCHEMAS ====================

// ✅ Static Mode Schema (Aligned with P&L)
const cashFlowStatementSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, default: "Cash Flow Statement" },
  companyName: { type: String },
  period: { type: String, required: true },
  // Inflow fields
  sales: { type: Number, default: 0 },
  serviceIncome: { type: Number, default: 0 },
  interestIncome: { type: Number, default: 0 },
  otherIncome: { type: Number, default: 0 },
  // Outflow fields
  costOfMaterials: { type: Number, default: 0 },
  salaries: { type: Number, default: 0 },
  rent: { type: Number, default: 0 },
  utilities: { type: Number, default: 0 },
  financeCost: { type: Number, default: 0 },
  depreciation: { type: Number, default: 0 },
  amortization: { type: Number, default: 0 },
  otherExpenses: { type: Number, default: 0 },

  totalInflow: { type: Number, required: true },
  totalOutflow: { type: Number, required: true },
  netCashFlow: { type: Number, required: true },
  status: { type: String, enum: ["positive", "negative", "neutral"], required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

cashFlowStatementSchema.index({ userId: 1, createdAt: -1 });

const CashFlowStatement = mongoose.model("CashFlowStatement", cashFlowStatementSchema);
const SimpleCashFlowStatement = mongoose.model("SimpleCashFlowStatement", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dummy: { type: String }
}, { strict: false })); // Keeping SimpleCashFlowStatement model placeholder to prevent errors elsewhere if referenced

// ==================== MIDDLEWARE ====================

const verifyToken = (req, res, next) => {
  if (req.user && (req.user.id || req.user._id) && req.user.id !== "000000000000000000000000") {
    return next();
  }
  const token = req.headers.authorization?.split(" ")[1];

  if (!token || token === "null" || token === "undefined") {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
    const JWT_SECRET = process.env.JWT_SECRET || "fallback_jwt_secret_2024_finance_app";
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

// ==================== DYNAMIC MODE ROUTES (Original) ====================

// ✅ POST - Create cash flow statement
router.post("/create", verifyToken, async (req, res) => {
  try {
    const {
      companyName,
      period,
      sales,
      serviceIncome,
      interestIncome,
      otherIncome,
      costOfMaterials,
      salaries,
      rent,
      utilities,
      financeCost,
      depreciation,
      amortization,
      otherExpenses
    } = req.body;

    if (!period) {
      return res.status(400).json({ message: "Period is required" });
    }

    const sVal = parseFloat(sales) || 0;
    const siVal = parseFloat(serviceIncome) || 0;
    const iiVal = parseFloat(interestIncome) || 0;
    const oiVal = parseFloat(otherIncome) || 0;

    const cmVal = parseFloat(costOfMaterials) || 0;
    const salVal = parseFloat(salaries) || 0;
    const rVal = parseFloat(rent) || 0;
    const uVal = parseFloat(utilities) || 0;
    const fcVal = parseFloat(financeCost) || 0;
    const dVal = parseFloat(depreciation) || 0;
    const amVal = parseFloat(amortization) || 0;
    const oeVal = parseFloat(otherExpenses) || 0;

    const totalInflow = sVal + siVal + iiVal + oiVal;
    const totalOutflow = cmVal + salVal + rVal + uVal + fcVal + dVal + amVal + oeVal;
    const netCashFlow = totalInflow - totalOutflow;
    
    let status = "neutral";
    if (netCashFlow > 0) status = "positive";
    if (netCashFlow < 0) status = "negative";

    const newStatement = new CashFlowStatement({
      userId: req.user.id,
      companyName,
      period,
      sales: sVal,
      serviceIncome: siVal,
      interestIncome: iiVal,
      otherIncome: oiVal,
      costOfMaterials: cmVal,
      salaries: salVal,
      rent: rVal,
      utilities: uVal,
      financeCost: fcVal,
      depreciation: dVal,
      amortization: amVal,
      otherExpenses: oeVal,
      totalInflow,
      totalOutflow,
      netCashFlow,
      status
    });

    await newStatement.save();

    res.status(201).json({ 
      message: "Cash flow statement created successfully!",
      data: newStatement
    });
  } catch (error) {
    console.error("Error creating cash flow statement:", error);
    res.status(500).json({ message: "Error creating cash flow statement", error: error.message });
  }
});

// ✅ GET - Fetch all dynamic statements for user
router.get("/all", verifyToken, async (req, res) => {
  try {
    const statements = await CashFlowStatement.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
    res.json(statements);
  } catch (error) {
    console.error("Error fetching cash flow statements:", error);
    res.status(500).json({ message: "Error fetching cash flow statements" });
  }
});

// ✅ GET route to dynamically generate Cash Flow Statement based on all modules (cash basis)
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

    let status = "neutral";
    if (metrics.cashFlow.net > 0) status = "positive";
    if (metrics.cashFlow.net < 0) status = "negative";

    res.json({
      companyName: companyName || "Your Company",
      period: period || `${start.toLocaleDateString('en-US', {month: 'long'})} ${start.getFullYear()}`,
      // Inflow breakdown
      sales: metrics.revenue.sales,
      serviceIncome: 0,
      interestIncome: 0,
      otherIncome: Math.max(0, metrics.revenue.total - metrics.revenue.sales),
      // Outflow breakdown
      costOfMaterials: metrics.expense.costOfMaterials + metrics.expense.cogs,
      salaries: metrics.expense.salaries,
      rent: metrics.expense.rent,
      utilities: metrics.expense.utilities,
      financeCost: metrics.expense.financeCost,
      depreciation: metrics.expense.depreciation,
      amortization: metrics.expense.amortization,
      otherExpenses: metrics.expense.otherExpenses,
      // Totals (cash basis)
      totalInflow: metrics.cashFlow.inflow,
      totalOutflow: metrics.cashFlow.outflow,
      netCashFlow: metrics.cashFlow.net,
      status,
      // Nested cashFlow object for Dashboard KPI compatibility
      cashFlow: {
        inflow: metrics.cashFlow.inflow,
        outflow: metrics.cashFlow.outflow,
        net: metrics.cashFlow.net,
        receivables: metrics.cashFlow.receivables,
        payables: metrics.cashFlow.payables,
        gstPayable: metrics.cashFlow.gstPayable
      },
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error generating Cash Flow statement:", error);
    res.status(500).json({ message: "Error generating Cash Flow statement", error: error.message });
  }
});

// ✅ GET - Fetch specific dynamic statement by ID
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const statement = await CashFlowStatement.findOne({ _id: id, userId: req.user.id });
    
    if (!statement) {
      return res.status(404).json({ message: "Cash flow statement not found" });
    }
    
    res.json(statement);
  } catch (error) {
    console.error("Error fetching cash flow statement:", error);
    res.status(500).json({ message: "Error fetching cash flow statement" });
  }
});

// ✅ PUT - Update dynamic statement
router.put("/update/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      period,
      sales,
      serviceIncome,
      interestIncome,
      otherIncome,
      costOfMaterials,
      salaries,
      rent,
      utilities,
      financeCost,
      depreciation,
      amortization,
      otherExpenses
    } = req.body;

    const existingStatement = await CashFlowStatement.findOne({ _id: id, userId: req.user.id });
    if (!existingStatement) {
      return res.status(404).json({ message: "Cash flow statement not found" });
    }

    const sVal = parseFloat(sales) || 0;
    const siVal = parseFloat(serviceIncome) || 0;
    const iiVal = parseFloat(interestIncome) || 0;
    const oiVal = parseFloat(otherIncome) || 0;

    const cmVal = parseFloat(costOfMaterials) || 0;
    const salVal = parseFloat(salaries) || 0;
    const rVal = parseFloat(rent) || 0;
    const uVal = parseFloat(utilities) || 0;
    const fcVal = parseFloat(financeCost) || 0;
    const dVal = parseFloat(depreciation) || 0;
    const amVal = parseFloat(amortization) || 0;
    const oeVal = parseFloat(otherExpenses) || 0;

    const totalInflow = sVal + siVal + iiVal + oiVal;
    const totalOutflow = cmVal + salVal + rVal + uVal + fcVal + dVal + amVal + oeVal;
    const netCashFlow = totalInflow - totalOutflow;
    
    let status = "neutral";
    if (netCashFlow > 0) status = "positive";
    if (netCashFlow < 0) status = "negative";

    const updatedStatement = await CashFlowStatement.findByIdAndUpdate(
      id,
      {
        period,
        sales: sVal,
        serviceIncome: siVal,
        interestIncome: iiVal,
        otherIncome: oiVal,
        costOfMaterials: cmVal,
        salaries: salVal,
        rent: rVal,
        utilities: uVal,
        financeCost: fcVal,
        depreciation: dVal,
        amortization: amVal,
        otherExpenses: oeVal,
        totalInflow,
        totalOutflow,
        netCashFlow,
        status,
        updatedAt: new Date()
      },
      { new: true }
    );

    res.json({ 
      message: "Cash flow statement updated successfully!", 
      data: updatedStatement 
    });
  } catch (error) {
    console.error("Error updating cash flow statement:", error);
    res.status(500).json({ message: "Error updating cash flow statement" });
  }
});

// ✅ DELETE - Remove dynamic statement
router.delete("/delete/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const deletedStatement = await CashFlowStatement.findOneAndDelete({ _id: id, userId: req.user.id });
    
    if (!deletedStatement) {
      return res.status(404).json({ message: "Cash flow statement not found" });
    }

    res.json({ message: "Cash flow statement deleted successfully!" });
  } catch (error) {
    console.error("Error deleting cash flow statement:", error);
    res.status(500).json({ message: "Error deleting cash flow statement" });
  }
});

// ==================== SIMPLE MODE ROUTES (Requirement Style) ====================

// ✅ POST - Create simple cash flow statement (textarea mode)
router.post("/simple/create", verifyToken, async (req, res) => {
  try {
    const { companyName, period, inflowText, outflowText, totalInflow, totalOutflow, netCashFlow, status } = req.body;

    if (!period || !inflowText || !outflowText) {
      return res.status(400).json({ message: "Period, inflow text, and outflow text are required" });
    }

    const newStatement = new SimpleCashFlowStatement({
      userId: req.user.id,
      companyName,
      period,
      inflowText,
      outflowText,
      totalInflow: totalInflow || 0,
      totalOutflow: totalOutflow || 0,
      netCashFlow: netCashFlow || 0,
      status: status || "neutral"
    });

    await newStatement.save();

    res.status(201).json({ 
      message: "Cash flow statement saved successfully!",
      data: newStatement
    });
  } catch (error) {
    console.error("Error creating simple cash flow statement:", error);
    res.status(500).json({ message: "Error creating cash flow statement", error: error.message });
  }
});

// ✅ GET - Fetch all simple statements for user
router.get("/simple/all", verifyToken, async (req, res) => {
  try {
    const statements = await SimpleCashFlowStatement.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(statements);
  } catch (error) {
    console.error("Error fetching simple statements:", error);
    res.status(500).json({ message: "Error fetching statements" });
  }
});

// ✅ GET - Fetch specific simple statement by ID
router.get("/simple/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const statement = await SimpleCashFlowStatement.findOne({ _id: id, userId: req.user.id });
    
    if (!statement) {
      return res.status(404).json({ message: "Cash flow statement not found" });
    }
    
    res.json(statement);
  } catch (error) {
    console.error("Error fetching simple statement:", error);
    res.status(500).json({ message: "Error fetching statement" });
  }
});

// ✅ PUT - Update simple statement
router.put("/simple/update/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { period, inflowText, outflowText, totalInflow, totalOutflow, netCashFlow, status } = req.body;

    const existingStatement = await SimpleCashFlowStatement.findOne({ _id: id, userId: req.user.id });
    if (!existingStatement) {
      return res.status(404).json({ message: "Cash flow statement not found" });
    }

    const updatedStatement = await SimpleCashFlowStatement.findByIdAndUpdate(
      id,
      {
        period,
        inflowText,
        outflowText,
        totalInflow: totalInflow || 0,
        totalOutflow: totalOutflow || 0,
        netCashFlow: netCashFlow || 0,
        status: status || "neutral",
        updatedAt: new Date()
      },
      { new: true }
    );

    res.json({ 
      message: "Cash flow statement updated successfully!", 
      data: updatedStatement 
    });
  } catch (error) {
    console.error("Error updating simple statement:", error);
    res.status(500).json({ message: "Error updating statement" });
  }
});

// ✅ DELETE - Remove simple statement
router.delete("/simple/delete/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const deletedStatement = await SimpleCashFlowStatement.findOneAndDelete({ _id: id, userId: req.user.id });
    
    if (!deletedStatement) {
      return res.status(404).json({ message: "Cash flow statement not found" });
    }

    res.json({ message: "Cash flow statement deleted successfully!" });
  } catch (error) {
    console.error("Error deleting simple statement:", error);
    res.status(500).json({ message: "Error deleting statement" });
  }
});

// ==================== SUMMARY ROUTES ====================

// ✅ GET - Dynamic mode summary
router.get("/summary/overview", verifyToken, async (req, res) => {
  try {
    const summary = await CashFlowStatement.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.user.id) } },
      {
        $group: {
          _id: null,
          totalStatements: { $sum: 1 },
          averageInflow: { $avg: "$totalInflow" },
          averageOutflow: { $avg: "$totalOutflow" },
          averageNetFlow: { $avg: "$netCashFlow" },
          positiveStatements: {
            $sum: { $cond: [{ $eq: ["$status", "positive"] }, 1, 0] }
          },
          negativeStatements: {
            $sum: { $cond: [{ $eq: ["$status", "negative"] }, 1, 0] }
          },
          totalInflowSum: { $sum: "$totalInflow" },
          totalOutflowSum: { $sum: "$totalOutflow" }
        }
      }
    ]);

    res.json(summary.length > 0 ? summary[0] : {});
  } catch (error) {
    console.error("Error fetching cash flow summary:", error);
    res.status(500).json({ message: "Error fetching cash flow summary" });
  }
});

// ✅ GET - Simple mode summary
router.get("/simple/summary/overview", verifyToken, async (req, res) => {
  try {
    const summary = await SimpleCashFlowStatement.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.user.id) } },
      {
        $group: {
          _id: null,
          totalStatements: { $sum: 1 },
          averageInflow: { $avg: "$totalInflow" },
          averageOutflow: { $avg: "$totalOutflow" },
          averageNetFlow: { $avg: "$netCashFlow" },
          positiveStatements: {
            $sum: { $cond: [{ $eq: ["$status", "positive"] }, 1, 0] }
          },
          negativeStatements: {
            $sum: { $cond: [{ $eq: ["$status", "negative"] }, 1, 0] }
          },
          totalInflowSum: { $sum: "$totalInflow" },
          totalOutflowSum: { $sum: "$totalOutflow" }
        }
      }
    ]);

    res.json(summary.length > 0 ? summary[0] : {});
  } catch (error) {
    console.error("Error fetching simple summary:", error);
    res.status(500).json({ message: "Error fetching simple summary" });
  }
});

export default router;
