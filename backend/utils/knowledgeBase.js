/**
 * SHREE ANDAL AI — Application Knowledge Base
 *
 * Every record contains:
 *   id           – stable identifier
 *   category     – grouping label
 *   question     – canonical question
 *   alternatives – natural-language variations used for retrieval scoring
 *   answer       – verified, application-specific answer text
 *   module       – the application module this relates to
 *   related      – ids of related records
 */

export const KB_RECORDS = [
  // ─── CATEGORY A: INVOICE MANAGEMENT ────────────────────────────────────────

  {
    id: "invoice-creation-overview",
    category: "Invoice Management",
    question: "Explain how invoice creation works.",
    alternatives: [
      "how does invoice creation work",
      "how can i create an invoice",
      "teach me how to make an invoice",
      "explain the invoice process",
      "how do i generate an invoice",
      "how does the invoice module work",
      "invoice creation",
      "make invoice",
      "create bill",
      "new invoice",
      "raise invoice",
      "generate bill",
    ],
    answer: `**Invoice Creation in SaaISS Accounting Software**

Sales invoices are created in **Invoice Automation**. Enter customer details, add products or services, review taxes and totals, then save the invoice. The saved invoice is available in the **History** tab, where you can print, download, or record a payment.

## Invoice creation — step by step

**1. Create a new invoice**
Open **Invoice** from the navigation and select the **Create Invoice** tab.

**2. Enter invoice details**
Enter the customer details, invoice date, due date (required for credit sales), customer GSTIN, billing address, and other required details.

**3. Add items or services**
Select the product or service, item code, HSN/SAC code, quantity, unit price, discount, and applicable GST rate for each line item.

**4. Calculate the invoice total**
The system automatically calculates the subtotal, discounts, applicable CGST/SGST or IGST, and final payable amount. The tax type (CGST+SGST for intra-state, IGST for inter-state) depends on the transaction and applicable GST rules.

**5. Save the invoice**
Validate the required fields and click **Save Invoice**. If an invoice number is not supplied, the backend generates one. The saved invoice appears in the **History** tab.

**6. Update the accounting system**
The current sales-invoice backend creates or updates a linked bookkeeping income entry. The invoice also stores its total, amount paid, balance due, and payment status. Ledger, GST, and inventory effects should be confirmed from the relevant module before relying on them for accounting or compliance decisions.

**7. Update reports and dashboard**
The Dashboard and Profit & Loss report use their own financial calculations and reporting scope. You can print or download the saved invoice from the History tab. Confirm the relevant report after saving rather than assuming every report has updated.

## Example

Suppose you create an invoice for a customer:

| Item | Amount |
| --- | --- |
| Product subtotal | ₹10,000 |
| GST at 18% | ₹1,800 |
| Invoice total | ₹11,800 |
| Amount paid | ₹5,000 |
| Amount due | ₹6,800 |

The software records ₹11,800 as the invoice total, ₹5,000 as the payment received, and ₹6,800 as the outstanding amount. The payment is also recorded in the appropriate accounts.

> **Important:** Creating an invoice is not the same as receiving payment. Record a payment separately with **Record Payment**; only then do the amount paid, balance due, and payment status change.`,
    module: "Invoice",
    related: ["sales-invoice-creation", "purchase-invoice-creation", "invoice-payment"],
  },

  {
    id: "sales-invoice-creation",
    category: "Invoice Management",
    question: "How do I create a sales invoice?",
    alternatives: [
      "how can i generate a sales bill",
      "how do i bill a customer",
      "steps to create a customer invoice",
      "how can i record a sale",
      "create sales invoice",
      "make a bill for my customer",
      "bill customer",
      "customer invoice",
      "sales bill",
      "generate sales invoice",
      "invoice for customer",
      "sell invoice",
    ],
    answer: `**Creating a Sales Invoice**

1. Go to **Invoice** in the navigation, then open the **Create Invoice** tab.
2. Enter the **customer details**.
3. Enter the **invoice date** and **due date**. A due date is required for credit sales.
4. **Add line items:** product/service, quantity, unit price, and GST rate. The system calculates CGST/SGST/IGST automatically.
5. Review the **grand total**, **amount paid**, and **balance due**.
6. Click **Save Invoice** to store the invoice.
7. The saved invoice appears in the **History** tab under **Sales Invoice History**. Open it to print, download PDF, or record a payment.

> The invoice status starts as "Pending" or "Unpaid". It changes to "Paid" automatically when the full amount is received and recorded.`,
    module: "Sales Invoice",
    related: ["invoice-creation-overview", "invoice-payment", "invoice-find"],
  },

  {
    id: "purchase-invoice-creation",
    category: "Invoice Management",
    question: "How do I create a purchase invoice?",
    alternatives: [
      "how do i record a purchase",
      "how do i enter a supplier bill",
      "how can i create a purchase bill",
      "how do i record goods purchased from a supplier",
      "create purchase invoice",
      "supplier bill",
      "vendor invoice",
      "purchase bill",
      "record purchase",
      "enter vendor bill",
    ],
    answer: `**Creating a Purchase Invoice**

1. Go to **Inventory** in the navigation and open the **Purchase Invoice** section.
2. Enter the supplier name, GSTIN, contact details, bill number, and bill date.
3. Add purchased items: name, quantity, unit cost, and applicable GST rate.
4. Review totals — subtotal, GST, grand total, and balance due.
5. Click **Save Invoice**. The record is stored and appears in **Purchase Invoice History** on the same Inventory page.

> Recording a purchase invoice increases your Accounts Payable. When you make a payment, record it against this bill to reduce the outstanding balance. Inventory quantities may increase if the items are tracked in the Inventory module.`,
    module: "Purchase Invoice",
    related: ["invoice-creation-overview", "invoice-payment", "invoice-find"],
  },

  {
    id: "invoice-find",
    category: "Invoice Management",
    question: "How do I find a saved invoice?",
    alternatives: [
      "where can i see my invoices",
      "how do i check invoice history",
      "where is my purchase invoice",
      "how can i reopen an old sales invoice",
      "find invoice",
      "search invoice",
      "invoice history",
      "view invoice",
      "open saved invoice",
      "invoice list",
      "where are invoices",
    ],
    answer: `**Finding a Saved Invoice**

- For **Sales Invoices:** Go to **Invoice → History**, then use **Sales Invoice History**. Use the search bar to filter by invoice number, customer name, or date range.
- For **Purchase Invoices:** Go to **Inventory → Purchase Invoice History** and search by bill number or supplier name.

Once you locate the invoice, click on it to open the full detail view. From there you can:
- View all line items and totals
- Print or download a PDF copy
- Record a payment
- Edit the invoice (subject to permissions)
- Cancel or void the invoice`,
    module: "Invoice",
    related: ["invoice-print", "invoice-payment"],
  },

  {
    id: "invoice-print",
    category: "Invoice Management",
    question: "How do I print or download an invoice?",
    alternatives: [
      "how do i get an invoice pdf",
      "how can i print a bill",
      "how do i download my sales invoice",
      "where is the invoice pdf",
      "print invoice",
      "download invoice",
      "invoice pdf",
      "export invoice",
      "share invoice",
      "invoice download",
    ],
    answer: `**Printing or Downloading an Invoice**

1. Open the invoice you want to print or download (see "How do I find a saved invoice?").
2. In the relevant history row, use **Print** / **View / Print** or **Download PDF**.
3. The application generates the document from the saved invoice details, line items, taxes, and totals.
4. Review the document and save or share it as needed.

> If the PDF button is missing or the document shows incorrect details, check that the invoice is fully saved and that the company profile (logo, address, GSTIN) is configured in Settings.`,
    module: "Invoice",
    related: ["invoice-find", "sales-invoice-creation"],
  },

  {
    id: "invoice-payment",
    category: "Invoice Management",
    question: "How does invoice payment work?",
    alternatives: [
      "how do i record a payment",
      "how do i apply payment to an invoice",
      "why is my invoice still showing a balance",
      "how does amount paid work",
      "record payment",
      "apply payment",
      "payment on invoice",
      "mark invoice paid",
      "payment received",
      "pay invoice",
      "invoice balance due",
    ],
    answer: `**Recording Invoice Payments**

**For a Sales Invoice (payment received from customer):**
1. Open the sales invoice from **Invoice → History → Sales Invoice History**.
2. Click **Record Payment** or enter the amount in the "Amount Paid" field.
3. Enter the payment date, amount received, and payment mode (cash, bank transfer, UPI, etc.).
4. Save the payment. The balance due updates automatically. If fully paid, the status changes to "Paid".

**For a Purchase Invoice (payment made to supplier):**
1. Open the purchase invoice from **Inventory → Purchase Invoice History**.
2. Click **Record Payment** or use the payment section.
3. Enter the amount paid, date, and payment mode.
4. Save. The outstanding balance and payment status update accordingly.

> A partial payment reduces the balance due but keeps the invoice as "Partially Paid". Multiple payments can be recorded against the same invoice.`,
    module: "Invoice",
    related: ["sales-invoice-creation", "purchase-invoice-creation"],
  },

  {
    id: "sales-vs-purchase-invoice",
    category: "Invoice Management",
    question: "What is the difference between a sales invoice and a purchase invoice?",
    alternatives: [
      "sales invoice vs purchase invoice",
      "which invoice should i use for a customer",
      "which invoice should i use for a supplier",
      "difference between sales and purchase invoice",
      "sales vs purchase",
      "when to use sales invoice",
      "when to use purchase invoice",
      "types of invoices",
    ],
    answer: `**Sales Invoice vs Purchase Invoice**

| Feature | Sales Invoice | Purchase Invoice |
|---|---|---|
| **Direction** | You sell to a customer | You buy from a supplier |
| **Who pays** | Customer pays you | You pay the supplier |
| **Accounting effect** | Increases Accounts Receivable (AR) | Increases Accounts Payable (AP) |
| **Revenue impact** | Contributes to sales revenue | Contributes to purchase/expense |
| **Inventory** | May reduce stock (goods sold) | May increase stock (goods received) |
| **GST** | You collect Output GST | You claim Input Tax Credit (ITC) |

Use a **Sales Invoice** when billing a customer for goods or services provided.
Use a **Purchase Invoice** when recording a bill received from a supplier.`,
    module: "Invoice",
    related: ["sales-invoice-creation", "purchase-invoice-creation"],
  },

  // ─── CATEGORY B: DASHBOARD AND FINANCIAL METRICS ───────────────────────────

  {
    id: "total-payables-concept",
    category: "Dashboard & Financial Metrics",
    question: "What is Total Payables?",
    alternatives: [
      "explain accounts payable",
      "how much do i owe suppliers",
      "what does the total payables card mean",
      "what is payables",
      "accounts payable",
      "payables meaning",
      "what does payables mean",
    ],
    answer: `**Total Payables** represents the outstanding amount your business owes to suppliers, vendors, or creditors for goods and services received but not yet paid for.

In SHREE ANDAL AI, Total Payables is calculated from your open Purchase Invoices — specifically the sum of all unpaid or partially paid purchase bill balances that have not been cancelled.

**Where to see it:**
- The **Dashboard** shows the current Total Payables figure.
- The **Invoice → Purchase Invoice History** shows individual bill details.

> For your actual current Total Payables figure, the AI CFO retrieves it live from your purchase invoice records. Ask "What is my Total Payables?" for the real-time amount.`,
    module: "Dashboard, Purchase Invoice",
    related: ["sales-vs-purchase-invoice", "purchase-invoice-creation"],
  },

  {
    id: "total-receivables-concept",
    category: "Dashboard & Financial Metrics",
    question: "What is Total Receivables?",
    alternatives: [
      "how much do customers owe me",
      "explain accounts receivable",
      "what does total receivables mean",
      "what is receivables",
      "accounts receivable",
      "receivables meaning",
    ],
    answer: `**Total Receivables** represents the outstanding amount customers owe your business for goods or services delivered but not yet paid for.

In SHREE ANDAL AI, Total Receivables is calculated from your open Sales Invoices — the sum of all unpaid or partially paid sales invoice balances.

**Where to see it:**
- The **Dashboard** shows the current Total Receivables card.
- **Invoice → Sales Invoice History** shows individual invoice balances.

> For your actual figure, ask "What is my Total Receivables?" and the AI CFO will retrieve the live amount from your sales invoice records.`,
    module: "Dashboard, Sales Invoice",
    related: ["sales-invoice-creation", "invoice-payment"],
  },

  {
    id: "revenue-concept",
    category: "Dashboard & Financial Metrics",
    question: "What is Revenue?",
    alternatives: [
      "explain revenue",
      "how much money did my business earn from sales",
      "what is the revenue card on the dashboard",
      "what is income",
      "business revenue",
      "total sales amount",
      "sales revenue",
    ],
    answer: `**Revenue** is the total income earned from your business activities over a specified period.

In SHREE ANDAL AI, revenue is recorded through:
1. **Bookkeeping entries** of type "Income"
2. **Sales invoices** — the invoiced amounts represent billed revenue

The Dashboard Revenue card typically reflects bookkeeping income entries for the selected reporting period.

> For your actual revenue figure, ask "What is my total revenue this month?" and the AI CFO retrieves it from your bookkeeping and invoice records.`,
    module: "Dashboard, Bookkeeping",
    related: ["expenses-concept", "net-profit-concept"],
  },

  {
    id: "expenses-concept",
    category: "Dashboard & Financial Metrics",
    question: "What are Expenses?",
    alternatives: [
      "explain business expenses",
      "how much did i spend this month",
      "what does the expenses metric mean",
      "what are costs",
      "business expenses",
      "total expenses",
      "spending",
    ],
    answer: `**Expenses** are costs incurred by the business during a reporting period.

In SHREE ANDAL AI, expenses are recorded through:
1. **Bookkeeping entries** of type "Expense" — categorized by type (rent, utilities, salaries, etc.)
2. **Purchase invoices** — cost of goods and services purchased

The Dashboard Expenses card reflects bookkeeping expense entries for the selected period.

> For the actual figure, ask "What are my total expenses this month?" and the AI CFO retrieves the amount broken down by category.`,
    module: "Dashboard, Bookkeeping",
    related: ["revenue-concept", "net-profit-concept", "bookkeeping-overview"],
  },

  {
    id: "net-profit-concept",
    category: "Dashboard & Financial Metrics",
    question: "What is Net Profit?",
    alternatives: [
      "explain net profit",
      "how much profit did my business make",
      "why is my net profit negative",
      "what is profit",
      "net profit meaning",
      "profit calculation",
      "p and l",
      "profit and loss meaning",
    ],
    answer: `**Net Profit** = Total Revenue − Total Expenses

It is the amount remaining after all recorded costs are deducted from income for a given period.

- A **positive Net Profit** means your business earned more than it spent.
- A **negative Net Profit** (loss) means expenses exceeded income. This can be due to high costs, low sales, or timing differences in recording transactions.

In SHREE ANDAL AI, net profit is computed from bookkeeping income and expense entries for the selected period. The Dashboard and Profit & Loss module show this figure.

> For your actual net profit, ask "What is my net profit this month?" and the AI CFO retrieves it from your verified bookkeeping records.`,
    module: "Dashboard, Profit & Loss",
    related: ["revenue-concept", "expenses-concept", "pnl-report"],
  },

  {
    id: "dashboard-ai-discrepancy",
    category: "Dashboard & Financial Metrics",
    question: "Why do my dashboard and AI CFO show different amounts?",
    alternatives: [
      "why is total payables different in the chatbot",
      "why does ai show a different financial value",
      "the dashboard number and ai answer do not match",
      "dashboard vs ai cfo mismatch",
      "different numbers dashboard chatbot",
      "ai shows wrong amount",
      "chatbot wrong figure",
    ],
    answer: `**Dashboard vs AI CFO Discrepancy**

If the Dashboard and AI CFO show different amounts for the same metric, the most common causes are:

1. **Different reporting periods** — The dashboard may use the current month while the AI defaults to all-time or a different range. Always specify the period when asking (e.g., "this month", "this quarter").

2. **Different calculation methods** — The dashboard may use one aggregator (e.g., financeAggregator) while the AI uses another data source. Both should ideally use the same backend service.

3. **Cached data** — The dashboard may be showing a cached snapshot. Refresh the page to get the latest data.

4. **Filter differences** — The dashboard may exclude cancelled invoices, while the AI may include them (or vice versa).

5. **Data entry timing** — A recent transaction may have been saved after the dashboard loaded.

**To resolve:** Refresh the dashboard, specify the same period to the AI CFO, and compare against Invoice History for the same date range. If discrepancies persist, check the backend calculation logic for each source.`,
    module: "Dashboard",
    related: ["total-payables-concept", "total-receivables-concept"],
  },

  // ─── CATEGORY C: INVENTORY AND BOOKKEEPING ──────────────────────────────────

  {
    id: "inventory-overview",
    category: "Inventory & Bookkeeping",
    question: "How does inventory work?",
    alternatives: [
      "how can i check my stock",
      "how do i manage products",
      "how does purchase affect stock",
      "inventory management",
      "stock management",
      "product stock",
      "check inventory",
      "inventory module",
      "stock levels",
    ],
    answer: `**Inventory Management in SHREE ANDAL AI**

The Inventory module helps you track the products or items your business buys, sells, and holds in stock.

**Key features:**
- **View all products/SKUs** with current stock quantities, unit cost, and selling price
- **Low stock alerts** — items below a configured threshold are flagged
- **Inventory valuation** — total value of current stock

**How stock changes:**
- When you create a **Sales Invoice** with inventory items, stock quantity decreases
- When you create a **Purchase Invoice** with inventory items, stock quantity may increase (depending on configuration)
- Manual adjustments can be made directly in the Inventory section

**To check inventory:**
1. Open **Inventory** from the navigation menu
2. View the product list with current quantities
3. Use search/filter to find a specific item

> For live inventory values and low-stock counts, ask the AI CFO about your inventory.`,
    module: "Inventory",
    related: ["sales-invoice-creation", "purchase-invoice-creation"],
  },

  {
    id: "bookkeeping-overview",
    category: "Inventory & Bookkeeping",
    question: "How does bookkeeping work?",
    alternatives: [
      "explain bookkeeping",
      "how are expenses recorded",
      "how does saaiss organize financial transactions",
      "bookkeeping entries",
      "record expense",
      "record income",
      "journal entry",
      "ledger entries",
      "financial transactions",
      "bookkeeping module",
    ],
    answer: `**Bookkeeping in SHREE ANDAL AI**

Bookkeeping organizes and records your business's financial transactions so they can be used in reports.

**How to record a transaction:**
1. Open **Bookkeeping** from the navigation menu
2. Click **Add Entry** or **New Transaction**
3. Select the **type** — Income or Expense
4. Choose the **category** (e.g., Rent, Utilities, Sales, Service Income)
5. Enter the **date**, **amount**, and a **description**
6. Save the entry

**What bookkeeping entries affect:**
- **Profit & Loss report** — income and expense entries directly determine net profit
- **Dashboard metrics** — Revenue and Expenses cards pull from bookkeeping entries
- **Cash flow reports** — entries with dates contribute to period cash flow

> Invoices and bookkeeping entries are separate. Invoices track what you billed/purchased; bookkeeping records actual cash movements and categorized transactions. Both are visible in financial reports.`,
    module: "Bookkeeping",
    related: ["expenses-concept", "revenue-concept", "pnl-report"],
  },

  // ─── CATEGORY D: REPORTS AND OTHER MODULES ──────────────────────────────────

  {
    id: "pnl-report",
    category: "Reports",
    question: "How do I view a profit and loss report?",
    alternatives: [
      "how can i check business profit",
      "where is the p and l report",
      "how do i understand my income and expenses",
      "profit and loss report",
      "p&l report",
      "view pnl",
      "income statement",
      "profit report",
      "financial statement",
    ],
    answer: `**Viewing the Profit & Loss Report**

1. Open **Profit & Loss** from the navigation for the detailed report.
2. The Dashboard also shows a Profit & Loss summary card for the selected period.
3. Select the **reporting period** (this month, last month, this quarter, this year, or a custom date range).
4. Review:
   - **Total Income** — sum of all bookkeeping income entries
   - **Total Expenses** — sum of all bookkeeping expense entries by category
   - **Net Profit/Loss** — the difference

> The AI CFO can also provide a P&L summary. Ask "Show me my Profit and Loss for this month" and it will retrieve the figures from your bookkeeping records.`,
    module: "Dashboard, Reports",
    related: ["net-profit-concept", "bookkeeping-overview"],
  },

  {
    id: "cash-flow-overview",
    category: "Reports",
    question: "How does cash flow work?",
    alternatives: [
      "explain cash flow prediction",
      "how can i understand money coming in and going out",
      "what is a cash flow statement",
      "cash flow",
      "cash flow forecast",
      "cash prediction",
      "money in money out",
      "cash position",
      "cash flow module",
    ],
    answer: `**Cash Flow in SHREE ANDAL AI**

**Cash Flow Statement** shows actual money that moved in and out of your business in a period:
- **Cash Inflow** — payments received, income recorded
- **Cash Outflow** — payments made, expenses recorded
- **Net Cash Flow** = Inflow − Outflow

**Cash Flow Prediction (AI Forecast)** estimates future cash movements based on:
- Historical income and expense patterns
- Outstanding receivables (expected inflows)
- Upcoming payables (expected outflows)
- Recurring transaction patterns

> ⚠️ Cash flow predictions are **estimates only**. Actual results depend on when customers pay and when you make payments. Always distinguish forecast figures from actual recorded transactions.

**Where to find it:**
- The **Dashboard** shows a Cash Flow Prediction chart
- Ask the AI CFO for current cash inflows and outflows`,
    module: "Dashboard, Cash Flow",
    related: ["total-receivables-concept", "total-payables-concept"],
  },

  {
    id: "gst-tax-overview",
    category: "Tax & GST",
    question: "How do I use GST or tax features?",
    alternatives: [
      "explain gst in an invoice",
      "how do i check tax details",
      "how does tax calculation work in saaiss",
      "gst features",
      "tax in invoice",
      "gst invoice",
      "cgst sgst igst",
      "input tax credit",
      "itc",
      "gst module",
      "gst report",
      "gst filing",
    ],
    answer: `**GST & Tax in SHREE ANDAL AI**

**In Invoices:**
- Select the applicable **GST rate** (0%, 5%, 12%, 18%, 28%) per line item
- The system automatically splits it into:
  - **CGST** (Central GST) — for intra-state transactions (split 50/50 with SGST)
  - **SGST** (State GST) — for intra-state transactions
  - **IGST** (Integrated GST) — for inter-state transactions
- Enter the buyer's and seller's **GSTIN** for compliant invoices

**Key concepts:**
- **Output GST** — GST collected from customers on sales invoices (you owe this to the government)
- **Input GST / ITC** — GST paid on purchase invoices (you can claim this as a credit)
- **Net GST Payable** = Output GST − Input ITC

**GST Reports:**
- Open the **Tax & GST** module or Dashboard to see Output GST, Input ITC, and Net GST Payable for any period

> GST filing, GSTR-1, GSTR-3B, and e-way bills require verification with your CA. The AI CFO can provide the figures but cannot submit returns.`,
    module: "Invoice, GST",
    related: ["sales-invoice-creation", "purchase-invoice-creation"],
  },

  {
    id: "troubleshooting",
    category: "Troubleshooting",
    question: "What should I do if a feature does not work?",
    alternatives: [
      "why is my invoice not saving",
      "why is the pdf incorrect",
      "why is payment not updating",
      "how do i troubleshoot an application error",
      "feature not working",
      "invoice save error",
      "pdf not generating",
      "payment not recording",
      "error in application",
      "bug in software",
      "something is broken",
      "not working",
    ],
    answer: `**Troubleshooting a Feature Issue**

**Step 1 — Identify the problem:**
- Which module is affected? (Invoice, Bookkeeping, Inventory, Payroll, etc.)
- What exactly did you try to do? (Save, print, record payment, etc.)
- What error message appeared, if any?

**Step 2 — Check common causes:**
- **Invoice not saving:** Verify all required fields are filled (customer name, date, at least one line item). Check that the amount is valid.
- **PDF not generating:** Confirm the invoice is fully saved first. Ensure your company profile (name, address, GSTIN) is set in Settings.
- **Payment not updating:** Check that you saved the payment entry. Refresh the invoice to see the updated balance.
- **Data not showing:** Try refreshing the page. Check the selected date range/filter.

**Step 3 — Check the browser console:**
- Press F12 → Console tab to see any JavaScript errors.
- Note the exact error message.

**Step 4 — Contact support:**
- If the issue persists, note the exact steps to reproduce it, the error message, and the affected invoice/record number, and reach out to the SHREE ANDAL AI support team.

> The AI CFO can only diagnose issues based on the information you provide. It cannot access your browser session or make changes on your behalf.`,
    module: "All Modules",
    related: ["invoice-creation-overview", "invoice-print"],
  },
];

