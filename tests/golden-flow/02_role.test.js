import { request, ensureServerReady, assert } from "./test_helper.js";

export async function runRoleSecurityRegression() {
  console.log("\n==========================================");
  console.log("🛡️ PART 5: ROLE SECURITY REGRESSION TEST SUITE");
  console.log("==========================================");

  await ensureServerReady();
  const timestamp = Date.now();
  const testEmail = `role_security_${timestamp}@example.com`;
  const adminPass = `AdminP@ss_${timestamp}`;
  const storePass = `StoreP@ss_${timestamp}`;

  // Step 1: Register account with Admin and Store credentials
  console.log("\n1. Registering account for role security tests...");
  const signupRes = await request("/signup-trial", { method: "POST" }, {
    email: testEmail,
    password: adminPass,
    storePassword: storePass,
    name: "Role Security User",
    role: "admin"
  });
  assert.strictEqual(signupRes.status, 201, "Account creation failed");

  // Login as Admin
  const adminLoginRes = await request("/signin", { method: "POST" }, { email: testEmail, password: adminPass });
  const adminToken = adminLoginRes.body.token;

  // Login as Store POS
  const storeLoginRes = await request("/signin", { method: "POST" }, { email: testEmail, password: storePass });
  const storeToken = storeLoginRes.body.token;

  // Step 2: Verify Store POS can access allowed modules (Invoice and Inventory)
  console.log("\n2. Verifying Store POS API access to allowed modules (Invoice & Inventory)...");
  const storeInvoiceRes = await request("/invoice/all?limit=10", {
    headers: { Authorization: `Bearer ${storeToken}` }
  });
  assert.ok(storeInvoiceRes.status === 200 || storeInvoiceRes.status === 304, "Store user must access Invoice API");
  console.log("   ✓ Store POS successfully accessed Invoice API");

  const storeInventoryRes = await request("/inventory/all", {
    headers: { Authorization: `Bearer ${storeToken}` }
  });
  assert.ok(storeInventoryRes.status === 200 || storeInventoryRes.status === 304, "Store user must access Inventory API");
  console.log("   ✓ Store POS successfully accessed Inventory API");

  // Step 3: Verify Store POS receives HTTP 403 when invoking restricted Admin APIs directly
  console.log("\n3. Testing direct API access restriction enforcement for Store POS (expecting HTTP 403)...");

  // Test Payroll endpoint
  const storePayrollRes = await request("/payroll/add", {
    method: "POST",
    headers: { Authorization: `Bearer ${storeToken}` }
  }, { employeeName: "Test Employee", basicSalary: 50000 });
  assert.strictEqual(storePayrollRes.status, 403, "Store user invoking Payroll API directly must be rejected with 403");
  console.log("   ✓ Store POS call to Payroll API rejected with 403 Forbidden");

  // Test Fraud Detection endpoint
  const storeFraudRes = await request("/fraud-detection/analyze", {
    method: "POST",
    headers: { Authorization: `Bearer ${storeToken}` }
  }, { transactionId: "TXN123", amount: 100000 });
  assert.strictEqual(storeFraudRes.status, 403, "Store user invoking Fraud Detection API directly must be rejected with 403");
  console.log("   ✓ Store POS call to Fraud Detection API rejected with 403 Forbidden");

  // Test Civil Engineering endpoint
  const storeCivilRes = await request("/civil/project/add", {
    method: "POST",
    headers: { Authorization: `Bearer ${storeToken}` }
  }, { projectName: "Test Site", budget: 500000 });
  assert.strictEqual(storeCivilRes.status, 403, "Store user invoking Civil Engineering API directly must be rejected with 403");
  console.log("   ✓ Store POS call to Civil Engineering API rejected with 403 Forbidden");

  // Step 4: Verify Admin can access all modules
  console.log("\n4. Verifying Admin access to management endpoints...");
  const adminUserRes = await request("/user", {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.strictEqual(adminUserRes.status, 200, "Admin user must access User API");
  assert.strictEqual(adminUserRes.body.role, "admin", "Admin role must be 'admin'");
  console.log("   ✓ Admin successfully verified management endpoints");

  // Step 5: Test privilege escalation prevention
  console.log("\n5. Testing privilege escalation prevention...");
  const storeProfileRes = await request("/user", {
    headers: { Authorization: `Bearer ${storeToken}` }
  });
  assert.strictEqual(storeProfileRes.body.role, "instore", "Store token must NEVER escalate to admin via profile endpoint");
  console.log("   ✓ Privilege escalation prevented: Store session remains 'instore'");

  console.log("\n✅ ROLE SECURITY REGRESSION TEST SUITE PASSED 100%");
}

if (process.argv[1].endsWith("02_role.test.js")) {
  runRoleSecurityRegression().catch(err => {
    console.error("❌ Role Security Regression Failed:", err);
    process.exit(1);
  });
}
