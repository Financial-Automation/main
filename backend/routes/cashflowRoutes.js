import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const router = express.Router();

// ✅ CashFlow Entry Schema
const cashflowEntrySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  year: { type: String, required: true },
  month: { type: String, required: true },
  cashInflow: { type: Number, required: true },
  cashOutflow: { type: Number, required: true },
  netCashFlow: { type: Number, required: true },
  time: { type: Number, required: true },
  description: { type: String, default: "" },
  category: { type: String, default: "General" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// ✅ Add index for better query performance
cashflowEntrySchema.index({ userId: 1, year: 1, month: 1 });
cashflowEntrySchema.index({ userId: 1, createdAt: -1 });

const CashFlowEntry = mongoose.model("CashFlowEntry", cashflowEntrySchema);

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

// ✅ Middleware to verify JWT token (same as server.js)
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

// ✅ POST route to store cash flow entry (Protected) - Updated for multiple entries
router.post("/add", verifyToken, async (req, res) => {
  try {
    const { year, month, cashInflow, cashOutflow, description, category } = req.body;
    
    // Validation
    if (!year || !month || cashInflow === undefined || cashOutflow === undefined) {
      return res.status(400).json({ message: "Year, month, cash inflow, and cash outflow are required" });
    }

    // Parse arrays for multiple entries
    const monthArray = Array.isArray(month) ? month : String(month).split(',').map(m => m.trim());
    const inflowArray = Array.isArray(cashInflow) ? cashInflow : String(cashInflow).split(',').map(val => parseFloat(val.trim()) || 0);
    const outflowArray = Array.isArray(cashOutflow) ? cashOutflow : String(cashOutflow).split(',').map(val => parseFloat(val.trim()) || 0);
    const descriptionArray = Array.isArray(description) ? description : [description || ""];
    const categoryArray = Array.isArray(category) ? category : [category || "General"];

    // Validate array lengths
    if (monthArray.length !== inflowArray.length || monthArray.length !== outflowArray.length) {
      return res.status(400).json({ message: "Number of months, cash inflows, and cash outflows must match" });
    }

    // Get the last time index for this user
    const lastEntry = await CashFlowEntry.findOne({ userId: req.user.id }).sort({ time: -1 });
    let nextTime = lastEntry ? lastEntry.time + 1 : 0;

    // Create multiple entries
    const newEntries = [];
    for (let i = 0; i < monthArray.length; i++) {
      const netCashFlow = parseFloat(inflowArray[i]) - parseFloat(outflowArray[i]);
      
      const newCashFlow = new CashFlowEntry({
        userId: req.user.id,
        year,
        month: monthArray[i],
        cashInflow: parseFloat(inflowArray[i]),
        cashOutflow: parseFloat(outflowArray[i]),
        netCashFlow,
        time: nextTime + i,
        description: descriptionArray[i] || "",
        category: categoryArray[i] || "General"
      });
      
      newEntries.push(newCashFlow);
    }

    // Save all entries
    await CashFlowEntry.insertMany(newEntries);

    res.status(201).json({ 
      message: `${newEntries.length} cash flow entries saved successfully!`,
      data: newEntries 
    });
  } catch (error) {
    console.error("Error saving cash flow entry:", error);
    res.status(500).json({ 
      message: "Error saving cash flow entry", 
      error: error.message 
    });
  }
});

// ✅ POST route to add multiple cash flow entries at once (Protected)
router.post("/add-bulk", verifyToken, async (req, res) => {
  try {
    const { entries } = req.body; // Array of entry objects
    
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ message: "Entries array is required" });
    }

    // Get the last time index for this user
    const lastEntry = await CashFlowEntry.findOne({ userId: req.user.id }).sort({ time: -1 });
    let nextTime = lastEntry ? lastEntry.time + 1 : 0;

    // Prepare entries with calculated fields
    const newEntries = entries.map((entry, index) => {
      const netCashFlow = parseFloat(entry.cashInflow) - parseFloat(entry.cashOutflow);
      
      return {
        userId: req.user.id,
        year: entry.year,
        month: entry.month,
        cashInflow: parseFloat(entry.cashInflow),
        cashOutflow: parseFloat(entry.cashOutflow),
        netCashFlow,
        time: nextTime + index,
        description: entry.description || "",
        category: entry.category || "General",
        createdAt: new Date(),
        updatedAt: new Date()
      };
    });

    // Save all entries
    await CashFlowEntry.insertMany(newEntries);

    res.status(201).json({ 
      message: `${newEntries.length} cash flow entries saved successfully!`,
      data: newEntries 
    });
  } catch (error) {
    console.error("Error saving bulk cash flow entries:", error);
    res.status(500).json({ 
      message: "Error saving bulk cash flow entries", 
      error: error.message 
    });
  }
});

