import mongoose from "mongoose";
import Invoice from "../models/Invoice.js";
import BookkeepingEntry from "../models/BookkeepingEntry.js";
import CashTransaction from "../models/CashTransaction.js";

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export const outstandingBalance = (record) => {
  const total = number(record.grandTotal ?? record.total);
  const paid = number(record.paid ?? record.amountPaid);
  return Math.max(0, number(record.balance ?? record.balanceDue ?? total - paid));
};

export const isOpenDocument = (record) => {
  const status = String(record.status || "").toLowerCase();
  const paymentStatus = String(record.paymentStatus || "").toLowerCase();
  return !record.isDeleted && !["cancelled", "paid"].includes(status) && paymentStatus !== "paid" && outstandingBalance(record) > 0;
};

export const userScope = (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) throw new Error("Invalid authenticated user identifier");
  const objectId = new mongoose.Types.ObjectId(userId);
  return { $or: [{ userId: objectId }, { userId: userId.toString() }] };
};

export const resolveAssistantPeriod = (period = "this-month", now = new Date()) => {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  if (period === "last-month") return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999), label: "last month" };
  if (period === "this-quarter") return { start: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1), end: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0, 23, 59, 59, 999), label: "this quarter" };
  if (period === "this-year") return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 12, 0, 23, 59, 59, 999), label: "this year" };
  return { start, end, label: "this month" };
};

const inPeriod = (value, period) => {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date >= period.start && date <= period.end;
};

const purchaseModel = () => mongoose.models.PurchaseInvoice || mongoose.model("PurchaseInvoice", new mongoose.Schema({}, { strict: false }));

export const recognizeFinancialIntent = (question, previousIntent) => {
  const text = String(question || "").toLowerCase();
  if (/\b(top.*suppliers?|suppliers?.*(top|breakdown))\b/.test(text)) return "supplier_payables";
  if (/\b(which ones|which).*\boverdue\b/.test(text) && ["total_payables", "supplier_payables", "outstanding_purchase_invoices"].includes(previousIntent)) return "outstanding_purchase_invoices";
  if (/\b(payable|payables|suppliers?.*(owe|due)|owe.*suppliers?|unpaid purchase|outstanding purchase)\b/.test(text)) return "total_payables";
  if (/\b(receivable|receivables|customer.*(owe|due)|owe.*customer)\b/.test(text)) return "total_receivables";
  if (/\b(unpaid|overdue|outstanding)\b.*\b(purchase|bill|supplier|vendor)\b/.test(text)) return "outstanding_purchase_invoices";
  if (/\b(unpaid|overdue|outstanding)\b.*\b(invoice|sales|customer)\b/.test(text)) return "outstanding_sales_invoices";
  if (/\b(total )?purchases?\b/.test(text)) return "purchase_summary";
  if (/\b(current )?cash (balance|position)\b/.test(text)) return "cash_balance";
  if (/\b(net profit|profit|p&l|loss)\b/.test(text)) return "profit_and_loss";
  if (/\b(sales|revenue|sell)\b/.test(text)) return "sales_summary";
  if (/\b(expense|expenses|spend|spent|cost)\b/.test(text)) return "expense_breakdown";
  return previousIntent || null;
};