/**
 * Normalise legacy and newly-added records into the maintainable knowledge
 * record shape. Existing records remain readable while new entries can carry
 * source and verification metadata without a database migration.
 */
const enrichRecord = (record) => ({
  domain: record.domain || record.category.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
  canonicalQuestion: record.question,
  alternativeQuestions: record.alternatives,
  answerType: record.answerType || "application_workflow",
  prerequisites: record.prerequisites || [],
  requiredFields: record.requiredFields || [],
  businessRules: record.businessRules || [],
  relatedModules: record.relatedModules || [record.module],
  sourceReferences: record.sourceReferences || [],
  verificationStatus: record.verificationStatus || "verified_source",
  lastVerifiedAt: record.lastVerifiedAt || "2026-10-18",
  ...record,
});

export const knowledgeBaseSummary = () => ({
  recordCount: KB_RECORDS.length,
  categories: [...new Set(KB_RECORDS.map((record) => record.category))].sort(),
  verifiedRecordCount: KB_RECORDS.filter((record) => enrichRecord(record).verificationStatus === "verified_source").length,
});

// ─── Retrieval Engine ─────────────────────────────────────────────────────────

/**
 * Normalize text: lowercase, remove punctuation, collapse whitespace.
 */
const normalize = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Tokenize text into words, removing common stop words.
 */
