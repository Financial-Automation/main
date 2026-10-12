import mongoose from "mongoose";
import BookkeepingEntry from "../models/BookkeepingEntry.js";
import Sale from "../models/Sale.js";

// Safe 15-second max TTL tenant-isolated in-memory cache for read-only financial summaries
const financeCache = new Map();
const FINANCE_CACHE_TTL_MS = 15000;

export function invalidateFinanceCache(userId) {
    if (!userId) return;
    const userIdStr = userId.toString();
    for (const key of financeCache.keys()) {
        if (key.startsWith(userIdStr + ":")) {
            financeCache.delete(key);
        }
    }
}

const getCachedOrFetch = async (cacheKey, fetchFn) => {
    const cached = financeCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < FINANCE_CACHE_TTL_MS)) {
        return cached.data;
    }
    const data = await fetchFn();
    financeCache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
};

// Helper to get models registered inline in routes
const getInvoiceModel = () => {
    try {
        return mongoose.model("Invoice");
    } catch (e) {
        return mongoose.model("Invoice", new mongoose.Schema({}, { strict: false }));
    }
};

const getPurchaseInvoiceModel = () => {
    try {
        return mongoose.model("PurchaseInvoice");
    } catch (e) {
        return mongoose.model("PurchaseInvoice", new mongoose.Schema({}, { strict: false }));
    }
};

const getInventoryItemModel = () => {
    try {
        return mongoose.model("InventoryItem");
    } catch (e) {
        return mongoose.model("InventoryItem", new mongoose.Schema({}, { strict: false }));
    }
};

// Resolve selected period to start and end Dates
export function resolvePeriod(period) {
    const now = new Date();
    let startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    let endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    if (period === "this-month") {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (period === "last-month") {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else if (period === "this-quarter") {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
        endDate = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0, 23, 59, 59, 999);
    } else if (period === "this-year") {
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 12, 0, 23, 59, 59, 999);
    }

    return { startDate, endDate };
}

/**
 * Calculates central financial metrics strictly using BookkeepingEntry as the single financial source of truth.
 */
