# Permanent Regression Testing Guide

This guide documents the command-line interface, test structure, continuous integration workflow, and failure diagnosis protocols for the Financial Automation Platform.

---

## 1. Test Commands

Run tests using standard `npm` commands:

| Command | Target Suite | Description |
|---|---|---|
| `npm run test` | Full Suite | Executes all 9 module regression tests + 1 Golden Smoke Test. |
| `npm run test:regression` | Module Regression | Executes 9 specific regression test suites (Auth, Role, Inventory, Invoice, Payment, Bookkeeping, Financial, Isolation, Plan). |
| `npm run test:golden` | Full Golden Suite | Alias for complete test suite run. |
| `npm run test:smoke` | Golden Smoke Test | Executes fast end-to-end smoke test covering complete lifecycle. |

---

## 2. Test Suite Architecture

All golden flow tests are organized in `tests/golden-flow/`:

```
tests/
├── golden-flow/
│   ├── 01_auth.test.js             # Auth & Session Role Retention
│   ├── 02_role.test.js             # Role Authorization & Privilege Escalation Prevention
│   ├── 03_inventory.test.js        # Inventory Stock Management & OTC Sales
│   ├── 04_invoice.test.js          # Invoice Lifecycle & Validation
│   ├── 05_payment.test.js          # Payment Processing & Ledger Inflows
│   ├── 06_bookkeeping.test.js      # Centralized Accounting Ledger Idempotency & Reversal
│   ├── 07_financial.test.js        # P&L, Balance Sheet, Cash Flow & Financial Ratios
│   ├── 08_data_isolation.test.js  # Multi-Tenant Data Isolation (Company A vs B)
│   ├── 09_plan.test.js             # Subscription Plan & Feature Access Restrictions
│   ├── 10_golden_smoke.test.js     # Fast End-to-End Golden Smoke Test
│   └── test_helper.js              # Shared HTTP Client & Assertion Utilities
└── run-tests.js                    # Unified Test Runner Engine
```

---

## 3. Recommended Workflow

- **Daily Local Development:**
  Before committing changes, execute:
  ```bash
  npm run test:smoke
  ```

- **Pre-Push Validation:**
  Before pushing code to `main` branch, execute:
  ```bash
  npm run test
  ```

---

## 4. Interpreting & Diagnosing Failures

1. **Assertion Failure in Auth/Role Tests (01_auth / 02_role):**
   - Verify `GET /api/user` returns `role: req.user?.role || user.role || "admin"`.
   - Verify `checkModuleAccess` middleware returns `HTTP 403 Forbidden` for store users trying to access restricted admin APIs.

2. **Assertion Failure in Bookkeeping/Payment Tests (05_payment / 06_bookkeeping):**
   - Check `upsertAutomatedBookkeepingEntry` helper in `backend/utils/bookkeepingHelper.js`.
   - Ensure `referenceId` is properly passed to maintain idempotency and prevent duplicate financial records.

3. **Assertion Failure in Data Isolation Test (08_data_isolation):**
   - Ensure database queries include `userId: req.user.id` or `createdBy: req.user.id` to prevent cross-company data exposure.
