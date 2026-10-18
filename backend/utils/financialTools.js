import mongoose from "mongoose";
import Invoice from "../models/Invoice.js";
import BookkeepingEntry from "../models/BookkeepingEntry.js";
import CashTransaction from "../models/CashTransaction.js";
import Customer from "../models/Customer.js";
import Sale from "../models/Sale.js";
import { getFinanceMetrics, getLiveBalanceSheet, getGstAnalytics, resolvePeriod } from "./financeAggregator.js";

// Safe decimal rounding helper
export const roundDec = (val) => Math.round((Number(val) || 0) * 100) / 100;
export const toNumber = (val) => (Number.isFinite(Number(val)) ? Number(val) : 0);

export const formatINR = (val) =>
  `₹${toNumber(val).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// User scope filter supporting both ObjectId and string representation
export const getUserScope = (userId) => {
  if (!userId) throw new Error("Missing authenticated user context");
  const idStr = String(userId);
  if (mongoose.Types.ObjectId.isValid(idStr)) {
    const objId = new mongoose.Types.ObjectId(idStr);
    return {
      $or: [{ userId: objId }, { userId: idStr }, { createdBy: idStr }],
    };
  }
  return {
    $or: [{ userId: idStr }, { createdBy: idStr }],
  };
};

// Authoritative Period Resolver with calendar boundaries
export const resolveDateRange = (period = "this-month", refDate = new Date()) => {
  const now = new Date(refDate);
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  let start = new Date(currentYear, currentMonth, 1, 0, 0, 0, 0);
  let end = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);
  let label = "this month";

  const p = String(period || "").toLowerCase().trim();

  if (p === "last-month" || p === "last month" || p === "previous month") {
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    start = new Date(prevYear, prevMonth, 1, 0, 0, 0, 0);
    end = new Date(prevYear, prevMonth + 1, 0, 23, 59, 59, 999);
    label = "last month";
  } else if (p === "this-quarter" || p === "this quarter" || p === "current quarter") {
    const qStartMonth = Math.floor(currentMonth / 3) * 3;
    start = new Date(currentYear, qStartMonth, 1, 0, 0, 0, 0);
    end = new Date(currentYear, qStartMonth + 3, 0, 23, 59, 59, 999);
    label = "this quarter";
  } else if (p === "this-year" || p === "this year" || p === "current year" || p === "financial year") {
    start = new Date(currentYear, 0, 1, 0, 0, 0, 0);
    end = new Date(currentYear, 11, 31, 23, 59, 59, 999);
    label = "this year";
  } else if (p === "today") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    label = "today";
  }

  const isDateInPeriod = (dateInput) => {
    if (!dateInput) return false;
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return false;
    return d >= start && d <= end;
  };

  const formattedDate = `${start.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })} – ${end.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

  return { start, end, label, formattedDate, isDateInPeriod };
};

// Dynamic Mongoose model getters to avoid circular dependencies
export const getModel = (name, fallbackSchema = {}) => {
  try {
    return mongoose.model(name);
  } catch {
    return mongoose.model(name, new mongoose.Schema(fallbackSchema, { strict: false }));
  }
};

export const getPurchaseInvoiceModel = () => getModel("PurchaseInvoice");
export const getInventoryItemModel = () => getModel("InventoryItem");
export const getPayrollModel = () => getModel("Payroll");
export const getFinancialRatiosModel = () => getModel("FinancialRatios");
export const getCashFlowStatementModel = () => getModel("CashFlowStatement");
export const getCashFlowEntryModel = () => getModel("CashFlowEntry");
export const getBankReconciliationModel = () => getModel("BankReconciliationSession");
export const getFraudTransactionModel = () => getModel("FraudTransaction");
export const getFraudRuleModel = () => getModel("FraudRule");
export const getCivilProjectModel = () => getModel("CivilProject");
export const getLedgerAccountModel = () => getModel("LedgerAccount");

// Outstanding balance helper for invoices and purchase bills
export const getOutstandingBalance = (record) => {
  if (!record) return 0;
  const total = toNumber(record.grandTotal ?? record.total);
  const paid = toNumber(record.paid ?? record.amountPaid);
  if (record.balance !== undefined && record.balance !== null) {
    return Math.max(0, toNumber(record.balance));
  }
  if (record.balanceDue !== undefined && record.balanceDue !== null) {
    return Math.max(0, toNumber(record.balanceDue));
  }
  return Math.max(0, total - paid);
};

export const isOpenInvoice = (record) => {
  if (!record || record.isDeleted) return false;
  const status = String(record.status || "").toLowerCase();
  const paymentStatus = String(record.paymentStatus || "").toLowerCase();
  if (status === "cancelled" || status === "paid" || paymentStatus === "paid") return false;
  return getOutstandingBalance(record) > 0;
};