export async function getFinanceMetrics(userId, start, end) {
    const cacheKey = `${userId}:metrics:${start}:${end}`;
    return getCachedOrFetch(cacheKey, async () => {
        const startDate = new Date(start);
        const endDate = new Date(end);
        const userObjectId = new mongoose.Types.ObjectId(userId);

    const userFilter = {
        $or: [
            { userId: userObjectId },
            { userId: userId.toString() }
        ]
    };

    const Invoice = getInvoiceModel();
    const PurchaseInvoice = getPurchaseInvoiceModel();

    // Parallelize independent database queries with selective field projections and .lean()
    const [bookkeepingEntries, salesInvoices, purchaseInvoices] = await Promise.all([
        BookkeepingEntry.find({
            ...userFilter,
            isDeleted: { $ne: true },
            date: { $gte: startDate, $lte: endDate }
        }).select("type amount category date").lean(),
        Invoice ? Invoice.find({
            ...userFilter,
            isDeleted: { $ne: true },
            sourceInvoiceType: { $ne: "purchase" },
            invoiceDate: { $lte: endDate }
        }).select("paymentStatus status balanceDue taxAmount totalTax").lean() : Promise.resolve([]),
        PurchaseInvoice ? PurchaseInvoice.find({
            ...userFilter,
            isDeleted: { $ne: true },
            createdAt: { $lte: endDate }
        }).select("balance totalTax").lean() : Promise.resolve([])
    ]);

    const bkIncomeEntries = bookkeepingEntries.filter(e => e.type === "income" || e.type === "Income");
    const bkExpenseEntries = bookkeepingEntries.filter(e => e.type === "expense" || e.type === "Expense");

    const totalRevenue = bkIncomeEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalExpenses = bkExpenseEntries.reduce((sum, e) => sum + (e.amount || 0), 0);

    // Group bookkeeping expenses by category
    const bkCategoryExpenses = {};
    bkExpenseEntries.forEach(e => {
        const cat = e.category || "General";
        bkCategoryExpenses[cat] = (bkCategoryExpenses[cat] || 0) + (e.amount || 0);
    });

    const cogs = (bkCategoryExpenses["Inventory Stock"] || 0) + (bkCategoryExpenses["Cost of Goods Sold"] || 0) + (bkCategoryExpenses["COGS"] || 0);
    const salaries = bkCategoryExpenses["Salaries"] || bkCategoryExpenses["salaries"] || 0;
    const rent = bkCategoryExpenses["Rent"] || bkCategoryExpenses["rent"] || 0;
    const utilities = bkCategoryExpenses["Utilities"] || bkCategoryExpenses["utilities"] || 0;
    const costOfMaterials = bkCategoryExpenses["Materials"] || bkCategoryExpenses["materials"] || 0;
    const financeCost = bkCategoryExpenses["Finance"] || bkCategoryExpenses["finance"] || 0;
    const depreciation = bkCategoryExpenses["Depreciation"] || bkCategoryExpenses["depreciation"] || 0;
    const amortization = bkCategoryExpenses["Amortization"] || bkCategoryExpenses["amortization"] || 0;

    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Accounts Receivable and Accounts Payable
    const salesInvoiceOutstanding = salesInvoices
        .filter(inv => inv.paymentStatus !== "paid" && inv.status !== "paid")
        .reduce((sum, inv) => sum + (inv.balanceDue || 0), 0);

    const purchaseInvoiceOutstanding = purchaseInvoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);

    const totalCashInflow = totalRevenue;
    const totalCashOutflow = totalExpenses;
    const netCashFlow = totalCashInflow - totalCashOutflow;

    const salesRevenue = bkIncomeEntries.filter(e => e.category === "Sales").reduce((sum, e) => sum + (e.amount || 0), 0);
    const inventorySalesRevenue = bkIncomeEntries.filter(e => e.category === "Inventory Sales").reduce((sum, e) => sum + (e.amount || 0), 0);

    return {
        period: { start: startDate, end: endDate },
        revenue: {
            sales: salesRevenue,
            bookkeepingIncome: totalRevenue,
            inventorySales: inventorySalesRevenue,
            total: totalRevenue
        },
        expense: {
            cogs,
            salaries,
            rent,
            utilities,
            costOfMaterials,
            financeCost,
            depreciation,
            amortization,
            otherExpenses: Math.max(0, totalExpenses - (cogs + salaries + rent + utilities + financeCost + depreciation + amortization)),
            total: totalExpenses
        },
        netProfit,
        profitMargin,
        cashFlow: {
            inflow: totalCashInflow,
            outflow: totalCashOutflow,
            net: netCashFlow,
            receivables: salesInvoiceOutstanding,
            payables: purchaseInvoiceOutstanding,
            gstPayable: Math.max(0, salesInvoices.reduce((sum, inv) => sum + (inv.taxAmount || 0), 0) - purchaseInvoices.reduce((sum, inv) => sum + (inv.totalTax || 0), 0))
        }
    };
});
}

/**
 * Calculates live Balance Sheet using BookkeepingEntry as the central transaction ledger.
 */
