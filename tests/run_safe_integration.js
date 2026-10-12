import net from "net";
import { spawn } from "child_process";
import { MongoMemoryServer } from "../backend/node_modules/mongodb-memory-server/index.js";

// Import existing Golden Flow test suites (no rewriting of test logic)
import { runAuthRegression } from "./golden-flow/01_auth.test.js";
import { runRoleSecurityRegression } from "./golden-flow/02_role.test.js";
import { runInventoryRegression } from "./golden-flow/03_inventory.test.js";
import { runInvoiceRegression } from "./golden-flow/04_invoice.test.js";
import { runPaymentRegression } from "./golden-flow/05_payment.test.js";
import { runBookkeepingRegression } from "./golden-flow/06_bookkeeping.test.js";
import { runFinancialRegression } from "./golden-flow/07_financial.test.js";
import { runDataIsolationRegression } from "./golden-flow/08_data_isolation.test.js";
import { runSubscriptionPlanRegression } from "./golden-flow/09_plan.test.js";
import { runGoldenSmokeTest } from "./golden-flow/10_golden_smoke.test.js";
import { runPurchaseDraftAndPaymentAuthRegression } from "./golden-flow/11_purchase_draft_and_payment_auth.test.js";

const TARGET_PORT = 5001;
const HEALTH_URL = `http://localhost:${TARGET_PORT}/api/health`;