// ============================================================================
// 1. DASHBOARD & FINANCIAL OVERVIEW (EXACT DASHBOARD CALCULATION PARITY)
// ============================================================================
export const getDashboardSummary = async ({ userId, period = "this-month" }) => {
  const scope = getUserScope(userId);
  const dateRange = resolveDateRange(period);
  const PurchaseInvoice = getPurchaseInvoiceModel();

  // 1. Purchase Invoices -> Total Payables
  const purchases = await PurchaseInvoice.find({ ...scope, isDeleted: { $ne: true } }).lean();
  const filteredPurchases = purchases.filter(
    (inv) =>
      inv.status !== "cancelled" &&
      dateRange.isDateInPeriod(inv.createdAt || inv.billDate)
  );

  const purchasePayables = filteredPurchases.reduce((sum, inv) => {
    if (inv.status === "cancelled") return sum;
    return sum + getOutstandingBalance(inv);
  }, 0);

  const totalPayables = roundDec(purchasePayables);

  // 2. Sales Invoices -> Total Receivables
  const invoices = await Invoice.find({
    ...scope,
    isDeleted: { $ne: true },
    sourceInvoiceType: { $ne: "purchase" },
  }).lean();

  const filteredInvoices = invoices.filter(
    (inv) =>
      inv.status !== "cancelled" &&
      dateRange.isDateInPeriod(inv.invoiceDate || inv.createdAt)
  );

  const invoiceReceivables = filteredInvoices.reduce((sum, inv) => {
    if (inv.status === "cancelled" || inv.status === "paid") return sum;
    return sum + getOutstandingBalance(inv);
  }, 0);

  // 3. Bookkeeping entries for fallback & income/expense calculation
  const bkEntries = await BookkeepingEntry.find({
    ...scope,
    isDeleted: { $ne: true },
    date: { $gte: dateRange.start, $lte: dateRange.end },
  }).lean();

  const bkIncome = bkEntries
    .filter((e) => String(e.type || "").toLowerCase() === "income")
    .reduce((sum, e) => sum + toNumber(e.amount), 0);

  const bkExpense = bkEntries
    .filter((e) => String(e.type || "").toLowerCase() === "expense")
    .reduce((sum, e) => sum + toNumber(e.amount), 0);

  // 4. Central Finance Metrics (P&L source)
  const metrics = await getFinanceMetrics(userId, dateRange.start, dateRange.end);
  const netProfit = roundDec(
    metrics?.netProfit !== undefined ? metrics.netProfit : bkIncome - bkExpense
  );

  const totalRevenue = roundDec(
    metrics?.revenue?.total ||
      filteredInvoices.reduce((s, i) => s + toNumber(i.grandTotal || i.total), 0) ||
      bkIncome
  );

  const totalExpenses = roundDec(
    metrics?.expense?.total ||
      filteredPurchases.reduce((s, p) => s + toNumber(p.total), 0) ||
      bkExpense
  );

  // Receivables exact logic matching Dashboard.tsx line 491-493
  const totalReceivables = roundDec(
    invoiceReceivables > 0
      ? invoiceReceivables
      : metrics?.cashFlow?.receivables > 0
      ? metrics.cashFlow.receivables
      : bkIncome
  );

  // GST Payable matching Dashboard.tsx line 506
  const gstData = await getGstAnalytics(userId, period);
  const gstPayable = roundDec(gstData?.gstSummary?.gstPayable || 0);

  const grossProfitMargin =
    totalRevenue > 0
      ? roundDec(((totalRevenue - (metrics?.expense?.cogs || 0)) / totalRevenue) * 100)
      : 0;

  const netProfitMargin =
    totalRevenue > 0 ? roundDec((netProfit / totalRevenue) * 100) : 0;

  return {
    period: dateRange.label,
    reportingDate: dateRange.formattedDate,
    currency: "INR",
    totalPayables,
    totalReceivables,
    netProfit,
    gstPayable,
    totalRevenue,
    totalExpenses,
    grossProfitMargin,
    netProfitMargin,
    isProfitable: netProfit >= 0,
    metrics: {
      openSalesInvoicesCount: filteredInvoices.filter(isOpenInvoice).length,
      openPurchaseInvoicesCount: filteredPurchases.filter(isOpenInvoice).length,
      bookkeepingIncome: bkIncome,
      bookkeepingExpense: bkExpense,
    },
  };
};

// ============================================================================
// 2. ACCOUNTS PAYABLE & SUPPLIER MANAGEMENT
// ============================================================================
export const getTotalPayables = async ({ userId, period = "this-month" }) => {
  const scope = getUserScope(userId);
  const dateRange = resolveDateRange(period);
  const PurchaseInvoice = getPurchaseInvoiceModel();

  const records = await PurchaseInvoice.find({ ...scope, isDeleted: { $ne: true } }).lean();

  const openBills = records.filter(
    (item) =>
      item.status !== "cancelled" &&
      dateRange.isDateInPeriod(item.createdAt || item.billDate) &&
      isOpenInvoice(item)
  );

  const now = new Date();
  const overdueBills = openBills.filter(
    (item) => item.dueDate && new Date(item.dueDate) < now
  );

  const totalAmount = roundDec(
    openBills.reduce((sum, item) => sum + getOutstandingBalance(item), 0)
  );

  const overdueAmount = roundDec(
    overdueBills.reduce((sum, item) => sum + getOutstandingBalance(item), 0)
  );

  // Group by supplier
  const supplierMap = {};
  openBills.forEach((bill) => {
    const name = bill.supplierName || bill.partyName || "Unspecified Supplier";
    if (!supplierMap[name]) {
      supplierMap[name] = {
        supplierName: name,
        phone: bill.phone || "",
        gstin: bill.gstin || "",
        amount: 0,
        invoiceCount: 0,
        invoices: [],
      };
    }
    const bal = getOutstandingBalance(bill);
    supplierMap[name].amount = roundDec(supplierMap[name].amount + bal);
    supplierMap[name].invoiceCount += 1;
    supplierMap[name].invoices.push({
      billNo: bill.billNo || bill._id,
      billDate: bill.billDate || bill.createdAt,
      dueDate: bill.dueDate,
      total: toNumber(bill.total),
      paid: toNumber(bill.paid),
      balance: bal,
      isOverdue: Boolean(bill.dueDate && new Date(bill.dueDate) < now),
    });
  });

  const suppliers = Object.values(supplierMap).sort((a, b) => b.amount - a.amount);

  return {
    metric: "total_payables",
    amount: totalAmount,
    overdueAmount,
    outstandingInvoiceCount: openBills.length,
    overdueInvoiceCount: overdueBills.length,
    supplierCount: suppliers.length,
    suppliers: suppliers.slice(0, 10),
    invoices: openBills.slice(0, 25).map((b) => ({
      billNo: b.billNo || b._id,
      supplierName: b.supplierName || "Unspecified Supplier",
      billDate: b.billDate || b.createdAt,
      dueDate: b.dueDate,
      total: toNumber(b.total),
      balance: getOutstandingBalance(b),
      isOverdue: Boolean(b.dueDate && new Date(b.dueDate) < now),
    })),
    overdueInvoices: overdueBills.slice(0, 25).map((b) => ({
      billNo: b.billNo || b._id,
      supplierName: b.supplierName || "Unspecified Supplier",
      dueDate: b.dueDate,
      balance: getOutstandingBalance(b),
    })),
    currency: "INR",
    period: dateRange.label,
    reportingDate: dateRange.formattedDate,
  };
};

