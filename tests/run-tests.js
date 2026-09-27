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

async function main() {
  const args = process.argv.slice(2);
  const isSmokeOnly = args.includes("--smoke");
  const isRegressionOnly = args.includes("--regression");

  console.log("==================================================");
  console.log("🚀 FINANCIAL AUTOMATION REGRESSION PROTECTION SUITE");
  console.log("==================================================");

  try {
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
    process.exit(1);
  }
}

main();