export async function getLiveBalanceSheet(userId, period = "this-month") {
    const cacheKey = `${userId}:bs:${period}`;
    return getCachedOrFetch(cacheKey, async () => {
    const { startDate, endDate } = resolvePeriod(period);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const userFilter = {
        $or: [
            { userId: userObjectId },
            { userId: userId.toString() }
        ]
    };

    const Invoice = getInvoiceModel();
    const PurchaseInvoice = getPurchaseInvoiceModel();
    const InventoryItem = getInventoryItemModel();

    // Parallelize independent database queries with selective field projections and .lean()
    const [cumulativeEntries, salesInvoices, purchaseInvoices, inventoryItems] = await Promise.all([
        BookkeepingEntry.find({
            ...userFilter,
            isDeleted: { $ne: true },
            date: { $lte: endDate }
        }).select("type amount category date").lean(),
        Invoice ? Invoice.find({
            ...userFilter,
            isDeleted: { $ne: true },
            sourceInvoiceType: { $ne: "purchase" },
            invoiceDate: { $lte: endDate }
        }).select("paymentStatus status balanceDue").lean() : Promise.resolve([]),
        PurchaseInvoice ? PurchaseInvoice.find({
            ...userFilter,
            isDeleted: { $ne: true },
            createdAt: { $lte: endDate }
        }).select("balance").lean() : Promise.resolve([]),
        InventoryItem ? InventoryItem.find({
            ...userFilter,
            isDeleted: { $ne: true }
        }).select("quantity price costPrice").lean() : Promise.resolve([])
    ]);

    const cumulativeIncome = cumulativeEntries
        .filter(e => e.type === "income" || e.type === "Income")
        .reduce((sum, e) => sum + (e.amount || 0), 0);

    const cumulativeExpense = cumulativeEntries
        .filter(e => e.type === "expense" || e.type === "Expense")
        .reduce((sum, e) => sum + (e.amount || 0), 0);

    const accountsReceivable = salesInvoices
        .filter(inv => inv.paymentStatus !== "paid" && inv.status !== "paid")
        .reduce((sum, inv) => sum + (inv.balanceDue || 0), 0);

    const accountsPayable = purchaseInvoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);

    const currentInventoryValuation = inventoryItems.reduce((sum, item) => sum + ((item.quantity || 0) * (item.price || item.costPrice || 0)), 0);

    // Cash and Bank Balance: Total Inflows - Total Outflows
    const cashAndBank = cumulativeIncome - cumulativeExpense;

    const fixedAssets = 0;
    const currentAssets = cashAndBank + accountsReceivable + currentInventoryValuation;
    const totalAssets = currentAssets + fixedAssets;

    const currentLiabilities = accountsPayable;
    const nonCurrentLiabilities = 0;
    const totalLiabilities = currentLiabilities + nonCurrentLiabilities;

    // Retained Earnings = Cumulative Net Income
    const retainedEarnings = cumulativeIncome - cumulativeExpense;
    const totalEquity = totalAssets - totalLiabilities; // Enforces exact accounting equation: Total Assets = Total Liabilities + Total Equity
    const balanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1.0;

    return {
        companyName: "Your Company",
        financialYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
        period,
        assets: {
            cashAndBank,
            accountsReceivable,
            inventory: currentInventoryValuation,
            currentAssets,
            fixedAssets,
            totalAssets
        },
        liabilities: {
            accountsPayable,
            currentLiabilities,
            nonCurrentLiabilities,
            totalLiabilities
        },
        equity: {
            ownerEquity: 0,
            retainedEarnings,
            totalEquity
        },
        totalLiabilitiesEquity: totalLiabilities + totalEquity,
        balanced,
        breakdown: {
            assets: {
                currentAssets: [
                    { label: "Cash & Bank Balances", value: cashAndBank },
                    { label: "Accounts Receivable (Trade)", value: accountsReceivable },
                    { label: "Inventory Stock Valuation", value: currentInventoryValuation }
                ],
                nonCurrentAssets: [
                    { label: "Fixed Assets & Equipment", value: fixedAssets }
                ]
            },
            liabilities: {
                currentLiabilities: [
                    { label: "Accounts Payable (Trade)", value: accountsPayable }
                ],
                nonCurrentLiabilities: [
                    { label: "Long Term Debt / Loans", value: nonCurrentLiabilities }
                ]
            },
            equity: [
                { label: "Owner Capital", value: 0 },
                { label: "Retained Earnings / Accumulated Profit", value: retainedEarnings }
            ]
        }
    };
});
}

