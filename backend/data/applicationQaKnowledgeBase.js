/**
 * SaaISS SHREE ANDAL AI — Application Question-and-Answer Knowledge Base
 * 
 * Verified, code-grounded Q&A records containing canonical questions, alternative
 * phrasings, verified answers, application module routes, navigation steps, and sources.
 */

export const APPLICATION_QA_KNOWLEDGE_BASE = [
  // ==========================================================================
  // CATEGORY A: INVOICE MANAGEMENT
  // ==========================================================================
  {
    id: "qa_invoice_creation",
    category: "INVOICE MANAGEMENT",
    canonicalQuestion: "Explain how invoice creation works.",
    alternativeQuestions: [
      "How does invoice creation work?",
      "How can I create an invoice?",
      "Teach me how to make an invoice.",
      "Explain the invoice process.",
      "How do I generate an invoice?",
      "How does the invoice module work?",
      "How do invoices work in SaaISS?"
    ],
    answer: "Invoice creation in your SaaISS accounting software works by entering customer details, adding products or services, calculating taxes and totals, and saving the invoice. Once created, the invoice should update the relevant accounting records and dashboard automatically.\n\n## Invoice creation — step by step\n\n1. Create a new invoice\n\nThe user opens the Sales Invoice module (/invoice) and clicks Create Invoice.\n\n2. Enter invoice details\n\nCustomer Details: Select the customer and enter the invoice number, invoice date, due date, customer GSTIN, billing address and other required details.\n\n3. Add items or services\n\nSelect the product or service, item code, HSN/SAC code, quantity, unit price, discount and applicable GST rate.\n\n4. Calculate the invoice total\n\nThe system calculates the subtotal, discounts, applicable CGST/SGST or IGST, and final payable amount. The tax type depends on the transaction and applicable GST rules.\n\n5. Save the invoice\n\nValidate the required fields (Validation & Business Rules), click Save Invoice to persist to the database, assign a unique invoice number and display the saved invoice in Invoice History.\n\n6. Update the accounting system\n\nThe saved invoice triggers the central Accounting Engine, which updates the relevant ledger entries, accounts receivable, sales revenue, GST payable and inventory records when applicable.\n\n7. Update reports and dashboard\n\nThe dashboard, Profit & Loss, Balance Sheet, GST reports and customer outstanding balances reflect the transaction according to their accounting rules. The user can print, download or share the invoice.\n\n## Example\n\nSuppose you create an invoice for a customer:\n\n| Item             | Amount  |\n| ---------------- | ------- |\n| Product subtotal | ₹10,000 |\n| GST at 18%       | ₹1,800  |\n| Invoice total    | ₹11,800 |\n| Amount paid      | ₹5,000  |\n| Amount due       | ₹6,800  |\n\nThe software should record ₹11,800 as the invoice total, ₹5,000 as the payment received and ₹6,800 as the outstanding amount. The payment must also be recorded in the appropriate accounts.\n\n## Correct backend workflow for your SaaISS project\n\nSales Invoice Form\n\nCustomer + Items + GST + Totals\n\nInvoice Validation & Database\n\nSave invoice and unique invoice ID\n\nCentral Accounting Engine\n\nProcess the invoice transaction once\n\nGeneral Ledger\n\nAccounts Receivable\n\nGST & Tax Reports\n\nInventory\n\nDashboard & Financial Reports\n\nSales • P&L • Balance Sheet • Outstanding • Cash Flow\n\nImportant: Creating an invoice is not the same as receiving payment. The system must keep the invoice total, amount paid and amount due consistent across the invoice form, Invoice History, downloaded PDF, customer ledger and dashboard. Inventory should also update according to the configured transaction and stock rules.\n\nThis is the intended workflow; the actual implementation in your live application needs to be checked separately to confirm every step is working correctly.",
    module: "Sales Invoice & Automation",
    route: "/invoice",
    navigationSteps: [
      "Navigate to `/invoice` in the left sidebar or top navigation menu.",
      "Click 'Create Invoice' (or select an existing invoice from the History drawer to edit).",
      "Fill in Customer Details: Customer Name (Mandatory), Email, Phone, Billing/Shipping Address, and GSTIN.",
      "Fill in Invoice Details: Invoice Number (auto-generated format `INV-YYYY-XXXXX`), Invoice Date (Mandatory), and Due Date.",
      "Add Line Items: Enter Product/Service Name, HSN/SAC code, Quantity, Unit Price, and Tax Rate %.",
      "Review dynamic tax calculations: Subtotal, CGST+SGST (50/50 split) or IGST, and Grand Total.",
      "Select Payment Method and enter initial Amount Paid if received.",
      "Click 'Save Invoice' to finalize or 'Save as Draft' to keep as an editable draft."
    ],
    source: "verified_codebase",
    relatedQuestions: [
      "How do I create a sales invoice?",
      "How do I create a purchase invoice?",
      "What happens after I save a sales invoice?"
    ]
  },
  {
    id: "qa_sales_invoice_create",
    category: "INVOICE MANAGEMENT",
    canonicalQuestion: "How do I create a sales invoice?",
    alternativeQuestions: [
      "How can I generate a sales bill?",
      "How do I bill a customer?",
      "Steps to create a customer invoice.",
      "How can I record a sale?",
      "How can I make a bill for my customer?",
      "How do I create a customer bill?",
      "Create sales invoice"
    ],
    answer: "Open the Invoice section at `/invoice` and click 'Create Invoice'. In the Customer Details section, enter the Customer Name (mandatory), Phone Number, Email, and GSTIN. In the Invoice Information section, verify the Invoice Date (defaults to today) and specify the Due Date. In the Line Items table, add your products or services with their Quantity, Unit, Price per Unit, and applicable GST rate (0%, 5%, 12%, 18%, 28%). The application automatically computes the Subtotal, SGST, CGST, IGST, and Grand Total. If payment was received at the time of sale, record the Amount Paid and select the payment method (Cash, Bank Transfer, UPI, Credit Card). Review the totals and click 'Save Invoice'. Once saved, the invoice appears in your Sales Invoice History drawer where you can view, print, or download it as a PDF.",
    module: "Sales Invoice & Automation",
    route: "/invoice",
    navigationSteps: [
      "Open `/invoice` from the navigation menu.",
      "Click 'Create Invoice'.",
      "Enter Customer Details: Customer Name is mandatory.",
      "Specify Invoice Date and Due Date.",
      "Add line items: Product Name, Quantity > 0, Unit Price >= 0, and GST slab.",
      "Verify Subtotal, GST taxes, Grand Total, and Amount Paid.",
      "Click 'Save Invoice' to save to the database."
    ],
    source: "verified_codebase",
    relatedQuestions: [
      "How do I print or download an invoice?",
      "How does invoice payment work?",
      "Where can I find a saved invoice?"
    ]
  },
  {
    id: "qa_purchase_invoice_create",
    category: "INVOICE MANAGEMENT",
    canonicalQuestion: "How do I create a purchase invoice?",
    alternativeQuestions: [
      "How do I record a purchase?",
      "How do I enter a supplier bill?",
      "How can I create a purchase bill?",
      "How do I record goods purchased from a supplier?",
      "Enter vendor invoice",
      "Add purchase invoice",
      "How to create vendor bill"
    ],
    answer: "Open the Inventory module at `/inventory` and click the 'Purchase Invoices' (or 'Vendor Bills') tab. Click 'Create Purchase Bill' or 'Add Purchase Invoice'. Fill in Supplier Information: Supplier Name (mandatory), Phone Number, and Supplier GSTIN. Enter Bill Details: Bill Number (mandatory vendor reference), Bill Date (mandatory), Due Date, and State of Supply. Add the purchased items with SKU/Item Code, HSN Code, Quantity, Unit, Unit Cost Price, and applicable GST rate. The system calculates Subtotal, Tax Breakdown (CGST/SGST or IGST), and Total Bill Amount. Record any immediate payment made. Click 'Save Bill' (`POST /api/purchase-invoice/create`). Saving the purchase invoice automatically updates stock in your `InventoryItem` collection, logs an Expense Bookkeeping entry under 'Purchases', and adds the unpaid balance to Total Payables on your Dashboard.",
    module: "Purchase Invoice & Vendor Bills",
    route: "/inventory",
    navigationSteps: [
      "Navigate to `/inventory` and select the 'Purchase Invoices' tab.",
      "Click 'Create Purchase Bill' / 'Add Purchase Invoice'.",
      "Enter Supplier Name (mandatory), Phone, and GSTIN.",
      "Enter Bill Number (mandatory) and Bill Date (mandatory).",
      "Select Supplier State and State of Supply for GST credit calculation.",
      "Add purchased items: Item Name, SKU, Quantity, Cost Price, and GST rate.",
      "Enter any initial payment paid.",
      "Click 'Save' to persist the bill and automatically update inventory stock."
    ],
    source: "verified_codebase",
    relatedQuestions: [
      "How does inventory work?",
      "What is Total Payables?",
      "What is the difference between a sales invoice and a purchase invoice?"
    ]
  },
  {
    id: "qa_find_saved_invoice",
    category: "INVOICE MANAGEMENT",
    canonicalQuestion: "How do I find a saved invoice?",
    alternativeQuestions: [
      "Where can I see my invoices?",
      "How do I check invoice history?",
      "Where is my purchase invoice?",
      "How can I reopen an old sales invoice?",
      "Where can I find a saved invoice?",
      "How to view saved invoices",
      "Find past invoices"
    ],
    answer: "To find saved sales invoices, open `/invoice` and click the 'History' drawer button at the top right of the invoice form. The History drawer lists all saved sales invoices for your authenticated business account with Invoice Number, Customer Name, Date, Grand Total, and Payment Status (Paid, Partial, Pending). Use the search bar or scroll through the list to find the desired invoice, then click on it to reopen and edit it. To find saved purchase invoices, navigate to `/inventory` and select the 'Purchase Invoices' tab. The purchase invoices data table displays all recorded vendor bills with Bill No, Supplier Name, Bill Date, Due Date, Total, Paid, Balance, and Status. You can search by Bill No or Supplier Name and click 'View' or 'PDF' on any row.",
    module: "Sales Invoice & Inventory",
    route: "/invoice (History drawer) or /inventory (Purchase Invoices tab)",
    navigationSteps: [
      "For Sales Invoices: Open `/invoice` and click 'History' at the top right.",
      "Search by customer name or invoice number in the History drawer.",
      "Click on any invoice row to load its details into the editor or view actions.",
      "For Purchase Invoices: Open `/inventory` and click the 'Purchase Invoices' tab.",
      "Locate the bill in the table or search by vendor name/bill number."
    ],
    source: "verified_codebase",
    relatedQuestions: [
      "How do I print or download an invoice?",
      "How does invoice payment work?"
    ]
  },
  {
    id: "qa_print_download_invoice",
    category: "INVOICE MANAGEMENT",
    canonicalQuestion: "How do I print or download an invoice?",
    alternativeQuestions: [
      "How do I get an invoice PDF?",
      "How can I print a bill?",
      "How do I download my sales invoice?",
      "Where is the invoice PDF?",
      "How do I print an invoice?",
      "How do I print an invoice PDF?",
      "Export invoice to pdf"
    ],
    answer: "For Sales Invoices, open `/invoice` and either open an invoice or locate it in the 'History' drawer. Click the 'Print' button to open the browser print dialog directly with your active invoice template formatting. Click the 'Download PDF' button to generate and export a professional, GST-compliant PDF invoice styled with your business logo, seller information, and bank details from Profile Settings. For Purchase Invoices, navigate to `/inventory`, switch to the 'Purchase Invoices' tab, and click the 'View' or 'PDF' action button on any bill row. This opens the Purchase Invoice Viewer where you can preview, print, or download the vendor bill PDF.",
    module: "Sales Invoice & Purchase Invoice",
    route: "/invoice or /inventory",
    navigationSteps: [
      "For Sales Invoices: Open `/invoice` and locate the invoice in History.",
      "Click 'Print' for physical printing or 'Download PDF' for local PDF export.",
      "To customize the PDF layout, navigate to `/invoice-templates`.",
      "For Purchase Invoices: Go to `/inventory` → 'Purchase Invoices' tab.",
      "Click the 'View' or 'PDF' icon on the bill row, then click 'Print' or 'Download'."
    ],
    source: "verified_codebase",
    relatedQuestions: [
      "Where can I find a saved invoice?",
      "Why is the PDF incorrect?"
    ]
  },
  {
    id: "qa_invoice_payment",
    category: "INVOICE MANAGEMENT",
    canonicalQuestion: "How does invoice payment work?",
    alternativeQuestions: [
      "How do I record a payment?",
      "How do I apply payment to an invoice?",
      "How do I apply a payment?",
      "Why is my invoice still showing a balance?",
      "How does amount paid work?",
      "Payment application workflow",
      "Record customer payment"
    ],
    answer: "Invoice payment records payments received from customers or paid to suppliers, updating outstanding balances and accounting statuses. For Sales Invoices: Open `/invoice`, open the 'History' drawer, locate the unpaid or partial invoice, and click 'Record Payment' / 'Apply Payment'. Enter the Payment Amount (must be greater than 0 and less than or equal to the balance due), select Payment Method (Cash, Bank Transfer, UPI, Cheque, Credit Card), and enter Payment Date. Submitting calls `POST /api/invoice/:id/payment`. The backend calculates `newAmountPaid = invoice.amountPaid + paymentAmount` and `newBalanceDue = Math.max(0, grandTotal - newAmountPaid)`. If balance due reaches 0, the invoice status changes to 'PAID' (green badge); if partially paid, it changes to 'PARTIAL'. The payment immediately reduces Total Receivables on your Dashboard. For Purchase Invoices, click 'Record Payment' on a bill in `/inventory` to submit `POST /api/purchase-invoice/:id/payment` and reduce Total Payables.",
    module: "Payment Application & Settlement",
    route: "/invoice (History drawer) or /inventory",
    navigationSteps: [
      "Open `/invoice` and open the 'History' drawer (or `/inventory` for vendor bills).",
      "Locate the invoice with an open balance and click 'Record Payment' / 'Apply Payment'.",
      "Enter payment amount, payment date, and payment method.",
      "Click 'Submit Payment'.",
      "Verify the invoice status updates to 'PAID' or 'PARTIAL' and the remaining balance drops."
    ],
    source: "verified_codebase",
    relatedQuestions: [
      "Why is my invoice payment not updating?",
      "What is Total Receivables?",
      "What is Total Payables?"
    ]
  },
  {
    id: "qa_sales_vs_purchase_invoice",
    category: "INVOICE MANAGEMENT",
    canonicalQuestion: "What is the difference between a sales invoice and a purchase invoice?",
    alternativeQuestions: [
      "Sales invoice vs purchase invoice.",
      "Which invoice should I use for a customer?",
      "Which invoice should I use for a supplier?",
      "What is the difference between sales and purchase invoices?",
      "Difference between sales and purchase invoice",
      "Compare sales invoice and purchase invoice"
    ],
    answer: "In SaaISS, Sales Invoices and Purchase Invoices serve two opposite sides of your double-entry accounting and operations:\n\n1. Sales Invoices (`/invoice`):\n• Purpose: Issued to customers for goods sold or services rendered (Revenue / Income).\n• Accounting Impact: Generates Accounts Receivable (money customers owe you). Unpaid balances directly increase Total Receivables on your Dashboard.\n• Inventory Impact: Finalized sales invoices automatically reserve and deduct stock from your inventory.\n• Tax Impact: Computes and collects Output GST (tax liability owed to the government).\n\n2. Purchase Invoices (`/inventory` → Purchase Invoices):\n• Purpose: Received from vendors/suppliers for raw materials, inventory, or operational expenses.\n• Accounting Impact: Generates Accounts Payable (liabilities you owe suppliers). Unpaid balances directly increase Total Payables on your Dashboard.\n• Inventory Impact: Automatically adds and increments purchased stock quantities in your inventory.\n• Tax Impact: Records Input Tax Credit (ITC) that offsets your output GST liability.",
    module: "Sales Invoice & Purchase Invoice",
    route: "/invoice and /inventory",
    navigationSteps: [
      "Use `/invoice` when billing a customer to recognize revenue and receivables.",
      "Use `/inventory` → 'Purchase Invoices' when recording a supplier bill to recognize inventory and payables."
    ],
    source: "verified_codebase",
    relatedQuestions: [
      "How do I create a sales invoice?",
      "How do I create a purchase invoice?",
      "What is Total Payables?",
      "What is Total Receivables?"
    ]
  },

  // ==========================================================================
  // CATEGORY B: DASHBOARD AND FINANCIAL METRICS
  // ==========================================================================
  {
    id: "qa_total_payables",
    category: "DASHBOARD AND FINANCIAL METRICS",
    canonicalQuestion: "What is Total Payables?",
    alternativeQuestions: [
      "Explain accounts payable.",
      "How much do I owe suppliers?",
      "What does the Total Payables card mean?",
      "What does Total Payables mean?",
      "How is Total Payables calculated?",
      "Definition of payables"
    ],
    answer: "Total Payables represents the total outstanding balance your business owes to suppliers and creditors for vendor purchase bills in the selected reporting period. In SaaISS, it is computed as `Total Payables = Sum of (Bill Total - Amount Paid)` across all open purchase invoices. Cancelled bills (`status === 'cancelled'`) and deleted records are strictly excluded. When you ask for your actual current Total Payables, SHREE ANDAL AI retrieves the authoritative value from the backend financial service `getTotalPayables`, guaranteeing 100% exact parity with the Total Payables KPI card on your executive dashboard.",
    module: "Dashboard & Accounts Payable",
    route: "/dashboard and /inventory",
    navigationSteps: [
      "View the 'Total Payables' KPI card on `/dashboard`.",
      "To see itemized supplier balances, go to `/inventory` → 'Purchase Invoices'.",
      "Ask SHREE ANDAL AI: 'What is my Total Payables this month?' for live authoritative numbers."
    ],
    source: "verified_codebase",
    relatedQuestions: [
      "What is my Total Payables this month?",
      "Explain how payables are calculated and show my current Total Payables.",
      "Why do my dashboard and AI CFO show different amounts?"
    ]
  },
  {
    id: "qa_total_receivables",
    category: "DASHBOARD AND FINANCIAL METRICS",
    canonicalQuestion: "What is Total Receivables?",
    alternativeQuestions: [
      "How much do customers owe me?",
      "Explain accounts receivable.",
      "What does Total Receivables mean?",
      "What does the Total Receivables card mean?",
      "How is Total Receivables calculated?",
      "Definition of receivables"
    ],
    answer: "Total Receivables represents the total unpaid balance customers owe to your business for billed sales invoices in the selected reporting period. In SaaISS, it is calculated as `Total Receivables = Sum of (Invoice Grand Total - Amount Paid)` across open sales invoices. Fully settled invoices (`status === 'paid'`) and cancelled invoices are excluded. When you ask for your current receivables, SHREE ANDAL AI queries the authoritative backend service `getTotalReceivables` to return the exact figure matching the Total Receivables card on your Dashboard.",
    module: "Dashboard & Accounts Receivable",
    route: "/dashboard and /invoice",
    navigationSteps: [
      "View the 'Total Receivables' KPI card on `/dashboard`.",
      "To inspect customer invoices, open `/invoice` → 'History' drawer.",
      "Ask SHREE ANDAL AI: 'What is my Total Receivables this month?' for live verified data."
    ],
    source: "verified_codebase",
    relatedQuestions: [
      "How does invoice payment work?",
      "What is Total Payables?",
      "What is Revenue?"
    ]
  },
  {
    id: "qa_revenue",
    category: "DASHBOARD AND FINANCIAL METRICS",
    canonicalQuestion: "What is Revenue?",
    alternativeQuestions: [
      "Explain revenue.",
      "How much money did my business earn from sales?",
      "What is the Revenue card on the dashboard?",
      "What is gross revenue?",
      "How is revenue calculated?"
    ],
    answer: "Revenue represents the gross income earned from your business operations during a reporting period. In SaaISS, total revenue aggregates three sources via `getFinanceMetrics`: 1) Finalized Sales Invoices revenue from `/invoice`, 2) Direct POS and inventory sales from `/inventory`, and 3) Other business income entries logged in `/bookkeeping`. When you ask for your revenue, SHREE ANDAL AI queries the verified financial backend for your selected period (e.g. this month, last month, this quarter, this year) and returns the verified figure and its component breakdown.",
    module: "Dashboard & Profit and Loss",
    route: "/dashboard and /profit-loss",
    navigationSteps: [
      "View Revenue summary on `/dashboard` in the Profit & Loss summary card.",
      "For a detailed itemized breakdown, open `/profit-loss` and select your reporting period."
    ],
    source: "verified_codebase",
    relatedQuestions: [
      "What are Expenses?",
      "What is Net Profit?",
      "How do I view a profit and loss report?"
    ]
  },
  {
    id: "qa_expenses",
    category: "DASHBOARD AND FINANCIAL METRICS",
    canonicalQuestion: "What are Expenses?",
    alternativeQuestions: [
      "Explain business expenses.",
      "How much did I spend this month?",
      "What does the Expenses metric mean?",
      "What are total expenses?",
      "How are expenses tracked in SaaISS?"
    ],
    answer: "Expenses are the business costs and overheads incurred during a reporting period under SaaISS accounting rules. In SaaISS, total expenses include Cost of Goods Sold (COGS) and vendor purchase bills from `/inventory`, as well as operational overheads (Salaries, Rent, Utilities, Software, Marketing, Office Supplies) logged in `/bookkeeping`. For your actual expense figure, SHREE ANDAL AI retrieves the authoritative value from `getExpenseAnalysis` or `getFinanceMetrics`, and can provide category breakdowns and month-over-month variance analysis.",
    module: "Dashboard & Bookkeeping",
    route: "/dashboard, /bookkeeping, and /profit-loss",
    navigationSteps: [
      "View total expenses on `/dashboard`.",
      "Review categorized expense entries in `/bookkeeping`.",
      "Ask SHREE ANDAL AI: 'Why did my expenses increase this month?' for variance analysis."
    ],
    source: "verified_codebase",
    relatedQuestions: [
      "What is Revenue?",
      "What is Net Profit?",
      "How does bookkeeping work?"
    ]
  },
  {
    id: "qa_net_profit",
    category: "DASHBOARD AND FINANCIAL METRICS",
    canonicalQuestion: "What is Net Profit?",
    alternativeQuestions: [
      "Explain net profit.",
      "How much profit did my business make?",
      "Why is my net profit negative?",
      "What does net profit mean?",
      "What does the net profit metric on my dashboard mean?",
      "Net profit formula"
    ],
    answer: "Net Profit is your company's actual bottom-line profitability after accounting for all revenues and operating expenses. The formula is `Net Profit = Total Operating Revenue - Total Operating Expenses`. Total Revenue includes sales invoices and bookkeeping income; Total Expenses includes cost of goods sold, vendor purchases, and operational overheads. On the SaaISS dashboard, if revenue exceeds expenses, the KPI card indicates 'Profitable (✅)'. If expenses exceed revenue, it alerts 'Operating at Loss (⚠️)'. SHREE ANDAL AI retrieves the authoritative Net Profit figure from `getFinanceMetrics`, ensuring exact consistency across the executive dashboard, P&L reports, and chatbot queries.",
    module: "Dashboard & Profit and Loss",
    route: "/dashboard and /profit-loss",
    navigationSteps: [
      "View the 'Net Profit' card on `/dashboard`.",
      "Check the complete Income Statement at `/profit-loss`.",
      "Ask SHREE ANDAL AI: 'What is my net profit this month?' for live verified numbers."
    ],
    source: "verified_codebase",
    relatedQuestions: [
      "What is Revenue?",
      "What are Expenses?",
      "How do I view a profit and loss report?"
    ]
  },
  {
    id: "qa_dashboard_ai_discrepancy",
    category: "DASHBOARD AND FINANCIAL METRICS",
    canonicalQuestion: "Why do my dashboard and AI CFO show different amounts?",
    alternativeQuestions: [
      "Why is Total Payables different in the chatbot?",
      "Why does AI show a different financial value?",
      "The dashboard number and AI answer do not match.",
      "Why are my dashboard and AI CFO showing different amounts?",
      "Financial value mismatch",
      "Why does AI say a different number than dashboard?"
    ],
    answer: "The SaaISS Dashboard and SHREE ANDAL AI are built to always agree with 100% parity because both query the exact same underlying backend services (such as `getTotalPayables`, `getTotalReceivables`, and `getFinanceMetrics`). If a discrepancy is observed, it is typically caused by: 1) Different reporting periods (e.g., viewing 'This Month' on the dashboard while asking the AI for all-time or last month), 2) Active dashboard date filters vs default query scope, 3) Unsaved draft transactions vs finalized records, or 4) Cached browser data requiring a page refresh. SHREE ANDAL AI always retrieves authoritative live values scoped to your company context and explicitly reports the evaluated date range.",
    module: "Dashboard & AI CFO Sync",
    route: "/dashboard",
    navigationSteps: [
      "Verify the period selector on `/dashboard` (e.g., 'This Month', 'Last Month', 'This Quarter').",
      "Include the exact period in your AI question: 'What is my Total Payables this month?'.",
      "Both the dashboard card and SHREE ANDAL AI will report the exact same verified figure."
    ],
    source: "verified_codebase",
    relatedQuestions: [
      "What is Total Payables?",
      "What is Total Receivables?",
      "Explain how payables are calculated and show my current Total Payables."
    ]
  },

  // ==========================================================================
  // CATEGORY C: INVENTORY AND BOOKKEEPING
  // ==========================================================================
  {
    id: "qa_inventory",
    category: "INVENTORY AND BOOKKEEPING",
    canonicalQuestion: "How does inventory work?",
    alternativeQuestions: [
      "How can I check my stock?",
      "How do I manage products?",
      "How does purchase affect stock?",
      "Inventory module workflow",
      "How does inventory work in SaaISS?",
      "Stock management"
    ],
    answer: "Inventory management in SaaISS (`/inventory`) tracks your physical products, stock on hand, SKUs, cost prices, selling prices, and inventory valuation. Key features and workflows include:\n1. Adding Stock: Enter Product Name, SKU, Category, Quantity, Buy/Cost Price, Selling Price, and GST Rate.\n2. Automatic Purchase Inflow: When you save a purchase invoice (`/inventory` → Purchase Invoices), matching items have their stock quantities automatically incremented in the database (`InventoryItem`).\n3. Automatic Sales Outflow: When a customer sales invoice is finalized (`/invoice`), item quantities are reserved and deducted (`POST /api/inventory/reserve/:id`).\n4. Stock Valuation: Computed dynamically as `Sum of (Quantity × Cost Price)` across all active stock items.\n5. Low Stock Alerts: Any item with quantity below 10 units is automatically flagged as 'Low Stock' on your inventory dashboard.",
    module: "Inventory & Stock Management",
    route: "/inventory",
    navigationSteps: [
      "Navigate to `/inventory` in the sidebar.",
      "Inspect the inventory table for current stock levels, unit cost, and selling price.",
      "Click 'Add Item' to record a new product SKU.",
      "Check the Low Stock alert badge for items below 10 units."
    ],
    source: "verified_codebase",
    relatedQuestions: [
      "How do I create a purchase invoice?",
      "What is the difference between a sales invoice and a purchase invoice?",
      "How does bookkeeping work?"
    ]
  },
  {
    id: "qa_bookkeeping",
    category: "INVENTORY AND BOOKKEEPING",
    canonicalQuestion: "How does bookkeeping work?",
    alternativeQuestions: [
      "Explain bookkeeping.",
      "How are expenses recorded?",
      "How does SaaISS organize financial transactions?",
      "How does bookkeeping work in SaaISS?",
      "Bookkeeping process",
      "General ledger workflow"
    ],
    answer: "The Bookkeeping module (`/bookkeeping`) serves as the central single source of truth for all financial transactions in SaaISS. Key operations include:\n1. Automated Entries: When you create and save a sales invoice, SaaISS automatically inserts an Income entry under category 'Sales'. When you save a purchase invoice, it automatically logs an Expense entry under category 'Purchases'.\n2. Manual Entries: Click 'Add Transaction' to log direct expenses (Salaries, Rent, Utilities, Consulting) or non-invoice income with Date, Category, Amount, Payment Mode, and Description.\n3. General Ledger & Chart of Accounts: View standard asset, liability, equity, revenue, and expense accounts (`LedgerAccount`) with running balances.\n4. Reporting Feed: Bookkeeping income and expense totals feed directly into Net Profit on your Dashboard, Profit & Loss reports, and Cash Flow calculations.",
    module: "Bookkeeping & General Ledger",
    route: "/bookkeeping",
    navigationSteps: [
      "Navigate to `/bookkeeping`.",
      "View the transaction log containing both automated invoice entries and manual ledger items.",
      "Click 'Add Transaction' to record a direct operational expense or miscellaneous income.",
      "Filter by category or date range to inspect specific ledger accounts."
    ],
    source: "verified_codebase",
    relatedQuestions: [
      "What are Expenses?",
      "What is Net Profit?",
      "How do I view a profit and loss report?"
    ]
  },

  // ==========================================================================
  // CATEGORY D: REPORTS AND OTHER MODULES
  // ==========================================================================
  {
    id: "qa_profit_loss",
    category: "REPORTS AND OTHER MODULES",
    canonicalQuestion: "How do I view a profit and loss report?",
    alternativeQuestions: [
      "How can I check business profit?",
      "Where is the P&L report?",
      "How do I understand my income and expenses?",
      "How do I view my profit and loss report?",
      "Generate P&L report",
      "View income statement"
    ],
    answer: "To view your Profit and Loss report, navigate to `/profit-loss` in the navigation menu. Select your desired reporting period using the period selector (This Month, Last Month, This Quarter, This Year, or Custom Date Range). The application calls `/api/profitloss/generate` to dynamically aggregate revenue from sales invoices and expenses from bookkeeping entries. The statement displays: 1) Total Revenue (Sales, POS, Other Income), 2) Cost of Goods Sold (COGS), 3) Operating Expenses breakdown (Salaries, Rent, Utilities, Office Supplies), 4) Net Profit, and 5) Net Profit Margin %. You can click 'Download PDF' or 'Print' to export a structured, executive-ready Profit and Loss report.",
    module: "Profit and Loss Statement (P&L)",
    route: "/profit-loss",
    navigationSteps: [
      "Navigate to `/profit-loss` from the navigation menu.",
      "Select your reporting period from the period dropdown.",
      "Review the income breakdown, expense categories, and Net Profit margin.",
      "Click 'Download PDF' to save a formatted report."
    ],
    source: "verified_codebase",
    relatedQuestions: [
      "What is Revenue?",
      "What is Net Profit?",
      "What are Expenses?"
    ]
  },
  {
    id: "qa_cash_flow",
    category: "REPORTS AND OTHER MODULES",
    canonicalQuestion: "How does cash flow work?",
    alternativeQuestions: [
      "Explain cash flow prediction.",
      "How can I understand money coming in and going out?",
      "What is a cash flow statement?",
      "What is cash flow prediction?",
      "How does cash flow work in SaaISS?",
      "Cash flow forecasting"
    ],
    answer: "SaaISS handles cash flow across two complementary views:\n1. Cash Flow Statement (`/cashflow-statement`): Summarizes actual recorded cash inflows (customer collections, cash sales) and cash outflows (supplier payments, operating expenses) for a reporting period, calculating Net Cash Flow and your ending cash position.\n2. Cash Flow Forecasting / Prediction (`/cashflow`): Uses a linear regression model over your past 6 months of historical bookkeeping entries to calculate slope and intercept trends. It projects expected monthly cash inflows, outflows, and net cash balances for the next 6 months, clearly identifying projected surpluses or cash runway constraints. Forecasts are explicitly labeled as estimates.",
    module: "Cash Flow & Forecasting",
    route: "/cashflow and /cashflow-statement",
    navigationSteps: [
      "Navigate to `/cashflow-statement` to review historical cash movements.",
      "Navigate to `/cashflow` to inspect the 6-month predictive regression forecast.",
      "Review the projected monthly inflows, outflows, and projected net surplus."
    ],
    source: "verified_codebase",
    relatedQuestions: [
      "How does bookkeeping work?",
      "What is Revenue?",
      "What is Net Profit?"
    ]
  },
  {
    id: "qa_gst_tax",
    category: "REPORTS AND OTHER MODULES",
    canonicalQuestion: "How do I use GST or tax features?",
    alternativeQuestions: [
      "Explain GST in an invoice.",
      "How do I check tax details?",
      "How does tax calculation work in SaaISS?",
      "How do I use GST or tax features in SaaISS?",
      "GST calculation",
      "Input Tax Credit ITC"
    ],
    answer: "SaaISS includes comprehensive GST and tax management features:\n1. Invoice Tax Calculation (`/invoice`): When adding line items, choose standard GST tax slabs (0%, 5%, 12%, 18%, 28%). For Intrastate sales (within the same state), GST is split 50/50 into CGST and SGST. For Interstate sales, IGST is applied.\n2. Tax Management Dashboard (`/tax-gst`): Aggregates sales invoices, POS sales, and purchase vendor bills for the selected period.\n3. Net Tax Liability: Computes `Net GST Payable = Output GST (from sales) - Input Tax Credit (ITC from purchase bills)`. If input exceeds output, credit carries forward.\n4. Export: Download GSTR-ready summary reports in JSON or CSV format for tax filing.",
    module: "Tax & GST Management",
    route: "/tax-gst",
    navigationSteps: [
      "Navigate to `/tax-gst`.",
      "Select your tax reporting period.",
      "Review Output GST collected on sales and Input Tax Credit (ITC) claimed on vendor bills.",
      "Check Net GST Payable to know your tax liability owed to the government.",
      "Export reports using the Download actions."
    ],
    source: "verified_codebase",
    relatedQuestions: [
      "How do I create a sales invoice?",
      "How do I create a purchase invoice?",
      "What is the difference between a sales invoice and a purchase invoice?"
    ]
  },
  {
    id: "qa_troubleshooting",
    category: "REPORTS AND OTHER MODULES",
    canonicalQuestion: "What should I do if a feature does not work?",
    alternativeQuestions: [
      "Why is my invoice not saving?",
      "Why is the PDF incorrect?",
      "Why is payment not updating?",
      "How do I troubleshoot an application error?",
      "Troubleshoot SaaISS",
      "Why did my invoice fail to save?"
    ],
    answer: "If you encounter an issue in SaaISS, follow these diagnostic steps based on verified application behavior:\n1. Invoice Not Saving: Check that mandatory fields are filled (Customer Name, Invoice Date, at least one line item with valid Quantity and Price). Verify that the Invoice Number is unique and not a duplicate across your business. Check your subscription plan limits (Sandbox plan limit is 50 invoices).\n2. Payment Not Updating: Ensure the payment was entered with an amount greater than 0 via the 'Apply Payment' modal and submitted successfully. If a partial payment was made, the invoice will transition to 'PARTIAL' rather than 'PAID' until the full grand total is settled.\n3. Bank Details Missing on PDF: Navigate to `/profile` and ensure Bank Name, Account Number, and IFSC Code are saved in your business profile. In `/invoice-templates`, verify that the 'Payment Details' section toggle is turned on.\n4. Session Expiry: If requests fail with 401 Unauthorized, log out and log back in to refresh your JWT token.",
    module: "Troubleshooting & System Help",
    route: "/invoice, /profile, and /invoice-templates",
    navigationSteps: [
      "Identify the exact form or button that failed.",
      "Review the error notification badge or toast in the top right.",
      "Check required fields, subscription plan limits in `/profile`, and unique invoice numbers.",
      "Ask SHREE ANDAL AI with the specific error message for targeted diagnosis."
    ],
    source: "verified_codebase",
    relatedQuestions: [
      "How do I create a sales invoice?",
      "How does invoice payment work?",
      "How do I print or download an invoice?"
    ]
  }
];
