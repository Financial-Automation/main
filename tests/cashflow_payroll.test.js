import assert from "assert";
import mongoose from "../backend/node_modules/mongoose/index.js";
import cashflowRouter from "../backend/routes/cashflowRoutes.js";

async function runTests() {
  console.log("==================================================");
  console.log("💰 CASH FLOW PAYROLL CALCULATION REGRESSION SUITE");
  console.log("==================================================");

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      console.error(`  ❌ ${name}`);
      console.error(err);
      throw err;
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      console.error(`  ❌ ${name}`);
      console.error(err);
      throw err;
    }
  }

  // Base stubbing for other models to isolate payroll logic
  mongoose.models.BookkeepingEntry = { find: () => ({ lean: async () => [] }) };
  mongoose.models.Invoice = { find: () => ({ select: () => ({ lean: async () => [] }) }) };
  mongoose.models.PurchaseInvoice = { find: () => ({ select: () => ({ lean: async () => [] }) }) };

  const TENANT_A = "507f1f77bcf86cd799439011";
  const TENANT_B = "507f191e810c19729de860ea";

  function setupMockPayroll(payrollData) {
    mongoose.models.Payroll = {
      find: (query) => ({
        lean: async () => {
          return payrollData.filter((p) => {
            // Check tenant isolation
            if (query["$or"]) {
              const matched = query["$or"].some(
                (cond) => String(cond.userId) === String(p.userId)
              );
              if (!matched) return false;
            } else if (query.userId && String(query.userId) !== String(p.userId)) {
              return false;
            }

            // Check status query ($ne: "paid")
            if (query.status && query.status["$ne"]) {
              if (p.status === query.status["$ne"]) {
                return false;
              }
            }

            return true;
          });
        },
      }),
    };
  }

  function executePlanningRoute(userId) {
    return new Promise((resolve, reject) => {
      const req = {
        method: "GET",
        url: "/planning",
        headers: {},
        query: { days: "30" },
        user: { id: userId, _id: userId },
      };

      const res = {
        statusCode: 200,
        body: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.body = payload;
          resolve(this);
          return this;
        },
      };

      try {
        cashflowRouter.handle(req, res, (err) => {
          if (err) reject(err);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  // ----------------------------------------------------
  // TEST GROUP 1: Basic Unpaid vs Paid Payroll Obligation
  // ----------------------------------------------------
  console.log("\n[Group 1: Unpaid vs Paid Filtering]");

  await asyncTest(
    "Unpaid payroll with status='calculated' is included in payroll obligations",
    async () => {
      setupMockPayroll([
        { userId: TENANT_A, netSalary: 45000, status: "calculated" },
      ]);

      const res = await executePlanningRoute(TENANT_A);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.expectedOutflows.payroll, 45000);
      assert.strictEqual(res.body.expectedOutflows.totalInWindow, 45000);
      assert.strictEqual(res.body.expectedOutflows.count, 1);
      assert.strictEqual(res.body.expectedOutflows.items[0].type, "Payroll");
      assert.strictEqual(res.body.expectedOutflows.items[0].amount, 45000);
    }
  );

  await asyncTest(
    "Paid payroll with status='paid' is strictly excluded from payroll obligations",
    async () => {
      setupMockPayroll([
        { userId: TENANT_A, netSalary: 60000, status: "paid" },
      ]);

      const res = await executePlanningRoute(TENANT_A);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.expectedOutflows.payroll, 0);
      assert.strictEqual(res.body.expectedOutflows.totalInWindow, 0);
      assert.strictEqual(res.body.expectedOutflows.count, 0);
      assert.strictEqual(res.body.expectedOutflows.items.length, 0);
    }
  );

  // ----------------------------------------------------
  // TEST GROUP 2: Multiple Records with Various Lifecycle States
  // ----------------------------------------------------
  console.log("\n[Group 2: Multiple Payroll Records]");

  await asyncTest(
    "Correctly sums multiple unpaid statuses (draft, calculated, reviewed, approved) and excludes paid",
    async () => {
      setupMockPayroll([
        { userId: TENANT_A, employeeName: "Alice", netSalary: 50000, status: "approved" },
        { userId: TENANT_A, employeeName: "Bob", netSalary: 35000, status: "calculated" },
        { userId: TENANT_A, employeeName: "Charlie", netSalary: 20000, status: "reviewed" },
        { userId: TENANT_A, employeeName: "David", netSalary: 15000, status: "draft" },
        { userId: TENANT_A, employeeName: "Eve", netSalary: 80000, status: "paid" }, // Excluded!
      ]);

      const res = await executePlanningRoute(TENANT_A);
      assert.strictEqual(res.statusCode, 200);
      // Expected sum: 50000 + 35000 + 20000 + 15000 = 120000
      assert.strictEqual(res.body.expectedOutflows.payroll, 120000);
      assert.strictEqual(res.body.expectedOutflows.totalInWindow, 120000);
      assert.strictEqual(res.body.expectedOutflows.count, 1);
    }
  );

  // ----------------------------------------------------
  // TEST GROUP 3: Invalid, Missing, and String Numeric Values
  // ----------------------------------------------------
  console.log("\n[Group 3: Robustness against Invalid/Missing Salary Values]");

  await asyncTest(
    "Missing, null, undefined, NaN, and negative salary values do not produce NaN or corrupt totals",
    async () => {
      setupMockPayroll([
        { userId: TENANT_A, netSalary: 30000, status: "calculated" },
        { userId: TENANT_A, netSalary: null, status: "calculated" },
        { userId: TENANT_A, netSalary: undefined, status: "calculated" },
        { userId: TENANT_A, netSalary: "invalid_not_a_number", status: "calculated" },
        { userId: TENANT_A, netSalary: NaN, status: "calculated" },
        { userId: TENANT_A, netSalary: -10000, status: "calculated" }, // Negative excluded
        { userId: TENANT_A, status: "calculated" }, // Missing netSalary field completely
        { userId: TENANT_A, netSalary: 20000, status: "approved" },
      ]);

      const res = await executePlanningRoute(TENANT_A);
      assert.strictEqual(res.statusCode, 200);
      // Valid sum: 30000 + 20000 = 50000
      assert.strictEqual(res.body.expectedOutflows.payroll, 50000);
      assert.strictEqual(Number.isNaN(res.body.expectedOutflows.payroll), false);
      assert.strictEqual(Number.isFinite(res.body.expectedOutflows.payroll), true);
      assert.strictEqual(res.body.projectedClosingCash, -50000);
    }
  );

  await asyncTest(
    "String numbers (e.g. '25000') are safely coerced to valid numbers without producing NaN",
    async () => {
      setupMockPayroll([
        { userId: TENANT_A, netSalary: "25000", status: "calculated" },
        { userId: TENANT_A, netSalary: 15000, status: "calculated" },
      ]);

      const res = await executePlanningRoute(TENANT_A);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.expectedOutflows.payroll, 40000);
    }
  );

  // ----------------------------------------------------
  // TEST GROUP 4: Multi-Tenant Isolation
  // ----------------------------------------------------
  console.log("\n[Group 4: Multi-Tenant Data Isolation]");

  await asyncTest(
    "Payroll obligations belonging to Tenant B do NOT bleed into Tenant A",
    async () => {
      setupMockPayroll([
        { userId: TENANT_A, employeeName: "Tenant A Employee", netSalary: 30000, status: "calculated" },
        { userId: TENANT_B, employeeName: "Tenant B Employee 1", netSalary: 90000, status: "calculated" },
        { userId: TENANT_B, employeeName: "Tenant B Employee 2", netSalary: 70000, status: "approved" },
      ]);

      // Query as Tenant A
      const resA = await executePlanningRoute(TENANT_A);
      assert.strictEqual(resA.body.expectedOutflows.payroll, 30000);

      // Query as Tenant B
      const resB = await executePlanningRoute(TENANT_B);
      assert.strictEqual(resB.body.expectedOutflows.payroll, 160000);
    }
  );

  // ----------------------------------------------------
  // TEST GROUP 5: Empty Dataset Handling
  // ----------------------------------------------------
  console.log("\n[Group 5: Empty Dataset & Financial Calculations]");

  await asyncTest(
    "Empty payroll list produces 0 obligations and no empty outflow item",
    async () => {
      setupMockPayroll([]);

      const res = await executePlanningRoute(TENANT_A);
      assert.strictEqual(res.body.expectedOutflows.payroll, 0);
      assert.strictEqual(res.body.expectedOutflows.count, 0);
      assert.strictEqual(res.body.expectedOutflows.items.length, 0);
      assert.strictEqual(res.body.riskStatus.hasRisk, false);
    }
  );

  await asyncTest(
    "Payroll obligations are reflected in drivers, riskStatus, and projectedClosingCash",
    async () => {
      setupMockPayroll([
        { userId: TENANT_A, netSalary: 100000, status: "calculated" },
      ]);

      const res = await executePlanningRoute(TENANT_A);
      assert.strictEqual(res.body.expectedOutflows.payroll, 100000);
      assert.strictEqual(res.body.projectedClosingCash, -100000);
      assert.strictEqual(res.body.potentialDeficit, 100000);
      assert.strictEqual(res.body.riskStatus.hasRisk, true);
      assert.strictEqual(res.body.riskStatus.severity, "danger");
      assert.ok(
        res.body.riskStatus.drivers.some((d) => d.includes("salary obligations")),
        "Driver list should include upcoming employee salary obligations"
      );
    }
  );

  console.log("\n==================================================");
  console.log(`✨ ALL ${passed}/${total} CASH FLOW PAYROLL TESTS PASSED!`);
  console.log("==================================================");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