// ✅ GET route to fetch all cash flow entries for logged-in user (Protected)
router.get("/all", verifyToken, async (req, res) => {
  try {
    const cashflows = await CashFlowEntry.find({ userId: req.user.id }).sort({ time: 1 });
    res.json(cashflows);
  } catch (error) {
    console.error("Error fetching cash flow data:", error);
    res.status(500).json({ 
      message: "Error fetching cash flow data",
      error: error.message 
    });
  }
});

// ✅ GET route to fetch entries for a specific year (Protected)
router.get("/year/:year", verifyToken, async (req, res) => {
  try {
    const { year } = req.params;
    const cashflows = await CashFlowEntry.find({ 
      userId: req.user.id, 
      year 
    }).sort({ time: 1 });
    
    res.json(cashflows);
  } catch (error) {
    console.error("Error fetching cash flow data for year:", error);
    res.status(500).json({ 
      message: "Error fetching cash flow data",
      error: error.message 
    });
  }
});

// ✅ GET route to fetch cash flow summary (Protected)
router.get("/summary", verifyToken, async (req, res) => {
  try {
    const summary = await CashFlowEntry.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.user.id) } },
      {
        $group: {
          _id: "$year",
          totalInflow: { $sum: "$cashInflow" },
          totalOutflow: { $sum: "$cashOutflow" },
          totalNetFlow: { $sum: "$netCashFlow" },
          entryCount: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json(summary);
  } catch (error) {
    console.error("Error fetching cash flow summary:", error);
    res.status(500).json({ 
      message: "Error fetching cash flow summary",
      error: error.message 
    });
  }
});

// ✅ PUT route to update a cash flow entry (Protected)
router.put("/update/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { year, month, cashInflow, cashOutflow, description, category } = req.body;

    // Find the entry and verify ownership
    const existingEntry = await CashFlowEntry.findOne({ _id: id, userId: req.user.id });
    if (!existingEntry) {
      return res.status(404).json({ message: "Cash flow entry not found" });
    }

    // Calculate new net cash flow
    const netCashFlow = parseFloat(cashInflow) - parseFloat(cashOutflow);

    // Update the entry
    const updatedEntry = await CashFlowEntry.findByIdAndUpdate(
      id,
      {
        year,
        month,
        cashInflow: parseFloat(cashInflow),
        cashOutflow: parseFloat(cashOutflow),
        netCashFlow,
        description: description || existingEntry.description,
        category: category || existingEntry.category,
        updatedAt: new Date()
      },
      { new: true } // Return updated document
    );

    res.json({ 
      message: "Cash flow entry updated successfully!", 
      data: updatedEntry 
    });
  } catch (error) {
    console.error("Error updating cash flow entry:", error);
    res.status(500).json({ 
      message: "Error updating cash flow entry",
      error: error.message 
    });
  }
});

// ✅ DELETE route to remove a cash flow entry (Protected)
router.delete("/delete/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership before deleting
    const deletedEntry = await CashFlowEntry.findOneAndDelete({ 
      _id: id, 
      userId: req.user.id 
    });
    
    if (!deletedEntry) {
      return res.status(404).json({ message: "Cash flow entry not found" });
    }

    res.json({ message: "Cash flow entry deleted successfully!" });
  } catch (error) {
    console.error("Error deleting cash flow entry:", error);
    res.status(500).json({ 
      message: "Error deleting cash flow entry",
      error: error.message 
    });
  }
});

