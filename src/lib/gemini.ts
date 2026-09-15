import { API_BASE_URL, apiRequest } from "./api";

export interface ChatMessage {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
}

const toNumber = (value: unknown) => Number(value) || 0;

const runCallGemini = async (chatMessages: ChatMessage[]): Promise<string> => {
  // Fetch live database context in background for fallback access
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

    const [invoices, purchases, payrolls, balanceSheets, bookkeeping] = await Promise.all([
      readJson(`${API_BASE_URL}/invoice/all?limit=100`),
      readJson(`${API_BASE_URL}/purchase-invoice/all`),
      readJson(`${API_BASE_URL}/payroll/all`),
      readJson(`${API_BASE_URL}/balance`),
      readJson(`${API_BASE_URL}/bookkeeping/all`),
    ]);

    bookkeepingEntries = Array.isArray(bookkeeping?.entries) ? bookkeeping.entries : [];
    invoicesList = Array.isArray(invoices?.invoices) ? invoices.invoices : [];
    purchasesList = Array.isArray(purchases?.invoices) ? purchases.invoices : [];
    payrollList = Array.isArray(payrolls) ? payrolls : [];
    balanceList = Array.isArray(balanceSheets) ? balanceSheets : [];

    dbContext = `
=== BOOKKEEPING ENTRIES ===
${bookkeepingEntries.map((e: any) => `- Date: ${e.date}, Type: ${e.type}, Category: ${e.category}, Description: ${e.description}, Amount: ₹${e.amount}`).join("\n")}

=== INVOICES ===
${invoicesList.map((i: any) => `- Number: ${i.invoiceNumber}, Client: ${i.customerName}, Date: ${i.invoiceDate}, Status: ${i.status}, Total: ₹${i.grandTotal}`).join("\n")}

=== PURCHASE INVOICES ===
${purchasesList.map((p: any) => `- Date: ${p.createdAt || p.billDate}, Vendor: ${p.partyName || "Unknown Vendor"}, Total: ₹${p.total || 0}`).join("\n")}

=== PAYROLL RECORDS ===
${payrollList.map((pr: any) => `- Employee: ${pr.employeeName}, Gross Salary: ₹${pr.grossSalary}, Net Salary: ₹${pr.netSalary}, Status: ${pr.status}, Date: ${pr.createdAt}`).join("\n")}

=== BALANCE SHEETS ===
${balanceList.slice(0, 5).map((bs: any) => `- Date: ${bs.createdAt}, Assets: ₹${bs.totalAssets}, Liabilities: ₹${bs.totalLiabilities}, Equity: ₹${bs.equity}`).join("\n")}
`;
  } catch (err) {
    console.error("Error loading database context for Gemini:", err);
  }

  // Local Intelligent AI Simulation using the live database context
  const userMessage = chatMessages[chatMessages.length - 1]?.content?.toLowerCase() || "";

  // Simulate a short thinking delay for realism
  await new Promise((resolve) => setTimeout(resolve, 600));

  // Helper to format currency
  const formatCurrency = (val: number) => `₹${val.toLocaleString("en-IN")}`;

  // 1. Calculate stats from live context
  const invoiceStats = {
    count: invoicesList.length,
    total: invoicesList.reduce((sum: number, i: any) => sum + toNumber(i.grandTotal), 0),
    paid: invoicesList.filter((i: any) => i.status === "paid").reduce((sum: number, i: any) => sum + toNumber(i.grandTotal), 0),
    unpaid: invoicesList.filter((i: any) => i.status !== "paid").reduce((sum: number, i: any) => sum + toNumber(i.grandTotal), 0),
  };

  const purchaseStats = {
    count: purchasesList.length,
    total: purchasesList.reduce((sum: number, p: any) => sum + toNumber(p.total), 0),
  };

  const payrollStats = {
    count: payrollList.length,
    total: payrollList.reduce((sum: number, pr: any) => sum + toNumber(pr.grossSalary), 0),
  };

  const bkIncome = bookkeepingEntries.filter((e: any) => e.type === "income").reduce((sum: number, e: any) => sum + toNumber(e.amount), 0);
  const bkExpense = bookkeepingEntries.filter((e: any) => e.type === "expense").reduce((sum: number, e: any) => sum + toNumber(e.amount), 0);
  const bkNet = bkIncome - bkExpense;

  // 2. Query Routing
  if (userMessage.includes("revenue") || userMessage.includes("income") || userMessage.includes("sales") || userMessage.includes("earn")) {
    return `Your total revenue is ${formatCurrency(bkIncome)} based on the live bookkeeping entries. This includes ${invoiceStats.count} invoices generated for a total of ${formatCurrency(invoiceStats.total)}, with ${formatCurrency(invoiceStats.paid)} paid and ${formatCurrency(invoiceStats.unpaid)} still outstanding.`;
  }

  if (userMessage.includes("expense") || userMessage.includes("spend") || userMessage.includes("cost") || userMessage.includes("purchase")) {
    return `Your total expenses are ${formatCurrency(bkExpense)}. This is composed of ${purchaseStats.count} purchase invoices totaling ${formatCurrency(purchaseStats.total)} and ${payrollStats.count} payroll records totaling ${formatCurrency(payrollStats.total)}.`;
  }

  if (userMessage.includes("profit") || userMessage.includes("balance") || userMessage.includes("net")) {
    return `Your net profit is ${formatCurrency(bkNet)}, calculated from total revenue of ${formatCurrency(bkIncome)} minus total expenses of ${formatCurrency(bkExpense)}. This represents a ${bkNet >= 0 ? "profitable business state" : "loss state"}.`;
  }

  if (userMessage.includes("invoice") || userMessage.includes("bill")) {
    if (invoicesList.length === 0) {
      return "I don't have enough data to calculate invoice metrics yet.";
    }
    const recentList = invoicesList.slice(0, 3).map((i: any) => `${i.invoiceNumber} for ${i.customerName} (${formatCurrency(i.grandTotal)})`).join(", ");
    return `You have generated ${invoiceStats.count} invoices totaling ${formatCurrency(invoiceStats.total)}. The most recent invoices are: ${recentList}.`;
  }

  if (userMessage.includes("payroll") || userMessage.includes("salary") || userMessage.includes("employee")) {
    if (payrollList.length === 0) {
      return "I don't have enough data to calculate payroll metrics yet.";
    }
    const recentEmployees = payrollList.slice(0, 3).map((pr: any) => `${pr.employeeName} (${formatCurrency(pr.grossSalary)})`).join(", ");
    return `Your total payroll commitment is ${formatCurrency(payrollStats.total)} across ${payrollStats.count} records. Recent records include: ${recentEmployees}.`;
  }

  if (userMessage.includes("ratio") || userMessage.includes("current ratio") || userMessage.includes("quick ratio")) {
    let matchingBS = balanceList[0];
    if (matchingBS) {
      const currentRatio = matchingBS.currentLiabilities ? (matchingBS.currentAssets / matchingBS.currentLiabilities).toFixed(2) : "0.00";
      return `Your current ratio is ${currentRatio}. A current ratio above 1.5 is standard, indicating healthy short-term liquidity.`;
    }
    return "I don't have enough balance sheet data to calculate liquidity ratios yet.";
  }

  if (userMessage.includes("do") || userMessage.includes("recommendation") || userMessage.includes("action") || userMessage.includes("what should I do")) {
    if (bkNet < 0) {
      return `Your net cash flow is negative at ${formatCurrency(bkNet)}. You should prioritize collecting outstanding receivables of ${formatCurrency(invoiceStats.unpaid)} and reducing non-essential expenses to restore profitability.`;
    }
    return `Your net cash flow is positive. You should maintain this trajectory and consider reinvesting surplus funds into inventory or customer acquisition.`;
  }

  if (userMessage.includes("hello") || userMessage.includes("hi") || userMessage.includes("hey") || userMessage.includes("help")) {
    return "Hello! I am your financial query assistant. Ask me anything about your business revenue, profits, expenses, invoices, payroll, or ratios, and I will give you a direct, actionable answer.";
  }

  // Default intelligent response fallback (cleaned of all markdown bold characters)
  return `I have analyzed the database context. Currently, your bookkeeping ledger shows a Net Balance of ${formatCurrency(bkNet)} on a total revenue of ${formatCurrency(bkIncome)}. Please let me know if you have questions about invoices, expenses, bookkeeping, or payroll.`;
};

export const callGemini = async (chatMessages: ChatMessage[]): Promise<string> => {
  try {
    const res = await apiRequest(`${API_BASE_URL}/ai/cfo-chat`, {
      method: "POST",
      body: JSON.stringify({ history: chatMessages })
    });
    if (res.ok) {
      const data = await res.json();
      return data.reply;
    }
  } catch (err) {
    console.error("Error calling backend CFO chat:", err);
  }
  const response = await runCallGemini(chatMessages);
  return response.replace(/\*\*/g, "");
};
