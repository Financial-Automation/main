import {
  roundDec,
  toNumber,
  formatINR,
  resolveDateRange,
  getOutstandingBalance,
  isOpenInvoice,
  getDashboardSummary,
  getTotalPayables,
  getTotalReceivables,
  getProfitAndLoss,
  getExpenseAnalysis,
  getBalanceSheetData,
  getCashFlowData,
  getCashFlowForecastData,
  getFinancialRatiosData,
  getInvoiceDetails,
  getInventoryValuationData,
  getGstManagementData,
  getPayrollData,
  getBankReconciliationData,
  getFraudDetectionData,
  getCivilProjectsData,
  getChartOfAccountsData,
} from "./financialTools.js";
import BookkeepingEntry from "../models/BookkeepingEntry.js";
import { getUserScope } from "./financialTools.js";
import { searchApplicationKnowledge, formatKnowledgeAnswer } from "./applicationKnowledge.js";
import { retrieveKnowledge, formatQaAnswer } from "./qaRetrievalEngine.js";

// Exported for backward-compatibility with existing tests and callers
export { getOutstandingBalance as outstandingBalance, isOpenInvoice as isOpenDocument };

export const resolveAssistantPeriod = (period = "this-month", now = new Date()) => {
  return resolveDateRange(period, now);
};

/**
 * Returns true only when the user is asking for company-specific financial
 * data. This keeps explanatory questions such as "What is Total Payables?"
 * on the knowledge-base path while still routing "What are my Total
 * Payables this month?" to the authoritative financial tools.
 */
export const requestsLiveFinancialData = (question) => {
  const text = String(question || "").toLowerCase();
  return /\b(my|our|current|actual|live|show|list|how much|balance|breakdown|overdue|outstanding|this\s+(?:month|quarter|year|week)|last\s+(?:month|quarter|year|week)|today|yesterday|date range)\b/.test(text);
};

