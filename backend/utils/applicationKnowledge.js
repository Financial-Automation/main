/**
 * SaaISS Application Knowledge Base
 * 
 * Verified documentation, UI fields, validation rules, backend operations,
 * workflows, and troubleshooting guides derived directly from the application codebase.
 */

export const APPLICATION_MODULES = {
  sales_invoice: {
    id: "sales_invoice",
    name: "Sales Invoice & Automation",
    route: "/invoice",
    purpose: "Create, manage, print, download, and track customer sales invoices with GST calculations, automated bookkeeping integration, and inventory stock deduction.",
    creationWorkflow: [
      "Navigate to `/invoice` (or click 'Invoicing & Bills' in the navigation menu).",
      "Click 'Create Invoice' (or select an existing invoice from History to edit).",
      "Customer Details: Enter Customer Name (Required), Email, Phone, Billing/Shipping Address, and Customer GSTIN.",
      "Invoice Details: Specify Invoice Number (optional, auto-generates format `INV-YYYY-XXXXX`), Invoice Date (Required), and Due Date (Required).",
      "Add Line Items: Enter Product/Service Name, Description, Code Type (HSN/SAC), HSN/SAC Code, Quantity, Unit (e.g., Pcs, Kg), Unit Price, Tax Rate (GST % slab: 0%, 5%, 12%, 18%, 28%), and Discount.",
      "Calculations: Subtotal, SGST, CGST, IGST (or Intrastate 50/50 split), and Grand Total are dynamically computed.",
      "Payment Terms & Bank Details: Select payment method (Cash, Bank Transfer, UPI, Credit Card, etc.), enter initial amount paid (if partial/full payment received at billing), and verify bank details pulled from your Profile Settings.",
      "Validation: Form validates required fields: Customer Name, Business Name, Invoice Date, Due Date, and at least one item with valid quantity and unit price.",
      "Save Invoice: Click 'Save Invoice' to persist as a finalized invoice, or 'Save as Draft' to store an editable draft in History.",
      "Post-Save Effects: The invoice is saved to MongoDB (`/api/invoice/create`); an automated Income Bookkeeping entry is logged under category 'Sales'; linked inventory item quantities are reserved/deducted; open balance increases Total Receivables on the Dashboard.",
      "Export & Share: In History or View mode, use the action buttons to 'Print', 'Download PDF', 'View Public Link', or 'Share via WhatsApp/Email'."
    ],
    postSaveEffects: [
      "Persists in MongoDB under the `Invoice` collection linked to your authenticated userId.",
      "Automated Bookkeeping: Automatically inserts an Income BookkeepingEntry (`category: 'Sales'`, `type: 'income'`, `amount: grandTotal`, `referenceId: invoice_{id}`).",
      "Inventory Deduction: For final (non-draft) invoices, items linked to inventory stock have their quantities deducted via `POST /api/inventory/reserve/:id`.",
      "Dashboard & AR Impact: If the invoice has an open balance (`balanceDue > 0`), it immediately increases Total Receivables on the Dashboard and Accounts Receivable reports.",
      "History & Local Synchronization: Synced to localStorage (`savedInvoices`) and immediately visible in the History drawer for printing, PDF download, editing, and payment recording."
    ],
    validationRules: [
      "Customer Name is mandatory (`customerName`).",
      "Business Name is mandatory (`businessName`, defaults from user Profile).",
      "Invoice Date and Due Date must be valid dates.",
      "Items array must contain at least 1 item with `productName`, `quantity > 0`, and `unitPrice >= 0`.",
      "Invoice Number must be unique across the tenant (duplicates return HTTP 400 with E11000).",
      "Subscription plan check: Users must not exceed active plan invoice limits (`checkPlanLimit`)."
    ],
    troubleshooting: {
      "why_invoice_not_saving": [
        "Check mandatory fields: Customer Name, Invoice Date, and Item Name/Price/Quantity must not be blank.",
        "Check duplicate invoice number: If you manually entered an invoice number that already exists, the database rejects it with 'Duplicate invoice number'. Use auto-generation or enter a unique number.",
        "Check subscription plan limits: If you are on the Sandbox plan (50 invoices limit) and reached the cap, upgrade your subscription in `/profile` or billing.",
        "Check session expiration: If your session expired, log in again to refresh your JWT token."
      ],
      "why_balance_not_decreasing": [
        "Ensure payment was submitted via the 'Apply Payment' modal with a valid non-zero amount.",
        "If you made a partial payment, the balance decreases by the paid amount, but won't reach zero until total paid equals grand total.",
        "Ensure the payment request was saved to the backend (`POST /api/invoice/:id/payment`) and not blocked by network connectivity.",
        "Verify that the invoice was not previously marked as cancelled or draft."
      ],
      "why_bank_details_missing_from_pdf": [
        "Bank details on invoices are populated from your Business Profile. Navigate to `/profile` and ensure Bank Name, Account Number, IFSC Code, and Account Type are saved.",
        "In the Invoice Template Editor (`/invoice-templates`), ensure the 'Payment Details' section toggle is enabled on your active invoice template."
      ]
    }
  },

  purchase_invoice: {
    id: "purchase_invoice",
    name: "Purchase Invoice & Vendor Bills",
    route: "/inventory",
    purpose: "Record vendor purchase invoices, track Accounts Payable to suppliers, automatically add purchased items into inventory stock, and record automated purchase expense entries.",
    creationWorkflow: [
      "Navigate to `/inventory` and click the 'Purchase Invoices' or 'Vendor Bills' tab.",
      "Click 'Create Purchase Bill' / 'Add Purchase Invoice'.",
      "Supplier Information: Enter Supplier Name (Required), Supplier Phone, and Supplier GSTIN.",
      "Bill Details: Enter Bill Number / Vendor Invoice No. (Required), Bill Date (Required), and Due Date.",
      "State of Supply: Select Supplier State and State of Supply to determine Intrastate (CGST+SGST) vs Interstate (IGST) tax credit.",
      "Add Purchased Items: Enter Item Name, SKU/Item Code, HSN Code, Quantity, Unit (Pcs, Kg, etc.), Unit Cost Price, and applicable GST rate.",
      "Payment Status: Record any advance or immediate payment made (Cash, Net Banking, G Pay, UPI), leaving the remaining balance as Accounts Payable.",
      "Save Bill: Submit the purchase invoice (`POST /api/purchase-invoice/create`).",
      "Post-Save Effects: An automated Expense Bookkeeping entry is logged (`category: 'Purchases'`, `type: 'expense'`); purchased item quantities are automatically added or incremented in your Inventory stock; outstanding balance increases Total Payables on the Dashboard."
    ],
    postSaveEffects: [
      "Persists in MongoDB under the `PurchaseInvoice` collection.",
      "Automated Bookkeeping: Generates an automated Expense BookkeepingEntry under `category: 'Purchases'`.",
      "Automatic Inventory Stock Inflow: If not draft, adds purchased item quantities to `InventoryItem`. If the SKU/Name matches an existing product, it updates quantity and cost price; otherwise, a new inventory item is created.",
      "Accounts Payable & Dashboard Impact: Unpaid bill balances immediately increase Total Payables on the Dashboard and Accounts Payable reports.",
      "Input Tax Credit (ITC): GST paid on purchases is recorded as Input Tax Credit in `/tax-gst` analytics."
    ],
    validationRules: [
      "Supplier Name is mandatory (`supplierName`).",
      "Bill Number is mandatory (`billNo`).",
      "Bill Date is mandatory (`billDate`).",
      "State of Supply is mandatory (`stateOfSupply`).",
      "Items list must contain at least 1 item with positive quantity and unit price."
    ],
    troubleshooting: {
      "why_purchase_not_saving": [
        "Ensure Supplier Name, Bill Number, and State of Supply are filled out.",
        "Verify item list contains valid quantities and prices.",
        "Check plan purchase invoice limits under subscription settings."
      ],
      "how_to_print_download": [
        "In the `/inventory` purchase invoices table, click the 'View' or 'PDF' button on any bill row.",
        "This opens the Purchase Invoice Viewer where you can click 'Print' or 'Download PDF' with your customized purchase invoice template."
      ]
    }
  },

  apply_payment: {
    id: "apply_payment",
    name: "Payment Application & Accounts Receivable/Payable Settlement",
    route: "/invoice (Sales) or /inventory (Purchases)",
    purpose: "Apply full or partial customer payments to sales invoices or vendor bill payments, reducing outstanding balances, updating payment statuses, and updating live receivables/payables.",
    workflow: [
      "For Sales Invoices: Open `/invoice`, click 'History' (or locate the invoice in the invoices list), and click 'Record Payment' / 'Apply Payment'.",
      "Enter Payment Details: Payment Amount (must be <= remaining balance due), Payment Method (Cash, Bank Transfer, UPI, Cheque, Credit Card), and Payment Date.",
      "Submit: Submits `POST /api/invoice/:id/payment`.",
      "Balance Calculation: Backend computes `newAmountPaid = invoice.amountPaid + paymentAmount` and `newBalanceDue = Math.max(0, grandTotal - newAmountPaid)`.",
      "Status Transition: If `newBalanceDue === 0`, status becomes 'PAID' (badge turns green); if `newAmountPaid > 0` but balance remains, status becomes 'PARTIAL'; otherwise 'PENDING'.",
      "Dashboard Reflection: As balance due drops, Total Receivables on the Dashboard automatically decreases by the exact payment amount.",
      "For Purchase Invoices: In `/inventory`, select the purchase bill, enter payment amount, and submit `POST /api/purchase-invoice/:id/payment` to decrease Total Payables."
    ]
  },

  bookkeeping: {
    id: "bookkeeping",
    name: "Bookkeeping & General Ledger",
    route: "/bookkeeping",
    purpose: "Central single source of truth for financial accounting. Maintains income and expense ledger entries, Chart of Accounts, and feeds Profit & Loss, Balance Sheet, and Cash Flow calculations.",
    workflow: [
      "Navigate to `/bookkeeping`.",
      "Manual Entry: Click 'Add Transaction' to log an Income or Expense entry with Date, Category (e.g., Salaries, Rent, Utilities, Consulting), Amount, Payment Mode, and Description.",
      "Automated Entries: When you create a sales invoice, the system automatically writes an income entry under 'Sales'. When you create a purchase invoice, it writes an expense entry under 'Purchases'.",
      "General Ledger: View running balances, filter by category or date range.",
      "Chart of Accounts: View standard asset, liability, equity, revenue, and expense accounts (`LedgerAccount`)."
    ],
    calculations: "Net Income = Total Bookkeeping Income - Total Bookkeeping Expenses. This feeds directly into Net Profit on the Dashboard and Profit & Loss statement."
  },

  dashboard_overview: {
    id: "dashboard_overview",
    name: "Dashboard & Executive Overview",
    route: "/dashboard",
    purpose: "Real-time executive summary of business health, key KPIs, receivables, payables, net profit, GST liabilities, and AI CFO assistant.",
    metricsExplanation: {
      "total_payables": "Sum of all unpaid balances on open purchase invoices in the selected period (`balance = total - paid`). Cancelled and deleted bills are excluded.",
      "total_receivables": "Sum of all unpaid balances owed by customers on open sales invoices in the selected period (`balanceDue = grandTotal - amountPaid`). Paid and cancelled invoices are excluded.",
      "net_profit": "Dynamic calculation from `getFinanceMetrics`: `Total Revenue (Sales + Inventory Sales + Other Income) - Total Operating Expenses (COGS + Salaries + Rent + Utilities + etc.)`.",
      "gst_payable": "Output GST collected on sales minus Input Tax Credit (ITC) on vendor purchases. If output > input, shows net tax payable to the government.",
      "working_capital": "Current Assets (Cash/Bank + Receivables + Inventory) minus Current Liabilities (Accounts Payable)."
    }
  },

  bank_reconciliation: {
    id: "bank_reconciliation",
    name: "Bank Reconciliation",
    route: "/bank-reconciliation",
    purpose: "Match internal accounting transactions against imported bank account statements, identify timing differences, unrecorded transactions, and verify book balance accuracy.",
    workflow: [
      "Navigate to `/bank-reconciliation`.",
      "Create a Reconciliation Session: Enter Session Name and Statement Period.",
      "Upload Files: Upload your Bank Statement (Excel/CSV format) and optionally your Internal Ledger file.",
      "Automatic Match Engine: System executes fuzzy matching comparing date, amount, transaction type (debit/credit), and reference keywords.",
      "Review Matches: Transactions are categorized into Matched (Green), Unmatched in Bank Statement (Yellow), and Unmatched in Ledger (Red).",
      "Manual Matching & Adjustment: Users can manually pair transactions or add adjusting entries for bank fees, interest, or direct deposits.",
      "Export: Download reconciliation certificates and discrepancy reports in Excel or PDF format."
    ]
  },

  inventory_management: {
    id: "inventory_management",
    name: "Inventory & Stock Management",
    route: "/inventory",
    purpose: "Track product stock on hand, SKUs, cost prices, selling prices, stock valuation, reorder levels (<10 units), and POS sales.",
    workflow: [
      "Navigate to `/inventory`.",
      "Add Stock Item: Enter Item Name, SKU/Code, Category, Quantity, Cost/Buy Price, Selling Price, and GST Rate.",
      "Automatic Inflow: Purchase invoices automatically increment stock for matching SKUs/names.",
      "Automatic Outflow: Sales invoices reserve/deduct stock upon finalized save.",
      "Stock Valuation: Computed as `Sum of (Quantity × Cost Price)` across all active inventory items.",
      "Reorder Alerts: Items with quantity under 10 units are automatically flagged as Low Stock."
    ]
  },

  tax_gst: {
    id: "tax_gst",
    name: "Tax & GST Management",
    route: "/tax-gst",
    purpose: "Calculate GST liabilities, verify Input Tax Credit (ITC), track CGST/SGST/IGST breakdown, and prepare GSTR-1 and GSTR-3B filings.",
    workflow: [
      "Navigate to `/tax-gst`.",
      "GST Calculation: Intrastate transactions (same state) split GST 50/50 into CGST and SGST. Interstate transactions apply IGST.",
      "Centralized Analytics: Aggregates sales invoices, POS sales, and purchase invoices for the reporting period.",
      "Net Tax Liability: `Net GST Payable = Output GST (Sales) - Input GST (Purchases/ITC)`. If input exceeds output, credit carries forward.",
      "Download Reports: Export GST returns in JSON portal format or CSV."
    ]
  },

  profit_loss: {
    id: "profit_loss",
    name: "Profit and Loss Statement (P&L)",
    route: "/profit-loss",
    purpose: "Comprehensive income statement summarizing revenue, cost of goods sold, operating expenses, and net profit with AI financial insights.",
    workflow: [
      "Navigate to `/profit-loss`.",
      "Select reporting period (this-month, last-month, this-quarter, this-year, or custom dates).",
      "Dynamic Generation: Calls `/api/profitloss/generate` which aggregates central Bookkeeping entries and sales records.",
      "Breakdown: Displays Sales Revenue, COGS/Materials, Salaries, Rent, Utilities, Finance Cost, Depreciation, and Amortization.",
      "Metrics: Computes Net Profit and Net Profit Margin %.",
      "Export: Download structured P&L PDF reports."
    ]
  },

  balance_sheet: {
    id: "balance_sheet",
    name: "Balance Sheet",
    route: "/balance-sheet",
    purpose: "Statement of financial position showing Total Assets, Total Liabilities, and Owner Equity enforcing the fundamental accounting equation: Assets = Liabilities + Equity.",
    workflow: [
      "Navigate to `/balance-sheet`.",
      "Select reporting period.",
      "Current Assets: Cash & Bank balances (cumulative bookkeeping inflow - outflow) + Accounts Receivable (unpaid customer invoices) + Inventory Stock Valuation.",
      "Current Liabilities: Accounts Payable (unpaid vendor bills).",
      "Equity: Owner Capital + Retained Earnings (accumulated net income).",
      "Balanced Check: Verifies `Total Assets === Total Liabilities + Total Equity`."
    ]
  },

  cash_flow_forecasting: {
    id: "cash_flow_forecasting",
    name: "Cash Flow Forecasting & Prediction",
    route: "/cashflow",
    purpose: "Predict future cash inflows, outflows, and net cash balances for the next 6 months using historical regression models.",
    workflow: [
      "Navigate to `/cashflow`.",
      "The system analyzes past 6 months of historical transaction inflows and outflows from Bookkeeping entries.",
      "Linear regression model calculates slope and intercept trends.",
      "Generates 6-month projected monthly inflow, outflow, and net cash flow with clear estimate labeling."
    ]
  },

  payroll: {
    id: "payroll",
    name: "Payroll & Employee Compensation",
    route: "/payroll",
    purpose: "Manage employee profiles, calculate gross salaries, statutory deductions (PF, ESI, Tax/TDS), and generate monthly pay slips.",
    workflow: [
      "Navigate to `/payroll`.",
      "Add Employee: Enter Employee Name, ID, Department, Role, Experience, and salary breakdown (Basic, DA, HRA, Travel, Allowances, Bonuses).",
      "Deductions: Enter PF Deduction, EPF Deduction, ESI Deduction, and Tax Deduction.",
      "Net Salary: Automatically computed as `Gross Salary - Total Deductions`.",
      "Pay Slip: Download or print employee monthly pay slips."
    ],
    security: "Restricted to administrators. Store associates and in-store roles are blocked from accessing payroll records."
  },

  financial_ratios: {
    id: "financial_ratios",
    name: "Financial Ratios Analysis",
    route: "/financial-ratios",
    purpose: "Automated calculation and benchmarking of liquidity, leverage, efficiency, and profitability ratios.",
    ratios: [
      "Current Ratio (Current Assets / Current Liabilities) — benchmark >= 1.50.",
      "Quick Ratio ((Current Assets - Inventory) / Current Liabilities) — benchmark >= 1.00.",
      "Debt-to-Equity (Total Debt / Total Equity) — benchmark <= 2.00.",
      "Net Profit Margin (Net Income / Revenue × 100).",
      "Gross Profit Margin ((Revenue - COGS) / Revenue × 100).",
      "Return on Equity (ROE) and Return on Assets (ROA)."
    ]
  },

  fraud_detection: {
    id: "fraud_detection",
    name: "Fraud Detection & Risk Audit",
    route: "/fraud-detection",
    purpose: "Automated anomaly detection across transactions, flagging high-risk patterns, duplicate billing, and unusual transaction amounts.",
    workflow: [
      "Navigate to `/fraud-detection`.",
      "Upload or scan transactions.",
      "Configurable rules: Velocity checks, high-value thresholds, duplicate amount/time checks, off-hours transactions.",
      "Risk Scoring: Each transaction receives a risk score (0-100); transactions exceeding threshold are flagged for manual review."
    ]
  },

  civil_engineering: {
    id: "civil_engineering",
    name: "Civil Engineering Project Scheduling (CPM)",
    route: "/civil-engineering",
    purpose: "Project scheduling using Critical Path Method (CPM), activity duration estimation, milestone tracking, and project budget estimation.",
    workflow: [
      "Navigate to `/civil-engineering`.",
      "Create Project: Enter Project Name, Description, and Budget.",
      "Add Activities: Specify Activity Name, Predecessors, and Duration (days).",
      "Calculate CPM: Computes Early Start (ES), Early Finish (EF), Late Start (LS), Late Finish (LF), Slack/Float, and identifies the Critical Path.",
      "Gantt & Progress: Tracks milestones and budget utilization against actual spend."
    ]
  },

  customer_management: {
    id: "customer_management",
    name: "Customer Management & Client Records",
    route: "/invoice (Customer Details section)",
    purpose: "Store and manage customer profiles, contact numbers, email addresses, billing and shipping addresses, GSTIN numbers, and payment terms for seamless invoicing and Accounts Receivable tracking.",
    workflow: [
      "Navigate to `/invoice` (or create a customer via `POST /api/customer`).",
      "In the Customer Details form, enter: Customer Name (Mandatory), Email, Phone Number, Billing Address, Shipping Address, and Customer GSTIN.",
      "Place of Supply & Terms: Select State / Place of Supply and Default Payment Terms (e.g., 'Due on Receipt', 'Net 15', 'Net 30').",
      "Saving Customer: When you save a sales invoice for a new customer or submit through customer management, the record persists in the `Customer` database collection.",
      "Auto-fill & Reuse: Returning customers are automatically suggested by name/phone with their saved GSTIN and addresses auto-populated.",
      "Accounts Receivable Link: Every open invoice issued to this customer automatically aggregates under their profile and contributes to Total Receivables."
    ]
  },

  supplier_management: {
    id: "supplier_management",
    name: "Supplier & Vendor Management",
    route: "/inventory (Purchase Invoices tab)",
    purpose: "Manage vendor contacts, supplier GSTINs, state of supply, and payment records for raw material purchases and Accounts Payable settlement.",
    workflow: [
      "Navigate to `/inventory` and click the 'Purchase Invoices' or 'Vendor Bills' tab.",
      "Click 'Create Purchase Bill' / 'Add Purchase Invoice'.",
      "Supplier Details: Enter Supplier Name (Mandatory), Supplier Phone Number, and Supplier GSTIN.",
      "State of Supply: Select Supplier State and Place of Supply to determine Intrastate (CGST+SGST) vs Interstate (IGST) tax credit.",
      "Bill Reference: Enter Vendor Bill Number, Bill Date, and Due Date.",
      "Accounts Payable Tracking: Unpaid balances on saved vendor bills automatically aggregate by supplier and reflect in Total Payables and supplier-wise aging summaries."
    ]
  },

  profile_settings: {
    id: "profile_settings",
    name: "Profile & Business Settings",
    route: "/profile",
    purpose: "Configure company profile, seller details, GSTIN, bank details, and authorised digital signatures that populate invoices and reports.",
    workflow: [
      "Navigate to `/profile`.",
      "Seller Details: Company Name, Phone, Email, GSTIN, State, and Address.",
      "Bank Details: Bank Name, Account Type (Current/Savings), Account Number, and IFSC Code.",
      "Authorised Signature: Upload or specify signature label.",
      "Impact: These details automatically populate on Sales Invoices, Purchase Invoices, and PDF exports."
    ]
  },

  ai_financial_assistant: {
    id: "ai_financial_assistant",
    name: "SaaISS AI CFO & Financial Assistant",
    route: "/dashboard",
    purpose: "Professional, database-connected AI Chief Financial Officer and Application Expert providing authoritative live company financial numbers with exact dashboard parity, calculation explanations, and verified workflow guidance.",
    workflow: [
      "Open the SaaISS Dashboard at `/dashboard` or click the AI Assistant chat icon in the navigation bar.",
      "Ask any question about your company finances (e.g., 'What is my Total Payables?', 'Show profit and loss', 'Compare expenses with last month').",
      "Exact Dashboard Parity: The AI CFO executes the exact same underlying calculation pipeline as your dashboard cards (e.g., `getTotalPayables`, `getTotalReceivables`, `getProfitAndLoss`), guaranteeing consistent numbers.",
      "Application Expert: Ask how any feature works (e.g., 'Explain how invoice creation works', 'How does bank reconciliation work?'), and the assistant provides verified step-by-step instructions from the codebase.",
      "Tenant Security & Scoping: All queries are strictly scoped to your authenticated company context via JWT authentication."
    ]
  }
};