function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        resolve(false);
      } else {
        resolve(false);
      }
    });
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function waitForServer(url, timeoutMs = 25000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const body = await res.json();
        if (body.status === "ok") return true;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timeout waiting for backend server at ${url} after ${timeoutMs}ms`);
}

async function main() {
  console.log("======================================================================");
  console.log("🛡️  FINANCIAL AUTOMATION — SAFE INTEGRATION TEST HARNESS");
  console.log("======================================================================");

  // 1. Port conflict detection (Safe abort without killing unrelated processes)
  const isPortFree = await checkPortAvailable(TARGET_PORT);
  if (!isPortFree) {
    console.error(`❌ Port ${TARGET_PORT} is already in use by another process.`);
    console.error(`   Aborting safely to prevent process conflict or port collision.`);
    process.exit(1);
  }
  console.log(`✓ Port ${TARGET_PORT} is verified free.`);

  let mongod = null;
  let backendChild = null;
  const suiteResults = [];

  const allSuites = [
    { id: "01_auth", name: "01_auth (Authentication & Session Role Retention)", fn: runAuthRegression },
    { id: "02_role", name: "02_role (Role Security & Permission Enforcement)", fn: runRoleSecurityRegression },
    { id: "03_inventory", name: "03_inventory (Inventory Lifecycle & OTC Sales)", fn: runInventoryRegression },
    { id: "04_invoice", name: "04_invoice (Invoice Lifecycle & Validation)", fn: runInvoiceRegression },
    { id: "05_payment", name: "05_payment (Payment Flow & Ledger Sync)", fn: runPaymentRegression },
    { id: "06_bookkeeping", name: "06_bookkeeping (Bookkeeping Ledger Idempotency & Reversal)", fn: runBookkeepingRegression },
    { id: "07_financial", name: "07_financial (P&L, Balance Sheet & Financial Statements)", fn: runFinancialRegression },
    { id: "08_data_isolation", name: "08_data_isolation (Multi-Tenant Company Data Isolation)", fn: runDataIsolationRegression },
    { id: "09_plan", name: "09_plan (Subscription Plan Enforcement)", fn: runSubscriptionPlanRegression },
    { id: "10_golden_smoke", name: "10_golden_smoke (End-to-End Golden Smoke Test)", fn: runGoldenSmokeTest },
    { id: "11_purchase_draft_and_payment_auth", name: "11_purchase_draft_and_payment_auth (Purchase Draft & Payment Auth)", fn: runPurchaseDraftAndPaymentAuthRegression },
  ];

  const isSmokeOnly = process.argv.includes("--smoke");
  const suitesToRun = isSmokeOnly
    ? allSuites.filter((s) => s.id === "10_golden_smoke")
    : allSuites;

  try {
    // 2. Start ephemeral MongoMemoryServer on local loopback interface
    console.log("⏳ Starting ephemeral in-memory MongoDB instance...");
    mongod = await MongoMemoryServer.create({
      instance: {
        ip: "127.0.0.1",
        dbName: "Financialautomation_test",
      },
    });
    const memoryMongoUri = mongod.getUri();
    console.log("✓ Ephemeral in-memory MongoDB started successfully on loopback interface.");

    // 3. Spawn backend server with fail-closed environment isolation
    console.log("⏳ Spawning backend server with fail-closed isolated environment...");
    const isolatedEnv = {
      ...process.env,
      PORT: String(TARGET_PORT),
      NODE_ENV: "test",
      DEV_MODE: "true",
      DEV_MONGO_URI: memoryMongoUri,
      PRO_MONGO_URI: memoryMongoUri, // Strictly neutralized to memory DB: Cloud Atlas impossible
      JWT_SECRET: "test_jwt_secret_for_golden_flow_regression_2026",
      RAZORPAY_KEY_ID: "rzp_test_placeholder",
      RAZORPAY_KEY_SECRET: "placeholder_secret",
      TEST_API_URL: `http://localhost:${TARGET_PORT}/api`,
      PERF_DEBUG: "false",
    };

    backendChild = spawn("node", ["backend/server.js"], {
      env: isolatedEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let backendDegraded = false;
    let backendStarted = false;

    backendChild.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      if (text.includes("MongoDB Connected Successfully")) {
        backendStarted = true;
      }
    });

    backendChild.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      if (text.includes("Starting server in degraded mode")) {
        backendDegraded = true;
      }
    });

    backendChild.on("exit", (code, signal) => {
      if (!signal) {
        console.warn(`[Backend Child] Process exited unexpectedly with code ${code}`);
      }
    });

    // 4. Wait for backend health confirmation
    console.log(`⏳ Waiting for backend health readiness at ${HEALTH_URL}...`);
    await waitForServer(HEALTH_URL, 20000);

    if (backendDegraded) {
      throw new Error("Backend reported degraded mode without working database connection.");
    }
    console.log("✓ Backend is alive and verified ready. Seeded plans initialized.");

    // 5. Execute Golden Flow test suites
    console.log("\n======================================================================");
    console.log(`🚀 EXECUTING ${suitesToRun.length} GOLDEN FLOW TEST SUITES`);
    console.log("======================================================================\n");

    for (const suite of suitesToRun) {
      console.log(`▶ Running Suite: ${suite.name}...`);
      const startTime = Date.now();
      try {
        await suite.fn();
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        suiteResults.push({ name: suite.name, status: "PASS", duration: `${duration}s` });
        console.log(`   ✓ SUITE PASSED: ${suite.name} (${duration}s)\n`);
      } catch (err) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        suiteResults.push({
          name: suite.name,
          status: "FAIL",
          duration: `${duration}s`,
          error: err.message,
        });
        console.error(`   ❌ SUITE FAILED: ${suite.name} (${duration}s)`);
        console.error(`      Error: ${err.message}\n`);
      }
    }
  } catch (startupErr) {
    console.error("❌ Test harness initialization or execution failed:", startupErr.message);
    suiteResults.push({ name: "Harness Initialization", status: "BLOCKED", error: startupErr.message });
  } finally {
    // 6. Graceful cleanup and teardown (ALWAYS executed)
    console.log("\n======================================================================");
    console.log("🧹 TEARDOWN: Terminating child processes and in-memory database...");
    console.log("======================================================================");

    if (backendChild) {
      try {
        backendChild.kill("SIGTERM");
        // Give 2 seconds for graceful shutdown before force kill
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (backendChild.exitCode === null) {
          backendChild.kill("SIGKILL");
        }
        console.log("✓ Backend server child process terminated.");
      } catch (err) {
        console.error("Error terminating backend process:", err);
      }
    }

    if (mongod) {
      try {
        await mongod.stop();
        console.log("✓ Ephemeral in-memory MongoDB stopped.");
      } catch (err) {
        console.error("Error stopping MongoMemoryServer:", err);
      }
    }
  }

  // 7. Print final structured report
  console.log("\n======================================================================");
  console.log("📊 GOLDEN FLOW INTEGRATION TEST RESULTS SUMMARY");
  console.log("======================================================================");
  for (const r of suiteResults) {
    const badge = r.status === "PASS" ? "✓ [PASS]" : r.status === "FAIL" ? "❌ [FAIL]" : "⚠️ [BLOCKED]";
    const extra = r.error ? ` — Error: ${r.error}` : ` (${r.duration || ""})`;
    console.log(`  ${badge.padEnd(11)} ${r.name}${extra}`);
  }

  const passedCount = suiteResults.filter((s) => s.status === "PASS").length;
  const failedCount = suiteResults.filter((s) => s.status === "FAIL").length;
  const blockedCount = suiteResults.filter((s) => s.status === "BLOCKED").length;

  console.log("======================================================================");
  console.log(`TOTAL: ${suiteResults.length} | PASSED: ${passedCount} | FAILED: ${failedCount} | BLOCKED: ${blockedCount}`);
  console.log("======================================================================\n");

  if (failedCount > 0 || blockedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Unhandled harness error:", err);
  process.exit(1);
});
