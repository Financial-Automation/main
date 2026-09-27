import { request, ensureServerReady, assert } from "./test_helper.js";

export async function runAuthRegression() {
  console.log("\n==========================================");
  console.log("🔒 PART 4: AUTH REGRESSION TEST SUITE");
  console.log("==========================================");

  await ensureServerReady();
  const timestamp = Date.now();
  const testEmail = `auth_test_${timestamp}@example.com`;
  const adminPass = `AdminP@ss_${timestamp}`;
  const storePass = `StoreP@ss_${timestamp}`;

  // Step 1: Register trial user with both Admin Password and Store Password
  console.log("\n1. Registering user with Admin and Store passwords...");
  const signupRes = await request("/signup-trial", { method: "POST" }, {
    email: testEmail,
    password: adminPass,
    storePassword: storePass,
    name: "Auth Test User",
    role: "admin"
  });

  assert.strictEqual(signupRes.status, 201, `Signup failed with status ${signupRes.status}`);
  assert.ok(signupRes.body.token, "Token should be present in signup response");
  console.log("   ✓ User registered successfully");

  // Step 2: Login with ADMIN password
  console.log("\n2. Testing login with ADMIN password...");
  const adminLoginRes = await request("/signin", { method: "POST" }, {
    email: testEmail,
    password: adminPass
  });

  assert.strictEqual(adminLoginRes.status, 200, "Admin login should succeed");
  assert.strictEqual(adminLoginRes.body.user.role, "admin", "Admin login should yield role 'admin'");
  const adminToken = adminLoginRes.body.token;
  console.log("   ✓ Admin login returned role 'admin'");

  // Step 3: Verify GET /api/user with Admin Token
  console.log("\n3. Testing GET /api/user with ADMIN token...");
  const adminUserRes = await request("/user", {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.strictEqual(adminUserRes.status, 200, "GET /api/user should succeed");
  assert.strictEqual(adminUserRes.body.role, "admin", "GET /api/user must retain role 'admin' for Admin session");
  console.log("   ✓ Admin session retained role 'admin' on refresh/fetch");

  // Step 4: Login with STORE password
  console.log("\n4. Testing login with STORE password...");
  const storeLoginRes = await request("/signin", { method: "POST" }, {
    email: testEmail,
    password: storePass
  });

  assert.strictEqual(storeLoginRes.status, 200, "Store login should succeed");
  assert.strictEqual(storeLoginRes.body.user.role, "instore", "Store login should yield role 'instore'");
  const storeToken = storeLoginRes.body.token;
  console.log("   ✓ Store login returned role 'instore'");

  // Step 5: Verify GET /api/user with Store Token (CRITICAL REGRESSION FIX)
  console.log("\n5. Testing GET /api/user with STORE token...");
  const storeUserRes = await request("/user", {
    headers: { Authorization: `Bearer ${storeToken}` }
  });
  assert.strictEqual(storeUserRes.status, 200, "GET /api/user should succeed");
  assert.strictEqual(storeUserRes.body.role, "instore", "GET /api/user MUST retain role 'instore' for Store session");
  console.log("   ✓ Store session retained role 'instore' on refresh/fetch");

  // Step 6: Test Invalid Password
  console.log("\n6. Testing login with INVALID password...");
  const invalidPassRes = await request("/signin", { method: "POST" }, {
    email: testEmail,
    password: "WrongPassword999!"
  });
  assert.strictEqual(invalidPassRes.status, 400, "Invalid password must return status 400");
  assert.strictEqual(invalidPassRes.body.success, false, "Invalid password must return success: false");
  console.log("   ✓ Invalid password correctly rejected");

  // Step 7: Test Invalid Email
  console.log("\n7. Testing login with NON-EXISTENT email...");
  const invalidEmailRes = await request("/signin", { method: "POST" }, {
    email: `non_existent_${timestamp}@example.com`,
    password: "AnyPassword123!"
  });
  assert.strictEqual(invalidEmailRes.status, 400, "Non-existent email must return status 400");
  assert.strictEqual(invalidEmailRes.body.success, false, "Non-existent email must return success: false");
  console.log("   ✓ Non-existent email correctly rejected");

  // Step 8: Test Token Expiry / Invalid Authorization Header
  console.log("\n8. Testing GET /api/user with INVALID token...");
  const invalidTokenRes = await request("/user", {
    headers: { Authorization: "Bearer invalid_token_xyz" }
  });
  assert.strictEqual(invalidTokenRes.status, 400, "Invalid token must return status 400");
  console.log("   ✓ Invalid authorization token correctly rejected");

  console.log("\n✅ AUTH REGRESSION TEST SUITE PASSED 100%");
}

if (process.argv[1].endsWith("01_auth.test.js")) {
  runAuthRegression().catch(err => {
    console.error("❌ Auth Regression Failed:", err);
    process.exit(1);
  });
}