/**
 * Keyword & semantic search over application knowledge base
 */
export const searchApplicationKnowledge = (query) => {
  if (!query) return null;
  const q = String(query).toLowerCase().trim();

  // 0. Non-existent / Unsupported features check
  if (
    /\b(crypto|cryptocurrency|bitcoin|btc|ethereum|eth|blockchain|web3|nft|token trading|shopify|amazon fba|dropship|dropshipping|forex|stock trading|binance|coinbase)\b/.test(q)
  ) {
    return {
      category: "unsupported_feature",
      topic: "Unsupported Capability",
      content: [
        "SaaISS is a dedicated AI financial accounting, invoicing, tax, and business management platform.",
        "It does not support cryptocurrency trading, token wallets, or external e-commerce dropshipping integrations.",
        "Supported capabilities include: Sales Invoicing, Purchase Invoicing, Bookkeeping & General Ledger, Profit & Loss, Balance Sheet, Cash Flow Forecasting, Inventory Management, GST & Tax Analytics, Bank Reconciliation, Payroll, and Financial Ratios."
      ]
    };
  }

  // 1. Combined questions (e.g., Invoice creation + Impact on Receivables)
  if (
    /\b(invoice creation.*(receivable|impact)|impact.*receivable.*invoice|how.*invoice.*affects?.*receivable)\b/.test(q)
  ) {
    return {
      category: "combined",
      combinedType: "receivables",
      module: APPLICATION_MODULES.sales_invoice,
      topic: "Invoice Creation Workflow & Impact on Total Receivables",
      content: [
        "**1. Sales Invoice Creation Workflow (`/invoice`)**:",
        "  • Navigate to `/invoice` and click 'Create Invoice'.",
        "  • Select or enter Customer Name, Invoice Date, Due Date, and line items (product, quantity, rate, GST).",
        "  • The system validates required fields and computes Subtotal, GST (CGST/SGST or IGST), and Grand Total.",
        "  • Click 'Save Invoice' to finalize and persist the invoice in the database.",
        "",
        "**2. Direct Impact on Total Receivables**:",
        "  • When you save a sales invoice with an outstanding balance (`balanceDue > 0`), the invoice is recorded as an open Account Receivable.",
        "  • Your **Total Receivables** on the Dashboard immediately increases by the unpaid balance (`balanceDue`).",
        "  • Automated Bookkeeping: An income ledger entry is recorded under category 'Sales'.",
        "  • When the customer pays and you click 'Record Payment' via the Apply Payment modal (`POST /api/invoice/:id/payment`), the balance due decreases and **Total Receivables** is reduced by the payment amount immediately."
      ]
    };
  }

  // 1b. Combined question: Explain Payables calculation + Live Total Payables
  if (
    /\b(explain.*(how )?payables.*calculated.*(and )?(show|what is|my).*payables|how.*payables.*calculated.*(and )?(show|what is|my).*payables)\b/.test(q)
  ) {
    return {
      category: "combined",
      combinedType: "payables",
      module: APPLICATION_MODULES.purchase_invoice,
      topic: "How Payables Are Calculated & Live Total Payables",
      content: [
        "In SaaISS, **Total Payables** represents the total unpaid balance your business owes to suppliers for vendor purchases.",
        "**Formula**: `Total Payables = Sum of (Bill Total - Amount Paid)` across all open purchase invoices in the reporting period.",
        "**Exclusions**: Cancelled bills and deleted purchase invoices are strictly excluded.",
        "**Authoritative Source**: Both the Dashboard KPI card and the AI CFO query the shared backend calculation pipeline in `getTotalPayables`."
      ]
    };
  }

  // 2. Print & Download Invoices (Generic, Sales & Purchase)
  if (
    /\b(how.*(print|download).*invoice|print.*invoice|download.*invoice|invoice.*pdf)\b/.test(q)
  ) {
    if (/\b(purchase|vendor|supplier|bill)\b/.test(q)) {
      return {
        category: "workflow",
        module: APPLICATION_MODULES.purchase_invoice,
        topic: "Print & Download Purchase Invoices",
        content: APPLICATION_MODULES.purchase_invoice.troubleshooting.how_to_print_download
      };
    }
    return {
      category: "workflow",
      module: APPLICATION_MODULES.sales_invoice,
      topic: "How to Print & Download Invoices",
      content: [
        "**For Sales Invoices (`/invoice`)**:",
        "1. Open the Sales Invoice module at `/invoice`.",
        "2. In the invoice editor or the 'History' drawer, locate the desired invoice.",
        "3. Click the **'Print'** button to launch your system's browser print dialog directly.",
        "4. Click **'Download PDF'** to export the invoice as a formatted, GST-compliant PDF file incorporating your company branding and bank details from Profile.",
        "",
        "**For Purchase Invoices (`/inventory`)**:",
        "1. Navigate to `/inventory` and select the **'Purchase Invoices'** tab.",
        "2. Click the **'View'** or **'PDF'** action icon on any bill row to open the Purchase Invoice Viewer.",
        "3. Click **'Print'** or **'Download PDF'** to generate the document."
      ]
    };
  }

  // 3. Difference between Sales Invoices and Purchase Invoices
  if (
    /\b(difference between.*(sales|customer).*(and|vs).*(purchase|vendor|bill).*invoices?|sales.*vs.*purchase.*invoices?)\b/.test(q)
  ) {
    return {
      category: "accounting_concept",
      topic: "Difference Between Sales Invoices and Purchase Invoices",
      content: [
        "In SaaISS, **Sales Invoices** and **Purchase Invoices** serve distinct roles in your accounting workflow:",
        "",
        "**1. Sales Invoices (`/invoice`)**:",
        "  • **Purpose**: Issued to customers for products or services delivered (Revenue / Income).",
        "  • **Accounting Impact**: Generates **Accounts Receivable (AR)** — money customers owe to your business. Unpaid balances directly increase Total Receivables on your Dashboard.",
        "  • **Inventory Impact**: Deducts stock quantities from your inventory when the invoice is finalized.",
        "  • **GST Effect**: Computes and collects **Output GST** (tax you owe to the government).",
        "",
        "**2. Purchase Invoices (`/inventory` → Purchase Invoices)**:",
        "  • **Purpose**: Received from vendors and suppliers for raw materials, inventory, or expenses.",
        "  • **Accounting Impact**: Generates **Accounts Payable (AP)** — liabilities your business owes to suppliers. Unpaid balances directly increase Total Payables on your Dashboard.",
        "  • **Inventory Impact**: Automatically adds or increments stock quantities in your inventory records.",
        "  • **GST Effect**: Records **Input Tax Credit (ITC)** (tax paid that offsets your output GST liability)."
      ]
    };
  }

  // 4. Direct Purchase Invoice creation queries (checked before sales invoice to avoid substring capture)
  if (
    !/\b(print|download|pdf)\b/.test(q) &&
    /\b(purchase invoice creation|how.*(create|make|add|enter|issue).*purchase|create.*purchase|make.*purchase.*bill|enter.*purchase|add.*purchase|how.*create.*(vendor|supplier).*bill)\b/.test(q)
  ) {
    return {
      category: "workflow",
      module: APPLICATION_MODULES.purchase_invoice,
      topic: "Purchase Invoice Creation Workflow",
      content: APPLICATION_MODULES.purchase_invoice.creationWorkflow
    };
  }

  // 5a. Specific Canonical Q1: Explain how invoice creation works
  if (/\bexplain.*invoice.*creation\b/i.test(q)) {
    return {
      category: "workflow",
      isQaRecord: true,
      id: "qa_invoice_creation",
      module: APPLICATION_MODULES.sales_invoice,
      topic: "Sales Invoice Creation Workflow",
      answer: "Invoice creation in your SaaISS accounting software works by entering customer details, adding products or services, calculating taxes and totals, and saving the invoice. Once created, the invoice should update the relevant accounting records and dashboard automatically.\n\n## Invoice creation — step by step\n\n1. Create a new invoice\n\nThe user opens the Sales Invoice module (/invoice) and clicks Create Invoice.\n\n2. Enter invoice details\n\nCustomer Details: Select the customer and enter the invoice number, invoice date, due date, customer GSTIN, billing address and other required details.\n\n3. Add items or services\n\nSelect the product or service, item code, HSN/SAC code, quantity, unit price, discount and applicable GST rate.\n\n4. Calculate the invoice total\n\nThe system calculates the subtotal, discounts, applicable CGST/SGST or IGST, and final payable amount. The tax type depends on the transaction and applicable GST rules.\n\n5. Save the invoice\n\nValidate the required fields (Validation & Business Rules), click Save Invoice to persist to the database, assign a unique invoice number and display the saved invoice in Invoice History.\n\n6. Update the accounting system\n\nThe saved invoice triggers the central Accounting Engine, which updates the relevant ledger entries, accounts receivable, sales revenue, GST payable and inventory records when applicable.\n\n7. Update reports and dashboard\n\nThe dashboard, Profit & Loss, Balance Sheet, GST reports and customer outstanding balances reflect the transaction according to their accounting rules. The user can print, download or share the invoice.\n\n## Example\n\nSuppose you create an invoice for a customer:\n\n| Item             | Amount  |\n| ---------------- | ------- |\n| Product subtotal | ₹10,000 |\n| GST at 18%       | ₹1,800  |\n| Invoice total    | ₹11,800 |\n| Amount paid      | ₹5,000  |\n| Amount due       | ₹6,800  |\n\nThe software should record ₹11,800 as the invoice total, ₹5,000 as the payment received and ₹6,800 as the outstanding amount. The payment must also be recorded in the appropriate accounts.\n\n## Correct backend workflow for your SaaISS project\n\nSales Invoice Form\n\nCustomer + Items + GST + Totals\n\nInvoice Validation & Database\n\nSave invoice and unique invoice ID\n\nCentral Accounting Engine\n\nProcess the invoice transaction once\n\nGeneral Ledger\n\nAccounts Receivable\n\nGST & Tax Reports\n\nInventory\n\nDashboard & Financial Reports\n\nSales • P&L • Balance Sheet • Outstanding • Cash Flow\n\nImportant: Creating an invoice is not the same as receiving payment. The system must keep the invoice total, amount paid and amount due consistent across the invoice form, Invoice History, downloaded PDF, customer ledger and dashboard. Inventory should also update according to the configured transaction and stock rules.\n\nThis is the intended workflow; the actual implementation in your live application needs to be checked separately to confirm every step is working correctly."
    };
  }

  // 5b. Direct Sales Invoice creation queries (strictly excludes purchase queries)
  if (
    !/\b(purchase|vendor|supplier|bill)\b/.test(q) &&
    /\b(how.*(create|make|issue|generate).*invoice|how.*invoice.*creation.*works?|how.*create.*sales.*invoice|invoice creation)\b/.test(q)
  ) {
    return {
      category: "workflow",
      module: APPLICATION_MODULES.sales_invoice,
      topic: "Sales Invoice Creation Workflow",
      content: APPLICATION_MODULES.sales_invoice.creationWorkflow
    };
  }

  // 6. Post-save purchase invoice behavior
  if (
    /\b(what happens.*(after|when).*(save|saving).*purchase|after.*(save|saving).*purchase.*invoice)\b/.test(q)
  ) {
    return {
      category: "post_save",
      module: APPLICATION_MODULES.purchase_invoice,
      topic: "What Happens When You Save a Purchase Invoice",
      content: APPLICATION_MODULES.purchase_invoice.postSaveEffects
    };
  }

  // 7. Post-save sales invoice behavior
  if (
    /\b(after.*(save|saving).*invoice|what happens.*after.*(save|saving).*sales|what happens after i save a sales invoice|how.*persists?.*invoice)\b/.test(q)
  ) {
    return {
      category: "post_save",
      module: APPLICATION_MODULES.sales_invoice,
      topic: "What Happens After Saving a Sales Invoice",
      content: APPLICATION_MODULES.sales_invoice.postSaveEffects
    };
  }

  // 5. Payment Application
  if (
    /\b(apply.*payment|record.*payment|how.*apply.*payment|how.*payment.*work|payment application|receive.*payment)\b/.test(q)
  ) {
    return {
      category: "workflow",
      module: APPLICATION_MODULES.apply_payment,
      topic: "Apply Payment & Balance Settlement Workflow",
      content: APPLICATION_MODULES.apply_payment.workflow
    };
  }

  // 6. Troubleshooting: Why balance not decreasing
  if (
    /\b(balance.*not (decreasing|updating|changing)|payment.*not (updating|reducing)|why.*balance.*due)\b/.test(q)
  ) {
    return {
      category: "troubleshooting",
      module: APPLICATION_MODULES.sales_invoice,
      topic: "Troubleshooting: Invoice Balance Not Decreasing",
      content: APPLICATION_MODULES.sales_invoice.troubleshooting.why_balance_not_decreasing
    };
  }

  // 7. Troubleshooting: Why invoice not saving
  if (
    /\b(invoice.*not saving|why.*cannot save invoice|error saving invoice)\b/.test(q)
  ) {
    return {
      category: "troubleshooting",
      module: APPLICATION_MODULES.sales_invoice,
      topic: "Troubleshooting: Invoice Not Saving",
      content: APPLICATION_MODULES.sales_invoice.troubleshooting.why_invoice_not_saving
    };
  }

  // 8. Troubleshooting: Why bank details missing from PDF
  if (
    /\b(bank details.*missing|missing.*bank details|pdf.*missing.*bank)\b/.test(q)
  ) {
    return {
      category: "troubleshooting",
      module: APPLICATION_MODULES.sales_invoice,
      topic: "Troubleshooting: Bank Details Missing from PDF",
      content: APPLICATION_MODULES.sales_invoice.troubleshooting.why_bank_details_missing_from_pdf
    };
  }

  // 9. Print & Download Purchase Invoice
  if (
    /\b(print.*purchase|download.*purchase|purchase.*pdf)\b/.test(q)
  ) {
    return {
      category: "workflow",
      module: APPLICATION_MODULES.purchase_invoice,
      topic: "Print & Download Purchase Invoices",
      content: APPLICATION_MODULES.purchase_invoice.troubleshooting.how_to_print_download
    };
  }

  // 10. Bank Reconciliation
  if (/\b(bank reconcil|reconcil.*work|how.*bank.*reconciliation)\b/.test(q)) {
    return {
      category: "workflow",
      module: APPLICATION_MODULES.bank_reconciliation,
      topic: "Bank Reconciliation Workflow",
      content: APPLICATION_MODULES.bank_reconciliation.workflow
    };
  }

  // 11. Bookkeeping
  if (/\b(how.*bookkeeping.*works?|explain.*bookkeeping|bookkeeping process)\b/.test(q)) {
    return {
      category: "workflow",
      module: APPLICATION_MODULES.bookkeeping,
      topic: "Bookkeeping & General Ledger Process",
      content: APPLICATION_MODULES.bookkeeping.workflow
    };
  }

  // 12. Inventory tracking & accounting impact
  if (/\b(how.*inventory.*work|inventory.*affects?.*accounting|stock tracking)\b/.test(q)) {
    return {
      category: "workflow",
      module: APPLICATION_MODULES.inventory_management,
      topic: "Inventory Tracking & Accounting Impact",
      content: [
        ...APPLICATION_MODULES.inventory_management.workflow,
        "Accounting Effect: Purchased stock increases Current Assets on the Balance Sheet. When sold, cost of goods is recognized as COGS in Profit & Loss, while inventory asset is reduced."
      ]
    };
  }

  // 13. GST calculation & workflow
  if (/\b(how.*gst.*work|gst.*calculated|tax.*management.*work)\b/.test(q)) {
    return {
      category: "workflow",
      module: APPLICATION_MODULES.tax_gst,
      topic: "GST Calculation & Workflow",
      content: APPLICATION_MODULES.tax_gst.workflow
    };
  }

  // 14. Payroll workflow
  if (/\b(how.*payroll.*work|payroll.*processing)\b/.test(q)) {
    return {
      category: "workflow",
      module: APPLICATION_MODULES.payroll,
      topic: "Payroll Processing Workflow",
      content: APPLICATION_MODULES.payroll.workflow
    };
  }

  // 15. Financial Ratios explanation
  if (/\b(how.*financial ratios.*calculated|explain.*financial ratios)\b/.test(q)) {
    return {
      category: "workflow",
      module: APPLICATION_MODULES.financial_ratios,
      topic: "Financial Ratios Calculations & Benchmarks",
      content: APPLICATION_MODULES.financial_ratios.ratios
    };
  }

  // 16. Cash Flow Forecasting
  if (/\b(how.*cash flow forecast.*work|cash flow prediction.*work)\b/.test(q)) {
    return {
      category: "workflow",
      module: APPLICATION_MODULES.cash_flow_forecasting,
      topic: "Cash Flow Forecasting Workflow",
      content: APPLICATION_MODULES.cash_flow_forecasting.workflow
    };
  }

  // 17. Fraud Detection
  if (/\b(how.*fraud detection.*work|fraud detection.*process)\b/.test(q)) {
    return {
      category: "workflow",
      module: APPLICATION_MODULES.fraud_detection,
      topic: "Fraud Detection & Risk Audit Workflow",
      content: APPLICATION_MODULES.fraud_detection.workflow
    };
  }

  // 18. How the AI Financial Assistant works
  if (/\b(how.*(ai.*assistant|ai.*cfo).*works?|explain.*(ai.*assistant|ai.*cfo))\b/.test(q)) {
    return {
      category: "workflow",
      module: APPLICATION_MODULES.ai_financial_assistant,
      topic: "How the SaaISS AI CFO Works",
      content: APPLICATION_MODULES.ai_financial_assistant.workflow
    };
  }

  // 19. Company profile and bank details configuration
  if (/\b(configure.*(profile|bank details|company details)|how.*(set up|configure|update).*profile)\b/.test(q)) {
    return {
      category: "workflow",
      module: APPLICATION_MODULES.profile_settings,
      topic: "Company Profile & Bank Details Configuration",
      content: APPLICATION_MODULES.profile_settings.workflow
    };
  }

  // 20. P&L vs Balance Sheet concept
  if (
    /\b(difference between.*(profit and loss|p&l).*balance sheet|p&l.*vs.*balance sheet)\b/.test(q)
  ) {
    return {
      category: "accounting_concept",
      topic: "Difference Between Profit & Loss and Balance Sheet",
      content: [
        "**Profit and Loss Statement (P&L)**: Measures financial performance over a period of time (e.g., month, quarter, year). Formula: `Net Profit = Total Revenue - Total Operating Expenses`. It tells you whether the business earned a profit or incurred a loss during that timeframe.",
        "**Balance Sheet**: A snapshot of financial position at a single point in time (as of a specific reporting date). Formula: `Total Assets = Total Liabilities + Total Equity`. It reveals what the company owns (Assets), what it owes (Liabilities), and net worth (Equity).",
        "**Connection**: Net Profit from the P&L flows directly into the Balance Sheet under **Retained Earnings** within Equity, balancing the books."
      ]
    };
  }

  // 21. How Total Payables is calculated
  if (/\b(how is total payables calculated|how.*payables.*calculated|explain.*total payables metric)\b/.test(q)) {
    return {
      category: "calculation_explanation",
      topic: "How Total Payables is Calculated",
      content: [
        "In SaaISS, **Total Payables** represents the total unpaid balance your business owes to suppliers for vendor purchases.",
        "**Formula**: `Total Payables = Sum of (Bill Total - Amount Paid)` across all open purchase invoices in the reporting period.",
        "**Exclusions**: Cancelled bills and deleted purchase invoices are strictly excluded.",
        "**Authoritative Source**: The figure displayed on the Dashboard KPI card and provided by the AI CFO comes from the exact same calculation pipeline in `getTotalPayables`."
      ]
    };
  }

  // 22. How Total Receivables is calculated
  if (/\b(how is total receivables calculated|how.*receivables.*calculated|explain.*total receivables metric)\b/.test(q)) {
    return {
      category: "calculation_explanation",
      topic: "How Total Receivables is Calculated",
      content: [
        "In SaaISS, **Total Receivables** represents the total unpaid balance customers owe to you for billed sales invoices.",
        "**Formula**: `Total Receivables = Sum of (Invoice Grand Total - Amount Paid)` across all open sales invoices in the reporting period.",
        "**Exclusions**: Cancelled invoices and fully paid invoices (`status: 'paid'`) are excluded.",
        "**Authoritative Source**: Matches the Dashboard card calculation in `getTotalReceivables`."
      ]
    };
  }

  // 23. Net Profit metric explanation on dashboard
  if (
    /\b(net profit.*(metric|mean|meaning|dashboard)|what does.*net profit.*mean|explain.*net profit.*metric)\b/.test(q)
  ) {
    return {
      category: "calculation_explanation",
      topic: "Dashboard Net Profit Metric Explanation",
      content: [
        "On your SaaISS Dashboard, **Net Profit** represents your company's actual bottom-line profitability after accounting for all revenues and operating expenses.",
        "**Calculation Formula**: `Net Profit = Total Operating Revenue - Total Operating Expenses`.",
        "• **Total Revenue**: Includes sales invoice revenue, recorded customer payments, direct inventory sales, and other income entries logged in bookkeeping.",
        "• **Total Expenses**: Includes cost of goods sold (COGS), purchase vendor bills, and operating overheads (rent, salaries, utilities, software, marketing) from bookkeeping entries.",
        "**Indicator**: If revenue exceeds expenses, the KPI card indicates **Profitable (✅)**. If expenses exceed revenue, it alerts **Operating at Loss (⚠️)**.",
        "**Authoritative Source**: Generated directly by `getFinanceMetrics` in `financeAggregator.js`, ensuring exact consistency across the executive dashboard, P&L reports, and AI CFO queries."
      ]
    };
  }

  // 24. Customer Management: Add/Create Customer
  if (
    /\b(how.*(add|create|enter|save).*customer|create.*customer|add.*customer|new customer workflow)\b/.test(q)
  ) {
    return {
      category: "workflow",
      module: APPLICATION_MODULES.customer_management,
      topic: "Customer Creation & Management Workflow",
      content: APPLICATION_MODULES.customer_management.workflow
    };
  }

  // 25. Supplier / Vendor Management: Add/Create Supplier
  if (
    /\b(how.*(add|create|enter|save).*(supplier|vendor)|create.*(supplier|vendor)|add.*(supplier|vendor)|new (supplier|vendor) workflow)\b/.test(q)
  ) {
    return {
      category: "workflow",
      module: APPLICATION_MODULES.supplier_management,
      topic: "Supplier & Vendor Management Workflow",
      content: APPLICATION_MODULES.supplier_management.workflow
    };
  }

  // 26. Inventory stock flow after purchase or sale
  if (
    /\b(how.*inventory.*update.*after.*(purchase|sale)|inventory.*flow|how.*stock.*update.*(purchase|sale))\b/.test(q)
  ) {
    return {
      category: "workflow",
      module: APPLICATION_MODULES.inventory_management,
      topic: "How Inventory Updates After a Purchase or Sale",
      content: [
        "**1. After Saving a Purchase Invoice (`/inventory` → Purchase Invoices)**:",
        "  • Inflow: The backend (`POST /api/purchase-invoice/create`) automatically updates stock in the `InventoryItem` collection.",
        "  • If the SKU or Item Name matches an existing item, its stock quantity is increased by the purchased amount and cost price is updated.",
        "  • If it is a new item, a new `InventoryItem` record is created.",
        "  • Accounting Impact: Increases Current Assets (Inventory Valuation) and logs an Expense Bookkeeping entry under 'Purchases'.",
        "",
        "**2. After Saving a Sales Invoice (`/invoice`)**:",
        "  • Outflow: For finalized sales invoices, matching items in inventory have their stock deducted via `POST /api/inventory/reserve/:id`.",
        "  • If inventory quantity falls below 10 units, the system automatically marks the product with a 'Low Stock' alert on the Inventory dashboard.",
        "  • Accounting Impact: Recognizes Cost of Goods Sold (COGS) and records an Income Bookkeeping entry under 'Sales'."
      ]
    };
  }

  // 27. How to generate Profit and Loss report
  if (
    /\b(how.*(generate|view|get|export).*profit and loss|how.*(generate|view|get|export).*p&l|generate.*(profit and loss|p&l).*report)\b/.test(q)
  ) {
    return {
      category: "workflow",
      module: APPLICATION_MODULES.profit_loss,
      topic: "How to Generate a Profit and Loss Report",
      content: [
        ...APPLICATION_MODULES.profit_loss.workflow,
        "**Direct Integration**: The numbers shown on the P&L report originate from the exact same central `getFinanceMetrics` function as the Dashboard Net Profit card and the AI CFO."
      ]
    };
  }

  return null;
};