export const queryFinancialTool = async ({ userId, intent, period }) => {
  const scope = userScope(userId);
  const dateLabel = `${period.start.toLocaleDateString("en-IN")} – ${period.end.toLocaleDateString("en-IN")}`;
  if (["total_payables", "outstanding_purchase_invoices", "supplier_payables", "purchase_summary"].includes(intent)) {
    const records = await purchaseModel().find({ ...scope, isDeleted: { $ne: true } }).lean();
    if (intent === "purchase_summary") {
      const purchases = records.filter((item) => String(item.status || "").toLowerCase() !== "cancelled" && inPeriod(item.createdAt || item.billDate, period));
      return { tool: intent, metric: "purchases", amount: purchases.reduce((sum, item) => sum + number(item.total ?? item.grandTotal), 0), purchase_invoice_count: purchases.length, currency: "INR", reporting_period: dateLabel };
    }
    const open = records.filter((item) => isOpenDocument(item) && inPeriod(item.createdAt || item.billDate, period));
    const overdue = open.filter((item) => item.dueDate && new Date(item.dueDate) < new Date());
    const suppliers = Object.values(open.reduce((groups, item) => {
      const name = item.supplierName || item.partyName || "Unspecified supplier";
      groups[name] = groups[name] || { supplier: name, amount: 0, invoice_count: 0 };
      groups[name].amount += outstandingBalance(item);
      groups[name].invoice_count += 1;
      return groups;
    }, {})).sort((a, b) => b.amount - a.amount).slice(0, 5);
    return { tool: intent, metric: intent === "supplier_payables" ? "supplier_payables" : intent === "outstanding_purchase_invoices" ? "outstanding_purchase_invoices" : "total_payables", amount: open.reduce((sum, item) => sum + outstandingBalance(item), 0), outstanding_invoice_count: open.length, overdue_amount: overdue.reduce((sum, item) => sum + outstandingBalance(item), 0), invoices: (intent === "outstanding_purchase_invoices" ? overdue : open).slice(0, 20), suppliers, currency: "INR", reporting_period: dateLabel };
  }
  if (intent === "total_receivables" || intent === "outstanding_sales_invoices") {
    const records = await Invoice.find({ ...scope, isDeleted: { $ne: true }, sourceInvoiceType: { $ne: "purchase" } }).lean();
    const open = records.filter((item) => isOpenDocument(item) && inPeriod(item.invoiceDate || item.createdAt, period));
    const overdue = open.filter((item) => item.dueDate && new Date(item.dueDate) < new Date());
    return { tool: intent, metric: "total_receivables", amount: open.reduce((sum, item) => sum + outstandingBalance(item), 0), outstanding_invoice_count: open.length, overdue_amount: overdue.reduce((sum, item) => sum + outstandingBalance(item), 0), invoices: open.slice(0, 20), currency: "INR", reporting_period: dateLabel };
  }
  const entries = await BookkeepingEntry.find({ ...scope, isDeleted: { $ne: true }, date: { $gte: period.start, $lte: period.end } }).lean();
  if (intent === "cash_balance") {
    const transactions = await CashTransaction.find({ ...scope, date: { $lte: period.end } }).lean();
    const balance = transactions.reduce((sum, transaction) => sum + (transaction.type === "inflow" ? number(transaction.amount) : -number(transaction.amount)), 0);
    return { tool: intent, metric: "cash_balance", amount: balance, transaction_count: transactions.length, currency: "INR", reporting_period: `as of ${period.end.toLocaleDateString("en-IN")}` };
  }
  const income = entries.filter((entry) => String(entry.type).toLowerCase() === "income").reduce((sum, entry) => sum + number(entry.amount), 0);
  const expenses = entries.filter((entry) => String(entry.type).toLowerCase() === "expense").reduce((sum, entry) => sum + number(entry.amount), 0);
  if (intent === "sales_summary") return { tool: intent, metric: "sales", amount: income, currency: "INR", reporting_period: dateLabel };
  if (intent === "expense_breakdown") return { tool: intent, metric: "expenses", amount: expenses, currency: "INR", reporting_period: dateLabel };
  if (intent === "profit_and_loss") return { tool: intent, metric: "net_profit", amount: income - expenses, revenue: income, expenses, currency: "INR", reporting_period: dateLabel };
  throw new Error("Unsupported financial question");
};

export const formatFinancialAnswer = (result) => {
  const money = (value) => `₹${number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (result.metric === "total_payables") return `Your total payables are **${money(result.amount)}** for ${result.reporting_period}.\n\n- Outstanding purchase invoices: ${result.outstanding_invoice_count}\n- Overdue payables: ${money(result.overdue_amount)}\n\nWould you like a supplier-wise breakdown or the overdue purchase invoices?`;
  if (result.metric === "supplier_payables") return `Your top suppliers by open payable balance for ${result.reporting_period}:\n\n${result.suppliers.map((supplier, index) => `${index + 1}. ${supplier.supplier}: **${money(supplier.amount)}** across ${supplier.invoice_count} invoice${supplier.invoice_count === 1 ? "" : "s"}`).join("\n") || "No open supplier balances were found."}`;
  if (result.metric === "outstanding_purchase_invoices") return result.invoices.length
    ? `Overdue purchase invoices for ${result.reporting_period}:\n\n${result.invoices.map((invoice) => `- ${invoice.billNo || invoice.billNumber || "Purchase invoice"} · ${invoice.supplierName || invoice.partyName || "Unspecified supplier"} · **${money(outstandingBalance(invoice))}**`).join("\n")}`
    : `No overdue purchase invoices were found for ${result.reporting_period}.`;
  if (result.metric === "total_receivables") return `Your total receivables are **${money(result.amount)}** for ${result.reporting_period}.\n\n- Outstanding sales invoices: ${result.outstanding_invoice_count}\n- Overdue receivables: ${money(result.overdue_amount)}`;
  if (result.metric === "net_profit") return `Your net profit is **${money(result.amount)}** for ${result.reporting_period}.\n\n- Revenue: ${money(result.revenue)}\n- Expenses: ${money(result.expenses)}`;
  if (result.metric === "purchases") return `Your total purchases are **${money(result.amount)}** for ${result.reporting_period}, across ${result.purchase_invoice_count} purchase invoice${result.purchase_invoice_count === 1 ? "" : "s"}.`;
  if (result.metric === "cash_balance") return `Your recorded cash balance is **${money(result.amount)}** ${result.reporting_period}, based on ${result.transaction_count} cash transaction${result.transaction_count === 1 ? "" : "s"}.`;
  return `Your ${result.metric} total is **${money(result.amount)}** for ${result.reporting_period}.`;
};
