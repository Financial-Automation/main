import { request, ensureServerReady, assert } from "./test_helper.js";

export async function runSubscriptionPlanRegression() {
  console.log("\n==========================================");
  console.log("💳 PART 12: SUBSCRIPTION PLAN REGRESSION TEST SUITE");
  console.log("==========================================");

  await ensureServerReady();
  const timestamp = Date.now();
  const testEmail = `plan_test_${timestamp}@example.com`;
  const adminPass = `AdminP@ss_${timestamp}`;
  const storePass = `StoreP@ss_${timestamp}`;

  // Step 1: Create Account with Admin and Store credentials
  console.log("\n1. Initializing test user account with plan credentials...");
  const signupRes = await request("/signup-trial", { method: "POST" }, {
    email: testEmail,
    password: adminPass,
    storePassword: storePass,
    name: "Plan Test Business",
    role: "admin"
  });

  assert.strictEqual(signupRes.status, 201, "Trial signup failed");
  const adminToken = signupRes.body.token;
  const user = signupRes.body.user;

  assert.strictEqual(user.subscriptionPlan, "trial", "New trial user plan must be 'trial'");
  assert.strictEqual(user.subscriptionStatus, "active", "Trial subscription status must be 'active'");
  console.log("   ✓ Trial account initialized. Plan: 'trial' | Status: 'active'");

  // Step 2: Login as Store user
  const storeLoginRes = await request("/signin", { method: "POST" }, { email: testEmail, password: storePass });
  const storeToken = storeLoginRes.body.token;

  // Step 3: Verify Allowed vs Restricted Features under Plan Restrictions
  console.log("\n2. Testing Plan & Role Restrictions via Direct HTTP APIs...");

  // Allowed feature for Admin (Invoice creation)
  const invoiceCheckRes = await request("/invoice/create", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` }
  }, {
    invoiceNumber: `INV-PLAN-${timestamp}`,
    invoiceDate: new Date().toISOString(),
    dueDate: new Date().toISOString(),
    businessName: "Plan Business",
    customerName: "Plan Customer",
    items: [{ productName: "Plan Item", quantity: 1, unitPrice: 500, total: 500 }],
    subtotal: 500,
    taxAmount: 0,
    grandTotal: 500,
    balanceDue: 500
  });
  assert.strictEqual(invoiceCheckRes.status, 201, "Admin user must be allowed to create invoice");
  console.log("   ✓ Admin plan feature verified: Invoice Creation");

  // Restricted feature for Store User (Payroll creation)
  const storePayrollRes = await request("/payroll/add", {
    method: "POST",
    headers: { Authorization: `Bearer ${storeToken}` }
  }, { employeeName: "Restricted Employee", basicSalary: 30000 });
  assert.strictEqual(storePayrollRes.status, 403, "Store POS direct call to Payroll API must return 403");
  console.log("   ✓ Direct API restriction verified: Store call to Payroll returned 403 Forbidden");

  // Restricted feature for Store User (Fraud Detection)
  const storeFraudRes = await request("/fraud-detection/analyze", {
    method: "POST",
    headers: { Authorization: `Bearer ${storeToken}` }
  }, { amount: 50000 });
  assert.strictEqual(storeFraudRes.status, 403, "Store POS direct call to Fraud Detection API must return 403");
  console.log("   ✓ Direct API restriction verified: Store call to Fraud Detection returned 403 Forbidden");

  // Step 4: Verify User Profile Metadata
  console.log("\n3. Testing User Profile Plan Metadata...");
  const profileRes = await request("/user", {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.strictEqual(profileRes.status, 200);
  assert.strictEqual(profileRes.body.subscriptionPlan, "trial");
  assert.strictEqual(profileRes.body.subscriptionStatus, "active");
  console.log(`   ✓ Profile subscription status verified: ${profileRes.body.subscriptionStatus} (${profileRes.body.subscriptionPlan})`);

  console.log("\n✅ SUBSCRIPTION PLAN REGRESSION TEST SUITE PASSED 100%");
}

if (process.argv[1].endsWith("09_plan.test.js")) {
  runSubscriptionPlanRegression().catch(err => {
    console.error("❌ Subscription Plan Regression Failed:", err);
    process.exit(1);
  });
}