// ============================================================================
// 3. ACCOUNTS RECEIVABLE & CUSTOMER MANAGEMENT
// ============================================================================
export const getTotalReceivables = async ({ userId, period = "this-month" }) => {
  const scope = getUserScope(userId);
  const dateRange = resolveDateRange(period);

  const records = await Invoice.find({
    ...scope,
    isDeleted: { $ne: true },
    sourceInvoiceType: { $ne: "purchase" },
  }).lean();

  const openInvoices = records.filter(
    (item) =>
      item.status !== "cancelled" &&
      item.status !== "paid" &&
      dateRange.isDateInPeriod(item.invoiceDate || item.createdAt) &&
      isOpenInvoice(item)
  );

  const now = new Date();
  const overdueInvoices = openInvoices.filter(
    (item) => item.dueDate && new Date(item.dueDate) < now
  );

  const invoiceReceivables = roundDec(
    openInvoices.reduce((sum, item) => sum + getOutstandingBalance(item), 0)
  );

  // Match Dashboard.tsx calcReceivables logic
  let finalAmount = invoiceReceivables;
  if (finalAmount === 0) {
    const metrics = await getFinanceMetrics(userId, dateRange.start, dateRange.end);
    if (metrics?.cashFlow?.receivables > 0) {
      finalAmount = metrics.cashFlow.receivables;
    }
  }

  const overdueAmount = roundDec(
    overdueInvoices.reduce((sum, item) => sum + getOutstandingBalance(item), 0)
  );

  // Group by customer
  const customerMap = {};
  openInvoices.forEach((inv) => {
    const name = inv.customerName || inv.partyName || "Unspecified Customer";
    if (!customerMap[name]) {
      customerMap[name] = {
        customerName: name,
        email: inv.customerEmail || "",
        phone: inv.customerPhone || "",
        gstin: inv.customerGSTIN || "",
        amount: 0,
        invoiceCount: 0,
        invoices: [],
      };
    }
    const bal = getOutstandingBalance(inv);
    customerMap[name].amount = roundDec(customerMap[name].amount + bal);
    customerMap[name].invoiceCount += 1;
    customerMap[name].invoices.push({
      invoiceNumber: inv.invoiceNumber || inv.invoiceNo || inv._id,
      invoiceDate: inv.invoiceDate || inv.createdAt,
      dueDate: inv.dueDate,
      total: toNumber(inv.grandTotal || inv.total),
      paid: toNumber(inv.amountPaid || inv.paid),
      balance: bal,
      isOverdue: Boolean(inv.dueDate && new Date(inv.dueDate) < now),
    });
  });

  const customers = Object.values(customerMap).sort((a, b) => b.amount - a.amount);

  return {
    metric: "total_receivables",
    amount: roundDec(finalAmount),
    overdueAmount,
    outstandingInvoiceCount: openInvoices.length,
    overdueInvoiceCount: overdueInvoices.length,
    customerCount: customers.length,
    customers: customers.slice(0, 10),
    invoices: openInvoices.slice(0, 25).map((inv) => ({
      invoiceNumber: inv.invoiceNumber || inv.invoiceNo || inv._id,
      customerName: inv.customerName || "Customer",
      invoiceDate: inv.invoiceDate || inv.createdAt,
      dueDate: inv.dueDate,
      total: toNumber(inv.grandTotal || inv.total),
      balance: getOutstandingBalance(inv),
      isOverdue: Boolean(inv.dueDate && new Date(inv.dueDate) < now),
    })),
    overdueInvoices: overdueInvoices.slice(0, 25).map((inv) => ({
      invoiceNumber: inv.invoiceNumber || inv._id,
      customerName: inv.customerName || "Customer",
      dueDate: inv.dueDate,
      balance: getOutstandingBalance(inv),
    })),
    currency: "INR",
    period: dateRange.label,
    reportingDate: dateRange.formattedDate,
  };
};