// ============================================================================
// INTENT RECOGNITION & ENTITY EXTRACTION
// ============================================================================
export const extractInvoiceIdentifier = (text) => {
  if (!text) return null;
  // Match patterns like INV-001, INV_001, INV/001, BILL-001, #1001, or INV001 (must have numbers or delimiters)
  const match = text.match(/\b((?:INV|BILL)[-_/][A-Za-z0-9_-]+|(?:INV|BILL)[0-9]+|#[0-9]+|[A-Za-z]{2,4}-[0-9]+)\b/i);
  if (match) {
    return match[1].replace(/^#/, "");
  }
  // Check for "invoice #?001" or "bill #?12" (excluding common nouns like "invoices", "summary", etc.)
  const phraseMatch = text.match(/\b(?:invoice|bill)\s+#?([A-Za-z0-9_-]+)/i);
  if (phraseMatch) {
    const candidate = phraseMatch[1].trim();
    const stopWords = ["number", "details", "detail", "summary", "balance", "status", "list", "records", "invoices", "bills", "items", "amount"];
    if (!stopWords.includes(candidate.toLowerCase())) {
      return candidate;
    }
  }
  return null;
};

export const extractComparisonPeriods = (text, defaultPeriod = "this-month") => {
  const t = String(text || "").toLowerCase();
  let currentPeriod = defaultPeriod;
  let comparePeriod = "last-month";

  if (/\b(this quarter|current quarter)\b/.test(t)) currentPeriod = "this-quarter";
  if (/\b(this year|current year)\b/.test(t)) currentPeriod = "this-year";

  if (/\blast month\b/.test(t) || /\bprevious month\b/.test(t)) {
    comparePeriod = "last-month";
  } else if (/\blast quarter\b/.test(t)) {
    comparePeriod = "this-quarter";
  } else if (/\blast year\b/.test(t)) {
    comparePeriod = "this-year";
  }

  return { currentPeriod, comparePeriod };
};

export const recognizeFinancialIntent = (question, previousIntent = null, history = []) => {
  const text = String(question || "").toLowerCase().trim();

  // 1. Follow-up heuristics with context
  if (
    /\b(which ones|which|who|list them).*\boverdue\b/.test(text) ||
    /^\s*overdue\??\s*$/.test(text)
  ) {
    if (["total_payables", "supplier_payables", "outstanding_purchase_invoices"].includes(previousIntent)) {
      return "outstanding_purchase_invoices";
    }
    if (["total_receivables", "customer_receivables", "outstanding_sales_invoices"].includes(previousIntent)) {
      return "outstanding_sales_invoices";
    }
    return "outstanding_purchase_invoices";
  }

  if (/\b(show.*top.*suppliers?|top.*suppliers?|supplier.*breakdown|who do i owe|who are my (top )?creditors?)\b/.test(text)) {
    return "supplier_payables";
  }

  if (/\b(show.*top.*customers?|top.*customers?|customer.*breakdown|who owes me|top debtors?)\b/.test(text)) {
    return "customer_receivables";
  }

  // Payables Comparison
  if (
    /\b(compare.*(total )?payables?|(total )?payables?.*(compare|versus|vs|with last month|with previous))\b/.test(text)
  ) {
    return "payables_comparison";
  }

  // Receivables Comparison
  if (
    /\b(compare.*(total )?receivables?|(total )?receivables?.*(compare|versus|vs|with last month|with previous))\b/.test(text)
  ) {
    return "receivables_comparison";
  }

  if (
    /\bwhy did (my )?expenses? (increase|rise|jump|go up)\b/.test(text) ||
    /\bwhy has (my )?profit (decreased|dropped|fallen|gone down)\b/.test(text) ||
    (/\b(compare expenses?|expense comparison)\b/.test(text)) ||
    (/\bcompare\b.*\b(last month|previous month|prior)\b/.test(text) && !previousIntent && !/\b(payable|receivable|invoice|bill)\b/.test(text))
  ) {
    return "expense_comparison";
  }

  // If question is a short period follow-up like "What about last month?" or "And last month?", preserve previousIntent
  if (previousIntent && /\b(what about|how about|and|for)\b.*\b(last month|previous month|this quarter|this year|today)\b/.test(text)) {
    return previousIntent;
  }

  // 2. Specific Invoice Queries
  if (
    extractInvoiceIdentifier(text) ||
    /\b(balance of invoice|why is this invoice|invoice details?|status of invoice|unpaid balance of)\b/.test(text)
  ) {
    return "invoice_details";
  }

  // 3a. Specific Outstanding/Open/Unpaid Invoices Listing
  if (
    /\b(show|list|view)?.*(outstanding|unpaid|open|pending).*purchase.*(invoices?|bills?)\b/.test(text) ||
    /\b(outstanding|unpaid|open|pending)\s+purchase\s+(invoices?|bills?)\b/.test(text)
  ) {
    return "outstanding_purchase_invoices";
  }

  if (
    /\b(show|list|view)?.*(outstanding|unpaid|open|pending).*(sales\s+invoices?|customer\s+invoices?)\b/.test(text) ||
    /\b(outstanding|unpaid|open|pending)\s+(sales\s+invoices?|customer\s+invoices?)\b/.test(text)
  ) {
    return "outstanding_sales_invoices";
  }

  // 3b. Purchases & Accounts Payable
  if (/\b(total )?purchases?\b/.test(text) && !/\b(payable|owe|due|unpaid|bill|outstanding|invoice)\b/.test(text)) {
    return "purchase_summary";
  }

  if (
    !/\b(gst|tax)\b/.test(text) &&
    /\b(total payables?|payables?|how much do i owe|what do i need to pay|unpaid purchase|outstanding purchase|pending supplier payments?|what payments are due)\b/.test(text)
  ) {
    if (/\b(overdue|due this week)\b/.test(text)) return "outstanding_purchase_invoices";
    return "total_payables";
  }

  // 4. Accounts Receivable
  if (
    /\b(total receivables?|receivables?|how much do customers owe|what are customers due|outstanding sales amount|money should i collect|pending customer payments?)\b/.test(text)
  ) {
    if (/\b(overdue)\b/.test(text)) return "outstanding_sales_invoices";
    return "total_receivables";
  }

  // 5. Invoices & Billing general
  if (/\b(how many invoices|unpaid.*invoices?|outstanding.*invoices?|overdue.*invoices?|pending.*invoices?)\b/.test(text)) {
    if (/\b(purchase|supplier|vendor|bill)\b/.test(text)) {
      return "outstanding_purchase_invoices";
    }
    return "outstanding_sales_invoices";
  }

  // 6. Cash Flow & Cash Position
  if (/\b(projected cash flow|cash flow forecast|forecast.*cash flow|next six months|cash flow prediction)\b/.test(text)) {
    return "cash_flow_forecast";
  }
  if (/\b(current )?cash (balance|position)\b/.test(text)) {
    return "cash_balance";
  }
  if (/\b(net cash flow|cash flow|current cash)\b/.test(text)) {
    return "cash_flow";
  }

  // 7. Balance Sheet & Working Capital
  if (
    /\b(balance sheet|current assets?|current liabilities?|working capital|total assets?|total liabilities?|net worth|equity)\b/.test(text)
  ) {
    return "balance_sheet";
  }

  // 8. Financial Ratios
  if (
    /\b(financial ratios?|current ratio|quick ratio|debt to equity|acid test|roe|roa|asset turnover)\b/.test(text)
  ) {
    return "financial_ratios";
  }

  // 9. Profit & Loss / Revenue / Expenses
  if (/\b(net profit|gross profit|profit margin|p&l|profit and loss|am i making money|am i profitable)\b/.test(text)) {
    return "profit_and_loss";
  }
  if (/\b(total revenue|revenue|gross revenue|sales summary|turnover)\b/.test(text)) {
    return "sales_summary";
  }
  if (/\b(total expenditure|total expenses?|which expense category|expense breakdown|spending|highest expense)\b/.test(text)) {
    return "expense_breakdown";
  }

  // 10. GST and Tax Management
  if (/\b(gst|tax liability|gst liability|input tax credit|itc|cgst|sgst|igst|gst payable)\b/.test(text)) {
    return "gst_summary";
  }

  // 11. Inventory Management
  if (/\b(inventory|stock value|current inventory|reorder level|low stock|running low|stock on hand|skus?|products? in stock)\b/.test(text)) {
    return "inventory_valuation";
  }

  // 12. Payroll
  if (/\b(payroll|salaries|salary expense|employee expenses?|staff cost|wages)\b/.test(text)) {
    return "payroll_summary";
  }

  // 13. Bank Reconciliation
  if (/\b(bank reconcil|reconciled balance|bank statement match|reconciliation session)\b/.test(text)) {
    return "bank_reconciliation";
  }

  // 14. Fraud Detection
  if (/\b(fraud|suspicious transaction|flagged transaction|risk score|anomalies)\b/.test(text)) {
    return "fraud_detection";
  }

  // 15. Civil Engineering Project Scheduling
  if (/\b(civil|cpm|critical path|project schedule|construction project)\b/.test(text)) {
    return "civil_projects";
  }

  // 16. Chart of Accounts & General Ledger
  if (/\b(chart of accounts|general ledger|ledger accounts?)\b/.test(text)) {
    return "chart_of_accounts";
  }

  // 17. Bookkeeping Entries
  if (/\b(bookkeeping|ledger entries|book entries)\b/.test(text)) {
    return "bookkeeping_ledger";
  }

  // 18. Complete Overview / Summary
  if (/\b(financial summary|complete summary|overview|how is my business doing|cfo summary|health check)\b/.test(text)) {
    return "dashboard_summary";
  }

  // 19. Context Carryover or Default to Dashboard Summary
  if (previousIntent && text.length < 20 && !/\b(hello|hi|hey|help)\b/.test(text)) {
    return previousIntent;
  }

  return "dashboard_summary";
};

export const isGeneralQuestion = (question) => {
  const text = String(question || "").toLowerCase().trim();
  if (!text) return false;

  // 1. Conceptual differences and comparisons across general accounting terms
  if (/\b(difference between|what is the difference|vs\.?|versus)\b/i.test(text)) {
    return true;
  }

  // 2. Explanations in simple terms / beginner level
  if (/\b(in simple terms|simple words|for beginners|layman('?s)? terms?|explain simply)\b/i.test(text)) {
    return true;
  }

  // 3. Generative or writing tasks (emails, letters, templates)
  if (/\b(write|draft|compose|help me write|create an email|draft a message|sample email|template for)\b/i.test(text)) {
    return true;
  }

  // 4. General programming, algorithms, math, or external topics
  if (/\b(python|javascript|code|script|algorithm|compound interest|depreciation method)\b/i.test(text)) {
    return true;
  }

  return false;
};

export const isLiveFinancialQuery = (question, previousIntent = null, history = []) => {
  const text = String(question || "").toLowerCase().trim();
  if (!text) return true; // empty query defaults to live dashboard summary for safety/compatibility

  // 1. Specific invoice reference
  if (extractInvoiceIdentifier(text)) return true;

  // 2. Follow-up heuristics when previousIntent is present
  if (previousIntent && (
    /\b(which ones|which|who|list them|what about|how about|and|for)\b/.test(text) ||
    /^\s*overdue\??\s*$/.test(text) ||
    text.length < 20
  )) {
    return true;
  }

  // 3. User explicitly asking for company-specific numbers, records, or live calculations
  if (requestsLiveFinancialData(text)) {
    return true;
  }

  // 4. Exact metric command phrases (e.g., "total payables", "net profit", "cash balance")
  const directMetricPatterns = [
    /^(total )?payables?$/i,
    /^(total )?receivables?$/i,
    /^(total )?purchases?$/i,
    /^(net )?profit( and loss)?$/i,
    /^p&l$/i,
    /^(total )?(revenue|sales|turnover)$/i,
    /^(total )?(expenses?|expenditure)$/i,
    /^(current )?cash (balance|flow|position)$/i,
    /^balance sheet$/i,
    /^(financial )?ratios?$/i,
    /^(current )?inventory( valuation)?$/i,
    /^payroll( summary)?$/i,
    /^bank reconciliation$/i,
    /^fraud detection$/i,
    /^gst (summary|liability|payable)$/i,
    /^(financial|dashboard|cfo) summary$/i
  ];
  if (directMetricPatterns.some(p => p.test(text))) {
    return true;
  }

  return false;
};

// ============================================================================
// QUESTION CLASSIFICATION (WORKFLOW vs DATA vs CONCEPT vs UNSUPPORTED)
// ============================================================================
export const classifyQuestion = (question, previousIntent = null, history = []) => {
  const rawText = String(question || "").trim();
  if (!rawText) {
    return {
      type: "LIVE_FINANCIAL_DATA",
      knowledge: null,
      intent: "dashboard_summary"
    };
  }

  // 1. Check structured application knowledge
  const appCheck = searchApplicationKnowledge(question);
  if (appCheck) {
    return {
      type: appCheck.category === "unsupported_feature"
        ? "UNSUPPORTED_FEATURE"
        : appCheck.category === "combined"
        ? "COMBINED"
        : "APPLICATION_KNOWLEDGE",
      knowledge: appCheck,
      intent: null
    };
  }

  // 2. Explicit generative/comparison/simple-terms questions bypass loose keyword matching
  const isGeneral = isGeneralQuestion(question);
  if (isGeneral) {
    return {
      type: "GENERAL_QUESTION",
      knowledge: null,
      intent: null
    };
  }

  // 3. Structured Q&A Knowledge Base Retrieval
  const qaResult = retrieveKnowledge(question);
  if (qaResult && qaResult.bestMatch && qaResult.confidence !== "none" && qaResult.score >= 0.45) {
    const rec = qaResult.bestMatch;
    let moduleId = rec.id.replace(/^qa_/, "").replace(/_create$/, "");
    if (rec.id === "qa_invoice_creation" || rec.id === "qa_sales_invoice_create") {
      moduleId = "sales_invoice";
    } else if (rec.id === "qa_purchase_invoice_create") {
      moduleId = "purchase_invoice";
    }
    return {
      type: "APPLICATION_KNOWLEDGE",
      knowledge: {
        ...rec,
        isQaRecord: true,
        topic: rec.canonicalQuestion,
        module: {
          id: moduleId,
          name: rec.module,
          route: rec.route
        }
      },
      qaRecord: rec,
      intent: null
    };
  }

  // 4. Live Financial Data vs General Conversational / Educational Question
  if (!isLiveFinancialQuery(question, previousIntent, history)) {
    return {
      type: "GENERAL_QUESTION",
      knowledge: null,
      intent: null
    };
  }

  const intent = recognizeFinancialIntent(question, previousIntent, history);
  return {
    type: "LIVE_FINANCIAL_DATA",
    knowledge: null,
    intent
  };
};

// ============================================================================
// TOOL DISPATCHER (SECURE USER-SCOPED EXECUTION)
// ============================================================================
export const queryFinancialTool = async ({
  userId,
  intent,
  period = "this-month",
  question = "",
  previousResult = null,
}) => {
  const requestedPeriod = String(period || "this-month");
  const extractedInv = extractInvoiceIdentifier(question);

  switch (intent) {
    case "total_payables":
    case "supplier_payables":
    case "outstanding_purchase_invoices": {
      const data = await getTotalPayables({ userId, period: requestedPeriod });
      return {
        ...data,
        tool: intent,
        metric: intent,
      };
    }

    case "total_receivables":
    case "customer_receivables":
    case "outstanding_sales_invoices": {
      const data = await getTotalReceivables({ userId, period: requestedPeriod });
      return {
        ...data,
        tool: intent,
        metric: intent,
      };
    }

    case "purchase_summary": {
      const scope = getUserScope(userId);
      const dateRange = resolveDateRange(requestedPeriod);
      const PurchaseInvoice = getPurchaseInvoiceModel();
      const records = await PurchaseInvoice.find({ ...scope, isDeleted: { $ne: true } }).lean();
      const purchases = records.filter(
        (item) =>
          String(item.status || "").toLowerCase() !== "cancelled" &&
          dateRange.isDateInPeriod(item.createdAt || item.billDate)
      );
      const totalAmt = roundDec(
        purchases.reduce((sum, item) => sum + toNumber(item.total ?? item.grandTotal), 0)
      );
      return {
        tool: intent,
        metric: "purchases",
        amount: totalAmt,
        purchaseInvoiceCount: purchases.length,
        currency: "INR",
        period: dateRange.label,
        reportingDate: dateRange.formattedDate,
      };
    }

    case "cash_balance": {
      const data = await getCashFlowData({ userId, period: requestedPeriod });
      return {
        tool: intent,
        metric: "cash_balance",
        amount: data.currentCashPosition,
        netCashFlow: data.netCashFlow,
        currency: "INR",
        period: data.period,
        reportingDate: data.reportingDate,
      };
    }

    case "profit_and_loss":
    case "sales_summary":
    case "expense_breakdown": {
      const data = await getProfitAndLoss({ userId, period: requestedPeriod });
      return {
        tool: intent,
        metric: intent,
        ...data,
      };
    }

    case "expense_comparison": {
      const { currentPeriod, comparePeriod } = extractComparisonPeriods(
        question,
        requestedPeriod
      );
      const data = await getExpenseAnalysis({
        userId,
        currentPeriod,
        comparePeriod,
      });
      return {
        ...data,
        tool: "expense_comparison",
        metric: "expense_comparison",
      };
    }

    case "payables_comparison": {
      const { currentPeriod, comparePeriod } = extractComparisonPeriods(
        question,
        requestedPeriod
      );
      const currentData = await getTotalPayables({ userId, period: currentPeriod });
      const previousData = await getTotalPayables({ userId, period: comparePeriod });
      const change = roundDec(currentData.amount - previousData.amount);
      const pctChange = previousData.amount > 0
        ? roundDec((change / previousData.amount) * 100)
        : currentData.amount > 0 ? 100 : 0;
      const direction = change > 0 ? "increased" : change < 0 ? "decreased" : "unchanged";
      return {
        tool: "payables_comparison",
        metric: "payables_comparison",
        currentPeriod,
        comparePeriod,
        currentTotal: currentData.amount,
        previousTotal: previousData.amount,
        changeAmount: change,
        percentageChange: pctChange,
        direction,
        currentOutstandingCount: currentData.outstandingInvoiceCount,
        previousOutstandingCount: previousData.outstandingInvoiceCount,
        currentOverdue: currentData.overdueAmount,
        previousOverdue: previousData.overdueAmount,
        currency: "INR",
        reportingDate: currentData.reportingDate
      };
    }

    case "receivables_comparison": {
      const { currentPeriod, comparePeriod } = extractComparisonPeriods(
        question,
        requestedPeriod
      );
      const currentData = await getTotalReceivables({ userId, period: currentPeriod });
      const previousData = await getTotalReceivables({ userId, period: comparePeriod });
      const change = roundDec(currentData.amount - previousData.amount);
      const pctChange = previousData.amount > 0
        ? roundDec((change / previousData.amount) * 100)
        : currentData.amount > 0 ? 100 : 0;
      const direction = change > 0 ? "increased" : change < 0 ? "decreased" : "unchanged";
      return {
        tool: "receivables_comparison",
        metric: "receivables_comparison",
        currentPeriod,
        comparePeriod,
        currentTotal: currentData.amount,
        previousTotal: previousData.amount,
        changeAmount: change,
        percentageChange: pctChange,
        direction,
        currentOutstandingCount: currentData.outstandingInvoiceCount,
        previousOutstandingCount: previousData.outstandingInvoiceCount,
        currentOverdue: currentData.overdueAmount,
        previousOverdue: previousData.overdueAmount,
        currency: "INR",
        reportingDate: currentData.reportingDate
      };
    }

    case "invoice_details": {
      const data = await getInvoiceDetails({
        userId,
        invoiceNumber: extractedInv || question,
      });
      return {
        ...data,
        tool: "invoice_details",
        metric: "invoice_details",
      };
    }

    case "balance_sheet": {
      const data = await getBalanceSheetData({ userId, period: requestedPeriod });
      return {
        tool: "balance_sheet",
        metric: "balance_sheet",
        ...data,
      };
    }

    case "cash_flow": {
      const data = await getCashFlowData({ userId, period: requestedPeriod });
      return {
        tool: "cash_flow",
        metric: "cash_flow",
        ...data,
      };
    }

    case "cash_flow_forecast": {
      const data = await getCashFlowForecastData({ userId, months: 6 });
      return {
        tool: "cash_flow_forecast",
        metric: "cash_flow_forecast",
        ...data,
      };
    }

    case "financial_ratios": {
      const data = await getFinancialRatiosData({ userId, period: requestedPeriod });
      return {
        tool: "financial_ratios",
        metric: "financial_ratios",
        ...data,
      };
    }

    case "inventory_valuation": {
      const data = await getInventoryValuationData({ userId });
      return {
        tool: "inventory_valuation",
        metric: "inventory_valuation",
        ...data,
      };
    }

    case "gst_summary": {
      const data = await getGstManagementData({ userId, period: requestedPeriod });
      return {
        tool: "gst_summary",
        metric: "gst_summary",
        ...data,
      };
    }

    case "payroll_summary": {
      const data = await getPayrollData({ userId });
      return {
        tool: "payroll_summary",
        metric: "payroll_summary",
        ...data,
      };
    }

    case "bank_reconciliation": {
      const data = await getBankReconciliationData({ userId });
      return {
        tool: "bank_reconciliation",
        metric: "bank_reconciliation",
        ...data,
      };
    }

    case "fraud_detection": {
      const data = await getFraudDetectionData({ userId });
      return {
        tool: "fraud_detection",
        metric: "fraud_detection",
        ...data,
      };
    }

    case "civil_projects": {
      const data = await getCivilProjectsData({ userId });
      return {
        tool: "civil_projects",
        metric: "civil_projects",
        ...data,
      };
    }

    case "chart_of_accounts": {
      const data = await getChartOfAccountsData({ userId });
      return {
        tool: "chart_of_accounts",
        metric: "chart_of_accounts",
        ...data,
      };
    }

    case "bookkeeping_ledger": {
      const scope = getUserScope(userId);
      const dateRange = resolveDateRange(requestedPeriod);
      const entries = await BookkeepingEntry.find({
        ...scope,
        isDeleted: { $ne: true },
        date: { $gte: dateRange.start, $lte: dateRange.end },
      })
        .sort({ date: -1 })
        .limit(20)
        .lean();
      return {
        tool: "bookkeeping_ledger",
        metric: "bookkeeping_ledger",
        period: dateRange.label,
        reportingDate: dateRange.formattedDate,
        count: entries.length,
        entries: entries.map((e) => ({
          date: e.date,
          type: e.type,
          category: e.category,
          amount: toNumber(e.amount),
          description: e.description,
        })),
      };
    }

    case "dashboard_summary":
    default: {
      const data = await getDashboardSummary({ userId, period: requestedPeriod });
      return {
        tool: "dashboard_summary",
        metric: "dashboard_summary",
        ...data,
      };
    }
  }
};

// ============================================================================
// CFO DETERMINISTIC ANSWER FORMATTER
// ============================================================================
export const formatFinancialAnswer = (result) => {
  if (!result) return "No financial records were found for this query.";

  const money = formatINR;

  // 1. Exact Dashboard Parity: Total Payables
  if (result.metric === "total_payables") {
    return (
      `Your current Total Payables are **${money(result.amount)}**, as of ${result.reportingDate || result.reporting_period || "the current period"}.\n\n` +
      `- Outstanding purchase bills: **${result.outstandingInvoiceCount ?? result.outstanding_invoice_count ?? 0}**\n` +
      `- Overdue payables: **${money(result.overdueAmount ?? result.overdue_amount ?? 0)}**\n\n` +
      `Would you like me to show the supplier-wise breakdown or the overdue payments?`
    );
  }

  // 2. Exact Dashboard Parity: Total Receivables
  if (result.metric === "total_receivables") {
    return (
      `Your current Total Receivables are **${money(result.amount)}**, as of ${result.reportingDate || result.reporting_period || "the current period"}.\n\n` +
      `- Outstanding customer invoices: **${result.outstandingInvoiceCount ?? result.outstanding_invoice_count ?? 0}**\n` +
      `- Overdue receivables: **${money(result.overdueAmount ?? result.overdue_amount ?? 0)}**\n\n` +
      `Would you like me to show the customer-wise breakdown or the overdue invoices?`
    );
  }

  // 3. Supplier Breakdown
  if (result.metric === "supplier_payables") {
    if (!result.suppliers || result.suppliers.length === 0) {
      return `You have no outstanding supplier payables for ${result.reportingDate || result.period || "this period"}. All supplier bills are settled!`;
    }
    const lines = result.suppliers.map(
      (s, idx) =>
        `${idx + 1}. **${s.supplierName || s.supplier}**: ${money(s.amount)} (${s.invoiceCount || s.invoice_count} open bill${(s.invoiceCount || s.invoice_count) === 1 ? "" : "s"})`
    );
    return (
      `### Top Suppliers by Outstanding Balance (${result.reportingDate || result.period})\n\n` +
      lines.join("\n") +
      `\n\n**Total Payables:** ${money(result.amount)}\n\nWould you like me to show the overdue purchase invoices among these?`
    );
  }

  // 4. Customer Breakdown
  if (result.metric === "customer_receivables") {
    if (!result.customers || result.customers.length === 0) {
      return `You have no outstanding customer receivables for ${result.reportingDate || result.period || "this period"}.`;
    }
    const lines = result.customers.map(
      (c, idx) =>
        `${idx + 1}. **${c.customerName}**: ${money(c.amount)} (${c.invoiceCount} unpaid invoice${c.invoiceCount === 1 ? "" : "s"})`
    );
    return (
      `### Top Customers by Outstanding Receivables (${result.reportingDate || result.period})\n\n` +
      lines.join("\n") +
      `\n\n**Total Receivables:** ${money(result.amount)}\n\nWould you like me to list the overdue sales invoices?`
    );
  }

  // 5. Outstanding / Overdue Purchase Bills
  if (result.metric === "outstanding_purchase_invoices") {
    const list = (result.invoices && result.invoices.length > 0)
      ? result.invoices
      : (result.overdueInvoices || []);
    if (list.length === 0) {
      return `Great news! You have **no outstanding supplier purchase invoices** for ${result.reportingDate || result.period}.`;
    }
    const lines = list.map(
      (inv) =>
        `- Bill **${inv.billNo}** · ${inv.supplierName} · Balance: **${money(inv.balance)}** (Due: ${inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-IN") : "N/A"}${inv.isOverdue ? " - Overdue ⚠️" : ""})`
    );
    return (
      `### Outstanding Purchase Invoices (${result.reportingDate || result.period})\n\n` +
      lines.join("\n") +
      `\n\n- **Total Outstanding Payables:** **${money(result.amount)}**\n- **Open Bills Count:** ${result.outstandingInvoiceCount || list.length}\n- **Overdue Amount:** ${money(result.overdueAmount || 0)}\n\nRecommendation: Prioritize payments to critical suppliers to maintain goodwill and credit terms.`
    );
  }

  // 6. Outstanding / Overdue Sales Invoices
  if (result.metric === "outstanding_sales_invoices") {
    const list = (result.invoices && result.invoices.length > 0)
      ? result.invoices
      : (result.overdueInvoices || []);
    if (list.length === 0) {
      return `Great news! You have **no outstanding sales invoices** for ${result.reportingDate || result.period}.`;
    }
    const lines = list.map(
      (inv) =>
        `- Invoice **${inv.invoiceNumber}** · ${inv.customerName} · Balance: **${money(inv.balance)}** (Due: ${inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-IN") : "N/A"}${inv.isOverdue ? " - Overdue ⚠️" : ""})`
    );
    return (
      `### Outstanding Customer Invoices (${result.reportingDate || result.period})\n\n` +
      lines.join("\n") +
      `\n\n- **Total Outstanding Receivables:** **${money(result.amount)}**\n- **Open Invoices Count:** ${result.outstandingInvoiceCount || list.length}\n- **Overdue Amount:** ${money(result.overdueAmount || 0)}\n\nRecommendation: Send automated payment reminders or follow up via WhatsApp/email.`
    );
  }

  // 7. Profit & Loss Statement
  if (result.metric === "profit_and_loss" || result.metric === "net_profit") {
    const status = result.isProfitable ? "PROFITABLE ✅" : "OPERATING AT A LOSS ⚠️";
    const topExpenses = (result.expenseBreakdown?.byCategory || []).slice(0, 4);
    const expenseList = topExpenses.length
      ? topExpenses.map((e) => `- ${e.category}: ${money(e.amount)}`).join("\n")
      : "- No categorized expenses recorded.";

    return (
      `### Profit & Loss Statement (${result.reportingDate || result.period})\n\n` +
      `- **Total Revenue:** ${money(result.totalRevenue || result.revenue)}\n` +
      `- **Total Expenses:** ${money(result.totalExpenses || result.expenses)}\n` +
      `- **Net Profit:** **${money(result.netProfit || result.amount)}**\n` +
      `- **Net Profit Margin:** **${result.profitMargin || 0}%**\n` +
      `- **Status:** Business is **${status}**\n\n` +
      `### Top Expense Categories\n${expenseList}\n\n` +
      (result.isProfitable
        ? "Recommendation: Reinvest cash surpluses into customer acquisition or working capital reserves."
        : "Recommendation: Immediate cost review required on non-essential operational expenses.")
    );
  }

  // 8. Sales Summary
  if (result.metric === "sales_summary" || result.metric === "sales") {
    return (
      `### Revenue & Sales Summary (${result.reportingDate || result.period})\n\n` +
      `- **Total Revenue:** **${money(result.totalRevenue || result.amount)}**\n` +
      `- Sales Invoices Revenue: ${money(result.revenueBreakdown?.salesRevenue || 0)}\n` +
      `- POS & Inventory Sales: ${money(result.revenueBreakdown?.inventorySales || 0)}\n` +
      `- Bookkeeping Other Income: ${money(result.revenueBreakdown?.otherIncome || 0)}`
    );
  }

  // 9. Expense Breakdown
  if (result.metric === "expense_breakdown" || result.metric === "expenses") {
    const list = (result.expenseBreakdown?.byCategory || []).map(
      (e) => `- **${e.category}**: ${money(e.amount)}`
    );
    return (
      `### Total Expenditure (${result.reportingDate || result.period})\n\n` +
      `**Total Expenses:** **${money(result.totalExpenses || result.amount)}**\n\n` +
      `### Category Breakdown\n${list.join("\n") || "No expenses recorded."}`
    );
  }

  // 10. Expense Comparison & CFO Variance Analysis
  if (result.metric === "expense_comparison") {
    const dirIcon = result.direction === "increased" ? "🔺" : result.direction === "decreased" ? "🟢" : "➡️";
    const drivers = (result.primaryDrivers || []).map(
      (d) =>
        `- **${d.category}**: ${money(d.currentAmount)} vs ${money(d.previousAmount)} (${d.change >= 0 ? "+" : ""}${money(d.change)}, ${d.percentageChange}%)`
    );
    const cuts = (result.costReductions || []).map(
      (d) =>
        `- **${d.category}**: reduced by ${money(Math.abs(d.change))} (${d.percentageChange}%)`
    );

    return (
      `### Expense Analysis: ${result.currentPeriod} vs ${result.comparePeriod}\n\n` +
      `Your total expenditure ${dirIcon} ${result.direction} by **${money(Math.abs(result.changeAmount))}** (${result.percentageChange}% change).\n\n` +
      `- **${result.currentPeriod} Total:** ${money(result.currentTotal)}\n` +
      `- **${result.comparePeriod} Total:** ${money(result.previousTotal)}\n\n` +
      (drivers.length
        ? `### Primary Drivers of Expense Increase\n${drivers.join("\n")}\n\n`
        : "") +
      (cuts.length ? `### Notable Cost Reductions\n${cuts.join("\n")}\n\n` : "") +
      `CFO Insight: ${
        result.direction === "increased"
          ? "Examine whether these cost increases contributed directly to proportional revenue growth, or represent overhead creep."
          : "Good cost discipline observed in operating expenditures."
      }`
    );
  }

  // 10b. Payables Comparison
  if (result.metric === "payables_comparison") {
    const dirIcon = result.direction === "increased" ? "🔺" : result.direction === "decreased" ? "🟢" : "➡️";
    return (
      `### Payables Analysis: ${result.currentPeriod} vs ${result.comparePeriod}\n\n` +
      `Your Total Payables ${dirIcon} ${result.direction} by **${money(Math.abs(result.changeAmount))}** (${result.percentageChange}% change).\n\n` +
      `- **${result.currentPeriod} Total Payables:** ${money(result.currentTotal)} (${result.currentOutstandingCount} open bills)\n` +
      `- **${result.comparePeriod} Total Payables:** ${money(result.previousTotal)} (${result.previousOutstandingCount} open bills)\n` +
      `- **Current Overdue Payables:** ${money(result.currentOverdue)}\n\n` +
      `CFO Insight: ${
        result.direction === "increased"
          ? "Total Payables increased compared to the previous period. Monitor supplier due dates to protect liquidity and cash flow."
          : "Total Payables decreased or remained stable, reflecting proactive vendor bill settlement."
      }`
    );
  }

  // 10c. Receivables Comparison
  if (result.metric === "receivables_comparison") {
    const dirIcon = result.direction === "increased" ? "🔺" : result.direction === "decreased" ? "🟢" : "➡️";
    return (
      `### Receivables Analysis: ${result.currentPeriod} vs ${result.comparePeriod}\n\n` +
      `Your Total Receivables ${dirIcon} ${result.direction} by **${money(Math.abs(result.changeAmount))}** (${result.percentageChange}% change).\n\n` +
      `- **${result.currentPeriod} Total Receivables:** ${money(result.currentTotal)} (${result.currentOutstandingCount} open invoices)\n` +
      `- **${result.comparePeriod} Total Receivables:** ${money(result.previousTotal)} (${result.previousOutstandingCount} open invoices)\n` +
      `- **Current Overdue Receivables:** ${money(result.currentOverdue)}\n\n` +
      `CFO Insight: ${
        result.direction === "increased"
          ? "Receivables increased. Prioritize collections on overdue accounts to accelerate cash inflow."
          : "Outstanding customer receivables have decreased, indicating improved collection velocity."
      }`
    );
  }

  // 11. Invoice Details
  if (result.metric === "invoice_details") {
    if (!result.found) {
      return result.message || "Invoice not found.";
    }
    const itemRows = (result.items || [])
      .map(
        (i) =>
          `  • ${i.name} · Qty: ${i.quantity} @ ${money(i.unitPrice)} = ${money(i.total)}`
      )
      .join("\n");

    return (
      `### Invoice Details: #${result.invoiceNumber} (${result.invoiceType.toUpperCase()})\n\n` +
      `- **Party:** ${result.customerOrSupplier}\n` +
      `- **Date:** ${new Date(result.date).toLocaleDateString("en-IN")}\n` +
      `- **Due Date:** ${result.dueDate ? new Date(result.dueDate).toLocaleDateString("en-IN") : "N/A"}\n` +
      `- **Grand Total:** **${money(result.grandTotal)}**\n` +
      `- **Amount Paid:** **${money(result.amountPaid)}**\n` +
      `- **Balance Due:** **${money(result.balanceDue)}**\n` +
      `- **Payment Status:** **${result.paymentStatus}**\n\n` +
      (itemRows ? `### Line Items\n${itemRows}\n\n` : "") +
      (result.balanceDue > 0
        ? `⚠️ Outstanding balance remaining: **${money(result.balanceDue)}**.`
        : "✅ This invoice is fully settled.")
    );
  }

  // 12. Balance Sheet
  if (result.metric === "balance_sheet") {
    return (
      `### Balance Sheet (${result.reportingDate || result.period})\n\n` +
      `### Assets: ${money(result.assets?.totalAssets)}\n` +
      `- Cash & Bank Balances: ${money(result.assets?.cashAndBank)}\n` +
      `- Accounts Receivable: ${money(result.assets?.accountsReceivable)}\n` +
      `- Inventory Stock Valuation: ${money(result.assets?.inventoryValuation)}\n` +
      `- **Total Current Assets:** ${money(result.assets?.currentAssets)}\n` +
      `- Fixed Assets: ${money(result.assets?.fixedAssets)}\n\n` +
      `### Liabilities: ${money(result.liabilities?.totalLiabilities)}\n` +
      `- Accounts Payable (Vendors): ${money(result.liabilities?.accountsPayable)}\n` +
      `- **Total Current Liabilities:** ${money(result.liabilities?.currentLiabilities)}\n\n` +
      `### Equity: ${money(result.equity?.totalEquity)}\n` +
      `- Retained Earnings / Reserves: ${money(result.equity?.retainedEarnings)}\n` +
      `- Owner Equity: ${money(result.equity?.ownerEquity)}\n\n` +
      `- **Net Working Capital:** **${money(result.workingCapital)}**\n` +
      `- **Balance Status:** ${result.isBalanced ? "Balanced (Assets = Liabilities + Equity) ✅" : "Unbalanced ⚠️"}`
    );
  }

  // 13. Cash Flow
  if (result.metric === "cash_flow" || result.metric === "cash_balance") {
    return (
      `### Cash Flow Statement (${result.reportingDate || result.period})\n\n` +
      `- **Cash Inflow:** ${money(result.cashInflow)}\n` +
      `- **Cash Outflow:** ${money(result.cashOutflow)}\n` +
      `- **Net Cash Flow:** **${money(result.netCashFlow)}** (${result.isPositiveCashFlow ? "Positive Inflow ✅" : "Negative Outflow ⚠️"})\n` +
      `- **Current Recorded Cash Position:** **${money(result.currentCashPosition)}**\n\n` +
      (result.isPositiveCashFlow
        ? "CFO Insight: Positive cash flow provides operational runway and resilience."
        : "CFO Insight: Outflows exceeded inflows this period. Accelerate customer collections.")
    );
  }

  // 14. Cash Flow Forecast
  if (result.metric === "cash_flow_forecast") {
    if (!result.predictions || result.predictions.length === 0) {
      return "Insufficient historical transaction data to generate a forecast.";
    }
    const predLines = result.predictions.map(
      (p) =>
        `- **${p.month}**: Inflow ${money(p.predictedInflow)} | Outflow ${money(p.predictedOutflow)} | **Net: ${money(p.predictedNetCashFlow)}**`
    );
    return (
      `### 6-Month Projected Cash Flow Forecast (Estimate)\n\n` +
      predLines.join("\n") +
      `\n\n### Forecast Summary\n` +
      `- Projected 6-Month Net Cash Flow: **${money(result.summary?.projectedNetSurplus)}**\n` +
      `- Average Monthly Inflow: ${money(result.summary?.averageMonthlyInflow)}\n` +
      `- Average Monthly Outflow: ${money(result.summary?.averageMonthlyOutflow)}\n\n` +
      `*Note: Cash flow forecasting uses regression trend models over historical transactions.*`
    );
  }

  // 15. Financial Ratios
  if (result.metric === "financial_ratios") {
    const r = result.ratios || {};
    return (
      `### Key Financial Ratios (${result.reportingDate || result.period})\n\n` +
      `- **Current Ratio:** **${r.currentRatio?.value}** (Benchmark: ${r.currentRatio?.benchmark}) · Status: ${r.currentRatio?.status}\n` +
      `- **Quick Ratio:** **${r.quickRatio?.value}** (Benchmark: ${r.quickRatio?.benchmark}) · Status: ${r.quickRatio?.status}\n` +
      `- **Debt-to-Equity:** **${r.debtToEquity?.value}** · Status: ${r.debtToEquity?.status}\n` +
      `- **Net Profit Margin:** **${r.netProfitMargin?.value}** · Status: ${r.netProfitMargin?.status}\n` +
      `- **Gross Profit Margin:** **${r.grossProfitMargin?.value}** · Status: ${r.grossProfitMargin?.status}\n` +
      `- **Return on Equity (ROE):** **${r.roe?.value}** · Status: ${r.roe?.status}\n` +
      `- **Return on Assets (ROA):** **${r.roa?.value}** · Status: ${r.roa?.status}`
    );
  }

  // 16. Inventory Valuation
  if (result.metric === "inventory_valuation") {
    const items = (result.topItems || []).map(
      (i) =>
        `- **${i.itemName}** (${i.sku}): ${i.quantity} units @ ${money(i.unitCost)} = **${money(i.valuation)}**`
    );
    const low = (result.lowStockItems || []).map(
      (i) => `- ⚠️ **${i.itemName}** (${i.sku}): only ${i.currentQuantity} units left (reorder threshold: ${i.reorderThreshold})`
    );

    return (
      `### Inventory & Stock Valuation\n\n` +
      `- **Total Inventory Valuation:** **${money(result.totalValuation)}**\n` +
      `- **Total SKUs / Products:** **${result.totalSkuCount}**\n` +
      `- **Items Below Reorder Level (<10 units):** **${result.lowStockCount}**\n\n` +
      (items.length ? `### Top Inventory Stock Items\n${items.join("\n")}\n\n` : "") +
      (low.length ? `### Low Stock Alerts\n${low.join("\n")}\n\n` : "")
    );
  }

  // 17. GST Management
  if (result.metric === "gst_summary") {
    return (
      `### Centralized GST Summary (${result.reportingDate || result.period})\n\n` +
      `- **Output GST (Collected on Sales):** ${money(result.outputGst)}\n` +
      `- **Input Tax Credit (ITC from Purchases):** ${money(result.inputGst)}\n` +
      `- **Net GST Payable:** **${money(result.gstPayable)}**\n` +
      `- **GST Credit Carry Forward:** ${money(result.gstReceivable)}\n\n` +
      `### Tax Slab Breakdown\n` +
      `- **CGST:** Output ${money(result.taxBreakdown?.cgst?.output)} | Input ${money(result.taxBreakdown?.cgst?.input)} | Net: ${money(result.taxBreakdown?.cgst?.net)}\n` +
      `- **SGST:** Output ${money(result.taxBreakdown?.sgst?.output)} | Input ${money(result.taxBreakdown?.sgst?.input)} | Net: ${money(result.taxBreakdown?.sgst?.net)}\n` +
      `- **IGST:** Output ${money(result.taxBreakdown?.igst?.output)} | Input ${money(result.taxBreakdown?.igst?.input)} | Net: ${money(result.taxBreakdown?.igst?.net)}\n\n` +
      (result.gstPayable > 0
        ? `Reminder: Ensure GST return GSTR-3B is filed and Net Tax of ${money(result.gstPayable)} is remitted before the 20th.`
        : "✅ You have no net GST liability to pay this tax period.")
    );
  }

  // 18. Payroll Summary
  if (result.metric === "payroll_summary") {
    const list = (result.employees || []).map(
      (e) =>
        `- **${e.name}** (${e.id}) · ${e.department} · Gross: ${money(e.grossSalary)} · Net: **${money(e.netSalary)}**`
    );
    return (
      `### Payroll & Employee Compensation Summary\n\n` +
      `- **Total Employees on Record:** **${result.employeeCount}**\n` +
      `- **Total Gross Salary:** ${money(result.totalGrossSalary)}\n` +
      `- **Total Net Payable:** **${money(result.totalNetSalary)}**\n` +
      `- **Total Statutory Deductions (PF/ESI/TDS):** ${money(result.totalDeductions)}\n\n` +
      (list.length ? `### Employee Payroll Records\n${list.join("\n")}` : "")
    );
  }

  // 19. Bank Reconciliation
  if (result.metric === "bank_reconciliation") {
    if (!result.hasSessions) {
      return result.message || "No bank reconciliation sessions found.";
    }
    const s = result.latestSession;
    return (
      `### Bank Reconciliation Status\n\n` +
      `- **Total Sessions:** ${result.totalSessions}\n` +
      `- **Latest Session Date:** ${new Date(s.date).toLocaleDateString("en-IN")}\n` +
      `- **Status:** ${s.status}\n` +
      `- **Matched Transactions:** **${s.matchedCount}**\n` +
      `- **Unmatched Ledger Items:** **${s.unmatchedLedgerCount}**\n` +
      `- **Unmatched Bank Items:** **${s.unmatchedBankCount}**\n` +
      `- **Discrepancy Amount:** **${money(s.differenceAmount)}**\n\n` +
      (s.differenceAmount === 0
        ? "✅ Bank balance is fully reconciled with internal books."
        : "⚠️ Discrepancies exist between bank statement and internal ledger. Review unmatched items.")
    );
  }

  // 20. Fraud Detection
  if (result.metric === "fraud_detection") {
    const alerts = (result.flaggedTransactions || []).map(
      (t) =>
        `- 🚨 Transaction #${t.transactionId} · Amount: ${money(t.amount)} · Reason: *${t.reason}* (Risk Score: ${t.riskScore}/100)`
    );
    return (
      `### Fraud Detection & Security Audit\n\n` +
      `- **Total Transactions Scanned:** **${result.totalScanned}**\n` +
      `- **Flagged Suspicious Transactions:** **${result.flaggedCount}**\n` +
      `- **Active Rules Enabled:** **${result.activeRulesCount}**\n\n` +
      (alerts.length
        ? `### Active Fraud Alerts\n${alerts.join("\n")}\n\nRecommendation: Review flagged items before approving payments.`
        : "✅ No suspicious financial transactions detected.")
    );
  }

  // 21. Civil Engineering Projects
  if (result.metric === "civil_projects") {
    if (!result.hasProjects) {
      return result.message || "No civil engineering project schedules found.";
    }
    const pList = result.projects.map(
      (p) =>
        `- **${p.name}**: Total Duration: **${p.totalDurationDays} days** · Budget: ${money(p.estimatedBudget)} · Critical Path: ${p.criticalPath?.join(" → ") || "Defined in CPM"}`
    );
    return (
      `### Civil Engineering Project Schedules & Financials\n\n` +
      `- Total Active Projects: **${result.projectCount}**\n\n` +
      pList.join("\n")
    );
  }

  // 22. Chart of Accounts
  if (result.metric === "chart_of_accounts") {
    const lines = (result.accounts || []).map(
      (a) => `- [${a.code}] **${a.name}** (${a.type}): Balance ${money(a.balance)}`
    );
    return (
      `### Chart of Accounts & General Ledger\n\n` +
      (lines.join("\n") || "No ledger accounts registered yet.")
    );
  }

  // 23. Purchases Summary
  if (result.metric === "purchases" || result.metric === "purchase_summary") {
    return `Your total purchases are **${money(result.amount)}** for ${result.reportingDate || result.period}, across ${result.purchaseInvoiceCount ?? result.purchase_invoice_count ?? 0} purchase invoice${(result.purchaseInvoiceCount ?? result.purchase_invoice_count) === 1 ? "" : "s"}.`;
  }

  // 24. Cash Balance
  if (result.metric === "cash_balance") {
    return `Your recorded cash balance is **${money(result.amount)}** as of ${result.reportingDate || result.period}.\n\n- Net cash flow this period: ${money(result.netCashFlow || 0)}\n- Current cash position: ${money(result.amount)}`;
  }

  // 25. Dashboard / Overall Summary
  return (
    `### SaaISS Financial Overview (${result.reportingDate || result.period})\n\n` +
    `- **Total Payables:** **${money(result.totalPayables)}**\n` +
    `- **Total Receivables:** **${money(result.totalReceivables)}**\n` +
    `- **Net Profit:** **${money(result.netProfit)}** (${result.isProfitable ? "Profitable ✅" : "Operating at Loss ⚠️"})\n` +
    `- **Total Revenue:** ${money(result.totalRevenue)}\n` +
    `- **Total Expenses:** ${money(result.totalExpenses)}\n` +
    `- **GST Payable:** ${money(result.gstPayable)}\n\n` +
    `Ask me for detailed breakdowns on payables, receivables, profit & loss, cash flow, GST, inventory, or payroll!`
  );
};