const STOP_WORDS = new Set([
  "a","an","the","is","it","in","on","of","and","or","to","i","me","my","we",
  "do","how","what","why","where","when","who","which","for","with","this",
  "that","can","does","are","be","at","if","by","as","so","no","not","did",
  "was","were","have","has","had","will","would","could","should","about",
  "from","into","than","but","its","our","your","their","s","am",
]);

const tokenize = (text) =>
  normalize(text)
    .split(" ")
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

/**
 * Score a knowledge base record against a tokenized user query.
 * Returns a score from 0 to 1.
 */
const scoreRecord = (record, queryTokens) => {
  if (!queryTokens.length) return 0;

  // Build a token set from all searchable text in the record
  const recordTokens = new Set([
    ...tokenize(record.question),
    ...record.alternatives.flatMap(tokenize),
    ...tokenize(record.category),
    ...tokenize(record.module),
  ]);

  let matches = 0;
  for (const token of queryTokens) {
    // Exact match
    if (recordTokens.has(token)) {
      matches += 1;
      continue;
    }
    // Prefix match (handles plurals and word stems)
    for (const rt of recordTokens) {
      if (rt.startsWith(token) || token.startsWith(rt)) {
        matches += 0.6;
        break;
      }
    }
  }

  return matches / queryTokens.length;
};

