# System Connection Contract Specification

This document defines the formal connection contracts across modules in the Financial Automation Platform. Each contract details inputs, expected outputs, source of truth, affected modules, associated regression test, and failure conditions.

---

## Connection Contracts Table

| Connection ID | Input | Expected Output | Source of Truth | Affected Modules | Regression Test | Failure Condition |
|---|---|---|---|---|---|---|
| **AUTH-001** | Admin Password | `role = "admin"`, Admin Token | User DB (`password` hash) | Auth, Dashboard | `tests/golden-flow/01_auth.test.js` | Admin password logs in with instore role or fails |
| **AUTH-002** | Store Password | `role = "instore"`, Instore Token | User DB (`storePassword` hash) | Auth, Dashboard, POS | `tests/golden-flow/01_auth.test.js` | Store password logs in with admin role or fails |
| **INV-001** | Stock Create / Update | Item stock quantity updated | Inventory DB (`Item` model) | Inventory | `tests/golden-flow/03_inventory.test.js` | Stock calculation mismatch or negative inventory error |
| **INV-002** | Inventory OTC Sale | Stock reduced, OTC Invoice & Bookkeeping entry created | Inventory & Bookkeeping DB | Inventory, Bookkeeping | `tests/golden-flow/03_inventory.test.js` | Stock reduced without bookkeeping record or double counted |
| **INVOICE-001** | Create / Update Invoice | Invoice saved, Bookkeeping Income entry generated/updated | Invoice & Bookkeeping DB | Invoice, Bookkeeping | `tests/golden-flow/04_invoice.test.js` | Invoice created without bookkeeping sync or incorrect total |
| **PAY-001** | Record Invoice Payment | Invoice paid balance updated, Bookkeeping entry synced, Cash Flow inflow updated | Invoice & Bookkeeping DB | Invoice, Bookkeeping, Cash Flow, Dashboard | `tests/golden-flow/05_payment.test.js` | Payment applies to wrong invoice, creates duplicate entry, or fails cash flow sync |
| **BOOK-001** | Bookkeeping Ledger Data | P&L Total Revenue, Total Expenses, Net Profit calculated correctly | Bookkeeping DB | Bookkeeping, P&L | `tests/golden-flow/07_financial.test.js` | P&L values diverge from Bookkeeping transaction totals |
| **BOOK-002** | Bookkeeping Ledger Data | Balance Sheet Total Assets = Liabilities + Equity | Bookkeeping & Balance DB | Bookkeeping, Balance Sheet | `tests/golden-flow/07_financial.test.js` | Balance sheet equation does not balance |
| **BOOK-003** | Bookkeeping Cash Events | Cash Flow Inflows, Outflows, Net Movement updated | Bookkeeping DB | Bookkeeping, Cash Flow | `tests/golden-flow/07_financial.test.js` | Cash flow statement numbers do not match bookkeeping receipts |
| **BOOK-004** | Financial Statement Data | Current Ratio, Quick Ratio, Debt-to-Equity, Profit Margins computed | Bookkeeping & Statement APIs | Financial Ratios | `tests/golden-flow/07_financial.test.js` | Division by zero error or incorrect ratio output |
| **ANALYTICS-001**| Bookkeeping & Invoice Data | Receivables, Payables, Net Profit summary displayed on Dashboard | Bookkeeping & Invoice DB | Dashboard | `tests/golden-flow/07_financial.test.js` | Dashboard widgets display mismatched or zero values |
| **ROLE-001** | Session JWT Token | `/api/user` returns role matching JWT token (`instore` / `admin`) | JWT Decoded Payload | Auth, User Context, Dashboard | `tests/golden-flow/01_auth.test.js` & `02_role.test.js` | `/api/user` returns `admin` for an `instore` JWT session |
| **DATA-001** | User Request with JWT | API returns ONLY data matching `req.user.id` | Database (`userId` field) | All Modules | `tests/golden-flow/08_data_isolation.test.js` | User B receives data belonging to User A |
| **PLAN-001** | User Subscription Plan | Access granted to allowed modules, blocked for restricted modules | `Plan` model & `authMiddleware` | SubscriptionContext, All Modules | `tests/golden-flow/09_plan.test.js` | Trial plan accesses Payroll/Fraud Detection UI |
| **PLAN-002** | Resource Creation Request | Creation allowed if count < limit, blocked if count >= limit | `Subscription` & DB Count | Invoice, Inventory, Purchase Invoice | `tests/golden-flow/09_plan.test.js` | User creates invoices beyond plan limit |
| **PLAN-003** | Direct HTTP API Access | API returns HTTP 403 Forbidden for restricted module/feature | `checkModuleAccess` & `checkPlanLimit` | Backend Routes | `tests/golden-flow/09_plan.test.js` & `02_role.test.js` | Store user or restricted plan bypasses UI and invokes API directly |
