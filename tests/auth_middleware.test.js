import assert from "assert";
import jwt from "../backend/node_modules/jsonwebtoken/index.js";
import {
  authenticateUser,
  checkSubscription,
  checkModuleAccess
} from "../backend/utils/authMiddleware.js";

const TEST_SECRET = "fallback_jwt_secret_2024_finance_app";
process.env.JWT_SECRET = TEST_SECRET;

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
  return res;
}

async function runTestSuite() {
  console.log("==================================================");
  console.log("🔒 AUTHENTICATION & MIDDLEWARE SECURITY TEST SUITE");
  console.log("==================================================");

  let passedCount = 0;
  let totalCount = 0;

  function test(name, fn) {
    totalCount++;
    try {
      fn();
      passedCount++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      console.error(`  ❌ ${name}`);
      console.error(err);
      throw err;
    }
  }

  async function asyncTest(name, fn) {
    totalCount++;
    try {
      await fn();
      passedCount++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      console.error(`  ❌ ${name}`);
      console.error(err);
      throw err;
    }
  }

  // ----------------------------------------------------
  // TEST GROUP 1: Instrumentation Substring Bypass Prevention
  // ----------------------------------------------------
  console.log("\n[Group 1: Instrumentation Path Security]");

  await asyncTest(
    "Unauthenticated request to '/instrumentation-stats' MUST be rejected with 401 (Not bypassed)",
    async () => {
      const req = {
        path: "/instrumentation-stats",
        headers: {}
      };
      const res = createMockRes();
      let nextCalled = false;

      await authenticateUser(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false, "next() must NOT be called for unauthenticated instrumentation request");
      assert.strictEqual(res.statusCode, 401, "Expected 401 Unauthorized status code");
      assert.strictEqual(res.body?.message, "Access denied. No token provided.");
    }
  );

  await asyncTest(
    "Unauthenticated request with '/api/inventory/instrumentation-reset' MUST be rejected with 401",
    async () => {
      const req = {
        path: "/api/inventory/instrumentation-reset",
        headers: {}
      };
      const res = createMockRes();
      let nextCalled = false;

      await authenticateUser(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false, "next() must NOT be called");
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body?.message, "Access denied. No token provided.");
    }
  );

  await asyncTest(
    "Unauthenticated request to '/invoices/some-instrumentation-path' MUST be rejected with 401",
    async () => {
      const req = {
        path: "/invoices/some-instrumentation-path",
        headers: {}
      };
      const res = createMockRes();
      let nextCalled = false;

      await authenticateUser(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false, "next() must NOT be called");
      assert.strictEqual(res.statusCode, 401);
    }
  );

  // ----------------------------------------------------
  // TEST GROUP 2: Missing & Invalid JWT Rejection
  // ----------------------------------------------------
  console.log("\n[Group 2: Protected Route JWT Validation]");

  await asyncTest("Missing Authorization header returns 401", async () => {
    const req = { path: "/items/all", headers: {} };
    const res = createMockRes();
    let nextCalled = false;

    await authenticateUser(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body?.message, "Access denied. No token provided.");
  });

  await asyncTest("Malformed / Invalid JWT returns 401", async () => {
    const req = {
      path: "/items/all",
      headers: { authorization: "Bearer invalid_gibberish_token_string" }
    };
    const res = createMockRes();
    let nextCalled = false;

    await authenticateUser(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body?.message, "Invalid authorization token.");
  });

  await asyncTest("Expired JWT returns 401 with Token expired message", async () => {
    const expiredToken = jwt.sign(
      { id: "507f1f77bcf86cd799439011", role: "admin" },
      TEST_SECRET,
      { expiresIn: "-10s" }
    );

    const req = {
      path: "/items/all",
      headers: { authorization: `Bearer ${expiredToken}` }
    };
    const res = createMockRes();
    let nextCalled = false;

    await authenticateUser(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body?.message, "Token expired. Please log in again.");
  });

  // ----------------------------------------------------
  // TEST GROUP 3: Legitimate Public Route Preservation
  // ----------------------------------------------------
  console.log("\n[Group 3: Legitimate Public Routes]");

  await asyncTest("Legitimate public route '/public/invoice-xyz' bypasses authenticateUser and calls next()", async () => {
    const req = { path: "/public/invoice-xyz", headers: {} };
    const res = createMockRes();
    let nextCalled = false;

    await authenticateUser(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true, "next() MUST be called for /public/ paths");
    assert.strictEqual(res.statusCode, 200, "Response status must remain unchanged");
  });

  await asyncTest("Legitimate public route '/public/purchase-abc' bypasses checkSubscription", async () => {
    const req = { path: "/public/purchase-abc", headers: {} };
    const res = createMockRes();
    let nextCalled = false;

    await checkSubscription(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true, "next() MUST be called for /public/ paths");
  });

  await asyncTest("Legitimate public route '/public/view' bypasses checkModuleAccess", async () => {
    const req = { path: "/public/view", headers: {} };
    const res = createMockRes();
    let nextCalled = false;

    const middleware = checkModuleAccess("invoice");
    await middleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true, "next() MUST be called for /public/ paths");
  });

  // ----------------------------------------------------
  // TEST GROUP 4: Module Access RBAC for Authorized Requests
  // ----------------------------------------------------
  console.log("\n[Group 4: Authorized Role Access & RBAC]");

  test("Admin user passes checkModuleAccess for any module", () => {
    const req = { path: "/bookkeeping/all", user: { role: "admin" } };
    const res = createMockRes();
    let nextCalled = false;

    const middleware = checkModuleAccess("bookkeeping");
    middleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true, "Admin must pass module check");
  });

  test("Store user ('instore') is blocked from modifying restricted module (e.g. bookkeeping POST)", () => {
    const req = {
      method: "POST",
      path: "/add",
      user: { role: "instore" }
    };
    const res = createMockRes();
    let nextCalled = false;

    const middleware = checkModuleAccess("bookkeeping");
    middleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false, "Store user must NOT modify bookkeeping");
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(
      res.body?.message,
      "In-Store accounts only have access to Invoice and Inventory modules."
    );
  });

  test("Store user ('instore') is permitted read-only overview GET request for Dashboard parity", () => {
    const req = {
      method: "GET",
      path: "/overview",
      user: { role: "instore" },
      subscription: { planId: { allowedModules: ["invoice", "inventory", "dashboard"] } }
    };
    const res = createMockRes();
    let nextCalled = false;

    const middleware = checkModuleAccess("dashboard");
    middleware(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true, "Store user must be allowed read overview for Dashboard parity");
  });

  console.log("\n==================================================");
  console.log(`✨ ALL ${passedCount}/${totalCount} SECURITY TESTS PASSED CLEANLY!`);
  console.log("==================================================");
}

runTestSuite().catch((err) => {
  console.error("Test suite execution failed:", err);
  process.exit(1);
});
