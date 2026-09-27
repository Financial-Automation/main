import { request, ensureServerReady, assert } from "./test_helper.js";

export async function runFinancialRegression() {
  console.log("\n==========================================");
  console.log("📊 PART 10: FINANCIAL REGRESSION TEST SUITE");
  console.log("==========================================");

  await ensureServerReady();
  const timestamp = Date.now();
  const testEmail = `financial_test_${timestamp}@example.com`;

  // Step 1: Create user account
  const signupRes = await request("/signup-trial", { method: "POST" }, {
    email: testEmail,
    password: "Password123!",
    storePassword: "StorePassword123!",
    name: "Financial Test Business",
    role: "admin"
  });
  assert.strictEqual(signupRes.status, 201, "Account creation failed");
  const token = signupRes.body.token;

  // Step 2: Create known Sales Invoice (Income = ₹100,000)
  console.log("\n1. Seeding controlled financial transactions (Income: ₹100,000)...");
  const invRes = await request("/invoice/create", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  }, {
    invoiceNumber: `INV-FIN-${timestamp}`,
    invoiceDate: new Date().toISOString(),
    dueDate: new Date().toISOString(),
    businessName: "Financial Test Business",
    customerName: "Enterprise Client",
    items: [{ productName: "License Fee", quantity: 1, unitPrice: 100000, total: 100000 }],
    subtotal: 100000,
    taxAmount: 0,
    grandTotal: 100000,
    amountPaid: 100000,
    balanceDue: 0
  });
  assert.strictEqual(invRes.status, 201, "Invoice creation failed");
  console.log("   ✓ Income transaction recorded (₹100,000)");

  // Step 3: Test Profit & Loss Statement Endpoint
  console.log("\n2. Testing Profit & Loss Statement generation (/api/profitloss/generate)...");
  const plRes = await request("/profitloss/generate?period=this-month", {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.strictEqual(plRes.status, 200, "P&L generation must return 200");
  assert.ok(plRes.body.totalRevenue >= 100000, "P&L Total Revenue must include income transaction");
  console.log(`   ✓ P&L Revenue verified: ₹${plRes.body.totalRevenue.toLocaleString()} | Net Profit: ₹${plRes.body.netProfit.toLocaleString()}`);

  // Step 4: Test Balance Sheet Endpoint
  console.log("\n3. Testing Balance Sheet generation (/api/balance/generate)...");
  const bsRes = await request("/balance/generate?period=this-month", {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.strictEqual(bsRes.status, 200, "Balance Sheet generation must return 200");
  assert.ok(bsRes.body.assets || bsRes.body.equity, "Balance Sheet should return financial components");
  console.log("   ✓ Balance Sheet components generated successfully");

  // Step 5: Test Cash Flow Statement Endpoint
  console.log("\n4. Testing Cash Flow Statement generation (/api/cashflow-statement/generate)...");
  const cfRes = await request("/cashflow-statement/generate?period=this-month", {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.strictEqual(cfRes.status, 200, "Cash Flow Statement generation must return 200");
  console.log("   ✓ Cash Flow Statement generated successfully");

  // Step 6: Test Financial Ratios Endpoint
  console.log("\n5. Testing Financial Ratios calculation (/api/financial-ratios/generate)...");
  const ratioRes = await request("/financial-ratios/generate?period=this-month", {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.strictEqual(ratioRes.status, 200, "Financial Ratios generation must return 200");
  assert.ok(ratioRes.body.ratios, "Financial Ratios payload must be present");
  console.log("   ✓ Financial Ratios computed successfully");

  // Step 7: Test Tax & GST Analytics Endpoint
  console.log("\n6. Testing Tax & GST Analytics (/api/tax/analytics)...");
  const gstRes = await request("/tax/analytics?period=this-month", {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.strictEqual(gstRes.status, 200, "GST Analytics must return 200");
  console.log("   ✓ Tax & GST Analytics generated successfully");

  console.log("\n✅ FINANCIAL REGRESSION TEST SUITE PASSED 100%");
}

if (process.argv[1].endsWith("07_financial.test.js")) {
  runFinancialRegression().catch(err => {
    console.error("❌ Financial Regression Failed:", err);
    process.exit(1);
  });
}