/** Minimum score threshold to consider a match relevant */
const CONFIDENCE_THRESHOLD = 0.25;

/**
 * Search the knowledge base for records relevant to the user's question.
 *
 * @param {string} userQuestion — the raw user question
 * @param {number} maxResults   — maximum number of results to return (default 2)
 * @returns {{ record: object, score: number }[]} sorted by score descending
 */
export const searchKnowledgeBase = (userQuestion, maxResults = 2) => {
  const tokens = tokenize(userQuestion);
  if (!tokens.length) return [];

  return KB_RECORDS
    .map((record) => ({ record: enrichRecord(record), score: scoreRecord(record, tokens) }))
    .filter(({ score }) => score >= CONFIDENCE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
};

/**
 * Get a single best-match knowledge base record, or null if none is confident.
 *
 * @param {string} userQuestion
 * @returns {{ record: object, score: number } | null}
 */
export const findBestMatch = (userQuestion) => {
  const results = searchKnowledgeBase(userQuestion, 1);
  return results.length ? results[0] : null;
};

/**
 * Build a context string from matching KB records to inject into the LLM prompt.
 */
export const buildKnowledgeContext = (userQuestion) => {
  const matches = searchKnowledgeBase(userQuestion, 3);
  if (!matches.length) return null;

  return matches
    .map(({ record, score }) =>
      `[Knowledge Base — ${record.category} | confidence: ${(score * 100).toFixed(0)}%]\n` +
      `Q: ${record.question}\nA: ${record.answer}`
    )
    .join("\n\n---\n\n");
};