// ============================================================================
// 4. PROFIT & LOSS AND REVENUE/EXPENSE BREAKDOWN
// ============================================================================
export const getProfitAndLoss = async ({ userId, period = "this-month" }) => {
  const scope = getUserScope(userId);
  const dateRange = resolveDateRange(period);

  const metrics = await getFinanceMetrics(userId, dateRange.start, dateRange.end);

  const bkEntries = await BookkeepingEntry.find({
    ...scope,
    isDeleted: { $ne: true },
    date: { $gte: dateRange.start, $lte: dateRange.end },
  }).lean();

  const bkExpensesByCategory = {};
  bkEntries
    .filter((e) => String(e.type || "").toLowerCase() === "expense")
    .forEach((e) => {
      const cat = e.category || "General Expense";
      bkExpensesByCategory[cat] = roundDec((bkExpensesByCategory[cat] || 0) + toNumber(e.amount));
    });

  const totalRevenue = roundDec(metrics.revenue.total);
  const totalExpenses = roundDec(metrics.expense.total);
  const netProfit = roundDec(metrics.netProfit);
  const profitMargin = roundDec(metrics.profitMargin);

  const sortedExpenses = Object.entries(bkExpensesByCategory)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  return {
    metric: "profit_and_loss",
    period: dateRange.label,
    reportingDate: dateRange.formattedDate,
    currency: "INR",
    totalRevenue,
    totalExpenses,
    netProfit,
    profitMargin,
    isProfitable: netProfit >= 0,
    revenueBreakdown: {
      salesRevenue: metrics.revenue.sales,
      inventorySales: metrics.revenue.inventorySales,
      otherIncome: metrics.revenue.bookkeepingIncome,
    },
    expenseBreakdown: {
      costOfMaterials: metrics.expense.costOfMaterials,
      cogs: metrics.expense.cogs,
      salaries: metrics.expense.salaries,
      rent: metrics.expense.rent,
      utilities: metrics.expense.utilities,
      financeCost: metrics.expense.financeCost,
      depreciation: metrics.expense.depreciation,
      amortization: metrics.expense.amortization,
      otherExpenses: metrics.expense.otherExpenses,
      byCategory: sortedExpenses,
    },
  };
};

// ============================================================================
// 5. EXPENSE COMPARISON & VARIANCE ANALYSIS (CFO-LEVEL REASONING)
// ============================================================================
export const getExpenseAnalysis = async ({
  userId,
  currentPeriod = "this-month",
  comparePeriod = "last-month",
}) => {
  const scope = getUserScope(userId);
  const current = resolveDateRange(currentPeriod);
  const compare = resolveDateRange(comparePeriod);

  const [currEntries, compEntries] = await Promise.all([
    BookkeepingEntry.find({
      ...scope,
      isDeleted: { $ne: true },
      type: { $regex: /^expense$/i },
      date: { $gte: current.start, $lte: current.end },
    }).lean(),
    BookkeepingEntry.find({
      ...scope,
      isDeleted: { $ne: true },
      type: { $regex: /^expense$/i },
      date: { $gte: compare.start, $lte: compare.end },
    }).lean(),
  ]);

  const groupCategories = (entries) => {
    const map = {};
    entries.forEach((e) => {
      const cat = e.category || "General Expense";
      map[cat] = roundDec((map[cat] || 0) + toNumber(e.amount));
    });
    return map;
  };

  const currCats = groupCategories(currEntries);
  const compCats = groupCategories(compEntries);

  const currTotal = roundDec(currEntries.reduce((s, e) => s + toNumber(e.amount), 0));
  const compTotal = roundDec(compEntries.reduce((s, e) => s + toNumber(e.amount), 0));
  const diff = roundDec(currTotal - compTotal);
  const percentageChange =
    compTotal > 0 ? roundDec((diff / compTotal) * 100) : currTotal > 0 ? 100 : 0;

  const allCategories = Array.from(
    new Set([...Object.keys(currCats), ...Object.keys(compCats)])
  );

  const categoryVariances = allCategories.map((cat) => {
    const currentAmount = currCats[cat] || 0;
    const previousAmount = compCats[cat] || 0;
    const change = roundDec(currentAmount - previousAmount);
    const pctChange =
      previousAmount > 0
        ? roundDec((change / previousAmount) * 100)
        : currentAmount > 0
        ? 100
        : 0;
    return {
      category: cat,
      currentAmount,
      previousAmount,
      change,
      percentageChange: pctChange,
    };
  });

  categoryVariances.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  // Identify top contributors to the increase/decrease
  const increases = categoryVariances.filter((c) => c.change > 0);
  const decreases = categoryVariances.filter((c) => c.change < 0);

  return {
    metric: "expense_variance_analysis",
    currentPeriod: current.label,
    comparePeriod: compare.label,
    currentTotal: currTotal,
    previousTotal: compTotal,
    changeAmount: diff,
    percentageChange,
    direction: diff > 0 ? "increased" : diff < 0 ? "decreased" : "unchanged",
    categoryVariances,
    primaryDrivers: increases.slice(0, 3),
    costReductions: decreases.slice(0, 3),
  };
};

// ============================================================================
// 6. BALANCE SHEET & ASSET / LIABILITY METRICS
// ============================================================================
export const getBalanceSheetData = async ({ userId, period = "this-month" }) => {
  const dateRange = resolveDateRange(period);
  const liveBS = await getLiveBalanceSheet(userId, period);

  return {
    metric: "balance_sheet",
    period: dateRange.label,
    reportingDate: dateRange.formattedDate,
    currency: "INR",
    assets: {
      cashAndBank: roundDec(liveBS.assets?.cashAndBank || 0),
      accountsReceivable: roundDec(liveBS.assets?.accountsReceivable || 0),
      inventoryValuation: roundDec(liveBS.assets?.inventory || 0),
      currentAssets: roundDec(liveBS.assets?.currentAssets || 0),
      fixedAssets: roundDec(liveBS.assets?.fixedAssets || 0),
      totalAssets: roundDec(liveBS.assets?.totalAssets || 0),
    },
    liabilities: {
      accountsPayable: roundDec(liveBS.liabilities?.accountsPayable || 0),
      currentLiabilities: roundDec(liveBS.liabilities?.currentLiabilities || 0),
      nonCurrentLiabilities: roundDec(liveBS.liabilities?.nonCurrentLiabilities || 0),
      totalLiabilities: roundDec(liveBS.liabilities?.totalLiabilities || 0),
    },
    equity: {
      ownerEquity: roundDec(liveBS.equity?.ownerEquity || 0),
      retainedEarnings: roundDec(liveBS.equity?.retainedEarnings || 0),
      totalEquity: roundDec(liveBS.equity?.totalEquity || 0),
    },
    workingCapital: roundDec(
      (liveBS.assets?.currentAssets || 0) - (liveBS.liabilities?.currentLiabilities || 0)
    ),
    isBalanced: Boolean(liveBS.balanced),
  };
};

