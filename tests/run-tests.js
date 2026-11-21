import http from "http";
import { spawn } from "child_process";
import path from "path";
import { pathToFileURL } from "url";
import { ensureServerReady, getApiBase } from "./golden-flow/test_helper.js";
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

async function getMongoMemoryServer() {
  try {
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    return MongoMemoryServer;
  } catch {
    const mongodPath = path.resolve("backend/node_modules/mongodb-memory-server/index.js");
    const { MongoMemoryServer } = await import(pathToFileURL(mongodPath).href);
    return MongoMemoryServer;
  }
}

async function isPortReachable(apiUrl) {
  return new Promise((resolve) => {
    try {
      const u = new URL(apiUrl + "/health");
      const req = http.request({
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: "GET",
        timeout: 1000
      }, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => { req.destroy(); resolve(false); });
      req.end();
    } catch {
      resolve(false);
    }
  });
}

async function main() {
  const args = process.argv.slice(2);
  const isSmokeOnly = args.includes("--smoke");
  const isRegressionOnly = args.includes("--regression");
  const forceInMemory = args.includes("--in-memory") ||
                        process.env.USE_IN_MEMORY_DB === "true" ||
                        process.env.CI === "true";

  let mongod = null;
  let serverProcess = null;

  console.log("==================================================");
  console.log("🚀 FINANCIAL AUTOMATION REGRESSION PROTECTION SUITE");
  console.log("==================================================");

  try {
    const initialApi = getApiBase();
    const isLive = await isPortReachable(initialApi);

    if (forceInMemory || !isLive) {
      console.log("\n📦 Starting isolated MongoMemoryServer environment...");
      const MongoMemoryServer = await getMongoMemoryServer();
      mongod = await MongoMemoryServer.create();
      const mongoUri = mongod.getUri();
      const testPort = process.env.TEST_PORT || "5098";

      console.log(`   ✓ In-memory MongoDB URI: ${mongoUri}`);
      console.log(`   ⚙️ Spawning ephemeral test backend on port ${testPort}...`);

      serverProcess = spawn(process.execPath, ["backend/server.js"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PORT: String(testPort),
          DEV_MODE: "true",
          DEV_MONGO_URI: mongoUri,
          BLOCK_PROD_FALLBACK: "true",
          JWT_SECRET: process.env.JWT_SECRET || "ci_test_secret_key_12345",
          NODE_ENV: "test"
        },
        stdio: ["ignore", "pipe", "pipe"]
      });

      serverProcess.stderr.on("data", (chunk) => {
        const msg = chunk.toString();
        if (!msg.includes("ExperimentalWarning") && !msg.includes("punycode")) {
          // Log server errors if any
        }
      });

      process.env.TEST_API_URL = `http://127.0.0.1:${testPort}/api`;
    }

    console.log(`🔗 Target API endpoint: ${getApiBase()}`);
    await ensureServerReady();

    if (isSmokeOnly) {
      await runGoldenSmokeTest();
    } else if (isRegressionOnly) {
      await runAuthRegression();
      await runRoleSecurityRegression();
      await runInventoryRegression();
      await runInvoiceRegression();
      await runPaymentRegression();
      await runBookkeepingRegression();
      await runFinancialRegression();
      await runDataIsolationRegression();
      await runSubscriptionPlanRegression();
    } else {
      // Run ALL tests
      await runAuthRegression();
      await runRoleSecurityRegression();
      await runInventoryRegression();
      await runInvoiceRegression();
      await runPaymentRegression();
      await runBookkeepingRegression();
      await runFinancialRegression();
      await runDataIsolationRegression();
      await runSubscriptionPlanRegression();
      await runGoldenSmokeTest();
    }

    console.log("==================================================");
    console.log("✨ ALL EXECUTED TEST SUITES PASSED CLEANLY!");
    console.log("==================================================");
  } catch (error) {
    console.error("\n❌ REGRESSION PROTECTION SUITE FAILED:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (serverProcess) {
      console.log("🛑 Stopping ephemeral test backend...");
      try { serverProcess.kill("SIGTERM"); } catch {}
    }
    if (mongod) {
      console.log("🛑 Stopping MongoMemoryServer...");
      try { await mongod.stop(); } catch {}
    }
  }
}

main();
