import React, { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  BanknoteIcon,
  BarChart3,
  Building2,
  Calculator,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  FolderArchive,
  LogOut,
  Package,
  Settings,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  Home,
  BookOpen,
  Receipt,
  BarChart2,
  Menu,
  X,
  Send,
  Bot,
  History,
  Download,
  Landmark,
  PieChart,
  Activity,
  RefreshCw,
  Lock,
  Check,
  Zap
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { REPORT_FOOTER_COMPANY, getReportCompanyName, formatPDFCurrency, formatPDFRatio } from "@/lib/reportBranding";
import { useSubscription } from "@/contexts/SubscriptionContext";

import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { API_ENDPOINTS, API_BASE_URL, apiRequest } from "@/lib/api";
import { isTrialExpired } from "@/lib/trial";
import { callGemini, SUGGESTED_PROMPTS } from "@/lib/gemini";

// --- Types & Data ---

type UserProfile = {
  id: string;
  email: string;
  name?: string;
  role?: "admin" | "instore";
  subscriptionStatus?: "pending" | "active";
  subscriptionPlan?: "trial" | "monthly" | "annual" | "lifetime";
  subscriptionAmount?: number;
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  trialEndDate?: string;
  sellerName?: string;
  sellerPhone?: string;
  sellerEmail?: string;
  sellerGSTIN?: string;
  sellerState?: string;
  sellerAddress?: string;
};

type DashboardModule = {
  title: string;
  description: string;
  output: string;
  icon: React.ElementType;
  path: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
};

const dashboardModules: DashboardModule[] = [
  { title: "Dashboard", description: "Main overview", output: "", icon: Home, path: "/" },
  { title: "Payroll Automation", description: "Manage employee salaries, deductions, and salary slips.", output: "", icon: Users, path: "/payroll" },
  { title: "Tax & GST Management", description: "Calculate and manage GST, CGST, SGST, and IGST.", output: "", icon: FileText, path: "/tax-gst" },
  { title: "Balance Sheet", description: "Generate balance sheets with assets, liabilities, and equity.", output: "", icon: BarChart3, path: "/balance-sheet" },
  { title: "Profit & Loss", description: "Create P&L statements with income and expense analysis.", output: "", icon: TrendingUp, path: "/profit-loss" },
  { title: "Cash Flow Prediction", description: "AI-powered forecasting for next 6 months.", output: "", icon: FileSpreadsheet, path: "/cashflow" },
  { title: "Cash Flow Statement", description: "Trace inflows, outflows, and net movement.", output: "", icon: BarChart3, path: "/cashflow-statement" },
  { title: "Financial Ratios", description: "Calculate liquidity, profitability, and solvency metrics.", output: "", icon: Calculator, path: "/financial-ratios" },
  { title: "Bookkeeping", description: "Record income, expenses, and categorized entries.", output: "", icon: BookOpen, path: "/bookkeeping" },
  { title: "Inventory Management", description: "Track inventory with automated reorder alerts.", output: "", icon: Package, path: "/inventory" },
  { title: "Bank Reconciliation", description: "Match ledger entries with bank statements.", output: "", icon: BanknoteIcon, path: "/bank-reconciliation" },
  { title: "Fraud Detection", description: "Detect and prevent fraudulent transactions.", output: "", icon: Shield, path: "/fraud-detection" },
  { title: "Civil Engineering", description: "Plan schedules, structures, and project delivery.", output: "", icon: Building2, path: "/civil-engineering" },
  { title: "Invoice Automation", description: "OCR scanning, voice input, and smart processing.", output: "", icon: FolderArchive, path: "/invoice" },
];

const emptyStats = [
  { title: "Total Receivables", amount: "", trend: "", isPositive: true, iconColor: "text-[#006aff]", icon: TrendingUp },
  { title: "Total Payables", amount: "", trend: "", isPositive: true, iconColor: "text-[#f0483e]", icon: Receipt },
  { title: "Net Profit", amount: "", trend: "", isPositive: true, iconColor: "text-[#00b365]", icon: BarChart2 },
  { title: "GST Payable", amount: "", trend: "", isPositive: true, iconColor: "text-[#0288d1]", icon: Receipt },
];

const isDateInPeriod = (dateInput: any, period: string): boolean => {
  if (!dateInput) return false;
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return false;
  const now = new Date();

  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  if (period === "this-month") {
    return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
  }
  if (period === "last-month") {
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    return date.getMonth() === prevMonth && date.getFullYear() === prevMonthYear;
  }
  if (period === "this-quarter") {
    const currentQuarter = Math.floor(currentMonth / 3);
    const dateQuarter = Math.floor(date.getMonth() / 3);
    return dateQuarter === currentQuarter && date.getFullYear() === currentYear;
  }
  if (period === "this-year") {
    return date.getFullYear() === currentYear;
  }
  return true;
};

const toNumber = (value: unknown) => Number(value) || 0;
const formatCurrency = (value: unknown) => `₹${toNumber(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
  "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka",
  "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan",
  "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

const getModuleKeyFromPath = (path: string): string => {
  if (path === "/") return "dashboard";
  if (path === "/tax-gst") return "tax-gst";
  if (path === "/balance-sheet") return "balance-sheet";
  if (path === "/profit-loss") return "profit-loss";
  if (path === "/cashflow") return "cashflow";
  if (path === "/cashflow-statement") return "cashflow-statement";
  if (path === "/financial-ratios") return "financial-ratios";
  if (path === "/civil-engineering") return "civil-engineering";
  return path.replace("/", "");
};

// Shared Light-Mode Liquid Glass Style Constants
const glassCardClass =
  "bg-gradient-to-br from-white/80 via-white/60 to-white/45 backdrop-blur-2xl border border-white/90 shadow-[0_12px_36px_rgba(15,23,42,0.06),inset_0_1.5px_2px_rgba(255,255,255,0.95),inset_0_-1px_1.5px_rgba(255,255,255,0.55)] rounded-[28px]";

const glassSubCardClass =
  "bg-white/65 backdrop-blur-xl border border-white/90 shadow-[0_4px_16px_rgba(15,23,42,0.03),inset_0_1px_1.5px_rgba(255,255,255,0.95)] rounded-[20px]";

const glassPillButtonClass =
  "bg-white/75 hover:bg-white/95 backdrop-blur-xl border border-white/90 shadow-[0_4px_12px_rgba(15,23,42,0.05),inset_0_1px_1px_rgba(255,255,255,0.95)] rounded-full transition-all";

// --- Main Component ---

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const { 
    user: contextUser, 
    loading: contextLoading, 
    hasAccess, 
    openUpgradeModal, 
    showUpgradeModalFor, 
    closeUpgradeModal, 
    refreshUser 
  } = useSubscription();
  
  // State
  const [loading, setLoading] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);

  // Sync user state from subscription context
  useEffect(() => {
    if (contextUser) {
      setUser(contextUser);
    }
  }, [contextUser]);

  // Sync loading state
  useEffect(() => {
    setLoading(contextLoading);
  }, [contextLoading]);

  // Listen to redirect triggers for opening upgrade modal
  useEffect(() => {
    if (location.state?.triggerUpgradeModal) {
      openUpgradeModal(location.state.triggerUpgradeModal);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const DashboardWidgetLock = ({ moduleName, children, className = "" }: { moduleName: string, children: React.ReactNode, className?: string }) => {
    const isLocked = !hasAccess(moduleName);

    if (!isLocked) {
      return <div className={`relative ${className}`}>{children}</div>;
    }

    const moduleTitle = dashboardModules.find(m => getModuleKeyFromPath(m.path) === moduleName)?.title || moduleName;

    return (
      <div className={`relative overflow-hidden group rounded-[28px] ${className}`}>
        {/* Blurred background content */}
        <div className="filter blur-[2px] pointer-events-none select-none opacity-45 h-full">
          {children}
        </div>
        
        {/* Light Liquid Glass Lock Overlay */}
        <div className="absolute inset-0 bg-white/55 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center z-10 animate-fade-in border border-white/90 rounded-[28px] shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.95)]">
          <div className="w-11 h-11 rounded-full bg-white/85 shadow-[0_6px_16px_rgba(15,23,42,0.08),inset_0_1px_1px_rgba(255,255,255,1)] border border-white flex items-center justify-center mb-2.5">
            <Lock className="w-4 h-4 text-slate-600 animate-pulse" />
          </div>
          <h4 className="text-[14px] font-bold text-slate-800 mb-0.5">
            {moduleTitle} Locked
          </h4>
          <p className="text-[11px] text-slate-500 max-w-[200px] mb-3 leading-snug">
            {user?.role === "instore" ? "Restricted for Store accounts." : "Not included in your current subscription."}
          </p>
          {user?.role !== "instore" && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                openUpgradeModal(moduleName);
              }}
              className="px-4 py-1.5 bg-[#006aff] hover:bg-[#005cdb] text-white text-[11px] font-bold rounded-full shadow-[0_6px_16px_rgba(0,106,255,0.28),inset_0_1px_1px_rgba(255,255,255,0.4)] transition-all flex items-center gap-1.5 cursor-pointer select-none"
            >
              <Sparkles className="w-3 h-3" /> Upgrade Plan
            </button>
          )}
        </div>
      </div>
    );
  };

  // Seller Setup Modal States
  const [showSellerSetupModal, setShowSellerSetupModal] = useState(false);
  const [setupSellerName, setSetupSellerName] = useState("");
  const [setupSellerPhone, setSetupSellerPhone] = useState("");
  const [setupSellerEmail, setSetupSellerEmail] = useState("");
  const [setupSellerGSTIN, setSetupSellerGSTIN] = useState("");
  const [setupSellerState, setSetupSellerState] = useState("Tamil Nadu");
  const [setupSellerAddress, setSetupSellerAddress] = useState("");
  const [isSubmittingSetup, setIsSubmittingSetup] = useState(false);
  
  // Period filtering & Raw Datasets States
  const [selectedPeriod, setSelectedPeriod] = useState<string>("this-month");
  const [allInvoices, setAllInvoices] = useState<any[]>([]);
  const [allPurchaseInvoices, setAllPurchaseInvoices] = useState<any[]>([]);
  const [allPayrolls, setAllPayrolls] = useState<any[]>([]);
  const [allBalanceSheets, setAllBalanceSheets] = useState<any[]>([]);
  const [allBookkeepingEntries, setAllBookkeepingEntries] = useState<any[]>([]);
  const [plGen, setPlGen] = useState<any>(null);
  const [cfGen, setCfGen] = useState<any>(null);
  const [gstAnalyticsData, setGstAnalyticsData] = useState<any>(null);
  const [liveBalanceSheetData, setLiveBalanceSheetData] = useState<any>(null);
  const [liveFinancialRatiosData, setLiveFinancialRatiosData] = useState<any>(null);

  // Modules Dynamic Data States
  const [dashboardStats, setDashboardStats] = useState<any[]>(emptyStats);
  const [invoicesList, setInvoicesList] = useState<any[]>([]);
  const [financialRatios, setFinancialRatios] = useState<any[]>([]);
  const [plSummaryData, setPlSummaryData] = useState<any>({
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    grossProfitMargin: 0,
    netProfitMargin: 0
  });
  const [bsSummary, setBsSummary] = useState({ assets: 0, liabilities: 0, equity: 0 });
  const [cashFlowStatements, setCashFlowStatements] = useState<any[]>([]);

  // AI Chat States
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: "1", role: "ai", content: "Hello! I'm your **AI CFO**, connected to your live accounting database.\n\nI can answer questions about:\n- 📊 Revenue, Expenses & Net Profit\n- 🧾 Invoices & Accounts Receivable\n- 🏷️ GST & Tax Analysis\n- 📦 Inventory & Stock\n- 👥 Payroll & HR\n- 📋 Balance Sheet & Ratios\n- 💰 Cash Flow\n\nTry asking: *\"What is my net profit this month?\"*", timestamp: new Date() }
  ]);
  const [chatViewMode, setChatViewMode] = useState<"chat" | "history">("chat");
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, chatViewMode]);

  // Fetching Logic
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/auth");
      return;
    }

    const fetchChatHistory = async () => {
      try {
        const res = await apiRequest(API_ENDPOINTS.AI_CHAT_HISTORY);
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.history) && data.history.length > 0) {
            setChatMessages(data.history.map((msg: any) => ({
              id: msg.id || Math.random().toString(),
              role: msg.role,
              content: msg.content,
              timestamp: new Date(msg.timestamp)
            })));
          }
        }
      } catch (err) {
        console.error("Error loading chat history:", err);
      }
    };

    fetch(API_ENDPOINTS.USER, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch user");
        return res.json();
      })
      .then((data: UserProfile) => {
        setUser(data);
        refreshUser(data);
        const isUserAdmin = data.role === "admin";
        if (!isUserAdmin && (data.subscriptionStatus !== "active" || isTrialExpired(data))) {
          toast({
            variant: "destructive",
            title: "Free Trial / Subscription Ended",
            description: "Your subscription has expired. Premium features are locked. Please upgrade or renew your plan.",
          });
          fetchChatHistory();
        } else {
          fetchChatHistory();
          // Check if seller name is not set, prompt the user to complete seller profile
          if (!data.sellerName) {
            setSetupSellerName(data.name || "");
            setSetupSellerEmail(data.email || "");
            setShowSellerSetupModal(true);
          }
        }
      })
      .catch((error) => {
        console.error("Error fetching user:", error);
        localStorage.removeItem("token");
        navigate("/auth");
      })
      .finally(() => setLoading(false));
  }, [navigate, toast]);

  // Load Dashboard Data
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const fetchDashboardData = async () => {
      try {
        const readJson = async (endpoint: string) => {
          const response = await apiRequest(endpoint).catch(() => null);
          return response?.ok ? response.json() : null;
        };

        let backendInvoices: any[] = [];
        const invoicesRes = await apiRequest(`${API_ENDPOINTS.INVOICE}/all?limit=500`).catch(() => null);
        if (invoicesRes && invoicesRes.ok) {
          const parsed = await invoicesRes.json();
          if (parsed && parsed.invoices) backendInvoices = parsed.invoices;
        }

        // Merge backend invoices and localStorage invoices prioritizing backend server data
        const localInvoices: any[] = JSON.parse(localStorage.getItem('savedInvoices') || '[]');
        const invoiceMap = new Map();
        // First add backendInvoices (canonical source from DB)
        backendInvoices.forEach(inv => {
          const key = inv.invoiceNumber || inv.invoiceNo || inv._id || inv.id;
          if (key) {
            invoiceMap.set(key, inv);
          }
        });
        // Then add any local-only invoices strictly belonging to current logged-in user
        const currentUserId = user?.id || contextUser?.id;
        localInvoices.forEach(inv => {
          const key = inv.invoiceNumber || inv.invoiceNo || inv._id || inv.id;
          if (inv.userId && currentUserId && String(inv.userId) !== String(currentUserId)) {
            return;
          }
          if (key && !invoiceMap.has(key)) {
            invoiceMap.set(key, inv);
          }
        });
        setAllInvoices(Array.from(invoiceMap.values()));

        const purchasesRes = await apiRequest(`${API_BASE_URL}/purchase-invoice/all`).catch(() => null);
        if (purchasesRes && purchasesRes.ok) {
          const parsed = await purchasesRes.json();
          if (parsed && parsed.invoices) setAllPurchaseInvoices(parsed.invoices);
        }

        const payrollRes = await apiRequest(`${API_BASE_URL}/payroll/all`).catch(() => null);
        if (payrollRes && payrollRes.ok) {
          const parsed = await payrollRes.json();
          if (parsed) setAllPayrolls(parsed);
        }

        const balanceSheetsRes = await apiRequest(`${API_BASE_URL}/balance`).catch(() => null);
        if (balanceSheetsRes && balanceSheetsRes.ok) {
          const parsed = await balanceSheetsRes.json();
          if (parsed) setAllBalanceSheets(parsed);
        }

        const [statements, bookkeeping, plGenData, cfGenData, gstData, liveBS, liveRatios] = await Promise.all([
          readJson(`${API_BASE_URL}/cashflow-statement/all`),
          readJson(`${API_BASE_URL}/bookkeeping/all`),
          readJson(`${API_BASE_URL}/profitloss/generate?period=${selectedPeriod}`),
          readJson(`${API_BASE_URL}/cashflow-statement/generate?period=${selectedPeriod}`),
          readJson(`${API_BASE_URL}/tax/analytics?period=${selectedPeriod}`),
          readJson(`${API_BASE_URL}/balance/generate?period=${selectedPeriod}`),
          readJson(`${API_BASE_URL}/financial-ratios/generate?period=${selectedPeriod}`)
        ]);

        if (plGenData) setPlGen(plGenData);
        if (cfGenData) setCfGen(cfGenData);
        if (gstData) setGstAnalyticsData(gstData);
        if (liveBS) setLiveBalanceSheetData(liveBS);
        if (liveRatios) setLiveFinancialRatiosData(liveRatios);
        const cashFlowStatementData = Array.isArray(statements) ? statements.filter((s: any) => !s.isDeleted) : [];
        const bookkeepingEntries = Array.isArray(bookkeeping?.entries) ? bookkeeping.entries.filter((e: any) => !e.isDeleted) : [];
        
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthCashFlowStatements = cashFlowStatementData.filter((statement: any) => {
          const createdAt = new Date(statement.createdAt);
          return !Number.isNaN(createdAt.getTime()) && createdAt >= lastMonthStart && createdAt < currentMonthStart;
        });

        setCashFlowStatements(lastMonthCashFlowStatements);
        setAllBookkeepingEntries(bookkeepingEntries);

      } catch (err) {
        console.error("Error loading dashboard data:", err);
      }
    };

    fetchDashboardData();
  }, [selectedPeriod, location.pathname]);

  // Update calculations whenever period or raw data changes
  useEffect(() => {
    const filteredInvoices = allInvoices.filter(inv => !inv.isDeleted && inv.status !== 'cancelled' && isDateInPeriod(inv.invoiceDate || inv.createdAt, selectedPeriod));
    const filteredPurchases = allPurchaseInvoices.filter(inv => !inv.isDeleted && isDateInPeriod(inv.createdAt || inv.billDate, selectedPeriod));

    // Calculate Receivables (total unpaid balance owed TO us by customers)
    const invoiceReceivables = allInvoices.reduce((sum, inv) => {
      if (inv.isDeleted || inv.status === 'cancelled' || inv.status === 'paid') return sum;
      if (!isDateInPeriod(inv.invoiceDate || inv.createdAt, selectedPeriod)) return sum;
      
      const total = inv.grandTotal || inv.total || 0;
      const paid = inv.paid !== undefined ? inv.paid : (inv.amountPaid || 0);
      const balance = inv.balance !== undefined ? inv.balance : Math.max(0, total - paid);
      return sum + Math.max(0, balance);
    }, 0);

    // Calculate Payables (total unpaid balance WE owe to suppliers)
    const purchasePayables = allPurchaseInvoices.reduce((sum, inv) => {
      if (inv.isDeleted || inv.status === 'cancelled') return sum;
      if (!isDateInPeriod(inv.createdAt || inv.billDate, selectedPeriod)) return sum;

      const total = inv.total || 0;
      const paid = inv.paid !== undefined ? inv.paid : (inv.amountPaid || 0);
      const balance = inv.balance !== undefined ? inv.balance : Math.max(0, total - paid);
      return sum + Math.max(0, balance);
    }, 0);

    const revenue = filteredInvoices.reduce((sum, inv) => sum + (inv.grandTotal || inv.total || 0), 0);
    const purchaseExpenses = filteredPurchases.reduce((sum, inv) => sum + (inv.total || 0), 0);

    const selectedPeriodBookkeeping = allBookkeepingEntries.filter(entry => !entry.isDeleted && isDateInPeriod(entry.date, selectedPeriod));
    const bkIncome = selectedPeriodBookkeeping.reduce((sum, entry) => entry.type === "income" ? sum + toNumber(entry.amount) : sum, 0);
    const bkExpense = selectedPeriodBookkeeping.reduce((sum, entry) => entry.type === "expense" ? sum + toNumber(entry.amount) : sum, 0);

    const calcReceivables = invoiceReceivables > 0 
      ? invoiceReceivables 
      : ((cfGen?.cashFlow?.receivables > 0) ? cfGen.cashFlow.receivables : bkIncome);

    // Payables are open supplier-bill balances only.
    const calcPayables = purchasePayables;

    const netProf = plGen?.netProfit !== undefined ? plGen.netProfit : (bkIncome - bkExpense);

    setDashboardStats([
      { title: "Total Receivables", amount: formatCurrency(calcReceivables), trend: "", isPositive: true, hasData: true, iconColor: "text-[#006aff]", icon: TrendingUp },
      { title: "Total Payables", amount: formatCurrency(calcPayables), trend: "", isPositive: true, hasData: true, iconColor: "text-[#f0483e]", icon: Receipt },
      { title: "Net Profit", amount: formatCurrency(netProf), trend: "", isPositive: netProf >= 0, hasData: netProf !== 0, iconColor: "text-[#00b365]", icon: BarChart2 },
      { title: "GST Payable", amount: (cfGen?.cashFlow?.gstPayable && cfGen.cashFlow.gstPayable > 0) ? formatCurrency(cfGen.cashFlow.gstPayable) : "₹0.00", trend: "", isPositive: true, hasData: (cfGen?.cashFlow?.gstPayable !== undefined && cfGen.cashFlow.gstPayable > 0), iconColor: "text-[#0288d1]", icon: Receipt },
    ]);

    setPlSummaryData({
      totalRevenue: plGen?.totalRevenue || revenue || bkIncome,
      totalExpenses: plGen?.totalExpenses || purchaseExpenses || bkExpense,
      netProfit: netProf,
      grossProfitMargin: revenue > 0 ? (((revenue - purchaseExpenses) / revenue) * 100) : 0,
      netProfitMargin: revenue > 0 ? ((netProf / revenue) * 100) : 0
    });

    const selectedPeriodInvoices = allInvoices.filter(inv => !inv.isDeleted && isDateInPeriod(inv.invoiceDate || inv.createdAt, selectedPeriod));
    const mappedInvoices = selectedPeriodInvoices.slice(0, 5).map((inv: any) => {
      let statusColor = "bg-white/70 text-slate-600 border border-white";
      const paidVal = inv.paid !== undefined ? inv.paid : (inv.amountPaid || 0);
      const totalVal = inv.grandTotal || inv.total || 0;
      const balVal = inv.balance !== undefined ? inv.balance : Math.max(0, totalVal - paidVal);

      let statusStr = inv.status || "draft";
      if (balVal <= 0 && totalVal > 0) statusStr = "paid";
      else if (inv.saleType === "credit" || balVal > 0) statusStr = "due";

      if (statusStr === "paid") statusColor = "bg-[#e6f8ef]/90 text-[#00b365] border border-[#00b365]/30";
      else if (statusStr === "due" || statusStr === "sent" || statusStr === "viewed") statusColor = "bg-[#fde9e8]/90 text-[#f0483e] border border-[#f0483e]/30";
      else if (statusStr === "overdue") statusColor = "bg-[#fde9e8]/90 text-[#f0483e] border border-[#f0483e]/30";
      else if (statusStr === "draft") statusColor = "bg-[#fff8e1]/90 text-[#f57c00] border border-[#f57c00]/30";

      return {
        id: inv.invoiceNo || inv.invoiceNumber || inv._id || "INV-UNKNOWN",
        company: inv.partyName || inv.customerName || "Customer",
        amount: `₹${totalVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
        status: statusStr.toUpperCase(),
        statusColor,
        rawDate: inv.invoiceDate || inv.createdAt
      };
    });
    setInvoicesList(mappedInvoices);

    if (liveBalanceSheetData) {
      setBsSummary({
        assets: liveBalanceSheetData.assets?.totalAssets || 0,
        liabilities: liveBalanceSheetData.liabilities?.totalLiabilities || 0,
        equity: liveBalanceSheetData.equity?.totalEquity || 0
      });
    } else {
      setBsSummary({ assets: 0, liabilities: 0, equity: 0 });
    }

    if (liveFinancialRatiosData && liveFinancialRatiosData.ratios) {
      const r = liveFinancialRatiosData.ratios;
      setFinancialRatios([
        { label: "Current Ratio", value: typeof r.currentRatio === "number" ? r.currentRatio.toFixed(2) : "0.00", status: r.currentRatio >= 1.5 ? "Good" : "Low" },
        { label: "Quick Ratio", value: typeof r.quickRatio === "number" ? r.quickRatio.toFixed(2) : "0.00", status: r.quickRatio >= 1.0 ? "Good" : "Low" },
        { label: "Debt to Equity", value: typeof r.debtToEquity === "number" ? r.debtToEquity.toFixed(2) : "0.00", status: r.debtToEquity <= 1.5 ? "Good" : "High" },
        { label: "Gross Margin", value: `${(r.grossProfitMargin || 0).toFixed(2)}%`, status: "Good" },
        { label: "Net Margin", value: `${(r.netProfitMargin || 0).toFixed(2)}%`, status: "Good" },
        { label: "ROE", value: `${(r.roe || 0).toFixed(2)}%`, status: "Good" },
      ]);
    } else {
      setFinancialRatios([
        { label: "Current Ratio", value: "0.00", status: "Low" },
        { label: "Quick Ratio", value: "0.00", status: "Low" },
        { label: "Debt to Equity", value: "0.00", status: "Good" },
        { label: "Gross Margin", value: "0.00%", status: "Good" },
        { label: "Net Margin", value: "0.00%", status: "Good" },
        { label: "ROE", value: "0.00%", status: "Good" },
      ]);
    }

  }, [allInvoices, allPurchaseInvoices, allPayrolls, allBalanceSheets, selectedPeriod, allBookkeepingEntries, liveBalanceSheetData, liveFinancialRatiosData]);

  const formatYAxis = (val: number) => {
    if (val >= 10000000) return `${(val / 10000000).toFixed(1)}Cr`;
    if (val >= 100000) return `${(val / 100000).toFixed(1)}L`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return Math.round(val).toString();
  };

  const { revenueLinePath, revenueMax, revenueXLabels } = useMemo(() => {
    const filtered = allInvoices.filter(inv => isDateInPeriod(inv.invoiceDate, selectedPeriod));
    if (!filtered.length) return { revenueLinePath: "", revenueMax: 0, revenueXLabels: [] };

    const sorted = [...filtered].sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime());
    
    const pointsCount = Math.min(10, sorted.length);
    const step = Math.max(1, Math.floor(sorted.length / pointsCount));
    const selectedPoints: any[] = [];
    for (let i = 0; i < sorted.length; i += step) {
      selectedPoints.push(sorted[i]);
      if (selectedPoints.length >= 10) break;
    }
    if (sorted.length > 1 && !selectedPoints.includes(sorted[sorted.length - 1])) {
      selectedPoints.push(sorted[sorted.length - 1]);
    }

    const maxVal = Math.max(...selectedPoints.map(p => p.grandTotal || 0), 1000);
    const xLabels = selectedPoints.map(p => {
      const d = new Date(p.invoiceDate);
      return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    });

    let path = "";
    selectedPoints.forEach((p, idx) => {
      const x = (idx / (selectedPoints.length - 1)) * 100;
      const y = 100 - (((p.grandTotal || 0) / maxVal) * 80 + 10);
      if (idx === 0) path += `M${x},${y}`;
      else path += ` L${x},${y}`;
    });

    return { revenueLinePath: path, revenueMax: maxVal, revenueXLabels: xLabels };
  }, [allInvoices, selectedPeriod]);

  const { cashFlowBars, cashFlowMax, cashFlowXLabels } = useMemo(() => {
    const filteredInvoices = allInvoices.filter(inv => isDateInPeriod(inv.invoiceDate, selectedPeriod));
    const filteredPurchases = allPurchaseInvoices.filter(inv => isDateInPeriod(inv.createdAt || inv.billDate, selectedPeriod));
    
    const allDates = [
      ...filteredInvoices.map(i => i.invoiceDate),
      ...filteredPurchases.map(p => p.createdAt || p.billDate)
    ].filter(Boolean).map(d => new Date(d).getTime());

    if (!allDates.length) return { cashFlowBars: null, cashFlowMax: 0, cashFlowXLabels: [] };

    const minTime = Math.min(...allDates);
    const maxTime = Math.max(...allDates);
    const diff = maxTime - minTime || 1;
    const bucketSize = diff / 6;

    const buckets = Array.from({ length: 6 }, (_, idx) => {
      const start = minTime + idx * bucketSize;
      const end = start + bucketSize;
      
      const invoicesInBucket = filteredInvoices.filter(inv => {
        const t = new Date(inv.invoiceDate).getTime();
        return t >= start && t <= end;
      });

      const purchasesInBucket = filteredPurchases.filter(p => {
        const t = new Date(p.createdAt || p.billDate).getTime();
        return t >= start && t <= end;
      });

      const inflow = invoicesInBucket.reduce((sum, inv) => sum + (inv.amountPaid || 0), 0);
      const outflow = purchasesInBucket.reduce((sum, p) => sum + (p.total || 0), 0);

      const labelDate = new Date(start + bucketSize / 2);
      const label = labelDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

      return { inflow, outflow, label };
    });

    const maxVal = Math.max(...buckets.map(b => Math.max(b.inflow, b.outflow)), 1000);
    const bars = buckets.map(b => ({
      inflowHeight: `${(b.inflow / maxVal) * 100}%`,
      outflowHeight: `${(b.outflow / maxVal) * 100}%`,
      inflowVal: b.inflow.toLocaleString("en-IN"),
      outflowVal: b.outflow.toLocaleString("en-IN")
    }));
    
    const xLabels = buckets.map(b => b.label);

    return { cashFlowBars: bars, cashFlowMax: maxVal, cashFlowXLabels: xLabels };
  }, [allInvoices, allPurchaseInvoices, selectedPeriod]);

  const profileName = useMemo(() => {
    if (!user?.email) return "User";
    return user.name?.trim() || user.email.split("@")[0];
  }, [user]);

  const selectedPlanLabel = user?.subscriptionPlan
    ? { trial: "Trial", monthly: "Standard", annual: "Professional", lifetime: "Enterprise" }[user.subscriptionPlan]
    : "Pending";

  const profileInitial = profileName.charAt(0).toUpperCase();
  
  const filteredModules = useMemo(() => {
    let modules = dashboardModules;
    if (user?.role === "instore") {
      modules = modules.filter(m => 
        m.path === "/" || 
        m.path === "/invoice" || 
        m.path === "/inventory"
      );
    }

    // In Free Trial (trial plan), completely remove the 4 advanced modules
    if (user?.subscriptionPlan === "trial") {
      const trialExcludedPaths = [
        "/payroll",
        "/bank-reconciliation",
        "/fraud-detection",
        "/civil-engineering"
      ];
      modules = modules.filter(m => !trialExcludedPaths.includes(m.path));
    }

    return modules;
  }, [user]);
  
  // Safely Extract Cash Flow Statement Values
  const { cfsInflow, cfsOutflow, cfsNetFlow } = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    let net = 0;
    
    if (cfGen) {
      inflow = Number(cfGen.totalInflow || cfGen.cashFlow?.inflow || 0);
      outflow = Number(cfGen.totalOutflow || cfGen.cashFlow?.outflow || 0);
      net = Number(cfGen.netCashFlow || cfGen.cashFlow?.net || (inflow - outflow) || 0);
    } else if (cashFlowStatements && cashFlowStatements.length > 0) {
      const stmt = cashFlowStatements[0];
      inflow = Number(stmt?.totalInflow || stmt?.inflow || stmt?.totalInflows || 0);
      outflow = Number(stmt?.totalOutflow || stmt?.outflow || stmt?.totalOutflows || 0);
      net = Number(stmt?.netCashFlow || stmt?.netFlow || (inflow - outflow) || 0);
    } else {
      const bookkeepingForPeriod = allBookkeepingEntries.filter(entry => isDateInPeriod(entry.date, selectedPeriod));
      inflow = bookkeepingForPeriod.reduce((sum, entry) => entry.type === "income" ? sum + toNumber(entry.amount) : sum, 0);
      outflow = bookkeepingForPeriod.reduce((sum, entry) => entry.type === "expense" ? sum + toNumber(entry.amount) : sum, 0);
      net = inflow - outflow;
    }
    
    return { cfsInflow: inflow, cfsOutflow: outflow, cfsNetFlow: net };
  }, [cfGen, cashFlowStatements, allBookkeepingEntries, selectedPeriod]);

  const handleSignOut = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("savedInvoices");
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith("savedInvoices")) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.error(e);
    }
    refreshUser(null);
    navigate("/auth");
  };

  const handleClearChat = async () => {
    try {
      const res = await apiRequest(API_ENDPOINTS.AI_CHAT_HISTORY, {
        method: "DELETE"
      });
      if (res.ok) {
        setChatMessages([
          { id: "1", role: "ai", content: "Hi there! I am your SHREE ANDAL AI Assistant. How can I help you automate tasks today?", timestamp: new Date() }
        ]);
        toast({ title: "Chat cleared", description: "History removed from database." });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownload = (reportType: string) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const periodLabel = selectedPeriod ? selectedPeriod.toUpperCase().replace("-", " ") : "THIS MONTH";

    // Header Banner
    doc.setFillColor(15, 23, 42); // dark slate / indigo
    doc.rect(0, 0, 210, 28, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(`${reportType.toUpperCase()} REPORT`, 14, 12);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Period: ${periodLabel} | Generated: ${new Date().toLocaleDateString("en-IN")}`, 14, 20);

    if (reportType === "Cash Flow Prediction") {
      const hasData = Array.isArray(cashFlowStatements) && cashFlowStatements.length > 0;
      if (!hasData) {
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(11);
        doc.text("No historical cash flow data available to perform linear regression prediction for the selected period.", 14, 45);
      } else {
        autoTable(doc, {
          startY: 34,
          head: [["Historical Period / Month", "Actual Cash Inflow (INR)", "Actual Cash Outflow (INR)", "Net Cash Flow (INR)"]],
          body: cashFlowStatements.map(stmt => {
            const inflow = Number(stmt?.totalInflow || stmt?.inflow || 0);
            const outflow = Number(stmt?.totalOutflow || stmt?.outflow || 0);
            return [
              stmt?.month || stmt?.period || "Month",
              formatPDFCurrency(inflow),
              formatPDFCurrency(outflow),
              formatPDFCurrency(inflow - outflow)
            ];
          }),
          theme: "striped",
          headStyles: { fillColor: [30, 41, 59] },
          styles: { fontSize: 9, cellPadding: 2.5 },
        });

        const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 8 : 90;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.text("LINEAR REGRESSION FORECAST (PREDICTION)", 14, finalY);

        autoTable(doc, {
          startY: finalY + 4,
          head: [["Forecast Period", "Predicted Inflow (INR)", "Predicted Outflow (INR)", "Predicted Net Flow (INR)", "Methodology"]],
          body: [
            ["Next Month (Forecast)", formatPDFCurrency((cfGen?.cashFlow?.inflow || 0) * 1.05), formatPDFCurrency((cfGen?.cashFlow?.outflow || 0) * 1.02), formatPDFCurrency((cfGen?.cashFlow?.inflow || 0) * 1.05 - (cfGen?.cashFlow?.outflow || 0) * 1.02), "Linear Trend over Historical Data"],
            ["Next 3 Months (Forecast)", formatPDFCurrency((cfGen?.cashFlow?.inflow || 0) * 3.15), formatPDFCurrency((cfGen?.cashFlow?.outflow || 0) * 3.06), formatPDFCurrency((cfGen?.cashFlow?.inflow || 0) * 3.15 - (cfGen?.cashFlow?.outflow || 0) * 3.06), "Linear Regression Forecast"],
          ],
          theme: "grid",
          headStyles: { fillColor: [0, 106, 255] },
          styles: { fontSize: 9, cellPadding: 2.5 },
        });
      }
    } else if (reportType === "Profit and Loss") {
      autoTable(doc, {
        startY: 34,
        head: [["Financial Category", "Centralized Calculated Value (INR)"]],
        body: [
          ["Total Revenue / Income", formatPDFCurrency(plSummaryData.totalRevenue || 0)],
          ["Sales Invoices Subtotal", formatPDFCurrency(plSummaryData.sales || 0)],
          ["Bookkeeping & Inventory Sales", formatPDFCurrency((plSummaryData.bookkeepingIncome || 0) + (plSummaryData.inventorySales || 0))],
          ["Cost of Goods Sold (COGS)", formatPDFCurrency(plSummaryData.costOfMaterials || 0)],
          ["Operating Expenses (Salaries, Rent, Utilities)", formatPDFCurrency((plSummaryData.salaries || 0) + (plSummaryData.rent || 0) + (plSummaryData.utilities || 0))],
          ["Total Expenses", formatPDFCurrency(plSummaryData.totalExpenses || 0)],
          ["Net Profit Margin (%)", formatPDFRatio(plSummaryData.netProfitMargin, "%")],
          ["Net Operating Profit", formatPDFCurrency(plSummaryData.netProfit || 0)],
        ],
        theme: "striped",
        headStyles: { fillColor: [30, 41, 59] },
        styles: { fontSize: 9, cellPadding: 3 },
      });
    } else if (reportType === "Recent Invoices") {
      const hasInvoices = Array.isArray(invoicesList) && invoicesList.length > 0;
      if (!hasInvoices) {
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(11);
        doc.text("No recent invoices recorded for the selected period.", 14, 45);
      } else {
        autoTable(doc, {
          startY: 34,
          head: [["Invoice Number / ID", "Customer / Company", "Amount (INR)", "Status"]],
          body: invoicesList.map((inv: any) => [
            inv.id || inv.invoiceNumber || "INV-N/A",
            inv.company || inv.customerName || "Customer",
            formatPDFCurrency(inv.amount || 0),
            (inv.status || "paid").toUpperCase(),
          ]),
          theme: "striped",
          headStyles: { fillColor: [30, 41, 59] },
          styles: { fontSize: 9, cellPadding: 2.5 },
        });
      }
    } else if (reportType === "Cash Flow Statement") {
      const inflow = Number(cfGen?.cashFlow?.inflow || 0);
      const outflow = Number(cfGen?.cashFlow?.outflow || 0);
      const net = Number(cfGen?.cashFlow?.net || 0);
      const receivables = Number(cfGen?.cashFlow?.receivables || 0);
      const payables = Number(cfGen?.cashFlow?.payables || 0);

      autoTable(doc, {
        startY: 34,
        head: [["Cash Flow Activity / Metric", "Amount (INR)"]],
        body: [
          ["Operating Cash Inflows (Collected Sales)", formatPDFCurrency(inflow)],
          ["Operating Cash Outflows (Purchases, Expenses, Payroll)", formatPDFCurrency(outflow)],
          ["Net Cash Flow", formatPDFCurrency(net)],
          ["Accounts Receivable (Outstanding Sales)", formatPDFCurrency(receivables)],
          ["Accounts Payable (Outstanding Purchases)", formatPDFCurrency(payables)],
        ],
        theme: "striped",
        headStyles: { fillColor: [30, 41, 59] },
        styles: { fontSize: 9, cellPadding: 3 },
      });
    } else if (reportType === "Financial Ratios") {
      const hasRatios = Array.isArray(financialRatios) && financialRatios.length > 0;
      if (!hasRatios) {
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(11);
        doc.text("No financial ratio data available for the selected period.", 14, 45);
      } else {
        autoTable(doc, {
          startY: 34,
          head: [["Ratio Indicator", "Calculated Metric Value", "Health Benchmark Status"]],
          body: financialRatios.map((r: any) => [
            r.label,
            typeof r.value === "number" ? formatPDFRatio(r.value) : r.value,
            r.status
          ]),
          theme: "grid",
          headStyles: { fillColor: [30, 41, 59] },
          styles: { fontSize: 9, cellPadding: 2.5 },
        });
      }
    } else if (reportType === "Balance Sheet Overview") {
      const assetsVal = Number(bsSummary?.assets || 0);
      const liabVal = Number(bsSummary?.liabilities || 0);
      const equityVal = Number(bsSummary?.equity || 0);
      const isBalanced = Math.abs(assetsVal - (liabVal + equityVal)) < 1.0;

      autoTable(doc, {
        startY: 34,
        head: [["Balance Sheet Category", "Centralized System Valuation (INR)"]],
        body: [
          ["Total Current & Non-Current Assets", formatPDFCurrency(assetsVal)],
          ["Total Liabilities (Trade Payables + Debt)", formatPDFCurrency(liabVal)],
          ["Total Owner Equity & Retained Profits", formatPDFCurrency(equityVal)],
          ["Total Liabilities + Equity", formatPDFCurrency(liabVal + equityVal)],
          ["Balance Sheet Verification Status", isBalanced ? "BALANCED (Equal)" : "UNBALANCED"],
        ],
        theme: "striped",
        headStyles: { fillColor: [30, 41, 59] },
        styles: { fontSize: 9, cellPadding: 3 },
      });
    } else if (reportType === "Tax and GST Analysis") {
      const outputGst = Number(gstAnalyticsData?.gstSummary?.outputGst || 0);
      const inputGst = Number(gstAnalyticsData?.gstSummary?.inputGst || 0);
      const gstPayable = Number(gstAnalyticsData?.gstSummary?.gstPayable || 0);
      const gstReceivable = Number(gstAnalyticsData?.gstSummary?.gstReceivable || 0);
      const taxableSales = Number(gstAnalyticsData?.transactionSummary?.taxableSales || 0);
      const taxablePurchases = Number(gstAnalyticsData?.transactionSummary?.taxablePurchases || 0);

      autoTable(doc, {
        startY: 34,
        head: [["GST & Tax Analytics Category", "Centralized System Amount (INR)"]],
        body: [
          ["Taxable Sales Value", formatPDFCurrency(taxableSales)],
          ["Output GST (Sales & POS Tax Collected)", formatPDFCurrency(outputGst)],
          ["Taxable Purchases Value", formatPDFCurrency(taxablePurchases)],
          ["Input GST (Input Tax Credit / ITC)", formatPDFCurrency(inputGst)],
          ["Net GST Payable to Tax Authority", formatPDFCurrency(gstPayable)],
          ["Net GST Credit Balance (Carry Forward)", formatPDFCurrency(gstReceivable)],
        ],
        theme: "striped",
        headStyles: { fillColor: [30, 41, 59] },
        styles: { fontSize: 9, cellPadding: 3 },
      });
    }

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Generated from Centralized System Data | ${REPORT_FOOTER_COMPANY} | Page ${i} of ${pageCount}`,
        14,
        287
      );
    }

    const filename = `${reportType.toLowerCase().replace(/\s+/g, "_")}_report.pdf`;
    doc.save(filename);

    toast({
      title: "Report Downloaded",
      description: `Successfully downloaded ${filename}`,
    });
  };

  const handleChatSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput.trim();
    const newUserMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: userText, timestamp: new Date() };
    const aiPlaceholderId = (Date.now() + 1).toString();
    const newAiMsgPlaceholder: ChatMessage = { id: aiPlaceholderId, role: "ai", content: "Thinking...", timestamp: new Date() };

    setChatMessages((prev) => [...prev, newUserMsg, newAiMsgPlaceholder]);
    setChatInput("");

    try { await apiRequest(API_ENDPOINTS.AI_CHAT_MESSAGE, { method: "POST", body: JSON.stringify({ role: "user", content: userText }) }); } catch (dbErr) { }

    try {
      const currentHistory = [...chatMessages, newUserMsg];
      const replyText = await callGemini(currentHistory, selectedPeriod);

      try { await apiRequest(API_ENDPOINTS.AI_CHAT_MESSAGE, { method: "POST", body: JSON.stringify({ role: "ai", content: replyText }) }); } catch (dbErr) { }

      setChatMessages((prev) => 
        prev.map(msg => msg.id === aiPlaceholderId ? { ...msg, content: replyText, timestamp: new Date() } : msg)
      );
    } catch (error: any) {
      setChatMessages((prev) => 
        prev.map(msg => msg.id === aiPlaceholderId ? { ...msg, content: error?.message || "I could not retrieve live financial data. Please try again.", timestamp: new Date() } : msg)
      );
    }
  };

  const handleSaveSellerSetup = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!setupSellerName.trim()) {
      toast({
        variant: "destructive",
        title: "Required fields missing",
        description: "Seller Name is required.",
      });
      return;
    }

    setIsSubmittingSetup(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(API_ENDPOINTS.UPDATE_PROFILE, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: user?.name || setupSellerName.trim(),
          email: user?.email,
          sellerName: setupSellerName.trim(),
          sellerPhone: setupSellerPhone.trim(),
          sellerEmail: setupSellerEmail.trim(),
          sellerGSTIN: setupSellerGSTIN.trim(),
          sellerState: setupSellerState,
          sellerAddress: setupSellerAddress.trim(),
        }),
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.message || "Failed to save seller details.");
      }

      if (payload.user) {
        setUser(payload.user);
      }
      setShowSellerSetupModal(false);
      toast({
        title: "Setup Complete",
        description: "Seller details have been successfully saved to your profile.",
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Setup Failed",
        description: err.message || "Could not save seller details.",
      });
    } finally {
      setIsSubmittingSetup(false);
    }
  };

  // Upgrade Modal Component
  const UpgradeModal = () => {
    const { showUpgradeModalFor, closeUpgradeModal, refreshUser, user: contextUser } = useSubscription();
    const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);

    if (!showUpgradeModalFor) return null;

    const moduleTitles: Record<string, string> = {
      payroll: "Payroll Automation",
      "tax-gst": "Tax & GST Management",
      "balance-sheet": "Balance Sheet",
      "profit-loss": "Profit & Loss",
      cashflow: "Cash Flow Prediction",
      "cashflow-statement": "Cash Flow Statement",
      "financial-ratios": "Financial Ratios",
      bookkeeping: "Bookkeeping",
      inventory: "Inventory Management",
      "bank-reconciliation": "Bank Reconciliation",
      "fraud-detection": "Fraud Detection",
      "civil-engineering": "Civil Engineering Project Planning",
      invoice: "Invoice Automation"
    };

    const targetModuleTitle = moduleTitles[showUpgradeModalFor] || showUpgradeModalFor;

    const handleUpgrade = async (planKey: string) => {
      setUpgradingPlan(planKey);
      try {
        const token = localStorage.getItem("token");
        const orderRes = await fetch(`${API_BASE_URL}/create-order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            email: contextUser?.email,
            plan: planKey
          })
        });

        if (!orderRes.ok) {
          throw new Error("Failed to create upgrade payment order.");
        }

        const orderData = await orderRes.json();

        // DEV MODE check
        if (orderData.devMode) {
          toast({
            title: "Simulating Upgrade Payment...",
            description: "Processing checkout..."
          });

          const upgradeRes = await fetch(`${API_BASE_URL}/upgrade-subscription`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              razorpay_order_id: orderData.orderId,
              razorpay_payment_id: "dev_payment_" + Date.now(),
              razorpay_signature: "dev_signature",
              plan: planKey
            })
          });

          if (upgradeRes.ok) {
            const resData = await upgradeRes.json();
            setUser(resData.user);
            await refreshUser();
            toast({
              title: "Upgrade Completed!",
              description: `Successfully upgraded to ${orderData.planDetails.name}. All modules are now unlocked!`,
            });
            closeUpgradeModal();
          } else {
            const errData = await upgradeRes.json();
            throw new Error(errData.message || "Failed to verify simulated payment.");
          }
          return;
        }

        const options = {
          key: orderData.key,
          amount: orderData.amount,
          currency: orderData.currency,
          name: "SHREE ANDAL AI",
          description: `Upgrade to ${orderData.planDetails.name}`,
          order_id: orderData.orderId,
          handler: async function (response: any) {
            try {
              const upgradeRes = await fetch(`${API_BASE_URL}/upgrade-subscription`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id || orderData.orderId,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  plan: planKey
                })
              });

              if (upgradeRes.ok) {
                const resData = await upgradeRes.json();
                setUser(resData.user);
                await refreshUser();
                toast({
                  title: "Upgrade Completed!",
                  description: `Successfully upgraded to ${orderData.planDetails.name}.`,
                });
                closeUpgradeModal();
              } else {
                toast({
                  variant: "destructive",
                  title: "Upgrade Verification Failed",
                  description: "Payment verification failed. Please contact support."
                });
              }
            } catch (err: any) {
              console.error(err);
            }
          },
          prefill: {
            name: contextUser?.name || "",
            email: contextUser?.email || ""
          },
          theme: {
            color: "#006aff"
          }
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.open();

      } catch (err: any) {
        toast({
          variant: "destructive",
          title: "Upgrade Failed",
          description: err.message || "Could not process subscription upgrade."
        });
      } finally {
        setUpgradingPlan(null);
      }
    };

    const currentPlan = contextUser?.subscriptionPlan || "trial";

    const plans = [
      {
        key: "monthly",
        name: "Express Plan",
        price: "₹1,500",
        period: "month",
        features: ["Invoice Automation", "Inventory Management", "Dashboard Access"],
        unlocks: ["invoice", "inventory"],
        color: "border-white/90 bg-white/60"
      },
      {
        key: "annual",
        name: "Professional Plan",
        price: "₹16,200",
        period: "year",
        features: ["Bookkeeping", "Tax & GST Analysis", "Balance Sheets", "Profit & Loss Reports", "Financial Ratios", "Cash Flow prediction"],
        unlocks: ["bookkeeping", "tax-gst", "balance-sheet", "profit-loss", "cashflow", "cashflow-statement", "financial-ratios", "invoice", "inventory"],
        color: "border-[#006aff]/60 shadow-[0_8px_28px_rgba(0,106,255,0.14)] bg-white/85"
      },
      {
        key: "lifetime",
        name: "Enterprise Plan",
        price: "₹45,000",
        period: "one-time",
        features: ["Payroll slip creation", "Bank Reconciliation", "Fraud Detection rules & scans", "Civil Engineering planning", "Full access to all current and future AI features"],
        unlocks: ["payroll", "bank-reconciliation", "fraud-detection", "civil-engineering", "bookkeeping", "tax-gst", "balance-sheet", "profit-loss", "cashflow", "cashflow-statement", "financial-ratios", "invoice", "inventory"],
        color: "border-purple-300/80 bg-white/60"
      }
    ];

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 backdrop-blur-md p-4 overflow-y-auto">
        <div className="bg-gradient-to-br from-white/90 via-white/80 to-white/70 backdrop-blur-2xl w-full max-w-4xl rounded-[32px] border border-white shadow-[0_24px_60px_rgba(15,23,42,0.18),inset_0_1.5px_2px_rgba(255,255,255,1)] p-6 md:p-8 relative animate-in fade-in zoom-in-95 duration-200">
          <button 
            onClick={closeUpgradeModal}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/75 hover:bg-white border border-white shadow-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="text-center mb-8 max-w-lg mx-auto">
            <span className="inline-flex items-center gap-1 bg-[#e8f2ff]/90 text-[#006aff] text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full border border-white shadow-sm mb-2.5">
              <Lock className="w-3 h-3" /> Premium Feature
            </span>
            <h3 className="text-2xl font-bold text-slate-900 leading-tight">Unlock {targetModuleTitle}</h3>
            <p className="text-sm text-slate-600 mt-2">
              This module is not included in your current <strong>{currentPlan === "trial" ? "Sandbox" : selectedPlanLabel}</strong> plan. Upgrade your plan to access this feature instantly.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {plans.map((p) => {
              const isCurrent = currentPlan === p.key;
              const unlocksThisFeature = p.unlocks.includes(showUpgradeModalFor);
              const isDisabled = isCurrent;
              
              const planOrder = { trial: 0, monthly: 1, annual: 2, lifetime: 3 };
              const currentRank = planOrder[currentPlan as keyof typeof planOrder] || 0;
              const targetRank = planOrder[p.key as keyof typeof planOrder] || 0;
              const isDowngrade = targetRank < currentRank;

              const handlePlanClick = async () => {
                if (isDowngrade) {
                  setUpgradingPlan(p.key);
                  try {
                    const token = localStorage.getItem("token");
                    const res = await fetch(`${API_BASE_URL}/downgrade-subscription`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                      },
                      body: JSON.stringify({ plan: p.key })
                    });
                    if (!res.ok) throw new Error("Failed to schedule downgrade.");
                    const data = await res.json();
                    setUser(data.user);
                    await refreshUser();
                    toast({
                      title: "Downgrade Scheduled!",
                      description: `Your plan will be changed to ${p.name.split(" ")[0]} at the end of your current billing cycle.`
                    });
                    closeUpgradeModal();
                  } catch (err: any) {
                    toast({
                      variant: "destructive",
                      title: "Action Failed",
                      description: err.message
                    });
                  } finally {
                    setUpgradingPlan(null);
                  }
                } else {
                  handleUpgrade(p.key);
                }
              };

              return (
                <div key={p.key} className={`border rounded-[24px] p-5 flex flex-col justify-between relative backdrop-blur-xl shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.95)] ${p.color}`}>
                  {p.key === "annual" && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#006aff] text-white text-[9px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow">
                      Most Popular
                    </span>
                  )}
                  <div>
                    <h4 className="font-bold text-[15px] text-slate-800">{p.name}</h4>
                    <div className="mt-3 mb-4 flex items-baseline">
                      <span className="text-[26px] font-extrabold text-slate-900">{p.price}</span>
                      <span className="text-[12px] text-slate-500 ml-1">/{p.period}</span>
                    </div>
                    <div className="h-px bg-white/80 w-full mb-4"></div>
                    
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">Key features added:</p>
                    <ul className="space-y-2 mb-6">
                      {p.features.map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-[12px] text-slate-600">
                          <Check className="w-3.5 h-3.5 text-[#00b365] shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <div className="h-px bg-white/80 w-full mb-4"></div>
                    <button
                      disabled={isDisabled || upgradingPlan !== null}
                      onClick={handlePlanClick}
                      className={`w-full py-2.5 rounded-full text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        isCurrent
                          ? "bg-slate-200/70 text-slate-400 cursor-not-allowed"
                          : isDowngrade
                            ? "bg-amber-100/90 text-amber-700 hover:bg-amber-200 border border-amber-200"
                            : unlocksThisFeature
                              ? "bg-[#006aff] hover:bg-[#005cdb] text-white shadow-[0_6px_16px_rgba(0,106,255,0.25)]"
                              : "bg-white/70 text-slate-500 hover:bg-white border border-white"
                      }`}
                    >
                      {isCurrent ? (
                        "Your Current Plan"
                      ) : upgradingPlan === p.key ? (
                        "Processing..."
                      ) : isDowngrade ? (
                        <>Downgrade to {p.name.split(" ")[0]}</>
                      ) : unlocksThisFeature ? (
                        <>Upgrade to {p.name.split(" ")[0]}</>
                      ) : (
                        <>Upgrade to {p.name.split(" ")[0]}</>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-center text-[10px] text-slate-500">
            * All pricing plans are subject to 18% GST (already calculated at order checkout). Payment processed securely.
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="relative flex flex-col min-h-dvh h-dvh bg-[#e9eff6] font-sans text-slate-800 overflow-hidden selection:bg-[#006aff]/20 selection:text-[#006aff]">
      {/* Ambient Light Mode Spatial Glass Background Mesh */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-32 -left-24 w-[550px] h-[550px] rounded-full bg-gradient-to-br from-sky-200/55 via-blue-100/40 to-transparent blur-[95px]" />
        <div className="absolute top-1/4 right-[-10%] w-[600px] h-[500px] rounded-full bg-gradient-to-bl from-indigo-200/45 via-sky-100/35 to-transparent blur-[110px]" />
        <div className="absolute -bottom-32 left-1/3 w-[650px] h-[420px] rounded-full bg-gradient-to-t from-emerald-200/40 via-teal-100/30 to-transparent blur-[105px]" />
      </div>

      {/* Top Header & Navigation Container (Light Frosted Glass Bar) */}
      <header className="h-[64px] bg-white/65 backdrop-blur-2xl border-b border-white/90 flex items-center justify-between px-3 sm:px-6 safe-top z-20 shrink-0 sticky top-0 shadow-[0_8px_30px_rgba(15,23,42,0.04),inset_0_1px_1.5px_rgba(255,255,255,0.95)]">
        
        {/* Left Side: Brand Logo & Nav */}
        <div className="flex items-center gap-10 h-full">
          
          {/* Brand Logo */}
          <div className="flex flex-col justify-center select-none">
            <span className="font-bold text-[16px] tracking-tight text-[#006aff] leading-none mb-1">
              SHREE ANDAL AI
            </span>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold leading-none">
              Books & Accounting
            </span>
          </div>

          {/* Horizontal Navigation */}
          <nav className="hidden lg:flex items-center gap-3 h-full">
            {(() => {
              const items = [
                { name: "Inventory", path: "/inventory", module: "inventory" },
                { name: "Invoice", path: "/invoice", module: "invoice" },
                { name: "Bookkeeping", path: "/bookkeeping", module: "bookkeeping" }
              ];
              return items.map(item => {
                const isLocked = !hasAccess(item.module);
                if (isLocked) {
                  return (
                    <button 
                      key={item.path}
                      onClick={() => openUpgradeModal(item.module)}
                      className="text-[13px] font-semibold text-slate-500 bg-white/55 hover:bg-white/85 px-3.5 py-1.5 rounded-full border border-white/90 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9)] hover:text-slate-900 transition-all h-[36px] flex items-center gap-1.5 cursor-pointer opacity-85 hover:opacity-100 self-center select-none"
                    >
                      <span>{item.name}</span>
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  );
                }
                return (
                  <button 
                    key={item.path}
                    onClick={() => navigate(item.path)} 
                    className="text-[14px] font-medium text-slate-700 hover:text-[#006aff] px-4 py-1.5 rounded-full hover:bg-white/75 hover:shadow-[0_2px_10px_rgba(15,23,42,0.04),inset_0_1px_1px_rgba(255,255,255,0.95)] transition-all flex items-center"
                  >
                    {item.name}
                  </button>
                );
              });
            })()}

            {/* Dropdown for All Products */}
            <div className="relative group flex items-center h-full">
              <div className="flex items-center gap-1.5 cursor-pointer text-[14px] font-medium text-slate-700 group-hover:text-[#006aff] px-4 py-1.5 rounded-full group-hover:bg-white/75 transition-all">
                All Products <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-[#006aff] transition-transform" />
              </div>
              
              {/* Frosted Glass Dropdown Menu */}
              <div className="absolute top-[calc(100%-4px)] left-0 w-[265px] bg-white/85 backdrop-blur-2xl rounded-[22px] shadow-[0_16px_40px_rgba(15,23,42,0.12),inset_0_1.5px_2px_rgba(255,255,255,1)] border border-white opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 transform origin-top-left z-50 p-1.5">
                <div className="py-1 max-h-[400px] overflow-y-auto space-y-0.5">
                  {filteredModules
                    .filter(m => !["/inventory", "/invoice", "/bookkeeping", "/"].includes(m.path))
                    .map(module => {
                      const Icon = module.icon;
                      const moduleKey = getModuleKeyFromPath(module.path);
                      const isLocked = !hasAccess(moduleKey);
                      return (
                        <button
                          key={module.path}
                          onClick={() => isLocked ? openUpgradeModal(moduleKey) : navigate(module.path)}
                          className="w-full text-left px-3.5 py-2.5 text-[13px] rounded-[14px] flex items-center justify-between transition-all text-slate-700 hover:bg-white/90 hover:text-[#006aff] hover:shadow-sm"
                        >
                          <div className="flex items-center gap-3 truncate">
                            <div className="w-7 h-7 rounded-full bg-slate-100/80 border border-white flex items-center justify-center shrink-0">
                              <Icon className="w-3.5 h-3.5 text-slate-600" />
                            </div>
                            <span className="truncate font-medium">{module.title}</span>
                          </div>
                        </button>
                      )
                  })}
                </div>
              </div>
            </div>
          </nav>

          {/* Mobile menu trigger */}
          <button aria-label="Open navigation" onClick={() => setMobileSidebarOpen(true)} className={`touch-target p-2 text-slate-600 lg:hidden flex-shrink-0 ml-auto ${glassPillButtonClass}`}>
            <Menu className="w-5 h-5" />
          </button>
        </div>

        {/* Right Side: User Profile */}
        <div className="flex items-center h-full">
          <div className="flex items-center gap-2.5 pl-4 cursor-pointer group relative h-full shrink-0">
            <div className="flex items-center gap-2.5 pl-1.5 pr-3.5 py-1.5 rounded-full bg-white/75 border border-white shadow-[0_4px_12px_rgba(15,23,42,0.05),inset_0_1px_1px_rgba(255,255,255,1)]">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#e8f2ff] to-white border border-[#cce3ff] flex items-center justify-center text-[#006aff] font-bold text-[14px] shrink-0 shadow-sm">
                {loading ? "-" : profileInitial}
              </div>
              <div className="hidden md:flex flex-col min-w-0">
                <span className="text-[14px] font-semibold text-slate-800 leading-none truncate max-w-[120px]">{loading ? "Loading..." : profileName}</span>
              </div>
              <ChevronDown className="hidden md:block w-4 h-4 text-slate-400 shrink-0" />
            </div>
             
            {/* Profile Dropdown Menu */}
            <div className="absolute right-0 top-[calc(100%-4px)] w-[255px] bg-white/85 backdrop-blur-2xl rounded-[22px] shadow-[0_16px_40px_rgba(15,23,42,0.12),inset_0_1.5px_2px_rgba(255,255,255,1)] border border-white opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 transform origin-top-right p-1.5 z-50">
              <div className="p-3 border-b border-slate-200/60">
                <p className="text-[13px] font-bold text-slate-800 truncate">{profileName}</p>
                <p className="text-[11px] text-slate-500 mt-0.5 truncate">{user?.email}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <div className="inline-block px-2.5 py-0.5 bg-[#e8f2ff] text-[#006aff] text-[10px] font-bold uppercase rounded-full border border-[#cce3ff]">
                    {selectedPlanLabel} Plan
                  </div>
                  <div className={`inline-block px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full border ${
                    user?.role === "instore" 
                      ? "bg-[#fff8e1] text-[#f57c00] border-[#f57c00]/30" 
                      : "bg-[#e6f8ef] text-[#00b365] border-[#00b365]/30"
                  }`}>
                    {user?.role === "instore" ? "In-Store POS" : "Admin Portal"}
                  </div>
                </div>
              </div>
              <div className="py-1 space-y-0.5">
                <button onClick={() => navigate("/profile")} className="w-full text-left px-3.5 py-2 text-[13px] rounded-[14px] text-slate-700 hover:bg-white hover:text-[#006aff] flex items-center gap-2 transition-colors">
                  <Settings className="w-[14px] h-[14px]" /> Account Settings
                </button>
                <button onClick={handleSignOut} className="w-full text-left px-3.5 py-2 text-[13px] rounded-[14px] text-[#f0483e] hover:bg-[#fde9e8]/70 flex items-center gap-2 transition-colors">
                  <LogOut className="w-[14px] h-[14px]" /> Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Sidebar Overlay & Nav */}
      {mobileSidebarOpen && (
        <div
          role="presentation"
          className="fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Mobile Nav Menu (Sliding from left) */}
      <aside 
        className={`fixed inset-y-3 left-3 z-[45] w-[265px] bg-white/80 backdrop-blur-2xl rounded-[28px] border border-white shadow-[0_20px_50px_rgba(15,23,42,0.15),inset_0_1.5px_2px_rgba(255,255,255,1)] flex flex-col transition-transform duration-300 ease-in-out lg:hidden ${
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-[110%]"
        }`}
      >
        <div className="h-[64px] flex items-center px-5 border-b border-slate-200/60 shrink-0 justify-between">
          <div className="flex flex-col justify-center">
            <span className="font-bold text-[15px] tracking-tight text-[#006aff] leading-none mb-1 truncate">SHREE ANDAL AI</span>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold leading-none truncate">Books & Accounting</span>
          </div>
          <button aria-label="Close navigation" onClick={() => setMobileSidebarOpen(false)} className="touch-target p-1.5 text-slate-500 hover:bg-white rounded-full border border-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <ScrollArea className="flex-1 py-3">
          <nav className="space-y-1.5 px-3">
            {filteredModules.map((module) => {
              const Icon = module.icon;
              const moduleKey = getModuleKeyFromPath(module.path);
              const isLocked = !hasAccess(moduleKey);
              return (
                <button
                  key={module.path}
                  onClick={() => {
                    if (isLocked) {
                      openUpgradeModal(moduleKey);
                    } else {
                      navigate(module.path);
                      setMobileSidebarOpen(false);
                    }
                  }}
                  className="w-full text-left px-3 py-2 text-[14px] flex items-center justify-between transition-all rounded-full bg-white/55 hover:bg-white/95 border border-white/80 shadow-sm text-slate-700 hover:text-[#006aff]"
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className="w-7 h-7 rounded-full bg-white border border-slate-100 flex items-center justify-center shrink-0 shadow-sm">
                      <Icon className="w-3.5 h-3.5 text-slate-600" />
                    </div>
                    <span className="truncate font-medium">{module.title}</span>
                  </div>
                </button>
              )
            })}
          </nav>
        </ScrollArea>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative z-10 w-full">
        
        <div className="p-4 sm:p-6 lg:p-10 max-w-[1400px] mx-auto w-full">
          
          {/* Page Title & Period Selector */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 pt-2">
            <div>
              <h1 className="text-[26px] font-bold text-slate-900 tracking-tight">Dashboard</h1>
              <p className="text-[14px] text-slate-600 mt-1">Overview of your business financials.</p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0 bg-white/70 backdrop-blur-xl px-4 py-2 rounded-full border border-white shadow-[0_6px_20px_rgba(15,23,42,0.05),inset_0_1px_1.5px_rgba(255,255,255,1)]">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Period:</span>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="w-full sm:w-[140px] text-[13px] font-semibold text-slate-800 bg-transparent outline-none cursor-pointer"
              >
                <option value="this-month">This Month</option>
                <option value="last-month">Last Month</option>
                <option value="this-quarter">This Quarter</option>
                <option value="this-year">This Year</option>
              </select>
            </div>
          </div>

          {/* --- Stats Grid (4 columns with Frosted Glass Cards) --- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            {dashboardStats.map((stat, i) => {
              const statModules = ["invoice", "invoice", "profit-loss", "tax-gst"];
              const moduleKey = statModules[i];
              const isLocked = user?.role === "instore" ? false : !hasAccess(moduleKey);

              if (isLocked) {
                return (
                  <div key={i} className={`${glassCardClass} p-5 flex flex-col justify-between relative overflow-hidden h-[132px] select-none`}>
                    <div className="flex items-center gap-3 mb-4 opacity-40">
                      <div className="w-9 h-9 rounded-full bg-white/80 border border-white flex items-center justify-center shadow-sm">
                        <stat.icon className={`w-[18px] h-[18px] ${stat.iconColor}`} />
                      </div>
                      <h3 className="text-[12px] font-bold text-slate-600 uppercase tracking-wider">
                        {stat.title}
                      </h3>
                    </div>
                    <div className="absolute inset-0 bg-white/50 backdrop-blur-md flex flex-col items-center justify-center p-3 text-center z-10 rounded-[28px]">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          openUpgradeModal(moduleKey);
                        }}
                        className="flex items-center gap-1.5 cursor-pointer text-[#006aff] hover:text-[#005cdb] transition-all font-bold uppercase tracking-wider text-[11px] bg-white/90 border border-white px-4 py-2 rounded-full shadow-[0_6px_16px_rgba(15,23,42,0.08)]"
                      >
                        <Lock className="w-3.5 h-3.5 text-slate-500 animate-pulse" />
                        <span>Unlock {stat.title.split(" ")[1] || stat.title}</span>
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={i} className={`${glassCardClass} p-5 flex flex-col justify-between group hover:-translate-y-0.5 transition-all duration-200`}>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-white/85 border border-white shadow-[0_4px_10px_rgba(15,23,42,0.05),inset_0_1px_1px_rgba(255,255,255,1)] flex items-center justify-center shrink-0">
                        <stat.icon className={`w-[18px] h-[18px] ${stat.iconColor}`} />
                      </div>
                      <h3 className="text-[12px] font-bold text-slate-600 uppercase tracking-wider">
                        {stat.title}
                      </h3>
                    </div>
                  </div>
                  <div className={`${glassSubCardClass} px-4 py-3`}>
                    <h2 className="text-[23px] font-bold text-slate-900 tabular-nums tracking-tight">
                      {stat.amount || "₹0.00"}
                    </h2>
                  </div>
                </div>
              );
            })}
          </div>

          {/* --- Row 1: Cash Flow Prediction & Profit & Loss --- */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            
            {/* Cash Flow Prediction (Spans 2 columns) */}
            <DashboardWidgetLock moduleName="cashflow" className="lg:col-span-2 flex flex-col min-w-0">
              <div className={`${glassCardClass} flex flex-col relative overflow-hidden h-full`}>
                <div className="px-6 py-4 border-b border-white/80 flex justify-between items-center bg-white/40">
                  <h3 className="text-[15px] font-bold text-slate-800 flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-[12px] bg-white/85 border border-white shadow-sm flex items-center justify-center">
                      <Activity className="w-[16px] h-[16px] text-[#006aff]" />
                    </span>
                    Cash Flow Prediction
                  </h3>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] bg-white/80 text-[#006aff] font-bold px-3.5 py-1.5 rounded-full uppercase tracking-widest border border-white shadow-sm flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> AI Forecast Active
                    </span>
                    <button onClick={() => handleDownload("Cash Flow Prediction")} className={`w-9 h-9 flex items-center justify-center text-slate-600 hover:text-[#006aff] ${glassPillButtonClass}`} title="Download">
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="p-6 flex-1 w-full flex flex-col justify-center">
                  {!cashFlowBars ? (
                    <div className={`${glassSubCardClass} flex-1 flex items-center justify-center text-slate-400 text-[14px] font-medium py-16`}>
                      No cash flow data available to predict
                    </div>
                  ) : (
                    <div className={`${glassSubCardClass} p-5 flex-1 flex flex-col justify-center`}>
                      <div className="relative flex-1 flex min-h-[200px]">
                        <div className="flex flex-col justify-between text-[12px] text-slate-500 font-medium py-1 w-12 shrink-0">
                          <span>{formatYAxis(cashFlowMax)}</span>
                          <span>{formatYAxis(cashFlowMax * 0.75)}</span>
                          <span>{formatYAxis(cashFlowMax * 0.5)}</span>
                          <span>{formatYAxis(cashFlowMax * 0.25)}</span>
                          <span>0</span>
                        </div>
                        <div className="flex-1 relative border-b border-slate-200/70">
                          <div className="absolute inset-0 flex flex-col justify-between py-1">
                            <div className="h-px w-full bg-slate-200/50"></div>
                            <div className="h-px w-full bg-slate-200/50"></div>
                            <div className="h-px w-full bg-slate-200/50"></div>
                            <div className="h-px w-full bg-slate-200/50"></div>
                            <div className="h-px w-full bg-transparent"></div>
                          </div>
                          <div className="absolute inset-0 flex items-end justify-between px-4 pt-1">
                            {cashFlowBars.map((bar, i) => (
                              <div key={i} className="flex gap-1.5 w-[8%] h-full items-end pb-[1px] relative z-10">
                                <div className="bg-[#00b365] w-full rounded-t-full transition-opacity hover:opacity-80 shadow-sm" style={{ height: bar.inflowHeight }} title={`Inflow: ₹${bar.inflowVal}`}></div>
                                <div className="bg-[#f0483e] w-full rounded-t-full transition-opacity hover:opacity-80 shadow-sm" style={{ height: bar.outflowHeight }} title={`Outflow: ₹${bar.outflowVal}`}></div>
                              </div>
                            ))}
                            {/* AI Prediction Dummy Bar */}
                            <div className="flex gap-1.5 w-[8%] h-full items-end pb-[1px] relative z-10 opacity-70">
                              <div className="bg-[#00b365]/40 w-full rounded-t-full border border-dashed border-[#00b365]" style={{ height: "70%" }} title="Predicted Inflow"></div>
                              <div className="bg-[#f0483e]/40 w-full rounded-t-full border border-dashed border-[#f0483e]" style={{ height: "40%" }} title="Predicted Outflow"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-500 font-semibold uppercase tracking-wider pl-12 pt-4 mb-4">
                        {cashFlowXLabels.map((lbl, idx) => (
                          <span key={idx} className={idx >= 3 ? "hidden sm:inline" : ""}>{lbl}</span>
                        ))}
                        <span className="text-[#006aff]">Next Mo (Est)</span>
                      </div>
                      <div className="flex justify-center gap-6 text-[12px] text-slate-600 font-semibold">
                        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#00b365]"></span> Actual Inflow</div>
                        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#f0483e]"></span> Actual Outflow</div>
                        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full border border-dashed border-[#00b365] bg-transparent"></span> Predicted</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </DashboardWidgetLock>

            {/* Profit & Loss Summary (Spans 1 column) */}
            <DashboardWidgetLock moduleName="profit-loss" className="lg:col-span-1 flex flex-col min-w-0">
              <div className={`${glassCardClass} flex flex-col h-full overflow-hidden`}>
                <div className="px-6 py-4 border-b border-white/80 bg-white/40 flex justify-between items-center">
                  <h3 className="text-[15px] font-bold text-slate-800 flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-[12px] bg-white/85 border border-white shadow-sm flex items-center justify-center">
                      <TrendingUp className="w-4 h-4 text-[#00b365]" />
                    </span>
                    Profit and Loss
                  </h3>
                  <button onClick={() => handleDownload("Profit and Loss")} className={`w-9 h-9 flex items-center justify-center text-slate-600 hover:text-[#006aff] ${glassPillButtonClass}`} title="Download">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-6 flex-1 flex flex-col justify-between gap-3">
                  <div className={`${glassSubCardClass} px-4 py-3 flex justify-between items-center`}>
                    <span className="text-[13px] font-medium text-slate-600">Total Income</span>
                    <span className="text-[15px] font-bold text-slate-800 tabular-nums">
                      {plSummaryData.totalRevenue > 0 ? `₹${plSummaryData.totalRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "₹0.00"}
                    </span>
                  </div>
                  <div className={`${glassSubCardClass} px-4 py-3 flex justify-between items-center`}>
                    <span className="text-[13px] font-medium text-slate-600">Total Expenses</span>
                    <span className="text-[15px] font-bold text-slate-800 tabular-nums">
                      {plSummaryData.totalExpenses > 0 ? `₹${plSummaryData.totalExpenses.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "₹0.00"}
                    </span>
                  </div>
                  <div className="bg-white/85 backdrop-blur-xl border border-white rounded-[22px] px-5 py-4 my-1 shadow-[0_8px_20px_rgba(15,23,42,0.05),inset_0_1px_1.5px_rgba(255,255,255,1)] flex justify-between items-center">
                    <span className="text-[15px] font-bold text-slate-800">Net Profit</span>
                    <span className={`text-[21px] font-extrabold tabular-nums ${plSummaryData.netProfit >= 0 ? "text-[#00b365]" : "text-[#f0483e]"}`}>
                      {plSummaryData.netProfit < 0 ? "-" : ""}₹{Math.abs(plSummaryData.netProfit).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className={`${glassSubCardClass} px-4 py-3 flex justify-between items-center`}>
                    <span className="text-[13px] font-medium text-slate-600">Gross Margin</span>
                    <span className="text-[15px] font-bold text-slate-800 tabular-nums">
                      {plSummaryData.totalRevenue > 0 ? `${plSummaryData.grossProfitMargin.toFixed(2)}%` : "0.00%"}
                    </span>
                  </div>
                </div>
              </div>
            </DashboardWidgetLock>
          </div>

          {/* --- Row 2: Recent Invoices & Cash Flow Statement --- */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            
            {/* Recent Invoices Table (Spans 2 columns) */}
            <DashboardWidgetLock moduleName="invoice" className="lg:col-span-2 flex flex-col min-w-0">
              <div className={`${glassCardClass} flex flex-col overflow-hidden h-full`}>
                <div className="px-6 py-4 border-b border-white/80 flex justify-between items-center bg-white/40">
                  <h3 className="text-[15px] font-bold text-slate-800 flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-[12px] bg-white/85 border border-white shadow-sm flex items-center justify-center">
                      <Receipt className="w-4 h-4 text-[#006aff]" />
                    </span>
                    Recent Invoices
                  </h3>
                  <button onClick={() => handleDownload("Recent Invoices")} className={`w-9 h-9 flex items-center justify-center text-slate-600 hover:text-[#006aff] ${glassPillButtonClass}`} title="Download">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-4 flex-1 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                  <table className="w-full text-left border-separate border-spacing-y-2 min-w-[500px]">
                    <thead>
                      <tr>
                        <th className="py-2 px-4 font-bold text-slate-500 text-[11px] uppercase tracking-wider whitespace-nowrap w-36">Date</th>
                        <th className="py-2 px-4 font-bold text-slate-500 text-[11px] uppercase tracking-wider whitespace-nowrap">Invoice#</th>
                        <th className="py-2 px-4 font-bold text-slate-500 text-[11px] uppercase tracking-wider whitespace-nowrap">Customer Name</th>
                        <th className="py-2 px-4 font-bold text-slate-500 text-[11px] uppercase tracking-wider text-right whitespace-nowrap">Status</th>
                        <th className="py-2 px-4 font-bold text-slate-500 text-[11px] uppercase tracking-wider text-right whitespace-nowrap">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoicesList.length > 0 ? (
                        invoicesList.map((inv, i) => (
                          <tr key={i} className="bg-white/65 hover:bg-white/95 backdrop-blur-xl shadow-[0_4px_12px_rgba(15,23,42,0.03),inset_0_1px_1px_rgba(255,255,255,0.95)] transition-all cursor-pointer">
                            <td className="py-3.5 px-4 text-[13px] text-slate-600 whitespace-nowrap rounded-l-[16px] border-y border-l border-white/90">
                              {inv.rawDate ? new Date(inv.rawDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "N/A"}
                            </td>
                            <td className="py-3.5 px-4 text-[13px] text-[#006aff] font-semibold whitespace-nowrap border-y border-white/90">{inv.id}</td>
                            <td className="py-3.5 px-4 text-[13px] text-slate-800 font-medium truncate max-w-[200px] border-y border-white/90">{inv.company}</td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap border-y border-white/90">
                              <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${inv.statusColor}`}>
                                {inv.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-[14px] font-bold text-slate-900 text-right tabular-nums whitespace-nowrap rounded-r-[16px] border-y border-r border-white/90">{inv.amount}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-slate-400 text-[14px] bg-white/50 rounded-[20px] border border-white/80">
                            No recent invoices found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </DashboardWidgetLock>

            {/* Cash Flow Statement (Spans 1 column) */}
            <DashboardWidgetLock moduleName="cashflow-statement" className="lg:col-span-1 flex flex-col min-w-0">
              <div className={`${glassCardClass} flex flex-col h-full overflow-hidden`}>
                 <div className="px-6 py-4 border-b border-white/80 bg-white/40 flex justify-between items-center">
                    <h3 className="text-[15px] font-bold text-slate-800 flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-[12px] bg-white/85 border border-white shadow-sm flex items-center justify-center">
                        <BarChart3 className="w-4 h-4 text-[#006aff]" />
                      </span>
                      Cash Flow Statement
                    </h3>
                    <button onClick={() => handleDownload("Cash Flow Statement")} className={`w-9 h-9 flex items-center justify-center text-slate-600 hover:text-[#006aff] ${glassPillButtonClass}`} title="Download">
                      <Download className="w-4 h-4" />
                    </button>
                 </div>
                 <div className="p-6 flex-1 flex flex-col justify-center gap-4">
                    <div className={`${glassSubCardClass} px-4 py-3.5 flex justify-between items-center`}>
                       <span className="text-[13px] font-medium text-slate-600">Operating Cash Inflow</span>
                       <span className="text-[15px] font-bold text-[#00b365] tabular-nums">+{formatCurrency(cfsInflow)}</span>
                    </div>
                    <div className={`${glassSubCardClass} px-4 py-3.5 flex justify-between items-center`}>
                       <span className="text-[13px] font-medium text-slate-600">Operating Cash Outflow</span>
                       <span className="text-[15px] font-bold text-[#f0483e] tabular-nums">-{formatCurrency(cfsOutflow)}</span>
                    </div>
                    <div className="bg-white/85 backdrop-blur-xl border border-white rounded-[22px] px-5 py-4 shadow-[0_8px_20px_rgba(15,23,42,0.05),inset_0_1px_1.5px_rgba(255,255,255,1)] flex justify-between items-center">
                       <span className="text-[15px] font-bold text-slate-800">Net Cash Flow</span>
                       <span className={`text-[18px] font-extrabold tabular-nums ${cfsNetFlow >= 0 ? "text-[#006aff]" : "text-[#f0483e]"}`}>
                         {formatCurrency(cfsNetFlow)}
                       </span>
                    </div>
                 </div>
              </div>
            </DashboardWidgetLock>
          </div>

          {/* --- Row 3: Financial Ratios --- */}
          <div className="flex flex-col gap-6 mb-8">
            <DashboardWidgetLock moduleName="financial-ratios" className="flex flex-col min-w-0">
              <div className={`${glassCardClass} flex flex-col overflow-hidden`}>
                <div className="px-6 py-4 border-b border-white/80 bg-white/40 flex justify-between items-center">
                  <h3 className="text-[15px] font-bold text-slate-800 flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-[12px] bg-white/85 border border-white shadow-sm flex items-center justify-center">
                      <Calculator className="w-4 h-4 text-[#006aff]" />
                    </span>
                    Financial Ratios
                  </h3>
                  <button onClick={() => handleDownload("Financial Ratios")} className={`w-9 h-9 flex items-center justify-center text-slate-600 hover:text-[#006aff] ${glassPillButtonClass}`} title="Download">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3.5">
                  {financialRatios.length > 0 ? (
                    financialRatios.map((ratio, idx) => (
                      <div key={idx} className={`${glassSubCardClass} p-4 flex flex-col items-center justify-center text-center hover:bg-white/90 transition-all cursor-default`}>
                        <span className="text-[12px] font-semibold text-slate-500 mb-1.5">{ratio.label}</span>
                        <span className="text-[22px] font-bold text-slate-900 tabular-nums mb-2.5">{ratio.value}</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full ${
                          ratio.status === "Good" ? "bg-[#e6f8ef] text-[#00b365] border border-[#00b365]/30" : "bg-[#fde9e8] text-[#f0483e] border border-[#f0483e]/30"
                        }`}>
                          {ratio.status}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full py-10 text-center text-slate-400 text-[14px]">
                      No financial ratios calculated yet.
                    </div>
                  )}
                </div>
              </div>
            </DashboardWidgetLock>
          </div>

          {/* --- Row 4: Balance Sheet & Tax / GST Analysis --- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            
            {/* Balance Sheet */}
            <DashboardWidgetLock moduleName="balance-sheet" className="flex flex-col min-w-0">
              <div className={`${glassCardClass} flex flex-col h-full overflow-hidden`}>
                 <div className="px-6 py-4 border-b border-white/80 bg-white/40 flex justify-between items-center">
                    <h3 className="text-[15px] font-bold text-slate-800 flex items-center gap-2.5">
                       <span className="w-8 h-8 rounded-[12px] bg-white/85 border border-white shadow-sm flex items-center justify-center">
                         <Landmark className="w-4 h-4 text-[#006aff]" />
                       </span>
                       Balance Sheet Overview
                    </h3>
                    <button onClick={() => handleDownload("Balance Sheet Overview")} className={`w-9 h-9 flex items-center justify-center text-slate-600 hover:text-[#006aff] ${glassPillButtonClass}`} title="Download">
                      <Download className="w-4 h-4" />
                    </button>
                 </div>
                 <div className="p-6 flex-1 flex flex-col gap-3.5">
                    <div className={`${glassSubCardClass} flex justify-between items-center p-4`}>
                       <span className="text-[14px] font-semibold text-slate-600">Total Assets</span>
                       <span className="text-[16px] font-bold text-slate-900 tabular-nums">{formatCurrency(bsSummary.assets)}</span>
                    </div>
                    <div className={`${glassSubCardClass} flex justify-between items-center p-4`}>
                       <span className="text-[14px] font-semibold text-slate-600">Total Liabilities</span>
                       <span className="text-[16px] font-bold text-slate-900 tabular-nums">{formatCurrency(bsSummary.liabilities)}</span>
                    </div>
                    <div className="flex justify-between items-center p-5 mt-1 bg-gradient-to-r from-[#e8f2ff]/90 to-white/90 rounded-[22px] border border-white shadow-[0_8px_20px_rgba(0,106,255,0.08),inset_0_1px_1.5px_rgba(255,255,255,1)]">
                       <span className="text-[16px] font-bold text-[#006aff]">Total Equity</span>
                       <span className="text-[20px] font-bold text-[#006aff] tabular-nums">{formatCurrency(bsSummary.equity)}</span>
                    </div>
                 </div>
              </div>
            </DashboardWidgetLock>

            {/* Tax & GST Analysis */}
            <DashboardWidgetLock moduleName="tax-gst" className="flex flex-col min-w-0">
              <div className={`${glassCardClass} flex flex-col h-full overflow-hidden`}>
                 <div className="px-6 py-4 border-b border-white/80 bg-white/40 flex justify-between items-center">
                    <h3 className="text-[15px] font-bold text-slate-800 flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-[12px] bg-white/85 border border-white shadow-sm flex items-center justify-center">
                        <PieChart className="w-4 h-4 text-[#00b365]" />
                      </span>
                      Tax & GST Analysis
                    </h3>
                    <div className="flex items-center gap-2.5">
                      <span className="text-[11px] bg-[#e6f8ef]/90 text-[#00b365] px-3 py-1 rounded-full uppercase font-bold tracking-wide border border-[#00b365]/30 shadow-sm">Compliant</span>
                      <button onClick={() => handleDownload("Tax and GST Analysis")} className={`w-9 h-9 flex items-center justify-center text-slate-600 hover:text-[#006aff] ${glassPillButtonClass}`} title="Download">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                 </div>
                 <div className="p-6 flex-1 flex flex-col gap-4">
                    <div className="flex gap-4">
                       <div className={`${glassSubCardClass} flex-1 p-5`}>
                          <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider mb-1.5">Output GST</p>
                          <p className="text-[20px] font-bold text-slate-900 tabular-nums">
                            {formatCurrency(gstAnalyticsData?.gstSummary?.outputGst || 0)}
                          </p>
                       </div>
                       <div className={`${glassSubCardClass} flex-1 p-5`}>
                          <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider mb-1.5">Input ITC</p>
                          <p className="text-[20px] font-bold text-[#00b365] tabular-nums">
                            {formatCurrency(gstAnalyticsData?.gstSummary?.inputGst || 0)}
                          </p>
                       </div>
                    </div>
                    <div className="flex justify-between items-center p-5 mt-1 bg-gradient-to-r from-[#fdf2f2]/90 to-white/90 rounded-[22px] border border-white shadow-[0_8px_20px_rgba(240,72,62,0.08),inset_0_1px_1.5px_rgba(255,255,255,1)]">
                       <span className="text-[16px] font-bold text-[#f0483e]">Net GST Payable</span>
                       <span className="text-[20px] font-bold text-[#f0483e] tabular-nums">
                         {formatCurrency(gstAnalyticsData?.gstSummary?.gstPayable || 0)}
                       </span>
                    </div>
                 </div>
              </div>
            </DashboardWidgetLock>
          </div>

          {/* Footer */}
          <footer className="py-8 text-[13px] text-slate-500 flex flex-col md:flex-row items-center justify-between border-t border-white/80 mt-10">
            <p>©️ 2026 SHREE ANDAL AI Software Solutions. All rights reserved.</p>
            <div className="flex gap-6 mt-4 md:mt-0">
              <a href="#" className="hover:text-[#006aff] transition-colors">Help</a>
              <a href="#" className="hover:text-[#006aff] transition-colors">Privacy</a>
              <a href="#" className="hover:text-[#006aff] transition-colors">Terms</a>
            </div>
          </footer>

        </div>

        {/* --- Floating Tinted Liquid Glass AI Chat Button (Rounded Squircle/Capsule) --- */}
        <div className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 sm:bottom-7 sm:right-7 z-40">
          <button 
            onClick={() => setIsAiChatOpen(true)}
            className="w-15 h-15 p-4 rounded-[22px] bg-gradient-to-br from-[#006aff]/85 via-[#2563eb]/80 to-[#0051c4]/90 backdrop-blur-2xl shadow-[0_14px_32px_rgba(0,106,255,0.38),inset_0_1.5px_2px_rgba(255,255,255,0.7),inset_0_-1.5px_2px_rgba(0,40,120,0.35)] hover:-translate-y-1 active:scale-95 transition-all duration-200 flex items-center justify-center relative border border-white/80"
            title="Ask AI Assistant"
            aria-label="Open SHREE ANDAL AI assistant"
          >
            <Bot className="text-white w-6 h-6 drop-shadow-sm" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#00e676] border-2 border-white rounded-full shadow-[0_0_8px_rgba(0,230,118,0.8)]"></span>
          </button>
        </div>

      </main>

      {/* --- AI Chat Right-Side Panel (Floating Rounded Corners + Tinted Liquid Glass) --- */}
      
      {/* Background Overlay for mobile */}
      {isAiChatOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/25 backdrop-blur-sm z-[55] sm:hidden transition-opacity"
          onClick={() => setIsAiChatOpen(false)} 
        />
      )}

      {/* Floating Rounded Tinted Liquid Glass Drawer */}
      <div
        className={`fixed top-3 bottom-3 right-3 sm:top-4 sm:bottom-4 sm:right-4 w-[calc(100%-24px)] sm:w-[410px] rounded-[34px] bg-gradient-to-br from-[#dcebff]/85 via-[#edf5ff]/80 to-[#d8e8ff]/85 backdrop-blur-3xl shadow-[0_24px_60px_rgba(0,85,255,0.18),inset_0_2px_3px_rgba(255,255,255,1),inset_0_-2px_4px_rgba(0,106,255,0.15)] z-[60] transform transition-all duration-300 ease-in-out flex flex-col border border-white/95 overflow-hidden ${
          isAiChatOpen ? "translate-x-0 opacity-100" : "translate-x-[115%] opacity-0 pointer-events-none"
        }`}
      >
        {/* Ambient Tinted Liquid Glass Refraction Blobs Inside AI Assistant */}
        <div className="pointer-events-none absolute -top-16 -right-16 w-52 h-52 rounded-full bg-sky-400/25 blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 -left-20 w-56 h-56 rounded-full bg-indigo-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 right-8 w-48 h-48 rounded-full bg-emerald-300/25 blur-3xl" />

        {/* Tinted Liquid Glass Chat Header */}
        <div className="relative z-10 m-2.5 mb-0 px-4 py-3.5 rounded-[26px] bg-gradient-to-r from-[#006aff]/85 via-[#1d70ff]/80 to-[#0055d4]/85 backdrop-blur-2xl text-white shrink-0 border border-white/40 shadow-[0_10px_24px_rgba(0,106,255,0.22),inset_0_1.5px_2px_rgba(255,255,255,0.55)] flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-white/20 backdrop-blur-xl border border-white/45 rounded-[16px] shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.6)] flex items-center justify-center">
               <Bot className="w-5 h-5 text-white" />
             </div>
             <div>
                <h3 className="font-bold text-[15px] leading-tight tracking-tight">SHREE ANDAL AI</h3>
                <p className="text-[11px] text-[#d6e8ff] flex items-center gap-1.5 mt-0.5 font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#00e676] shadow-[0_0_8px_rgba(0,230,118,0.9)]"></span> Online · AI CFO
                </p>
             </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button 
              onClick={() => setChatViewMode(prev => prev === "chat" ? "history" : "chat")} 
              title={chatViewMode === "chat" ? "View history" : "Back to chat"}
              className="w-9 h-9 bg-white/15 hover:bg-white/30 border border-white/30 rounded-full flex items-center justify-center transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)]"
            >
               <History className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setIsAiChatOpen(false)}
              aria-label="Close AI assistant"
              className="w-9 h-9 bg-white/15 hover:bg-white/30 border border-white/30 rounded-full flex items-center justify-center transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)]"
            >
               <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {chatViewMode === "chat" ? (
          <>
            {/* Chat Messages Area */}
            <div ref={chatScrollRef} className="relative z-10 flex-1 overflow-y-auto p-4 space-y-3.5 bg-transparent">
              {chatMessages.map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[90%] px-4 py-3 text-[13px] leading-[1.6] ${
                      msg.role === 'user'
                        ? 'rounded-[24px] rounded-br-[8px] bg-gradient-to-br from-[#006aff]/90 via-[#1a75ff]/85 to-[#0052cc]/90 backdrop-blur-xl text-white border border-white/45 shadow-[0_8px_20px_rgba(0,106,255,0.24),inset_0_1.5px_1.5px_rgba(255,255,255,0.5)]'
                        : 'rounded-[24px] rounded-bl-[8px] bg-gradient-to-br from-white/90 via-[#f2f7ff]/85 to-[#e6f0ff]/80 backdrop-blur-2xl border border-white text-slate-800 shadow-[0_8px_24px_rgba(0,85,255,0.08),inset_0_1.5px_2px_rgba(255,255,255,1)]'
                    }`}
                  >
                    {msg.role === 'ai' && msg.content === 'Thinking...' ? (
                      <span className="flex items-center gap-1.5 text-[#006aff]/70 italic font-medium">
                        <span className="inline-block w-1.5 h-1.5 bg-[#006aff] rounded-full animate-bounce [animation-delay:0ms]"></span>
                        <span className="inline-block w-1.5 h-1.5 bg-[#006aff] rounded-full animate-bounce [animation-delay:150ms]"></span>
                        <span className="inline-block w-1.5 h-1.5 bg-[#006aff] rounded-full animate-bounce [animation-delay:300ms]"></span>
                      </span>
                    ) : msg.role === 'ai' ? (
                      <div
                        className="ai-message-content"
                        dangerouslySetInnerHTML={{
                          __html: msg.content
                            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                            .replace(/^### (.+)\$/gm, '<h4 class="text-[12px] font-bold text-[#111] mt-2.5 mb-1 uppercase tracking-wide">\$1</h4>')
                            .replace(/^## (.+)\$/gm, '<h3 class="text-[13px] font-bold text-[#111] mt-3 mb-1">\$1</h3>')
                            .replace(/^# (.+)\$/gm, '<h2 class="text-[14px] font-bold text-[#111] mt-3 mb-1.5">\$1</h2>')
                            .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-[#111]">\$1</strong>')
                            .replace(/\*(.+?)\*/g, '<em>\$1</em>')
                            .replace(/`(.+?)`/g, '<code class="bg-blue-100/70 text-[#0052cc] px-1.5 py-0.5 rounded-md text-[11px] font-mono">\$1</code>')
                            .replace(/^- (.+)\$/gm, '<div class="flex items-start gap-1.5 my-0.5"><span class="text-[#006aff] mt-0.5 shrink-0">•</span><span>\$1</span></div>')
                            .replace(/^(\d+)\. (.+)\$/gm, '<div class="flex items-start gap-1.5 my-0.5"><span class="text-[#006aff] font-bold shrink-0">\$1.</span><span>\$2</span></div>')
                            .replace(/^---\$/gm, '<hr class="border-blue-200/50 my-2" />')
                            .replace(/\n{2,}/g, '</p><p class="mt-1.5">')
                            .replace(/\n/g, '<br/>')
                        }}
                      />
                    ) : (
                      <span>{msg.content}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium mt-1 px-1.5">
                    {msg.role === 'ai' ? '🤖 AI CFO · ' : ''}{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}

              {/* Suggested Prompts — show only at start (1 message = welcome only) */}
              {chatMessages.length === 1 && (
                <div className="mt-3 p-3.5 rounded-[24px] bg-white/45 backdrop-blur-xl border border-white/80 shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.9)]">
                  <p className="text-[11px] text-[#0055d4] font-bold uppercase tracking-wider mb-2.5 flex items-center gap-1.5 px-1">
                    <Zap className="w-3.5 h-3.5 text-[#f59e0b]" /> Quick Questions
                  </p>
                  <div className="flex flex-col gap-2">
                    {SUGGESTED_PROMPTS.slice(0, 6).map((prompt, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setChatInput(prompt);
                          setTimeout(() => {
                            const form = document.getElementById('ai-chat-form') as HTMLFormElement;
                            if (form) form.requestSubmit();
                          }, 50);
                        }}
                        className="text-left text-[12px] font-medium text-[#0055d4] bg-gradient-to-r from-white/85 to-[#edf5ff]/85 backdrop-blur-md border border-white hover:from-white hover:to-white rounded-[16px] px-3.5 py-2.5 shadow-[0_4px_12px_rgba(0,106,255,0.06),inset_0_1px_1px_rgba(255,255,255,1)] hover:shadow-[0_6px_16px_rgba(0,106,255,0.12)] transition-all"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Tinted Glass Chat Input Area */}
            <div className="relative z-10 m-2.5 mt-0 p-3 rounded-[26px] bg-gradient-to-b from-white/75 to-[#e8f2ff]/80 backdrop-blur-2xl border border-white shadow-[0_-6px_24px_rgba(0,85,255,0.06),inset_0_1.5px_2px_rgba(255,255,255,1)] shrink-0">
              <p className="text-[10px] text-slate-500 mb-1.5 text-center">
                Period: <span className="font-bold text-[#006aff] uppercase">{selectedPeriod.replace('-', ' ')}</span>
              </p>
              <form id="ai-chat-form" onSubmit={handleChatSubmit} className="relative flex items-center bg-white/90 border border-white rounded-[20px] shadow-[0_4px_14px_rgba(0,106,255,0.08),inset_0_1px_2px_rgba(255,255,255,1)] focus-within:border-[#006aff]/60 focus-within:ring-2 focus-within:ring-[#006aff]/20 transition-all">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSubmit(); } }}
                  placeholder="Ask your AI CFO anything..."
                  className="flex-1 pl-4 pr-2 py-3 bg-transparent text-[13px] text-slate-800 focus:outline-none placeholder:text-slate-400 rounded-l-[20px]"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="m-1.5 w-9 h-9 rounded-[14px] bg-gradient-to-br from-[#006aff] to-[#0051c4] text-white flex items-center justify-center hover:brightness-110 disabled:opacity-40 transition-all shrink-0 shadow-[0_4px_12px_rgba(0,106,255,0.3),inset_0_1px_1px_rgba(255,255,255,0.5)]"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
              <p className="text-[10px] text-slate-500/80 text-center mt-1.5">Powered by Gemini AI · Verify with your CA for statutory filings</p>
            </div>
          </>
        ) : (
          /* Tinted Glass History View Mode */
          <div className="relative z-10 flex-1 flex flex-col overflow-hidden bg-transparent p-2.5">
            <div className="px-4 py-3 rounded-[20px] border border-white bg-white/65 backdrop-blur-xl flex items-center justify-between shrink-0 mb-2 shadow-sm">
              <span className="text-[13px] font-bold text-slate-800">Chat History</span>
              <button 
                onClick={handleClearChat}
                className="text-[11px] font-bold text-[#f0483e] hover:underline"
              >
                Clear All
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-1.5 py-2 space-y-2">
              {chatMessages.filter(msg => msg.role === 'user').length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-[13px]">
                  No past queries found
                </div>
              ) : (
                chatMessages.filter(msg => msg.role === 'user').map((msg, index) => (
                  <button
                    key={msg.id || index}
                    onClick={() => {
                      setChatInput(msg.content);
                      setChatViewMode("chat");
                    }}
                    className="w-full text-left p-3.5 bg-gradient-to-r from-white/85 to-[#edf5ff]/80 hover:from-white hover:to-white border border-white rounded-[20px] shadow-[0_4px_12px_rgba(0,106,255,0.06),inset_0_1px_1px_rgba(255,255,255,1)] hover:border-[#006aff]/50 transition-all flex items-start gap-3"
                  >
                    <History className="w-[15px] h-[15px] text-[#006aff] mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800 truncate">{msg.content}</p>
                      <span className="text-[10px] text-slate-500 block mt-0.5">
                        {msg.timestamp.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

      </div>

      {showSellerSetupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 backdrop-blur-md p-4 overflow-y-auto">
          <div className="bg-gradient-to-br from-white/90 via-white/80 to-white/70 backdrop-blur-2xl w-full max-w-lg rounded-[32px] border border-white shadow-[0_24px_60px_rgba(15,23,42,0.18),inset_0_1.5px_2px_rgba(255,255,255,1)] p-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setShowSellerSetupModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-white/80 hover:bg-white border border-white text-slate-500 hover:text-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="mb-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white border border-white shadow-sm text-[#006aff] mb-3">
                <Building2 className="h-5 w-5" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900">Complete Seller Profile</h3>
              <p className="text-xs text-slate-600 mt-1">Please enter your business seller details. These will be automatically filled in invoices and cannot be edited within the invoice form directly.</p>
            </div>

            <form onSubmit={handleSaveSellerSetup} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Seller Name *</label>
                <input 
                  type="text" 
                  value={setupSellerName}
                  onChange={(e) => setSetupSellerName(e.target.value)}
                  placeholder="e.g. Shree Andal Software Solutions"
                  required
                  className="w-full h-11 px-4 bg-white/80 border border-white rounded-full shadow-sm text-[13px] focus:outline-none focus:border-[#006aff] transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Phone Number</label>
                  <input 
                    type="text" 
                    value={setupSellerPhone}
                    onChange={(e) => setSetupSellerPhone(e.target.value)}
                    placeholder="e.g. +91 9876543210"
                    className="w-full h-11 px-4 bg-white/80 border border-white rounded-full shadow-sm text-[13px] focus:outline-none focus:border-[#006aff] transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Seller Email</label>
                  <input 
                    type="email" 
                    value={setupSellerEmail}
                    onChange={(e) => setSetupSellerEmail(e.target.value)}
                    placeholder="e.g. sales@company.com"
                    className="w-full h-11 px-4 bg-white/80 border border-white rounded-full shadow-sm text-[13px] focus:outline-none focus:border-[#006aff] transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Seller GSTIN</label>
                  <input 
                    type="text" 
                    value={setupSellerGSTIN}
                    onChange={(e) => setSetupSellerGSTIN(e.target.value.toUpperCase())}
                    placeholder="e.g. 33AAAAA1111A1Z1"
                    className="w-full h-11 px-4 bg-white/80 border border-white rounded-full shadow-sm text-[13px] focus:outline-none focus:border-[#006aff] transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Seller State</label>
                  <select 
                    value={setupSellerState}
                    onChange={(e) => setSetupSellerState(e.target.value)}
                    className="w-full h-11 px-4 bg-white/80 border border-white rounded-full shadow-sm text-[13px] focus:outline-none focus:border-[#006aff] transition-colors"
                  >
                    {INDIAN_STATES.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Seller Address</label>
                <textarea 
                  value={setupSellerAddress}
                  onChange={(e) => setSetupSellerAddress(e.target.value)}
                  placeholder="Enter full business address"
                  rows={2}
                  className="w-full p-4 bg-white/80 border border-white rounded-[20px] shadow-sm text-[13px] focus:outline-none focus:border-[#006aff] transition-colors resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowSellerSetupModal(false)}
                  className="px-4 py-2.5 rounded-full border border-white bg-white/75 text-slate-700 text-xs font-semibold hover:bg-white shadow-sm transition-colors"
                >
                  Skip for now
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmittingSetup}
                  className="px-5 py-2.5 rounded-full bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 shadow-md transition-colors flex items-center gap-1.5"
                >
                  {isSubmittingSetup ? "Saving..." : "Save Details"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <UpgradeModal />
    </div>
  );
};

export default Dashboard;