// ============================================================================
// 7. CASH FLOW & CASH POSITION
// ============================================================================
export const getCashFlowData = async ({ userId, period = "this-month" }) => {
  const scope = getUserScope(userId);
  const dateRange = resolveDateRange(period);

  const bkEntries = await BookkeepingEntry.find({
    ...scope,
    isDeleted: { $ne: true },
    date: { $gte: dateRange.start, $lte: dateRange.end },
  }).lean();

  const cashInflow = roundDec(
    bkEntries
      .filter((e) => String(e.type || "").toLowerCase() === "income")
      .reduce((s, e) => s + toNumber(e.amount), 0)
  );

  const cashOutflow = roundDec(
    bkEntries
      .filter((e) => String(e.type || "").toLowerCase() === "expense")
      .reduce((s, e) => s + toNumber(e.amount), 0)
  );

  const netCashFlow = roundDec(cashInflow - cashOutflow);

  // Cumulative cash & bank position
  const allCumulative = await BookkeepingEntry.find({
    ...scope,
    isDeleted: { $ne: true },
    date: { $lte: dateRange.end },
  }).lean();

  const totalCumInflow = allCumulative
    .filter((e) => String(e.type || "").toLowerCase() === "income")
    .reduce((s, e) => s + toNumber(e.amount), 0);

  const totalCumOutflow = allCumulative
    .filter((e) => String(e.type || "").toLowerCase() === "expense")
    .reduce((s, e) => s + toNumber(e.amount), 0);

  const currentCashPosition = roundDec(totalCumInflow - totalCumOutflow);

  return {
    metric: "cash_flow",
    period: dateRange.label,
    reportingDate: dateRange.formattedDate,
    currency: "INR",
    cashInflow,
    cashOutflow,
    netCashFlow,
    currentCashPosition,
    isPositiveCashFlow: netCashFlow >= 0,
  };
};

// ============================================================================
// 8. CASH FLOW FORECASTING (6-MONTH PROJECTION)
// ============================================================================
export const getCashFlowForecastData = async ({ userId, months = 6 }) => {
  const scope = getUserScope(userId);
  const CashFlowEntry = getCashFlowEntryModel();

  const manualEntries = await CashFlowEntry.find(scope).sort({ time: 1 }).lean();
  const now = new Date();
  const monthlyPoints = [];

  if (manualEntries.length >= 2) {
    manualEntries.forEach((entry) => {
      monthlyPoints.push({
        label: `${entry.month} ${entry.year}`,
        inflow: toNumber(entry.cashInflow),
        outflow: toNumber(entry.cashOutflow),
        net: toNumber(entry.netCashFlow),
        time: toNumber(entry.time),
      });
    });
  } else {
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const monthLabel = mStart.toLocaleDateString("en-US", { month: "short", year: "numeric" });

      const bkEntries = await BookkeepingEntry.find({
        ...scope,
        isDeleted: { $ne: true },
        date: { $gte: mStart, $lte: mEnd },
      }).lean();

      const inflow = bkEntries
        .filter((e) => String(e.type || "").toLowerCase() === "income")
        .reduce((s, e) => s + toNumber(e.amount), 0);
      const outflow = bkEntries
        .filter((e) => String(e.type || "").toLowerCase() === "expense")
        .reduce((s, e) => s + toNumber(e.amount), 0);

      if (inflow > 0 || outflow > 0 || i === 0) {
        monthlyPoints.push({
          label: monthLabel,
          inflow,
          outflow,
          net: inflow - outflow,
          time: 5 - i,
        });
      }
    }
  }

  const n = monthlyPoints.length;
  let slopeInflow = 0,
    interceptInflow = 0;
  let slopeOutflow = 0,
    interceptOutflow = 0;

  if (n === 0) {
    return {
      metric: "cash_flow_forecast",
      hasEnoughData: false,
      message: "Insufficient historical transaction data to generate a forecast.",
      predictions: [],
    };
  }

  if (n === 1) {
    interceptInflow = monthlyPoints[0].inflow;
    interceptOutflow = monthlyPoints[0].outflow;
  } else {
    const sumX = monthlyPoints.reduce((sum, p) => sum + p.time, 0);
    const sumYInflow = monthlyPoints.reduce((sum, p) => sum + p.inflow, 0);
    const sumYOutflow = monthlyPoints.reduce((sum, p) => sum + p.outflow, 0);
    const sumXYInflow = monthlyPoints.reduce((sum, p) => sum + p.time * p.inflow, 0);
    const sumXYOutflow = monthlyPoints.reduce((sum, p) => sum + p.time * p.outflow, 0);
    const sumXX = monthlyPoints.reduce((sum, p) => sum + p.time * p.time, 0);

    const denom = n * sumXX - sumX * sumX || 1;
    slopeInflow = (n * sumXYInflow - sumX * sumYInflow) / denom;
    interceptInflow = (sumYInflow - slopeInflow * sumX) / n;

    slopeOutflow = (n * sumXYOutflow - sumX * sumYOutflow) / denom;
    interceptOutflow = (sumYOutflow - slopeOutflow * sumX) / n;
  }

  const predictions = [];
  const lastTime = monthlyPoints[monthlyPoints.length - 1]?.time || 0;

  for (let i = 1; i <= months; i++) {
    const futureDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const futureLabel = futureDate.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    const targetX = lastTime + i;

    const predInflow = Math.max(0, roundDec(interceptInflow + slopeInflow * targetX));
    const predOutflow = Math.max(0, roundDec(interceptOutflow + slopeOutflow * targetX));
    const predNet = roundDec(predInflow - predOutflow);

    predictions.push({
      month: futureLabel,
      predictedInflow: predInflow,
      predictedOutflow: predOutflow,
      predictedNetCashFlow: predNet,
      isEstimate: true,
    });
  }

  return {
    metric: "cash_flow_forecast",
    forecastPeriodMonths: months,
    historicalBaselineMonths: n,
    predictions,
    summary: {
      averageMonthlyInflow: roundDec(
        predictions.reduce((s, p) => s + p.predictedInflow, 0) / months
      ),
      averageMonthlyOutflow: roundDec(
        predictions.reduce((s, p) => s + p.predictedOutflow, 0) / months
      ),
      projectedNetSurplus: roundDec(
        predictions.reduce((s, p) => s + p.predictedNetCashFlow, 0)
      ),
    },
    note: "All future cash flow figures are mathematical trend estimates.",
  };
};

