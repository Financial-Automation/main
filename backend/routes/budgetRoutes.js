import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import Budget from "../models/Budget.js";

const router = express.Router();

// Helper to get user filter for tenant isolation
const getUserFilter = (req) => {
  const userIdStr = req.user?.id || req.user?._id?.toString();
  if (!userIdStr || userIdStr === "000000000000000000000000") return { userId: null };
  const userObjectId = mongoose.Types.ObjectId.isValid(userIdStr)
    ? new mongoose.Types.ObjectId(userIdStr)
    : null;

  return userObjectId
    ? { $or: [{ userId: userObjectId }, { userId: userIdStr }] }
    : { userId: userIdStr };
};

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  if (process.env.SKIP_DUPLICATE_JWT !== "false" && req.user) return next();
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Access denied. No token provided." });

  try {
    const JWT_SECRET = process.env.JWT_SECRET || "fallback_jwt_secret_2024_finance_app";
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ message: "Invalid token" });
  }
};

// 1. Create or Upsert Category Budget
router.post("/", verifyToken, async (req, res) => {
  try {
    const { category, budgetAmount, period, notes } = req.body;

    if (!category || typeof category !== "string" || !category.trim()) {
      return res.status(400).json({ message: "Category name is required" });
    }

    const parsedAmount = parseFloat(budgetAmount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      return res.status(400).json({ message: "Valid positive budget amount is required" });
    }

    const userFilter = getUserFilter(req);
    const userId = req.user.id || req.user._id;

    // Check if budget already exists for this user and category
    const categoryName = category.trim();
    const periodName = period || "monthly";

    const budget = await Budget.findOneAndUpdate(
      { ...userFilter, category: { $regex: new RegExp(`^${categoryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }, period: periodName },
      {
        userId,
        category: categoryName,
        budgetAmount: parsedAmount,
        period: periodName,
        notes: notes ? notes.trim() : "",
        status: "active",
        updatedAt: new Date()
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.status(201).json({
      message: "Budget set successfully!",
      budget
    });
  } catch (error) {
    console.error("Error setting budget:", error);
    res.status(500).json({ message: "Failed to set budget", error: error.message });
  }
});

// 2. Get All Budgets for User
router.get("/", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const { status } = req.query;

    const filter = { ...userFilter };
    if (status && status !== "all") {
      filter.status = status;
    }

    const budgets = await Budget.find(filter).sort({ category: 1 }).lean();
    res.json(budgets);
  } catch (error) {
    console.error("Error fetching budgets:", error);
    res.status(500).json({ message: "Failed to fetch budgets", error: error.message });
  }
});

// 3. Expense Management & Budget Control Center Aggregation API
router.get("/summary", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const now = new Date();

    const targetYear = req.query.year ? parseInt(req.query.year, 10) : now.getFullYear();
    const targetMonth = req.query.month ? parseInt(req.query.month, 10) - 1 : now.getMonth();

    const currentMonthStart = new Date(targetYear, targetMonth, 1);
    const currentMonthEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

    const prevMonthStart = new Date(targetYear, targetMonth - 1, 1);
    const prevMonthEnd = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

    const BookkeepingEntry = mongoose.models.BookkeepingEntry || mongoose.model("BookkeepingEntry");

    // Fetch Bookkeeping Expense entries for current and previous months
    let currentExpenses = [];
    let prevExpenses = [];

    if (BookkeepingEntry) {
      const [curr, prev] = await Promise.all([
        BookkeepingEntry.find({
          ...userFilter,
          isDeleted: { $ne: true },
          type: { $in: ["expense", "Expense", "Expenses"] },
          date: { $gte: currentMonthStart, $lte: currentMonthEnd }
        }).lean(),
        BookkeepingEntry.find({
          ...userFilter,
          isDeleted: { $ne: true },
          type: { $in: ["expense", "Expense", "Expenses"] },
          date: { $gte: prevMonthStart, $lte: prevMonthEnd }
        }).lean()
      ]);

      currentExpenses = curr;
      prevExpenses = prev;
    }

    // Group actual expenses by category
    const currentCategoryTotals = {};
    let totalCurrentExpenses = 0;
    currentExpenses.forEach(e => {
      const cat = e.category || "General";
      const amt = e.amount || 0;
      currentCategoryTotals[cat] = (currentCategoryTotals[cat] || 0) + amt;
      totalCurrentExpenses += amt;
    });

    const prevCategoryTotals = {};
    let totalPrevExpenses = 0;
    prevExpenses.forEach(e => {
      const cat = e.category || "General";
      const amt = e.amount || 0;
      prevCategoryTotals[cat] = (prevCategoryTotals[cat] || 0) + amt;
      totalPrevExpenses += amt;
    });

    // Fetch set Budgets for this user
    const budgets = await Budget.find({ ...userFilter, status: "active" }).lean();
    const budgetMap = {};
    let totalBudgetSet = 0;
    budgets.forEach(b => {
      budgetMap[b.category] = b;
      totalBudgetSet += b.budgetAmount;
    });

    // Collect all unique categories from actual expenses + defined budgets
    const allCategoriesSet = new Set([
      ...Object.keys(currentCategoryTotals),
      ...Object.keys(prevCategoryTotals),
      ...Object.keys(budgetMap)
    ]);

    const categoryBreakdown = [];
    const alerts = [];
    let overBudgetCount = 0;
    let nearLimitCount = 0;

    allCategoriesSet.forEach(cat => {
      const currAmt = currentCategoryTotals[cat] || 0;
      const prevAmt = prevCategoryTotals[cat] || 0;
      const budgetDoc = budgetMap[cat];
      const budgetAmt = budgetDoc ? budgetDoc.budgetAmount : 0;

      const remaining = Math.max(0, budgetAmt - currAmt);
      const usagePercentage = budgetAmt > 0 ? Math.round((currAmt / budgetAmt) * 100) : 0;

      let status = "on_track";
      if (budgetAmt > 0) {
        if (currAmt > budgetAmt) {
          status = "over_budget";
          overBudgetCount++;
          alerts.push({
            category: cat,
            severity: "danger",
            message: `${cat} has exceeded its monthly budget by ₹${(currAmt - budgetAmt).toLocaleString('en-IN')} (${usagePercentage}% utilized).`
          });
        } else if (currAmt >= 0.8 * budgetAmt) {
          status = "near_limit";
          nearLimitCount++;
          alerts.push({
            category: cat,
            severity: "warning",
            message: `${cat} is nearing its budget limit (${usagePercentage}% utilized).`
          });
        }
      } else {
        status = "no_budget";
      }

      const monthOverMonthChange = prevAmt > 0
        ? Math.round(((currAmt - prevAmt) / prevAmt) * 100)
        : (currAmt > 0 ? 100 : 0);

      const percentOfTotal = totalCurrentExpenses > 0
        ? Math.round((currAmt / totalCurrentExpenses) * 100)
        : 0;

      categoryBreakdown.push({
        category: cat,
        budgetAmount: budgetAmt,
        currentAmount: currAmt,
        previousAmount: prevAmt,
        remainingBudget: remaining,
        usagePercentage,
        monthOverMonthChange,
        percentOfTotal,
        status,
        budgetId: budgetDoc ? budgetDoc._id : null,
        notes: budgetDoc ? budgetDoc.notes : ""
      });
    });

    // Sort category breakdown by current amount descending
    categoryBreakdown.sort((a, b) => b.currentAmount - a.currentAmount);

    const largestCategory = categoryBreakdown.length > 0 ? categoryBreakdown[0].category : "None";
    const totalExpenseChangePercent = totalPrevExpenses > 0
      ? Math.round(((totalCurrentExpenses - totalPrevExpenses) / totalPrevExpenses) * 100)
      : (totalCurrentExpenses > 0 ? 100 : 0);

    const totalBudgetUsagePercent = totalBudgetSet > 0
      ? Math.round((totalCurrentExpenses / totalBudgetSet) * 100)
      : 0;

    res.json({
      period: `${currentMonthStart.toLocaleString('default', { month: 'long' })} ${targetYear}`,
      totalCurrentMonthExpenses: totalCurrentExpenses,
      totalPrevMonthExpenses: totalPrevExpenses,
      totalExpenseChangePercent,
      totalBudgetSet,
      totalBudgetUsagePercent,
      largestCategory,
      overBudgetCount,
      nearLimitCount,
      alerts,
      categories: categoryBreakdown,
      recentExpenses: currentExpenses.slice(0, 10)
    });
  } catch (error) {
    console.error("Error generating expense budget summary:", error);
    res.status(500).json({ message: "Error generating expense budget summary", error: error.message });
  }
});

// 4. Get Single Budget by ID
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const budget = await Budget.findOne({ _id: req.params.id, ...userFilter }).lean();
    if (!budget) {
      return res.status(404).json({ message: "Budget not found" });
    }
    res.json(budget);
  } catch (error) {
    console.error("Error fetching budget:", error);
    res.status(500).json({ message: "Failed to fetch budget", error: error.message });
  }
});

// 5. Update Budget Amount or Notes
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const { budgetAmount, notes, status } = req.body;

    const updateFields = { updatedAt: new Date() };
    if (budgetAmount !== undefined) {
      const parsed = parseFloat(budgetAmount);
      if (isNaN(parsed) || parsed < 0) {
        return res.status(400).json({ message: "Valid positive budget amount required" });
      }
      updateFields.budgetAmount = parsed;
    }
    if (notes !== undefined) updateFields.notes = notes.trim();
    if (status !== undefined && ["active", "inactive"].includes(status)) updateFields.status = status;

    const updatedBudget = await Budget.findOneAndUpdate(
      { _id: req.params.id, ...userFilter },
      updateFields,
      { new: true, runValidators: true }
    );

    if (!updatedBudget) {
      return res.status(404).json({ message: "Budget not found" });
    }

    res.json({
      message: "Budget updated successfully!",
      budget: updatedBudget
    });
  } catch (error) {
    console.error("Error updating budget:", error);
    res.status(500).json({ message: "Failed to update budget", error: error.message });
  }
});

// 6. Delete Budget (Safe removal of target, DOES NOT delete Bookkeeping entries)
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const deletedBudget = await Budget.findOneAndDelete({ _id: req.params.id, ...userFilter });

    if (!deletedBudget) {
      return res.status(404).json({ message: "Budget not found" });
    }

    res.json({
      message: "Budget limit removed successfully! Historical bookkeeping transactions remain intact.",
      deleted: true
    });
  } catch (error) {
    console.error("Error deleting budget:", error);
    res.status(500).json({ message: "Failed to delete budget", error: error.message });
  }
});

export default router;
