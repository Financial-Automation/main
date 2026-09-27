# Project Golden Flow & Architectural System Specification

This document defines the permanent, protected business architecture and accounting rules for the Financial Automation Platform.

---

## 1. Authentication Architecture

### Roles & Portals
```
                         +-----------------------+
                         |  Authentication Flow  |
                         +-----------+-----------+
                                     |
               +---------------------+---------------------+
               |                                           |
    [Admin Password Match]                      [Store Password Match]
               |                                           |
      role = "admin"                              role = "instore"
               |                                           |
     +---------v---------+                       +---------v---------+
     |   Admin Portal    |                       |    Store Portal   |
     | (Full Management) |                       |  (In-Store POS)   |
     +-------------------+                       +-------------------+
```

- **Admin Password Sign-In:**
  - Authenticates as `role = "admin"`.
  - Grants full management access to all modules enabled by the subscription plan.
  - Returns JWT token signed with `{ id, role: "admin" }`.
  - Dashboard UI displays `"Admin Portal"`.

- **Store Password Sign-In:**
  - Authenticates as `role = "instore"`.
  - Grants operational POS access strictly restricted to `Invoice` and `Inventory` modules (plus GET read-only metrics for Dashboard).
  - Returns JWT token signed with `{ id, role: "instore" }`.
  - `/api/user` endpoint preserves the JWT token role (`"instore"`) and never overwrites it with the underlying user database record role.
  - Dashboard UI displays `"In-Store POS"`.

---

## 2. Operational Data & Financial Flow

```
+------------------+         +------------------+
| Inventory Module |         |  Invoice Module  |
+--------+---------+         +--------+---------+
         |                            |
         +-------------+--------------+
                       |
                       v
       +-------------------------------+
       |       Bookkeeping Ledger       |  <-- Single Centralized Source of Truth
       +---------------+---------------+
                       |
        +--------------+--------------+
        |              |              |
        v              v              v
   +----------+  +-----------+  +-----------+
   |   P&L    |  |  Balance  |  | Cash Flow |
   | Statement|  |   Sheet   |  | Statement |
   +----+-----+  +-----+-----+  +----+------+
        |              |              |
        +--------------+--------------+
                       |
                       v
          +-------------------------+
          | Financial Ratios & AI   |
          +------------+------------+
                       |
                       v
          +-------------------------+
          | Executive Dashboard     |
          +-------------------------+
```

1. **Operational Input Sources:**
   - **Sales Invoices** (`/api/invoice`) & **Purchase Invoices** (`/api/purchase-invoice`): Record sales, billing details, payments, and supplier transactions.
   - **Inventory** (`/api/inventory`): Item management, stock adjustments, and stock sync.

2. **Centralized Accounting Ledger:**
   - **Bookkeeping** (`/api/bookkeeping`): The single financial source of truth. Operational events automatically create corresponding financial transactions (income/expense entries).

3. **Financial Statements & Analytics:**
   - **Profit & Loss** (`/api/profitloss`): Calculates Net Profit, Revenue, and Expenses dynamically from Bookkeeping entries and Invoice records.
   - **Balance Sheet** (`/api/balance`): Aggregates Assets, Liabilities, and Equity.
   - **Cash Flow Statement** (`/api/cashflow-statement`): Tracks operating, investing, and financing cash movements.
   - **Financial Ratios** (`/api/financial-ratios`): Derives liquidity, profitability, and debt ratios.
   - **Dashboard** (`/api/user`, `/api/invoice/all`, `/api/bookkeeping/all`): Synthesizes key financial metrics.

---

## 3. Payment Flow

```
+---------------+      +-------------------+      +---------------------+      +---------------------+      +---------------+
| Payment Event | ---> |  Target Invoice   | ---> |  Bookkeeping Sync   | ---> | Cash Flow Statement | ---> |   Dashboard   |
| (Full/Partial)|      | (Status & Balance)|      | (Income/Receivable) |      |   (Inflow Update)   |      | Metric Sync   |
+---------------+      +-------------------+      +---------------------+      +---------------------+      +---------------+
```

- When a payment is recorded against an invoice:
  1. The specific target invoice's `amountPaid`, `balance`, and `status` (`paid` / `partially_paid` / `due`) update.
  2. A corresponding income entry is recorded/updated in Bookkeeping.
  3. Cash Flow Statement receives updated inflow data.
  4. Executive Dashboard updates Receivables and Net Profit indicators in real-time.

---

## 4. Fundamental Accounting Rules

1. **No Direct Manual Input to Bookkeeping:**
   - Operational input must originate from Invoice or Inventory events to ensure consistency across inventory stock and financial ledgers.
2. **Centralized Financial Source of Truth:**
   - Bookkeeping is the single source of truth. Analytics and statement generators consume processed Bookkeeping data.
3. **No Duplicate Accounting Entries:**
   - Idempotency guards prevent duplicate financial records for the same transaction.
4. **Propagation of Updates & Deletions:**
   - Modifying an invoice updates its corresponding bookkeeping entry.
   - Soft-deleting or cancelling an invoice removes or reverses its accounting impact.
5. **Shared Company Data Across Roles:**
   - Admin and Store roles access the same underlying company database context.
6. **Strict Role Security:**
   - Store users (`instore` role) are restricted to `Invoice` and `Inventory` modules. Direct API calls to restricted modules (e.g. Payroll, Fraud Detection) return `403 Forbidden`.
7. **Strict Multi-Tenant Data Isolation:**
   - Company A's data must be completely isolated from Company B. Queries must filter by authenticated user/company ID.