// ============================================================================
// 9. FINANCIAL RATIOS & KEY PERFORMANCE INDICATORS
// ============================================================================
export const getFinancialRatiosData = async ({ userId, period = "this-month" }) => {
  const dateRange = resolveDateRange(period);
  const [metrics, liveBS] = await Promise.all([
    getFinanceMetrics(userId, dateRange.start, dateRange.end),
    getLiveBalanceSheet(userId, period),
  ]);

  const currentAssets = liveBS.assets?.currentAssets || 0;
  const currentLiabilities = liveBS.liabilities?.currentLiabilities || 0;
  const totalAssets = liveBS.assets?.totalAssets || 0;
  const totalLiabilities = liveBS.liabilities?.totalLiabilities || 0;
  const totalEquity = liveBS.equity?.totalEquity || 0;
  const inventory = liveBS.assets?.inventory || 0;
  const revenue = metrics.revenue?.total || 0;
  const netIncome = metrics.netProfit || 0;
  const cogs = metrics.expense?.cogs || 0;

  const currentRatio =
    currentLiabilities > 0
      ? roundDec(currentAssets / currentLiabilities)
      : currentAssets > 0
      ? 1
      : 0;

  const quickRatio =
    currentLiabilities > 0
      ? roundDec((currentAssets - inventory) / currentLiabilities)
      : currentAssets > 0
      ? 1
      : 0;

  const debtToEquity = totalEquity > 0 ? roundDec(totalLiabilities / totalEquity) : 0;
  const debtRatio = totalAssets > 0 ? roundDec(totalLiabilities / totalAssets) : 0;
  const grossProfitMargin =
    revenue > 0 ? roundDec(((revenue - cogs) / revenue) * 100) : 0;
  const netProfitMargin = revenue > 0 ? roundDec((netIncome / revenue) * 100) : 0;
  const roe = totalEquity > 0 ? roundDec((netIncome / totalEquity) * 100) : 0;
  const roa = totalAssets > 0 ? roundDec((netIncome / totalAssets) * 100) : 0;
  const assetsTurnover = totalAssets > 0 ? roundDec(revenue / totalAssets) : 0;

  return {
    metric: "financial_ratios",
    period: dateRange.label,
    reportingDate: dateRange.formattedDate,
    ratios: {
      currentRatio: {
        value: currentRatio,
        benchmark: ">= 1.50",
        status: currentRatio >= 1.5 ? "Healthy" : currentRatio >= 1.0 ? "Adequate" : "Low",
        description: "Measures ability to pay short-term obligations with short-term assets.",
      },
      quickRatio: {
        value: quickRatio,
        benchmark: ">= 1.00",
        status: quickRatio >= 1.0 ? "Healthy" : "Low",
        description: "Measures ability to meet short-term liabilities without selling inventory.",
      },
      debtToEquity: {
        value: debtToEquity,
        benchmark: "< 2.00",
        status: debtToEquity <= 2.0 ? "Healthy" : "High Leverage",
        description: "Indicates proportion of debt used to finance assets relative to equity.",
      },
      netProfitMargin: {
        value: `${netProfitMargin}%`,
        benchmark: ">= 15%",
        status: netProfitMargin >= 15 ? "Strong" : netProfitMargin > 0 ? "Moderate" : "Loss",
        description: "Percentage of revenue remaining after all operating expenses.",
      },
      grossProfitMargin: {
        value: `${grossProfitMargin}%`,
        benchmark: ">= 30%",
        status: grossProfitMargin >= 30 ? "Strong" : "Moderate",
        description: "Revenue retained after subtracting cost of goods sold.",
      },
      roe: {
        value: `${roe}%`,
        benchmark: ">= 15%",
        status: roe >= 15 ? "High Return" : "Moderate",
        description: "Return on shareholders' equity.",
      },
      roa: {
        value: `${roa}%`,
        benchmark: ">= 5%",
        status: roa >= 5 ? "Efficient" : "Low Return",
        description: "Measures how efficiently assets generate earnings.",
      },
      assetsTurnover: {
        value: assetsTurnover,
        benchmark: ">= 1.0",
        status: assetsTurnover >= 1.0 ? "Efficient" : "Underutilized",
        description: "Revenue generated per rupee of assets.",
      },
    },
  };
};

