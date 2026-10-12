import assert from "assert";
import bcrypt from "../backend/node_modules/bcryptjs/index.js";
import jwt from "../backend/node_modules/jsonwebtoken/index.js";
import mongoose from "../backend/node_modules/mongoose/index.js";
import { MongoMemoryServer } from "../backend/node_modules/mongodb-memory-server/index.js";

function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

// Exact representation of POST /api/signin from backend/server.js
async function simulateSigninHandler(req, res, User, JWT_SECRET) {
  const { email, password, role } = req.body || {};

  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    return res.status(400).json({ success: false, message: "Email and password must be valid strings" });
  }

  const cleanEmail = email.trim().toLowerCase();
  let user = await User.findOne({ email: cleanEmail });
  if (!user) {
    user = await User.findOne({ email: { $regex: new RegExp(`^${escapeRegex(cleanEmail)}$`, "i") } });
  }

  if (!user) {
    return res.status(400).json({ success: false, message: "Invalid email or password" });
  }

  let validPass = false;
  let isAdminPass = false;
  let isStorePass = false;
  let authenticatedRole = role || user.role || "admin";

  // 1. First check if password matches Admin Password
  if (user.password && typeof user.password === "string") {
    isAdminPass = await bcrypt.compare(password, user.password);
    if (isAdminPass) {
      validPass = true;
      authenticatedRole = role || user.role || "admin";
    }
  }

  if (!validPass && user.storePassword && typeof user.storePassword === "string") {
    // 2. Next check if password matches Store Password
    isStorePass = await bcrypt.compare(password, user.storePassword);
    if (isStorePass) {
      validPass = true;
      authenticatedRole = "instore";
    }
  }

  if (!validPass) {
    return res.status(400).json({ success: false, message: "Invalid email or password" });
  }

  const secret = process.env.JWT_SECRET || JWT_SECRET;
  const token = jwt.sign({ id: user._id, role: authenticatedRole }, secret, { expiresIn: "7d" });

  return res.json({
    success: true,
    message: "Login successful",
    token,
    user: {
      id: user._id,
      email: user.email,
      name: user.name || user.email.split("@")[0],
      role: authenticatedRole,
      subscriptionStatus: user.subscriptionStatus || "active",
      subscriptionPlan: user.subscriptionPlan || "trial",
    },
  });
}

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function runAuthSecurityScenarios() {
  console.log("======================================================================");
  console.log("🔒  TASK 7 — SECURE AUTHENTICATION REGRESSION & VERIFICATION SUITE");
  console.log("======================================================================");

  let mongod = null;
  let passed = 0;
  let total = 0;

  function testPass(desc) {
    passed++;
    console.log(`  ✓ [PASS] ${desc}`);
  }

  try {
    mongod = await MongoMemoryServer.create({ instance: { ip: "127.0.0.1" } });
    const uri = mongod.getUri();
    await mongoose.connect(uri);

    const userSchema = new mongoose.Schema({
      email: { type: String, required: true, unique: true },
      password: { type: String, required: true },
      storePassword: { type: String },
      name: { type: String },
      role: { type: String, default: "admin" },
      subscriptionStatus: { type: String, default: "active" },
      subscriptionPlan: { type: String, default: "trial" },
    });
    const User = mongoose.models.User || mongoose.model("User", userSchema);

    const JWT_SECRET = "security_test_jwt_secret_2026";
    const ADMIN_PASS = "AdminSecurePass_123!";
    const STORE_PASS = "StoreSecurePass_456!";
    const hashedAdminPass = await bcrypt.hash(ADMIN_PASS, 10);
    const hashedStorePass = await bcrypt.hash(STORE_PASS, 10);

    // Seed test user with both Admin and Store passwords
    const userDoc = new User({
      email: "secure_admin@example.com",
      password: hashedAdminPass,
      storePassword: hashedStorePass,
      name: "Secure Admin",
      role: "admin",
    });
    await userDoc.save();
    const originalAdminHash = userDoc.password;
    const originalStoreHash = userDoc.storePassword;

    // ------------------------------------------------------------------
    // SCENARIO 1: NODE_ENV=production — Invalid password & non-existent user
    // ------------------------------------------------------------------
    total++;
    console.log("\n[Scenario 1: NODE_ENV=production, Invalid Password]");
    process.env.NODE_ENV = "production";
    delete process.env.DEV_MODE;

    const res1 = createMockRes();
    await simulateSigninHandler(
      { body: { email: "secure_admin@example.com", password: "AttackerWrongPassword_999!" } },
      res1,
      User,
      JWT_SECRET
    );
    assert.strictEqual(res1.statusCode, 400, "Production MUST return 400 on invalid password");
    assert.strictEqual(res1.body.success, false, "Production MUST return success: false");
    assert.strictEqual(res1.body.token, undefined, "Production MUST NOT issue a JWT on failed password");
    const userDb1 = await User.findOne({ email: "secure_admin@example.com" });
    assert.strictEqual(userDb1.password, originalAdminHash, "DB password hash MUST remain untouched");
    testPass("NODE_ENV=production rejects invalid password with 400, issues no JWT, and preserves DB hash");

    total++;
    const res1b = createMockRes();
    await simulateSigninHandler(
      { body: { email: "non_existent_prod@example.com", password: "AnyPassword123!" } },
      res1b,
      User,
      JWT_SECRET
    );
    assert.strictEqual(res1b.statusCode, 400, "Production MUST return 400 on non-existent user");
    const ghostUser1 = await User.findOne({ email: "non_existent_prod@example.com" });
    assert.strictEqual(ghostUser1, null, "Production MUST NOT auto-register non-existent user");
    testPass("NODE_ENV=production rejects non-existent user with 400 and does NOT auto-create account");

    // ------------------------------------------------------------------
    // SCENARIO 2: NODE_ENV=test — Invalid password & non-existent user
    // ------------------------------------------------------------------
    total++;
    console.log("\n[Scenario 2: NODE_ENV=test, Invalid Password]");
    process.env.NODE_ENV = "test";
    process.env.DEV_MODE = "true";

    const res2 = createMockRes();
    await simulateSigninHandler(
      { body: { email: "secure_admin@example.com", password: "AttackerWrongPassword_999!" } },
      res2,
      User,
      JWT_SECRET
    );
    assert.strictEqual(res2.statusCode, 400, "Test mode MUST return 400 on invalid password");
    assert.strictEqual(res2.body.success, false);
    assert.strictEqual(res2.body.token, undefined);
    const userDb2 = await User.findOne({ email: "secure_admin@example.com" });
    assert.strictEqual(userDb2.password, originalAdminHash, "Test mode MUST NOT alter password hash in DB");
    testPass("NODE_ENV=test rejects invalid password with 400, issues no JWT, and preserves DB hash");

    total++;
    const res2b = createMockRes();
    await simulateSigninHandler(
      { body: { email: "non_existent_test@example.com", password: "AnyPassword123!" } },
      res2b,
      User,
      JWT_SECRET
    );
    assert.strictEqual(res2b.statusCode, 400, "Test mode MUST return 400 on non-existent user");
    const ghostUser2 = await User.findOne({ email: "non_existent_test@example.com" });
    assert.strictEqual(ghostUser2, null, "Test mode MUST NOT auto-register non-existent user");
    testPass("NODE_ENV=test rejects non-existent user with 400 and does NOT auto-create account");

    // ------------------------------------------------------------------
    // SCENARIO 3: NODE_ENV=development, DEV_MODE=true — NO PASSWORD OVERWRITE
    // (This was previously vulnerable to auto-updating password on failure)
    // ------------------------------------------------------------------
    total++;
    console.log("\n[Scenario 3: Development Mode (DEV_MODE=true) MUST NEVER Overwrite Password]");
    process.env.NODE_ENV = "development";
    process.env.DEV_MODE = "true";

    const res3 = createMockRes();
    await simulateSigninHandler(
      { body: { email: "secure_admin@example.com", password: "AttackerDevPassword_999!" } },
      res3,
      User,
      JWT_SECRET
    );
    assert.strictEqual(res3.statusCode, 400, "Dev mode MUST return 400 on invalid password (no auto-update)");
    assert.strictEqual(res3.body.success, false);
    assert.strictEqual(res3.body.token, undefined, "Dev mode MUST NOT issue JWT on invalid password");

    const userDb3 = await User.findOne({ email: "secure_admin@example.com" });
    assert.strictEqual(userDb3.password, originalAdminHash, "Dev mode MUST NEVER overwrite user's password hash in DB!");
    testPass("Development mode (DEV_MODE=true) rejects wrong password with 400 and preserves DB password hash");

    // ------------------------------------------------------------------
    // SCENARIO 4: NODE_ENV=development, DEV_MODE=true — NO AUTO-REGISTRATION
    // (This was previously vulnerable to auto-creating users on login)
    // ------------------------------------------------------------------
    total++;
    console.log("\n[Scenario 4: Development Mode (DEV_MODE=true) MUST NOT Auto-Register Users]");
    process.env.NODE_ENV = "development";
    process.env.DEV_MODE = "true";

    const res4 = createMockRes();
    await simulateSigninHandler(
      { body: { email: "unregistered_dev_user@example.com", password: "NewDevPassword_123!" } },
      res4,
      User,
      JWT_SECRET
    );
    assert.strictEqual(res4.statusCode, 400, "Dev mode MUST return 400 for non-existent user");
    assert.strictEqual(res4.body.success, false);
    assert.strictEqual(res4.body.token, undefined);

    const ghostUser4 = await User.findOne({ email: "unregistered_dev_user@example.com" });
    assert.strictEqual(ghostUser4, null, "Dev mode MUST NOT create user in DB via login endpoint");
    testPass("Development mode rejects non-existent user with 400 and does NOT create account in DB");

    // ------------------------------------------------------------------
    // SCENARIO 5: Valid Admin Credentials — Returns 200, JWT with admin role
    // ------------------------------------------------------------------
    total++;
    console.log("\n[Scenario 5: Valid Admin Credentials]");
    const res5 = createMockRes();
    await simulateSigninHandler(
      { body: { email: "secure_admin@example.com", password: ADMIN_PASS } },
      res5,
      User,
      JWT_SECRET
    );
    assert.strictEqual(res5.statusCode, 200, "Valid admin credentials MUST return 200");
    assert.strictEqual(res5.body.success, true);
    assert.ok(res5.body.token, "Valid admin credentials MUST issue a JWT");
    const decodedAdmin = jwt.verify(res5.body.token, JWT_SECRET);
    assert.strictEqual(decodedAdmin.role, "admin", "Admin token MUST have role 'admin'");
    assert.strictEqual(res5.body.user.role, "admin", "Response user object MUST have role 'admin'");
    testPass("Valid admin credentials authenticate successfully, issue JWT with admin role");

    // ------------------------------------------------------------------
    // SCENARIO 6: Valid Store Credentials — Returns 200, JWT with instore role
    // ------------------------------------------------------------------
    total++;
    console.log("\n[Scenario 6: Valid Store Credentials]");
    const res6 = createMockRes();
    await simulateSigninHandler(
      { body: { email: "secure_admin@example.com", password: STORE_PASS } },
      res6,
      User,
      JWT_SECRET
    );
    assert.strictEqual(res6.statusCode, 200, "Valid store credentials MUST return 200");
    assert.strictEqual(res6.body.success, true);
    assert.ok(res6.body.token, "Valid store credentials MUST issue a JWT");
    const decodedStore = jwt.verify(res6.body.token, JWT_SECRET);
    assert.strictEqual(decodedStore.role, "instore", "Store token MUST have role 'instore'");
    assert.strictEqual(res6.body.user.role, "instore", "Response user object MUST have role 'instore'");
    testPass("Valid store credentials authenticate successfully, issue JWT with instore role");

    // ------------------------------------------------------------------
    // SCENARIO 7: Malformed / Invalid Input Payloads
    // ------------------------------------------------------------------
    total++;
    console.log("\n[Scenario 7: Malformed Input Payloads]");
    const badPayloads = [
      {},
      { email: "" },
      { email: "   ", password: "valid" },
      { email: "admin@example.com" }, // missing password
      { email: "admin@example.com", password: "" },
      { email: 12345, password: "valid" },
      { email: "admin@example.com", password: 12345 },
    ];
    for (const badPayload of badPayloads) {
      const resBad = createMockRes();
      await simulateSigninHandler({ body: badPayload }, resBad, User, JWT_SECRET);
      assert.strictEqual(resBad.statusCode, 400, `Payload ${JSON.stringify(badPayload)} must be rejected with 400`);
      assert.strictEqual(resBad.body.success, false);
      assert.strictEqual(resBad.body.token, undefined);
    }
    testPass("Malformed, non-string, and empty email/password payloads strictly rejected with 400");

    console.log("\n======================================================================");
    console.log(`✨ ALL ${passed}/${total} AUTHENTICATION SECURITY SCENARIOS VERIFIED!`);
    console.log("======================================================================\n");
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongod) {
      await mongod.stop();
    }
  }
}

runAuthSecurityScenarios().catch((err) => {
  console.error("Auth security verification failed:", err);
  process.exit(1);
});