// ✅ CASH FLOW PLANNING & CONTROL CENTER API
router.get("/planning", verifyToken, async (req, res) => {
  try {
    const userFilter = getUserFilter(req);
    const userIdStr = req.user.id || req.user._id?.toString();
    const userObjectId = mongoose.Types.ObjectId.isValid(userIdStr) ? new mongoose.Types.ObjectId(userIdStr) : null;
    const windowDays = parseInt(req.query.days || "30", 10);

    const now = new Date();
    const cutoffDate = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

    // Mongoose models
    const BookkeepingEntry = mongoose.models.BookkeepingEntry || mongoose.model("BookkeepingEntry");
    const Invoice = mongoose.models.Invoice || mongoose.model("Invoice");
    const PurchaseInvoice = mongoose.models.PurchaseInvoice || mongoose.model("PurchaseInvoice");
    const Payroll = mongoose.models.Payroll || mongoose.model("Payroll");

    // 1. Fetch Bookkeeping entries for Current Net Cash Position & MTD Actuals
    let currentCash = 0;
    let actualMTDInflow = 0;
    let actualMTDOutflow = 0;

    if (BookkeepingEntry) {
      const bkEntries = await BookkeepingEntry.find({
        ...userFilter,
        isDeleted: { $ne: true }
      }).lean();

      const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      bkEntries.forEach(entry => {
        const amt = entry.amount || 0;
        const isIncome = entry.type === "Income" || entry.type === "income";
        const isExpense = entry.type === "Expenses" || entry.type === "Expense" || entry.type === "expense";

        if (isIncome) currentCash += amt;
        if (isExpense) currentCash -= amt;

        if (entry.date && new Date(entry.date) >= startOfCurrentMonth) {
          if (isIncome) actualMTDInflow += amt;
          if (isExpense) actualMTDOutflow += amt;
        }
      });
    }

    // 2. Fetch Outstanding Sales Invoices (Expected Inflows)
    const salesInvoices = Invoice ? await Invoice.find({
      ...userFilter,
      isDeleted: false,
      paymentStatus: { $ne: "paid" }
    }).select("invoiceNumber customerName grandTotal amountPaid balanceDue dueDate paymentStatus status").lean() : [];

    let totalOverdueReceivables = 0;
    let totalUpcomingReceivables = 0;
    const inflowItems = [];

    salesInvoices.forEach(inv => {
      const balance = inv.balanceDue !== undefined ? inv.balanceDue : Math.max(0, (inv.grandTotal || 0) - (inv.amountPaid || 0));
      if (balance <= 0) return;

      const dueDate = inv.dueDate ? new Date(inv.dueDate) : now;
      const isOverdue = dueDate < now;
      const isInWindow = isOverdue || dueDate <= cutoffDate;

      if (isInWindow) {
        if (isOverdue) totalOverdueReceivables += balance;
        else totalUpcomingReceivables += balance;

        inflowItems.push({
          id: inv._id,
          type: "Sales Invoice",
          referenceNo: inv.invoiceNumber,
          partyName: inv.customerName || "Customer",
          amount: balance,
          dueDate: inv.dueDate,
          status: isOverdue ? "overdue" : "expected"
        });
      }
    });

    // 3. Fetch Outstanding Purchase Bills (Expected Outflows)
    const purchaseBills = PurchaseInvoice ? await PurchaseInvoice.find({
      $or: [{ userId: userObjectId }, { userId: userIdStr }],
      isDeleted: { $ne: true }
    }).select("billNo supplierName total paid balance createdAt").lean() : [];

    let totalOverduePayables = 0;
    let totalUpcomingPayables = 0;
    const outflowItems = [];

    purchaseBills.forEach(bill => {
      const balance = bill.balance !== undefined ? bill.balance : Math.max(0, (bill.total || 0) - (bill.paid || 0));
      if (balance <= 0) return;

      const billDate = bill.createdAt ? new Date(bill.createdAt) : now;
      const dueDate = new Date(billDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      const isOverdue = dueDate < now;
      const isInWindow = isOverdue || dueDate <= cutoffDate;

      if (isInWindow) {
        if (isOverdue) totalOverduePayables += balance;
        else totalUpcomingPayables += balance;

        outflowItems.push({
          id: bill._id,
          type: "Purchase Bill",
          referenceNo: bill.billNo || "PURCHASE",
          partyName: bill.supplierName || "Supplier",
          amount: balance,
          dueDate,
          status: isOverdue ? "overdue" : "expected"
        });
      }
    });

    // 4. Fetch Payroll Obligations
    let payrollObligations = 0;
    if (Payroll) {
      const pendingPayrolls = await Payroll.find({
        ...userFilter,
        status: { $ne: "paid" }
      }).lean();
      payrollObligations = pendingPayrolls.reduce((sum, p) => {
        const salary = Number(p.netSalary);
        return sum + (Number.isFinite(salary) && salary > 0 ? salary : 0);
      }, 0);

      if (payrollObligations > 0) {
        outflowItems.push({
          id: "payroll_pending",
          type: "Payroll",
          referenceNo: "PAYROLL",
          partyName: "Employee Salaries",
          amount: payrollObligations,
          dueDate: new Date(now.getFullYear(), now.getMonth() + 1, 1),
          status: "expected"
        });
      }
    }

    // 5. Projected Closing Cash & Risk Status
    const expectedInflowsTotal = totalOverdueReceivables + totalUpcomingReceivables;
    const expectedOutflowsTotal = totalOverduePayables + totalUpcomingPayables + payrollObligations;
    const projectedClosingCash = currentCash + expectedInflowsTotal - expectedOutflowsTotal;
    const potentialDeficit = projectedClosingCash < 0 ? Math.abs(projectedClosingCash) : 0;

    const drivers = [];
    if (totalOverdueReceivables > 0) {
      drivers.push(`Overdue customer receivables of ₹${totalOverdueReceivables.toLocaleString('en-IN')}`);
    }
    if (totalOverduePayables > 0) {
      drivers.push(`Overdue vendor payables of ₹${totalOverduePayables.toLocaleString('en-IN')}`);
    }
    if (payrollObligations > 0) {
      drivers.push(`Upcoming employee salary obligations of ₹${payrollObligations.toLocaleString('en-IN')}`);
    }

    const hasRisk = projectedClosingCash < 0 || (currentCash + expectedInflowsTotal < expectedOutflowsTotal);

    res.json({
      planningWindowDays: windowDays,
      openingCash: currentCash,
      currentCash,
      actualMTD: {
        inflow: actualMTDInflow,
        outflow: actualMTDOutflow,
        net: actualMTDInflow - actualMTDOutflow
      },
      expectedInflows: {
        totalInWindow: expectedInflowsTotal,
        overdue: totalOverdueReceivables,
        upcoming: totalUpcomingReceivables,
        count: inflowItems.length,
        items: inflowItems.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      },
      expectedOutflows: {
        totalInWindow: expectedOutflowsTotal,
        overdue: totalOverduePayables,
        upcoming: totalUpcomingPayables,
        payroll: payrollObligations,
        count: outflowItems.length,
        items: outflowItems.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      },
      projectedClosingCash,
      potentialDeficit,
      riskStatus: {
        hasRisk,
        severity: hasRisk ? (projectedClosingCash < 0 ? "danger" : "warning") : "healthy",
        warningMessage: hasRisk
          ? `Potential cash flow shortage detected in the next ${windowDays} days. Projected closing cash: ₹${projectedClosingCash.toLocaleString('en-IN')}.`
          : `Cash flow position healthy across the next ${windowDays} days.`,
        drivers
      }
    });
  } catch (error) {
    console.error("Error generating cash flow planning data:", error);
    res.status(500).json({ message: "Error generating cash flow planning data", error: error.message });
  }
});

// ✅ GET route for dynamic Cash Flow Prediction based on real historical transactions & manual entries
router.get("/predict", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // 1. Fetch manual entries
    const manualEntries = await CashFlowEntry.find({ userId: userObjectId }).sort({ time: 1 });

    // 2. Fetch live data metrics across historical months (past 6 months)
    const now = new Date();
    const monthlyPoints = [];

    // Combine manual entries if available
    if (manualEntries.length >= 2) {
      manualEntries.forEach(entry => {
        monthlyPoints.push({
          label: `${entry.month} ${entry.year}`,
          inflow: entry.cashInflow,
          outflow: entry.cashOutflow,
          net: entry.netCashFlow,
          time: entry.time
        });
      });
    } else {
      // Build monthly points from central Bookkeeping collection
      const BookkeepingEntry = mongoose.model("BookkeepingEntry");

      for (let i = 5; i >= 0; i--) {
        const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
        const monthLabel = mStart.toLocaleDateString("en-US", { month: "short", year: "numeric" });

        let monthInflow = 0;
        let monthOutflow = 0;

        if (BookkeepingEntry) {
          const bkEntries = await BookkeepingEntry.find({
            $or: [{ userId: userObjectId }, { userId: userId.toString() }],
            isDeleted: { $ne: true },
            date: { $gte: mStart, $lte: mEnd }
          });
          monthInflow = bkEntries.filter(e => e.type === "income" || e.type === "Income").reduce((sum, e) => sum + (e.amount || 0), 0);
          monthOutflow = bkEntries.filter(e => e.type === "expense" || e.type === "Expense").reduce((sum, e) => sum + (e.amount || 0), 0);
        }

        if (monthInflow > 0 || monthOutflow > 0) {
          monthlyPoints.push({
            label: monthLabel,
            inflow: monthInflow,
            outflow: monthOutflow,
            net: monthInflow - monthOutflow,
            time: 5 - i
          });
        }
      }
    }

    if (monthlyPoints.length < 1) {
      return res.json({
        hasEnoughData: false,
        message: "Not enough historical data for reliable prediction",
        predictions: []
      });
    }

    const n = monthlyPoints.length;
    let slopeInflow = 0, interceptInflow = 0;
    let slopeOutflow = 0, interceptOutflow = 0;

    if (n === 1) {
      // Single month baseline: use current month's inflow and outflow as baseline forecast
      interceptInflow = monthlyPoints[0].inflow;
      interceptOutflow = monthlyPoints[0].outflow;
    } else {
      // Multi-month trend: Perform Linear Regression over historical monthly points
      const sumX = monthlyPoints.reduce((sum, p) => sum + p.time, 0);
      const sumYInflow = monthlyPoints.reduce((sum, p) => sum + p.inflow, 0);
      const sumYOutflow = monthlyPoints.reduce((sum, p) => sum + p.outflow, 0);
      const sumXYInflow = monthlyPoints.reduce((sum, p) => sum + p.time * p.inflow, 0);
      const sumXYOutflow = monthlyPoints.reduce((sum, p) => sum + p.time * p.outflow, 0);
      const sumXX = monthlyPoints.reduce((sum, p) => sum + p.time * p.time, 0);

      const denom = (n * sumXX - sumX * sumX) || 1;

      slopeInflow = (n * sumXYInflow - sumX * sumYInflow) / denom;
      interceptInflow = (sumYInflow - slopeInflow * sumX) / n;

      slopeOutflow = (n * sumXYOutflow - sumX * sumYOutflow) / denom;
      interceptOutflow = (sumYOutflow - slopeOutflow * sumX) / n;
    }

    const futurePredictions = [];
    const lastTime = monthlyPoints[monthlyPoints.length - 1].time;

    for (let i = 1; i <= 6; i++) {
      const futureTime = lastTime + i;
      const predictedInflow = Math.max(0, Math.round(slopeInflow * futureTime + interceptInflow));
      const predictedOutflow = Math.max(0, Math.round(slopeOutflow * futureTime + interceptOutflow));
      const predictedNet = predictedInflow - predictedOutflow;

      const futureDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthName = futureDate.toLocaleDateString("en-US", { month: "short", year: "numeric" });

      futurePredictions.push({
        month: `Month +${i} (${monthName})`,
        predictedInflow,
        predictedOutflow,
        predictedNet,
        time: futureTime
      });
    }

    res.json({
      hasEnoughData: true,
      method: "Linear Regression over historical transaction data",
      historicalPoints: monthlyPoints,
      predictions: futurePredictions,
      nextMonth: futurePredictions[0],
      next3Months: futurePredictions.slice(0, 3),
      next6Months: futurePredictions
    });
  } catch (error) {
    console.error("Error in cashflow prediction:", error);
    res.status(500).json({ message: "Error generating cashflow prediction", error: error.message });
  }
});

export default router;