// ============================================================================
// 10. INVOICE AND PAYMENT DETAILS
// ============================================================================
export const getInvoiceDetails = async ({ userId, invoiceNumber, id }) => {
  const scope = getUserScope(userId);
  const filter = { ...scope, isDeleted: { $ne: true } };

  if (id && mongoose.Types.ObjectId.isValid(id)) {
    filter._id = new mongoose.Types.ObjectId(id);
  } else if (invoiceNumber) {
    filter.invoiceNumber = { $regex: new RegExp(`^${invoiceNumber.trim()}$`, "i") };
  } else {
    throw new Error("Invoice number or ID is required");
  }

  // 1. Check Sales Invoices
  let invoice = await Invoice.findOne(filter).lean();
  let invoiceType = "sales";

  // 2. Fallback check Purchase Invoices
  if (!invoice) {
    const PurchaseInvoice = getPurchaseInvoiceModel();
    const purchaseFilter = { ...scope, isDeleted: { $ne: true } };
    if (id && mongoose.Types.ObjectId.isValid(id)) {
      purchaseFilter._id = new mongoose.Types.ObjectId(id);
    } else {
      purchaseFilter.billNo = { $regex: new RegExp(`^${invoiceNumber.trim()}$`, "i") };
    }
    invoice = await PurchaseInvoice.findOne(purchaseFilter).lean();
    if (invoice) invoiceType = "purchase";
  }

  if (!invoice) {
    return {
      found: false,
      message: `Invoice '${invoiceNumber || id}' was not found in your records.`,
    };
  }

  const grandTotal = toNumber(invoice.grandTotal ?? invoice.total);
  const amountPaid = toNumber(invoice.amountPaid ?? invoice.paid);
  const balanceDue = getOutstandingBalance(invoice);
  const isPaid = balanceDue <= 0 && grandTotal > 0;

  return {
    found: true,
    invoiceType,
    invoiceNumber: invoice.invoiceNumber || invoice.billNo,
    customerOrSupplier: invoice.customerName || invoice.supplierName || "N/A",
    date: invoice.invoiceDate || invoice.billDate || invoice.createdAt,
    dueDate: invoice.dueDate,
    grandTotal,
    amountPaid,
    balanceDue,
    status: isPaid ? "PAID" : invoice.status?.toUpperCase() || "PENDING",
    paymentStatus: isPaid ? "PAID" : invoice.paymentStatus?.toUpperCase() || "UNPAID",
    paymentMethod: invoice.paymentMethod || "N/A",
    itemsCount: invoice.items?.length || 0,
    items: (invoice.items || []).map((item) => ({
      name: item.productName || item.itemName || "Item",
      quantity: item.quantity,
      unitPrice: item.unitPrice || item.pricePerUnit,
      tax: item.taxAmount,
      total: item.total || item.amount,
    })),
    notes: invoice.notes || "",
  };
};

// ============================================================================
// 11. INVENTORY VALUATION AND REORDER ALERTS
// ============================================================================
export const getInventoryValuationData = async ({ userId }) => {
  const scope = getUserScope(userId);
  const InventoryItem = getInventoryItemModel();

  const items = await InventoryItem.find({ ...scope, isDeleted: { $ne: true } }).lean();

  const totalValue = roundDec(
    items.reduce((sum, item) => {
      const qty = toNumber(item.quantity);
      const price = toNumber(item.costPrice || item.buyPrice || item.price);
      return sum + qty * price;
    }, 0)
  );

  const lowStockThreshold = 10;
  const lowStockItems = items.filter((item) => toNumber(item.quantity) < lowStockThreshold);

  const topItemsByValue = items
    .map((item) => {
      const qty = toNumber(item.quantity);
      const price = toNumber(item.costPrice || item.buyPrice || item.price);
      return {
        itemName: item.itemName,
        sku: item.sku,
        quantity: qty,
        unitCost: price,
        valuation: roundDec(qty * price),
        category: item.category || "General",
        isLowStock: qty < lowStockThreshold,
      };
    })
    .sort((a, b) => b.valuation - a.valuation);

  return {
    metric: "inventory_valuation",
    totalValuation: totalValue,
    totalSkuCount: items.length,
    lowStockCount: lowStockItems.length,
    lowStockItems: lowStockItems.map((i) => ({
      itemName: i.itemName,
      sku: i.sku,
      currentQuantity: toNumber(i.quantity),
      reorderThreshold: lowStockThreshold,
    })),
    topItems: topItemsByValue.slice(0, 5),
    currency: "INR",
  };
};

// ============================================================================
// 12. GST AND TAX MANAGEMENT
// ============================================================================
export const getGstManagementData = async ({ userId, period = "this-month" }) => {
  const dateRange = resolveDateRange(period);
  const analytics = await getGstAnalytics(userId, period);

  return {
    metric: "gst_summary",
    period: dateRange.label,
    reportingDate: dateRange.formattedDate,
    currency: "INR",
    outputGst: roundDec(analytics.gstSummary?.outputGst || 0),
    inputGst: roundDec(analytics.gstSummary?.inputGst || 0),
    gstPayable: roundDec(analytics.gstSummary?.gstPayable || 0),
    gstReceivable: roundDec(analytics.gstSummary?.gstReceivable || 0),
    taxBreakdown: {
      cgst: {
        output: roundDec(analytics.taxBreakdown?.cgst?.output || 0),
        input: roundDec(analytics.taxBreakdown?.cgst?.input || 0),
        net: roundDec(analytics.taxBreakdown?.cgst?.net || 0),
      },
      sgst: {
        output: roundDec(analytics.taxBreakdown?.sgst?.output || 0),
        input: roundDec(analytics.taxBreakdown?.sgst?.input || 0),
        net: roundDec(analytics.taxBreakdown?.sgst?.net || 0),
      },
      igst: {
        output: roundDec(analytics.taxBreakdown?.igst?.output || 0),
        input: roundDec(analytics.taxBreakdown?.igst?.input || 0),
        net: roundDec(analytics.taxBreakdown?.igst?.net || 0),
      },
    },
    transactionSummary: {
      taxableSales: roundDec(analytics.transactionSummary?.taxableSales || 0),
      taxablePurchases: roundDec(analytics.transactionSummary?.taxablePurchases || 0),
    },
  };
};