export async function getGstAnalytics(userId, period = "this-month") {
    const cacheKey = `${userId}:gst:${period}`;
    return getCachedOrFetch(cacheKey, async () => {
    const { startDate, endDate } = resolvePeriod(period);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const userFilter = {
        $or: [
            { userId: userObjectId },
            { userId: userId.toString() }
        ]
    };

    // 1. Fetch Sales Invoices
    const Invoice = getInvoiceModel();
    let salesInvoices = [];
    if (Invoice) {
        salesInvoices = await Invoice.find({
            ...userFilter,
            isDeleted: { $ne: true },
            sourceInvoiceType: { $ne: "purchase" },
            invoiceDate: { $gte: startDate, $lte: endDate }
        }).select("subtotal items cgst sgst igst taxAmount totalTax").lean();
    }

    // 2. Fetch POS / Inventory Sales
    const inventorySales = await Sale.find({
        ...userFilter,
        isDeleted: { $ne: true },
        saleDate: { $gte: startDate, $lte: endDate }
    }).select("subtotal cgstAmount sgstAmount igstAmount cgst sgst igst gstAmount taxAmount").lean();

    // 3. Fetch Purchase Invoices
    const PurchaseInvoice = getPurchaseInvoiceModel();
    let purchaseInvoices = [];
    if (PurchaseInvoice) {
        purchaseInvoices = await PurchaseInvoice.find({
            ...userFilter,
            isDeleted: { $ne: true },
            createdAt: { $gte: startDate, $lte: endDate }
        }).select("subtotal totalCgst totalSgst totalIgst cgst sgst igst totalTax taxAmount items").lean();
    }

    // Calculate Sales-side Taxable & GST Amounts
    let salesTaxable = 0;
    let outputCgst = 0;
    let outputSgst = 0;
    let outputIgst = 0;
    let outputGst = 0;

    salesInvoices.forEach(inv => {
        salesTaxable += (inv.subtotal || 0);
        const hasItems = Array.isArray(inv.items);
        const cgst = inv.cgst || (hasItems ? inv.items.reduce((s, i) => s + (i.cgstAmount || 0), 0) : 0);
        const sgst = inv.sgst || (hasItems ? inv.items.reduce((s, i) => s + (i.sgstAmount || 0), 0) : 0);
        const igst = inv.igst || (hasItems ? inv.items.reduce((s, i) => s + (i.igstAmount || 0), 0) : 0);
        const tax = inv.taxAmount || inv.totalTax || (cgst + sgst + igst);

        outputCgst += cgst;
        outputSgst += sgst;
        outputIgst += igst;
        outputGst += tax;
    });

    inventorySales.forEach(sale => {
        salesTaxable += (sale.subtotal || 0);
        const cgst = sale.cgstAmount || sale.cgst || 0;
        const sgst = sale.sgstAmount || sale.sgst || 0;
        const igst = sale.igstAmount || sale.igst || 0;
        const tax = sale.gstAmount || sale.taxAmount || (cgst + sgst + igst);

        outputCgst += cgst;
        outputSgst += sgst;
        outputIgst += igst;
        outputGst += tax;
    });

    // Calculate Purchase-side Taxable & GST Amounts
    let purchaseTaxable = 0;
    let inputCgst = 0;
    let inputSgst = 0;
    let inputIgst = 0;
    let inputGst = 0;

    purchaseInvoices.forEach(inv => {
        purchaseTaxable += (inv.subtotal || 0);
        const hasItems = Array.isArray(inv.items);
        const cgst = inv.totalCgst || inv.cgst || (hasItems ? inv.items.reduce((s, i) => s + (i.cgstAmount || 0), 0) : 0);
        const sgst = inv.totalSgst || inv.sgst || (hasItems ? inv.items.reduce((s, i) => s + (i.sgstAmount || 0), 0) : 0);
        const igst = inv.totalIgst || inv.igst || (hasItems ? inv.items.reduce((s, i) => s + (i.igstAmount || 0), 0) : 0);
        const tax = inv.totalTax || inv.taxAmount || (cgst + sgst + igst);

        inputCgst += cgst;
        inputSgst += sgst;
        inputIgst += igst;
        inputGst += tax;
    });

    // Net GST Calculation
    let gstPayable = 0;
    let gstReceivable = 0;

    if (outputGst >= inputGst) {
        gstPayable = outputGst - inputGst;
        gstReceivable = 0;
    } else {
        gstPayable = 0;
        gstReceivable = inputGst - outputGst;
    }

    return {
        period,
        gstSummary: {
            outputGst,
            inputGst,
            gstPayable,
            gstReceivable
        },
        taxBreakdown: {
            cgst: {
                output: outputCgst,
                input: inputCgst,
                net: Math.max(0, outputCgst - inputCgst)
            },
            sgst: {
                output: outputSgst,
                input: inputSgst,
                net: Math.max(0, outputSgst - inputSgst)
            },
            igst: {
                output: outputIgst,
                input: inputIgst,
                net: Math.max(0, outputIgst - inputIgst)
            }
        },
        transactionSummary: {
            taxableSales: salesTaxable,
            taxablePurchases: purchaseTaxable,
            salesGst: outputGst,
            purchaseGst: inputGst
        }
    };
});
}
