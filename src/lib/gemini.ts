import { API_BASE_URL, apiRequest } from "./api";

export interface ChatMessage {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
}

export const SUGGESTED_PROMPTS = [
  "What is my Total Payables?",
  "What is my Total Receivables?",
  "What is my net profit this month?",
  "Show me outstanding invoices and overdue AR",
  "What is my GST payable?",
  "Summarize my expenses by category",
  "How is my cash flow looking?",
  "What inventory is running low?",
  "Show payroll summary",
];

const toNumber = (value: unknown) => Number(value) || 0;

// Legacy renderer retained only for local development reference. It must never
// be used as a production fallback because it cannot provide authoritative
// tenant-scoped financial data.
const runLocalFallback = async (
  chatMessages: ChatMessage[],
  period = "this-month"
): Promise<string> => {
  let dbContext = "No database context loaded.";
  let bookkeepingEntries: any[] = [];
  let invoicesList: any[] = [];
  let purchasesList: any[] = [];
  let payrollList: any[] = [];
  let balanceList: any[] = [];

  try {
    const readJson = async (endpoint: string) => {
      const response = await apiRequest(endpoint).catch(() => null);
      return response?.ok ? response.json() : null;
    };

    const [invoices, purchases, payrolls, balanceSheets, bookkeeping] =
      await Promise.all([
        readJson(`${API_BASE_URL}/invoice/all?limit=200`),
        readJson(`${API_BASE_URL}/purchase-invoice/all`),
        readJson(`${API_BASE_URL}/payroll/all`),
        readJson(`${API_BASE_URL}/balance`),
        readJson(`${API_BASE_URL}/bookkeeping/all`),
      ]);

    bookkeepingEntries = Array.isArray(bookkeeping?.entries)
      ? bookkeeping.entries
      : [];
    invoicesList = Array.isArray(invoices?.invoices) ? invoices.invoices : [];
    purchasesList = Array.isArray(purchases?.invoices)
      ? purchases.invoices
      : [];
    payrollList = Array.isArray(payrolls) ? payrolls : [];
    balanceList = Array.isArray(balanceSheets) ? balanceSheets : [];
  } catch (err) {
    console.error("Error loading local fallback context:", err);
  }

  await new Promise((resolve) => setTimeout(resolve, 400));

  const fmt = (val: number) =>
    `₹${val.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const invoiceStats = {
    count: invoicesList.length,
    total: invoicesList.reduce((s: number, i: any) => s + toNumber(i.grandTotal), 0),
    paid: invoicesList.filter((i: any) => i.status === "paid").reduce((s: number, i: any) => s + toNumber(i.grandTotal), 0),
    unpaid: invoicesList.filter((i: any) => i.status !== "paid").reduce((s: number, i: any) => s + toNumber(i.grandTotal), 0),
    overdue: invoicesList.filter((i: any) => i.status === "overdue"),
  };
  const purchaseStats = {
    count: purchasesList.length,
    total: purchasesList.reduce((s: number, p: any) => s + toNumber(p.total), 0),
    unpaid: purchasesList.reduce((s: number, p: any) => s + toNumber(p.balance || 0), 0),
  };
  const payrollStats = {
    count: payrollList.length,
    gross: payrollList.reduce((s: number, p: any) => s + toNumber(p.grossSalary), 0),
    net: payrollList.reduce((s: number, p: any) => s + toNumber(p.netSalary), 0),
  };
  const bkIncome = bookkeepingEntries.filter((e: any) => e.type === "income").reduce((s: number, e: any) => s + toNumber(e.amount), 0);
  const bkExpense = bookkeepingEntries.filter((e: any) => e.type === "expense").reduce((s: number, e: any) => s + toNumber(e.amount), 0);
  const bkNet = bkIncome - bkExpense;
  const profitMargin = bkIncome > 0 ? ((bkNet / bkIncome) * 100).toFixed(1) : "0.0";

  const bkCategories: Record<string, number> = {};
  bookkeepingEntries.filter((e: any) => e.type === "expense").forEach((e: any) => {
    const cat = e.category || "General Expense";
    bkCategories[cat] = (bkCategories[cat] || 0) + toNumber(e.amount);
  });
  const bkCategoryBreakdown = Object.entries(bkCategories)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, val]) => `- ${cat}: ${fmt(val)}`)
    .join("\n");

  const userMessage =
    chatMessages[chatMessages.length - 1]?.content?.toLowerCase() || "";

  if (userMessage.match(/revenue|income|sales|earn/)) {
    return `### Summary\nYour total income is **${fmt(bkIncome)}** from the bookkeeping ledger, with **${invoiceStats.count}** sales invoices totaling **${fmt(invoiceStats.total)}**.\n\n### Key Numbers\n- Bookkeeping Income: ${fmt(bkIncome)}\n- Total Invoiced: ${fmt(invoiceStats.total)}\n- Collected: ${fmt(invoiceStats.paid)}\n- Outstanding AR: ${fmt(invoiceStats.unpaid)}\n\n### Recommendation\nPrioritize collection on ${invoiceStats.overdue.length} overdue invoices to strengthen cash flow.`;
  }

  if (userMessage.match(/expense|spend|cost|purchase/)) {
    return `### Summary\nTotal expenses: **${fmt(bkExpense)}**.\n\n### Key Numbers\n- Expenses: ${fmt(bkExpense)}\n- Revenue: ${fmt(bkIncome)}\n- Net Profit: ${fmt(bkNet)}\n- Purchase Bills: ${fmt(purchaseStats.total)}\n- Payroll (Gross): ${fmt(payrollStats.gross)}\n\n### Expense Breakdown\n${bkCategoryBreakdown || "No categorized expenses yet."}\n\n### Recommendation\nAlign vendor payables with cash inflow cycles.`;
  }

  if (userMessage.match(/profit|margin|p&l|loss/)) {
    return `### Summary\nNet Profit: **${fmt(bkNet)}** | Net Margin: **${profitMargin}%**\n\n### Key Numbers\n- Revenue: ${fmt(bkIncome)}\n- Expenses: ${fmt(bkExpense)}\n- Net Profit: ${fmt(bkNet)}\n- Margin: ${profitMargin}%\n\n### Analysis\nBusiness is **${bkNet >= 0 ? "PROFITABLE ✅" : "OPERATING AT A LOSS ⚠️"}**.\n\n### Recommendation\n${bkNet < 0 ? "Focus on reducing overhead and accelerating high-margin revenue." : "Maintain discipline and reinvest surplus into growth."}`;
  }

  if (userMessage.match(/gst|tax|igst|cgst|sgst|itc/)) {
    return `### GST Summary\nContact your CA for full GST analytics. Per local context — output GST is estimated from invoices.\n\n### Recommendation\nOpen the Tax & GST module for a full CGST/SGST/IGST breakdown with ITC calculations.`;
  }

  if (userMessage.match(/invoice|receivable|ar|overdue|outstanding/)) {
    const recentList = invoicesList
      .slice(0, 5)
      .map((i: any) => `- #${i.invoiceNumber} | ${i.customerName} | ${fmt(i.grandTotal)} | ${i.status}`)
      .join("\n");
    return `### Invoice & AR Summary\n- Total Invoices: **${invoiceStats.count}** (${fmt(invoiceStats.total)})\n- Paid: ${fmt(invoiceStats.paid)}\n- Outstanding AR: **${fmt(invoiceStats.unpaid)}**\n- Overdue: **${invoiceStats.overdue.length}** invoices\n\n${recentList ? `### Recent Invoices\n${recentList}` : ""}`;
  }

  if (userMessage.match(/payroll|salary|employee|hr/)) {
    const empList = payrollList
      .slice(0, 5)
      .map((p: any) => `- ${p.employeeName}: Gross ${fmt(p.grossSalary)}, Net ${fmt(p.netSalary)}`)
      .join("\n");
    return `### Payroll Summary\n- Employees: **${payrollStats.count}**\n- Total Gross: **${fmt(payrollStats.gross)}**\n- Total Net Payable: **${fmt(payrollStats.net)}**\n\n${empList ? `### Employees\n${empList}` : ""}`;
  }

  if (userMessage.match(/cash flow|cashflow|cash/)) {
    return `### Cash Flow Summary\n- Cash Inflow: **${fmt(bkIncome)}**\n- Cash Outflow: **${fmt(bkExpense)}**\n- Net Cash Flow: **${fmt(bkNet)}**\n- AR Outstanding: ${fmt(invoiceStats.unpaid)}\n- AP Outstanding: ${fmt(purchaseStats.unpaid)}\n\n### Recommendation\n${bkNet >= 0 ? "✅ Positive cash flow. Consider reinvesting surplus." : "⚠️ Negative cash flow. Accelerate collections and defer payments."}`;
  }

  if (userMessage.match(/hello|hi|hey|help|what can/)) {
    return `Hello! I'm **SHREE ANDAL AI**, your SaaISS application and financial assistant.\n\nI can help with:\n- 🧾 Sales & Purchase Invoices, Printing, and Payment Application\n- 📦 Inventory, Stock Inflow/Outflow, and Low Stock Alerts\n- 📚 Bookkeeping, General Ledger, and Chart of Accounts\n- 📊 Profit & Loss, Balance Sheet, and Cash Flow Forecasting\n- 🏷️ GST & Tax Liabilities\n- 💰 Authoritative Live Financial Data (Total Payables, Total Receivables, Net Profit)\n\nTry asking: *"Explain how invoice creation works"* or *"What is my Total Payables this month?"*`;
  }

  return `### SHREE ANDAL AI Financial Overview\n\n### Key Numbers\n- Revenue: ${fmt(bkIncome)}\n- Expenses: ${fmt(bkExpense)}\n- **Net Profit: ${fmt(bkNet)}** (${profitMargin}% margin)\n- Outstanding AR: ${fmt(invoiceStats.unpaid)}\n- Overdue Invoices: ${invoiceStats.overdue.length}\n\n### Status\n${invoiceStats.overdue.length > 0 ? `⚠️ ${invoiceStats.overdue.length} overdue invoices need follow-up.` : "✅ No overdue invoices."}\n${bkNet >= 0 ? "✅ Business is profitable." : "⚠️ Business is operating at a loss."}\n\n*Ask me about invoice workflows, payment application, inventory, bookkeeping, or live company metrics.*`;
};

// ─── Main export ─────────────────────────────────────────────────────────────
export const callGemini = async (
  chatMessages: ChatMessage[],
  period = "this-month"
): Promise<string> => {
  // The server owns model credentials, verified workflow knowledge, and
  // tenant-scoped financial tools. Never substitute a browser-side estimate.
  try {
    const res = await apiRequest(`${API_BASE_URL}/ai/cfo-chat`, {
      method: "POST",
      body: JSON.stringify({ history: chatMessages, period }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && typeof data?.reply === "string" && data.reply.trim()) return data.reply;
    throw new Error(data?.message || "The AI service returned an invalid response. Please try again.");
  } catch (networkErr) {
    console.error("[saaiss-ai] request failed:", networkErr);
    throw networkErr instanceof Error
      ? networkErr
      : new Error("The AI service is unavailable. Please try again.");
  }
};