// ============================================================================
// 13. PAYROLL AND EMPLOYEE EXPENSES
// ============================================================================
export const getPayrollData = async ({ userId, employeeId }) => {
  const scope = getUserScope(userId);
  const Payroll = getPayrollModel();

  const query = { ...scope };
  if (employeeId) {
    query.employeeId = employeeId;
  }

  const payrolls = await Payroll.find(query).sort({ createdAt: -1 }).lean();

  const totalGross = roundDec(payrolls.reduce((s, p) => s + toNumber(p.grossSalary), 0));
  const totalNet = roundDec(payrolls.reduce((s, p) => s + toNumber(p.netSalary), 0));
  const totalDeductions = roundDec(
    payrolls.reduce((s, p) => s + toNumber(p.totalDeductions), 0)
  );

  return {
    metric: "payroll_summary",
    employeeCount: payrolls.length,
    totalGrossSalary: totalGross,
    totalNetSalary: totalNet,
    totalDeductions,
    currency: "INR",
    employees: payrolls.slice(0, 10).map((p) => ({
      name: p.employeeName,
      id: p.employeeId,
      department: p.employeeDepartment,
      grossSalary: toNumber(p.grossSalary),
      netSalary: toNumber(p.netSalary),
      deductions: toNumber(p.totalDeductions),
    })),
  };
};

// ============================================================================
// 14. BANK RECONCILIATION
// ============================================================================
export const getBankReconciliationData = async ({ userId }) => {
  const scope = getUserScope(userId);
  const BankReconciliationSession = getBankReconciliationModel();

  const sessions = await BankReconciliationSession.find(scope)
    .sort({ createdAt: -1 })
    .lean();

  if (sessions.length === 0) {
    return {
      metric: "bank_reconciliation",
      hasSessions: false,
      message: "No bank reconciliation sessions recorded yet.",
    };
  }

  const latest = sessions[0];
  return {
    metric: "bank_reconciliation",
    hasSessions: true,
    totalSessions: sessions.length,
    latestSession: {
      sessionId: latest._id,
      date: latest.createdAt,
      status: latest.status || "Completed",
      matchedCount: latest.matchedTransactions?.length || latest.matchedCount || 0,
      unmatchedLedgerCount: latest.unmatchedLedger?.length || 0,
      unmatchedBankCount: latest.unmatchedBank?.length || 0,
      differenceAmount: toNumber(latest.discrepancy || latest.difference || 0),
    },
  };
};

// ============================================================================
// 15. FRAUD DETECTION
// ============================================================================
export const getFraudDetectionData = async ({ userId }) => {
  const scope = getUserScope(userId);
  const FraudTransaction = getFraudTransactionModel();
  const FraudRule = getFraudRuleModel();

  const [transactions, rules] = await Promise.all([
    FraudTransaction.find(scope).sort({ timestamp: -1 }).lean(),
    FraudRule.find({ ...scope, enabled: true }).lean(),
  ]);

  const flagged = transactions.filter((t) => t.isSuspicious || t.riskScore > 50);

  return {
    metric: "fraud_detection",
    totalScanned: transactions.length,
    flaggedCount: flagged.length,
    activeRulesCount: rules.length,
    flaggedTransactions: flagged.slice(0, 5).map((t) => ({
      transactionId: t.transactionId || t._id,
      amount: toNumber(t.amount),
      reason: t.flagReason || t.riskReason || "Anomalous transaction pattern",
      riskScore: t.riskScore,
      status: t.status || "Pending Review",
    })),
  };
};

// ============================================================================
// 16. CIVIL ENGINEERING PROJECT SCHEDULING (CPM)
// ============================================================================
export const getCivilProjectsData = async ({ userId }) => {
  const scope = getUserScope(userId);
  const CivilProject = getCivilProjectModel();

  const projects = await CivilProject.find(scope).sort({ createdAt: -1 }).lean();

  if (projects.length === 0) {
    return {
      metric: "civil_projects",
      hasProjects: false,
      message: "No civil engineering project schedules found.",
    };
  }

  return {
    metric: "civil_projects",
    hasProjects: true,
    projectCount: projects.length,
    projects: projects.slice(0, 5).map((p) => ({
      name: p.projectName || p.name || "Civil Project",
      totalDurationDays: p.totalDuration || p.cpmDuration || 0,
      criticalPath: p.criticalPath || [],
      activitiesCount: p.activities?.length || 0,
      estimatedBudget: toNumber(p.budget || p.cost || 0),
    })),
  };
};

// ============================================================================
// 17. CHART OF ACCOUNTS & GENERAL LEDGER
// ============================================================================
export const getChartOfAccountsData = async ({ userId }) => {
  const scope = getUserScope(userId);
  const LedgerAccount = getLedgerAccountModel();

  const accounts = await LedgerAccount.find(scope).sort({ code: 1 }).lean();

  return {
    metric: "chart_of_accounts",
    accountCount: accounts.length,
    accounts: accounts.map((acc) => ({
      name: acc.name,
      code: acc.code,
      type: acc.type,
      balance: roundDec(acc.balance || 0),
    })),
  };
};