/**
 * Formats a knowledge base search result into clear, structured Markdown.
 */
export const formatKnowledgeAnswer = (knowledge) => {
  if (!knowledge) return "";

  if (knowledge.isQaRecord) {
    if (knowledge.id === "qa_invoice_creation" || knowledge.canonicalQuestion === "Explain how invoice creation works.") {
      return knowledge.answer;
    }
    const steps = knowledge.navigationSteps && knowledge.navigationSteps.length > 0
      ? `\n\n**Verified Navigation Steps:**\n` + knowledge.navigationSteps.map((s, idx) => `${idx + 1}. ${s}`).join("\n")
      : "";
    const moduleName = typeof knowledge.module === "object" ? (knowledge.module?.name || knowledge.module?.id) : knowledge.module;
    const route = knowledge.route || (typeof knowledge.module === "object" ? knowledge.module?.route : "");

    return (
      `### ${knowledge.canonicalQuestion}\n\n` +
      (moduleName ? `**Module:** ${moduleName}${route ? ` (\`${route}\`)` : ""}\n\n` : "") +
      knowledge.answer +
      steps
    );
  }

  if (knowledge.category === "unsupported_feature") {
    return (
      `### Notice: ${knowledge.topic}\n\n` +
      knowledge.content.join("\n\n")
    );
  }

  if (knowledge.category === "combined") {
    return (
      `### ${knowledge.topic}\n\n` +
      knowledge.content.join("\n")
    );
  }

  if (knowledge.category === "troubleshooting") {
    const steps = knowledge.content.map((step, idx) => `${idx + 1}. ${step}`).join("\n");
    return (
      `### ${knowledge.topic}\n\n` +
      (knowledge.module ? `**Module:** ${knowledge.module.name} (\`${knowledge.module.route}\`)\n\n` : "") +
      `**Troubleshooting Steps & Checklist:**\n\n` +
      steps
    );
  }

  if (knowledge.category === "workflow" || knowledge.category === "post_save") {
    const steps = knowledge.content.map((step, idx) => `${idx + 1}. ${step}`).join("\n");
    const rules = knowledge.module?.validationRules
      ? `\n\n**Validation & Business Rules:**\n` + knowledge.module.validationRules.map(r => `- ${r}`).join("\n")
      : "";
    return (
      `### ${knowledge.topic}\n\n` +
      (knowledge.module ? `**Module:** ${knowledge.module.name} (\`${knowledge.module.route}\`)\n\n` : "") +
      `**Verified Steps:**\n\n` +
      steps +
      rules
    );
  }

  if (knowledge.category === "accounting_concept" || knowledge.category === "calculation_explanation") {
    return (
      `### ${knowledge.topic}\n\n` +
      knowledge.content.join("\n\n")
    );
  }

  return knowledge.content?.join("\n\n") || "";
};
