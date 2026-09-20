import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SubscriptionProvider, useSubscription } from "@/contexts/SubscriptionContext";
import { Loader2 } from "lucide-react";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import ProfileSettings from "./pages/ProfileSettings";
import Payroll from "./pages/Payroll";
import TaxGST from "./pages/TaxGST";

import BalanceSheet from "./pages/BalanceSheet";
import ProfitLoss from "./pages/ProfitLoss";
import CashFlow from "./pages/CashFlow";
import NotFound from "./pages/NotFound";
import CivilEngineering from "./pages/CivilEngineering";

import CashFlowStatement from "./pages/CashFlowStatement";
import FinancialRatios from "./pages/FinancialRatios";
import Bookkeeping from "./pages/Bookkeeping";
import Inventory from "./pages/Inventory";
import BankReconciliation from "./pages/BankReconciliation";
import FraudDetection from "./pages/FraudDetection";
import AutomationInvoice from "./pages/AutomationInvoice";
import PublicInvoiceView from "./pages/PublicInvoiceView";
import PublicPurchaseInvoiceView from "./pages/PublicPurchaseInvoiceView";
import InvoiceTemplates from "./pages/InvoiceTemplates";
import InvoiceTemplateEditor from "./pages/InvoiceTemplateEditor";
import PurchaseInvoiceTemplates from "./pages/PurchaseInvoiceTemplates";
import PurchaseInvoiceTemplateEditor from "./pages/PurchaseInvoiceTemplateEditor";
import ResetPassword from "./pages/ResetPassword";
import ServerIssues from "./pages/ServerIssues";
import AiAccountingExplained from "./pages/AiAccountingExplained";
import ThankYou from "./pages/ThankYou";
import ProductPage from "./pages/ProductPage";
import AiInvoicingSoftware from "./pages/AiInvoicingSoftware";
import CashFlowForecastingSoftware from "./pages/CashFlowForecastingSoftware";

const queryClient = new QueryClient();

const RootRoute = () => {
  const { user, loading } = useSubscription();
  const isMaintenanceMode = import.meta.env.VITE_MAINTENANCE_MODE === "true";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-[#006aff]" />
      </div>
    );
  }

  if (user) {
    return <Navigate to={isMaintenanceMode ? "/server-issues" : "/dashboard"} replace />;
  }

  return <Navigate to={isMaintenanceMode ? "/server-issues" : "/auth"} replace />;
};

const App = () => {
  const isMaintenanceMode = import.meta.env.VITE_MAINTENANCE_MODE === "true";

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SubscriptionProvider>
          <Toaster />
          <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<RootRoute />} />
            <Route path="/product" element={<ProductPage />} />
            <Route path="/ai-accounting-software" element={<Index />} />
            <Route path="/ai-invoicing-software" element={<AiInvoicingSoftware />} />
            <Route path="/products/cash-flow-forecasting-software/" element={<CashFlowForecastingSoftware />} />

            {/* Maintenance Mode Gates */}
            <Route
              path="/auth"
              element={isMaintenanceMode ? <ServerIssues /> : <Auth />}
            />

            <Route
              path="/dashboard"
              element={isMaintenanceMode ? <ServerIssues /> : <Dashboard />}
            />

            <Route
              path="/profile"
              element={isMaintenanceMode ? <ServerIssues /> : <ProfileSettings />}
            />

            <Route path="/payroll" element={isMaintenanceMode ? <ServerIssues /> : <Payroll />} />
            <Route path="/tax-gst" element={isMaintenanceMode ? <ServerIssues /> : <TaxGST />} />
            <Route path="/balance-sheet" element={isMaintenanceMode ? <ServerIssues /> : <BalanceSheet />} />
            <Route path="/profit-loss" element={isMaintenanceMode ? <ServerIssues /> : <ProfitLoss />} />
            <Route path="/cashflow" element={isMaintenanceMode ? <ServerIssues /> : <CashFlow />} />
            <Route path="/civil-engineering" element={isMaintenanceMode ? <ServerIssues /> : <CivilEngineering />} />
            <Route path="/cashflow-statement" element={isMaintenanceMode ? <ServerIssues /> : <CashFlowStatement />} />
            <Route path="/financial-ratios" element={isMaintenanceMode ? <ServerIssues /> : <FinancialRatios />} />
            <Route path="/bookkeeping" element={isMaintenanceMode ? <ServerIssues /> : <Bookkeeping />} />
            <Route path="/inventory" element={isMaintenanceMode ? <ServerIssues /> : <Inventory />} />
            <Route path="/bank-reconciliation" element={isMaintenanceMode ? <ServerIssues /> : <BankReconciliation />} />
            <Route path="/fraud-detection" element={isMaintenanceMode ? <ServerIssues /> : <FraudDetection />} />
            <Route path="/invoice" element={isMaintenanceMode ? <ServerIssues /> : <AutomationInvoice />} />
            <Route path="/invoice/ocr" element={isMaintenanceMode ? <ServerIssues /> : <AutomationInvoice />} />
            <Route path="/invoice/templates" element={isMaintenanceMode ? <ServerIssues /> : <InvoiceTemplates />} />
            <Route path="/invoice/templates/create" element={isMaintenanceMode ? <ServerIssues /> : <InvoiceTemplateEditor />} />
            <Route path="/invoice-templates" element={isMaintenanceMode ? <ServerIssues /> : <InvoiceTemplates />} />
            <Route path="/invoice-templates/create" element={isMaintenanceMode ? <ServerIssues /> : <InvoiceTemplateEditor />} />
            <Route path="/inventory/purchase-templates" element={isMaintenanceMode ? <ServerIssues /> : <PurchaseInvoiceTemplates />} />
            <Route path="/inventory/purchase-templates/create" element={isMaintenanceMode ? <ServerIssues /> : <PurchaseInvoiceTemplateEditor />} />
            <Route path="/purchase-templates" element={isMaintenanceMode ? <ServerIssues /> : <PurchaseInvoiceTemplates />} />
            <Route path="/purchase-templates/create" element={isMaintenanceMode ? <ServerIssues /> : <PurchaseInvoiceTemplateEditor />} />
            <Route path="/invoice/view/:id" element={<PublicInvoiceView />} />
            <Route path="/purchase-invoice/view/:id" element={<PublicPurchaseInvoiceView />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/thank-you" element={<ThankYou />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        </SubscriptionProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};


export default App;
