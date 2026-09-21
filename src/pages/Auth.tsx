import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Check,
  Lock,
  Mail,
  Receipt,
  CreditCard,
  ArrowRight,
  ShieldCheck,
  Building2,
  Zap,
  Hexagon,
  Eye,
  EyeOff,
  AlertCircle
} from "lucide-react";
import { VoiceButton } from "@/components/ui/VoiceButton";
import { API_ENDPOINTS, apiRequest } from "@/lib/api";
import { isTrialExpired } from "@/lib/trial";
import { motion, AnimatePresence } from "framer-motion";
import { useSubscription } from "@/contexts/SubscriptionContext";

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayResponse) => void;
  modal: { ondismiss: () => void };
  theme: { color: string };
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: { plan?: string; planName?: string };
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => { open: () => void };
  }
}

type SubscriptionPlan = {
  id: string;
  name: string;
  price: number;
  gst: number;
  totalAmount: number;
  duration: string;
  description: string;
  features: string[];
  popular: boolean;
};

const subscriptionPlans = {
  trial: {
    id: "trial",
    name: "Sandbox",
    price: 0,
    gst: 0,
    totalAmount: 0,
    duration: "14 days",
    description: "Explore the platform with full access. No credit card required.",
    features: [
      "Test up to 50 invoices",
      "Basic Invoice, Inventory & Bookkeeping",
      "Standard email support"
    ],
    popular: false,
  },
  basic: {
    id: "basic",
    name: "Basic",
    price: 950,
    gst: 171,
    totalAmount: 1121,
    duration: "month",
    description: "Essential billing & inventory management for small businesses.",
    features: [
      "Up to 5,000 Invoices",
      "Invoice Module Access",
      "Inventory Management",
      "Standard Email Support"
    ],
    popular: false,
  },
  basic_annual: {
    id: "basic_annual",
    name: "Basic",
    price: 9120,
    gst: 1642,
    totalAmount: 10762,
    duration: "year",
    description: "Essential billing & inventory management. Save 20% annually.",
    features: [
      "Up to 5,000 Invoices",
      "Invoice Module Access",
      "Inventory Management",
      "Standard Email Support"
    ],
    popular: false,
  },
  intermediate: {
    id: "intermediate",
    name: "Intermediate",
    price: 1950,
    gst: 351,
    totalAmount: 2301,
    duration: "month",
    description: "Full automation suite with complete bookkeeping & GST compliance.",
    features: [
      "Up to 25,000 Invoices",
      "Invoice, Inventory & Bookkeeping",
      "Tax & GST Compliance",
      "Balance Sheet & Profit & Loss",
      "Cash Flow Statement & Prediction",
      "Financial Ratios"
    ],
    popular: true,
  },
  intermediate_annual: {
    id: "intermediate_annual",
    name: "Intermediate",
    price: 18720,
    gst: 3370,
    totalAmount: 22090,
    duration: "year",
    description: "Full automation suite & GST compliance. Save 20% annually.",
    features: [
      "Up to 25,000 Invoices",
      "Invoice, Inventory & Bookkeeping",
      "Tax & GST Compliance",
      "Balance Sheet & Profit & Loss",
      "Cash Flow Statement & Prediction",
      "Financial Ratios"
    ],
    popular: true,
  },
  premium: {
    id: "premium",
    name: "Premium",
    price: 4950,
    gst: 891,
    totalAmount: 5841,
    duration: "month",
    description: "Unlimited scale with advanced fraud detection & payroll.",
    features: [
      "Up to 100,000 Invoices",
      "All Intermediate Modules Included",
      "Payroll & Bank Reconciliation",
      "Advanced Fraud Detection",
      "Civil Engineering Module"
    ],
    popular: false,
  },
  premium_annual: {
    id: "premium_annual",
    name: "Premium",
    price: 47520,
    gst: 8554,
    totalAmount: 56074,
    duration: "year",
    description: "Unlimited scale with fraud detection & payroll. Save 20% annually.",
    features: [
      "Up to 100,000 Invoices",
      "All Intermediate Modules Included",
      "Payroll & Bank Reconciliation",
      "Advanced Fraud Detection",
      "Civil Engineering Module"
    ],
    popular: false,
  },
  // Legacy aliases
  monthly: {
    id: "monthly",
    name: "Basic",
    price: 950,
    gst: 171,
    totalAmount: 1121,
    duration: "month",
    description: "Essential billing & inventory management.",
    features: ["Up to 5,000 Invoices", "Invoice Module Access", "Inventory Management"],
    popular: false,
  },
  annual: {
    id: "annual",
    name: "Intermediate",
    price: 1950,
    gst: 351,
    totalAmount: 2301,
    duration: "month",
    description: "Full automation suite with complete bookkeeping.",
    features: ["Up to 25,000 Invoices", "Invoice, Inventory & Bookkeeping", "Tax & GST Compliance"],
    popular: true,
  },
  lifetime: {
    id: "lifetime",
    name: "Premium",
    price: 4950,
    gst: 891,
    totalAmount: 5841,
    duration: "month",
    description: "Unlimited scale with advanced fraud detection.",
    features: ["Up to 100,000 Invoices", "All Intermediate Modules Included", "Payroll & Bank Reconciliation"],
    popular: false,
  }
} satisfies Record<string, SubscriptionPlan>;

type PlanKey = keyof typeof subscriptionPlans;

// Premium SaaS Pricing Card with Hover Glow Effects
const PlanCard = ({
  planKey,
  plan,
  onSelect,
  isSummary = false
}: {
  planKey: string,
  plan: SubscriptionPlan,
  onSelect?: () => void,
  isSummary?: boolean
}) => {
  const isTrial = planKey === "trial";
  const isPopular = plan.popular;

  // Base inner card styles
  const innerCardClasses = isPopular && !isSummary
    ? "bg-[#0f172a] text-white border-[#0f172a]"
    : "bg-white text-[#0f172a] border-[#e2e8f0]";

  return (
    <div className={`relative w-full max-w-[340px] mx-auto group transition-all duration-300 ${isPopular && !isSummary ? 'scale-100 lg:scale-105 z-10' : !isSummary ? 'hover:-translate-y-2' : ''
      }`}>

      {/* 1. Animated Glow for the Popular Plan */}
      {isPopular && !isSummary && (
        <div className="absolute -inset-[2px] bg-gradient-to-r from-[#3b82f6] via-[#6366f1] to-[#8b5cf6] rounded-[26px] blur-lg opacity-60 group-hover:opacity-100 transition duration-500 animate-pulse"></div>
      )}

      {/* 2. Hover Glow for Standard Plans */}
      {!isPopular && !isSummary && (
        <div className="absolute -inset-[1.5px] bg-gradient-to-r from-[#60a5fa] to-[#818cf8] rounded-[26px] blur-md opacity-0 group-hover:opacity-40 transition duration-500"></div>
      )}

      {/* Main Card Content */}
      <div className={`relative flex flex-col p-6 xl:p-7 rounded-[24px] border h-full w-full shadow-sm ${innerCardClasses}`}>

        {isPopular && !isSummary && (
          <div className="absolute -top-3.5 left-8 bg-gradient-to-r from-[#3b82f6] to-[#2563eb] text-white text-[11px] font-bold uppercase tracking-widest px-3.5 py-1 rounded-full shadow-md z-20">
            Recommended
          </div>
        )}

        <h3 className={`text-[20px] font-semibold tracking-tight ${isPopular && !isSummary ? 'text-white' : 'text-[#0f172a]'}`}>
          {plan.name}
        </h3>
        <p className={`text-[14px] mt-2 leading-relaxed ${isPopular && !isSummary ? 'text-[#94a3b8]' : 'text-[#64748b]'}`}>
          {plan.description}
        </p>

        <div className="mt-6 mb-6">
          <div className="flex items-end gap-1.5">
            <span className={`text-[38px] font-bold leading-none tracking-tighter ${isPopular && !isSummary ? 'text-white' : 'text-[#0f172a]'}`}>
              {isTrial ? "Free" : `₹${plan.totalAmount.toLocaleString()}`}
            </span>
            {!isTrial && <span className={`text-[14px] font-medium mb-1.5 ${isPopular && !isSummary ? 'text-[#94a3b8]' : 'text-[#64748b]'}`}>/{plan.duration}</span>}
          </div>
          {!isTrial ? (
            <div className={`text-[13px] font-medium mt-2 ${isPopular && !isSummary ? 'text-[#64748b]' : 'text-[#94a3b8]'}`}>
              ₹{plan.price.toLocaleString()} + ₹{plan.gst.toLocaleString()} GST (18%)
            </div>
          ) : (
            <div className={`text-[13px] font-medium mt-2 ${isPopular && !isSummary ? 'text-[#64748b]' : 'text-[#94a3b8]'}`}>
              ₹0.00 due today
            </div>
          )}
        </div>

        {!isSummary && (
          <button
            onClick={onSelect}
            className={`w-full py-2.5 rounded-xl font-semibold text-[14px] transition-all duration-200 mb-6 flex items-center justify-center gap-2 ${isPopular
                ? 'bg-white text-[#0f172a] hover:bg-[#f8fafc] shadow-[0_4px_14px_rgba(255,255,255,0.15)]'
                : 'bg-[#f8fafc] text-[#0f172a] border border-[#e2e8f0] hover:bg-[#f1f5f9] hover:border-[#cbd5e1]'
              }`}
          >
            {isTrial ? "Start free trial" : "Get started"} <ArrowRight className="w-4 h-4" />
          </button>
        )}

        <div className={`${isSummary ? 'mt-2' : 'pt-5 border-t'} ${isPopular && !isSummary ? 'border-[#1e293b]' : 'border-[#f1f5f9]'}`}>
          <p className={`text-[13px] font-semibold mb-4 ${isPopular && !isSummary ? 'text-[#e2e8f0]' : 'text-[#0f172a]'}`}>
            Plan includes:
          </p>
          <ul className="space-y-3.5">
            {plan.features.map((feat, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <Check className={`w-4 h-4 mt-0.5 shrink-0 ${isPopular && !isSummary ? 'text-[#3b82f6]' : 'text-[#0f172a]'}`} strokeWidth={2.5} />
                <span className={`text-[13.5px] leading-snug font-medium ${isPopular && !isSummary ? 'text-[#cbd5e1]' : 'text-[#475569]'}`}>{feat}</span>
              </li>
            ))}
          </ul>
        </div>

      </div>
    </div>
  );
};

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { refreshUser } = useSubscription();

  const [loading, setLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [view, setView] = useState<"signin" | "signup">("signin");
  const [signupStep, setSignupStep] = useState<1 | 2>(1);
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("basic");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [storePassword, setStorePassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [showStorePassword, setShowStorePassword] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab");
    const plan = params.get("plan") as PlanKey | null;

    if (tab === "signup" || tab === "signin") {
      setView(tab);
      setError("");
      if (tab === "signup") setSignupStep(1);
    }
    if (plan && plan in subscriptionPlans) {
      setSelectedPlan(plan);
      if (plan === "trial") {
        setView("signup");
        setSignupStep(1);
      }
    }
  }, [location.search]);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);

  const clearInvoiceCache = () => {
    try {
      localStorage.removeItem("savedInvoices");
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith("savedInvoices")) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const cleanedEmail = email.trim().toLowerCase();

    if (!cleanedEmail || !password) {
      const msg = "Email and password are required.";
      setError(msg);
      return toast({ variant: "destructive", title: "Required", description: msg });
    }

    setLoading(true);
    try {
      const res = await apiRequest(API_ENDPOINTS.SIGNIN, {
        method: "POST",
        body: JSON.stringify({ email: cleanedEmail, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Invalid email or password.");

      if (data.user?.subscriptionStatus === "expired") {
        toast({
          variant: "destructive",
          title: "Subscription Expired",
          description: "Your trial has expired. Please subscribe to continue."
        });
        setView("signup");
        setSignupStep(1);
        setSelectedPlan("monthly");
        return;
      }

      clearInvoiceCache();
      localStorage.setItem("token", data.token);
      await refreshUser(data.user);
      setTimeout(() => navigate("/dashboard"), 300);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Invalid email or password.";
      setError(errMsg);
      toast({
        variant: "destructive",
        title: "Sign In Failed",
        description: errMsg
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const cleanedEmail = email.trim().toLowerCase();

    if (!cleanedEmail || !password || !storePassword) {
      const msg = "Work Email, Admin password, and Store password are required.";
      setError(msg);
      return toast({ variant: "destructive", title: "Required", description: msg });
    }
    setPaymentLoading(true);

    try {
      if (selectedPlan === "trial") {
        setLoading(true);
        const trialRes = await apiRequest(API_ENDPOINTS.SIGNUP_TRIAL, {
          method: "POST",
          body: JSON.stringify({ email: cleanedEmail, password, storePassword, name: name || cleanedEmail.split("@")[0], role: "admin" }),
        });
        const trialData = await trialRes.json();
        if (!trialRes.ok) throw new Error(trialData.message || "Sign up failed.");

        clearInvoiceCache();
        localStorage.setItem("token", trialData.token);
        await refreshUser(trialData.user);
        toast({ title: "Welcome!", description: "Initializing your workspace..." });
        setTimeout(() => navigate("/dashboard"), 300);
        return;
      }

      const orderRes = await apiRequest(API_ENDPOINTS.CREATE_ORDER, {
        method: "POST",
        body: JSON.stringify({ email: cleanedEmail, plan: selectedPlan }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.message || "Failed to create order.");

      const options: RazorpayOptions = {
        key: orderData.key,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "SHREE ANDAL AI",
        description: `Billing License - ${subscriptionPlans[selectedPlan].name}`,
        order_id: orderData.orderId,
        handler: async function (response: RazorpayResponse) {
          try {
            setLoading(true);
            const verifyRes = await apiRequest(API_ENDPOINTS.VERIFY_PAYMENT, {
              method: "POST",
              body: JSON.stringify({ ...response, email: cleanedEmail, password, storePassword, plan: selectedPlan, name: name || cleanedEmail.split('@')[0], role: "admin" }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok) throw new Error(verifyData.message || "Payment verification failed.");

            clearInvoiceCache();
            localStorage.setItem("token", verifyData.token);
            await refreshUser(verifyData.user);
            setTimeout(() => navigate("/dashboard"), 300);
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Verification failed";
            setError(errMsg);
            toast({ variant: "destructive", title: "Payment Error", description: errMsg });
          } finally {
            setLoading(false);
            setPaymentLoading(false);
          }
        },
        modal: { ondismiss: () => setPaymentLoading(false) },
        prefill: { email: cleanedEmail, name: name || cleanedEmail.split('@')[0] },
        theme: { color: "#0f172a" },
      };
      new window.Razorpay(options).open();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "An error occurred.";
      setError(errMsg);
      toast({ variant: "destructive", title: "Error", description: errMsg });
      setPaymentLoading(false);
      setLoading(false);
    }
  };

  const planEntries = Object.entries(subscriptionPlans) as Array<[PlanKey, SubscriptionPlan]>;

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] font-sans text-[#0f172a] selection:bg-[#3b82f6]/20 selection:text-[#2563eb]">
      <AnimatePresence mode="wait">

        {view === "signup" && signupStep === 1 ? (

          /* =========================================
             STEP 1: FULL SCREEN PRICING PLAN SELECTOR
             ========================================= */
          <motion.div
            key="fullscreen-pricing"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="w-full min-h-screen flex flex-col py-12 md:py-20 relative overflow-x-hidden"
          >
            {/* Minimal Header */}
            <div className="absolute top-6 left-6 md:left-10 flex items-center gap-2.5 z-30">
              <div className="w-9 h-9 bg-[#0f172a] rounded-lg flex items-center justify-center text-white shadow-md">
                <Hexagon className="w-5 h-5 fill-current" />
              </div>
              <span className="font-bold text-[18px] tracking-tight text-[#0f172a]">SHREE ANDAL AI</span>
            </div>

            <div className="absolute top-6 right-6 md:right-10 text-[14px] font-medium z-30 flex items-center gap-3">
              <span className="text-[#64748b] hidden sm:inline">Already have an account?</span>
              <button onClick={() => { setView("signin"); setEmail(""); setPassword(""); setStorePassword(""); }} className="text-[#0f172a] font-semibold hover:text-[#3b82f6] transition-colors">Sign in</button>
            </div>

            {/* Title Section */}
            <div className="text-center mb-8 md:mb-10 px-6 mt-16 md:mt-4 relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#e0e7ff] text-[#3730a3] text-[12px] font-bold uppercase tracking-widest mb-6">
                <Zap className="w-3.5 h-3.5 fill-current" /> Scalable Pricing
              </div>
              <h1 className="text-[36px] md:text-[48px] font-bold text-[#0f172a] leading-tight mb-4 tracking-tighter">
                Choose the right plan for your business
              </h1>
              <p className="text-[16px] md:text-[18px] text-[#64748b] max-w-2xl mx-auto font-medium">
                Transparent pricing with no hidden fees. Upgrade, downgrade, or cancel anytime.
              </p>
            </div>

            {/* Claude-style Billing Toggle Switch */}
            <div className="flex items-center justify-center mb-10 z-10">
              <div className="bg-[#e2e8f0] p-1.5 rounded-full flex items-center gap-1 shadow-inner border border-[#cbd5e1]">
                <button
                  type="button"
                  onClick={() => setBillingCycle("monthly")}
                  className={`px-6 py-2.5 rounded-full text-[13.5px] font-bold transition-all duration-300 ${
                    billingCycle === "monthly"
                      ? "bg-[#0f172a] text-white shadow-md"
                      : "text-[#64748b] hover:text-[#0f172a]"
                  }`}
                >
                  Monthly Billed
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle("yearly")}
                  className={`px-6 py-2.5 rounded-full text-[13.5px] font-bold transition-all duration-300 flex items-center gap-2 ${
                    billingCycle === "yearly"
                      ? "bg-[#0f172a] text-white shadow-md"
                      : "text-[#64748b] hover:text-[#0f172a]"
                  }`}
                >
                  <span>Yearly Billed</span>
                  <span className="bg-emerald-500 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                    Save 20%
                  </span>
                </button>
              </div>
            </div>

            {/* Pricing Grid */}
            <div className="w-full max-w-[1400px] mx-auto px-6 z-10">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 xl:gap-8 items-start justify-center">
                {(billingCycle === "monthly" 
                  ? ["trial", "basic", "intermediate", "premium"]
                  : ["trial", "basic_annual", "intermediate_annual", "premium_annual"]
                ).map((key) => {
                  const plan = subscriptionPlans[key as PlanKey];
                  return (
                    <PlanCard
                      key={key}
                      planKey={key}
                      plan={plan}
                      onSelect={() => {
                        setSelectedPlan(key as PlanKey);
                        setSignupStep(2);
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </motion.div>

        ) : (

          /* =========================================
             STEP 2 OR SIGN IN: SPLIT SCREEN LAYOUT
             ========================================= */
          <motion.div
            key="split-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex w-full min-h-screen bg-white"
          >
            {/* LEFT SIDE - FORM */}
            <div className="w-full lg:w-[45%] xl:w-[40%] flex flex-col min-h-screen relative z-20 bg-white border-r border-[#e2e8f0]">

              <div className="px-8 md:px-12 py-8 flex items-center justify-between">
                <div className="flex items-center gap-2.5 cursor-pointer">
                  <div className="w-9 h-9 bg-[#0f172a] rounded-lg flex items-center justify-center text-white">
                    <Hexagon className="w-5 h-5 fill-current" />
                  </div>
                  <span className="font-bold text-[18px] tracking-tight text-[#0f172a]">SHREE ANDAL AI</span>
                </div>

                <div className="lg:hidden text-[14px] font-medium">
                  {view === "signin" ? (
                    <span className="text-[#64748b]">New? <button onClick={() => { setView("signup"); setSignupStep(1); setEmail(""); setPassword(""); setStorePassword(""); }} className="text-[#0f172a] font-semibold hover:text-[#3b82f6]">Sign up</button></span>
                  ) : (
                    <span className="text-[#64748b]">Registered? <button onClick={() => { setView("signin"); setEmail(""); setPassword(""); setStorePassword(""); }} className="text-[#0f172a] font-semibold hover:text-[#3b82f6]">Sign in</button></span>
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col justify-center px-8 md:px-12 lg:px-16 pb-16 w-full max-w-[560px] mx-auto overflow-y-auto [&::-webkit-scrollbar]:hidden">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={view}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="w-full flex flex-col"
                  >
                    {view === "signin" ? (
                      /* --- SIGN IN FORM --- */
                      <div className="flex flex-col h-full">
                        <div className="mb-8">
                          <h1 className="text-[30px] font-bold text-[#0f172a] tracking-tight mb-2">Welcome back</h1>
                          <p className="text-[15px] text-[#64748b] font-medium">Sign in to your account to manage your business ledgers.</p>
                        </div>
                        {error && (
                          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-600 text-sm font-medium">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
                            <span>{error}</span>
                          </div>
                        )}
                        <form onSubmit={handleSignIn} className="space-y-5">
                          <div>
                            <label className="block text-[13px] font-bold text-[#333] mb-2 uppercase tracking-wide">Work Email</label>
                            <div className="relative flex items-center">
                              <Mail className="absolute left-3.5 w-[18px] h-[18px] text-[#94a3b8]" />
                              <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} className="w-full h-12 pl-10 pr-10 bg-white border border-[#cbd5e1] rounded-[10px] text-[15px] focus:border-[#3b82f6] focus:ring-4 focus:ring-[#3b82f6]/10 outline-none transition-all placeholder:text-[#94a3b8]" placeholder="name@company.com" required />
                              <div className="absolute right-2"><VoiceButton onTranscript={(txt) => { setEmail(txt); setError(""); }} onClear={() => { setEmail(""); setError(""); }} size="sm" /></div>
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <label className="block text-[13px] font-bold text-[#333] uppercase tracking-wide">Password</label>
                              <a href="#" className="text-[13px] font-semibold text-[#3b82f6] hover:text-[#2563eb]">Forgot password?</a>
                            </div>
                            <div className="relative flex items-center">
                              <Lock className="absolute left-3.5 w-[18px] h-[18px] text-[#94a3b8]" />
                              <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} className="w-full h-12 pl-10 pr-10 bg-white border border-[#cbd5e1] rounded-[10px] text-[15px] focus:border-[#3b82f6] focus:ring-4 focus:ring-[#3b82f6]/10 outline-none transition-all placeholder:text-[#94a3b8]" placeholder="••••••••" required />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3.5 text-[#94a3b8] hover:text-[#0f172a] transition-colors focus:outline-none"
                                tabIndex={-1}
                              >
                                {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                              </button>
                            </div>
                          </div>
                          <button type="submit" disabled={loading} className="w-full h-12 mt-6 bg-[#0f172a] hover:bg-[#1e293b] text-white font-semibold text-[15px] rounded-[10px] transition-colors flex items-center justify-center gap-2 shadow-sm">
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Sign In <ArrowRight className="w-4 h-4" /></>}
                          </button>
                        </form>
                      </div>
                    ) : (
                      /* --- SIGN UP: STEP 2 (ACCOUNT DETAILS) --- */
                      <div className="flex flex-col h-full">
                        <button onClick={() => { setSignupStep(1); setError(""); }} className="text-[13px] font-semibold text-[#64748b] hover:text-[#0f172a] flex items-center gap-1.5 mb-8 transition-colors w-fit group">
                          <ArrowRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" /> Back to pricing
                        </button>
                        <div className="mb-8">
                          <h1 className="text-[30px] font-bold text-[#0f172a] tracking-tight mb-2">Create your account</h1>
                          <p className="text-[15px] text-[#64748b] font-medium">Complete your <span className="font-bold text-[#0f172a]">{subscriptionPlans[selectedPlan].name}</span> plan setup.</p>
                        </div>
                        {error && (
                          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-600 text-sm font-medium">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
                            <span>{error}</span>
                          </div>
                        )}
                        <form onSubmit={handleSignUp} className="space-y-5">
                          <div>
                            <label className="block text-[13px] font-bold text-[#333] mb-2 uppercase tracking-wide">Work Email</label>
                            <div className="relative flex items-center">
                              <Mail className="absolute left-3.5 w-[18px] h-[18px] text-[#94a3b8]" />
                              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full h-12 pl-10 pr-10 bg-white border border-[#cbd5e1] rounded-[10px] text-[15px] focus:border-[#3b82f6] focus:ring-4 focus:ring-[#3b82f6]/10 outline-none transition-all placeholder:text-[#94a3b8]" placeholder="name@company.com" required />
                              <div className="absolute right-2"><VoiceButton onTranscript={setEmail} onClear={() => setEmail("")} size="sm" /></div>
                            </div>
                          </div>
                          <div>
                            <label className="block text-[13px] font-bold text-[#333] mb-2 uppercase tracking-wide">Set Admin Password</label>
                            <div className="relative flex items-center">
                              <Lock className="absolute left-3.5 w-[18px] h-[18px] text-[#94a3b8]" />
                              <input type={showAdminPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full h-12 pl-10 pr-10 bg-white border border-[#cbd5e1] rounded-[10px] text-[15px] focus:border-[#3b82f6] focus:ring-4 focus:ring-[#3b82f6]/10 outline-none transition-all placeholder:text-[#94a3b8]" placeholder="Create admin password" required />
                              <button
                                type="button"
                                onClick={() => setShowAdminPassword(!showAdminPassword)}
                                className="absolute right-3.5 text-[#94a3b8] hover:text-[#0f172a] transition-colors focus:outline-none"
                                tabIndex={-1}
                              >
                                {showAdminPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                              </button>
                            </div>
                          </div>
                          <div>
                            <label className="block text-[13px] font-bold text-[#333] mb-2 uppercase tracking-wide">Set Store Password</label>
                            <div className="relative flex items-center">
                              <Lock className="absolute left-3.5 w-[18px] h-[18px] text-[#94a3b8]" />
                              <input type={showStorePassword ? "text" : "password"} value={storePassword} onChange={(e) => setStorePassword(e.target.value)} className="w-full h-12 pl-10 pr-10 bg-white border border-[#cbd5e1] rounded-[10px] text-[15px] focus:border-[#3b82f6] focus:ring-4 focus:ring-[#3b82f6]/10 outline-none transition-all placeholder:text-[#94a3b8]" placeholder="Create store password" required />
                              <button
                                type="button"
                                onClick={() => setShowStorePassword(!showStorePassword)}
                                className="absolute right-3.5 text-[#94a3b8] hover:text-[#0f172a] transition-colors focus:outline-none"
                                tabIndex={-1}
                              >
                                {showStorePassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                              </button>
                            </div>
                          </div>
                          <button type="submit" disabled={loading || paymentLoading} className="w-full h-12 mt-6 bg-[#0f172a] hover:bg-[#1e293b] text-white font-semibold text-[15px] rounded-[10px] transition-colors flex items-center justify-center gap-2 shadow-sm">
                            {paymentLoading ? <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</> : loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Setting up workspace...</> : selectedPlan === "trial" ? "Start Free Trial" : <><Lock className="w-4 h-4" /> Pay ₹{subscriptionPlans[selectedPlan].totalAmount.toLocaleString()} securely</>}
                          </button>
                          <p className="text-[13px] text-[#64748b] text-center mt-4 font-medium">By registering, you agree to our <a href="#" className="text-[#0f172a] font-semibold hover:underline">Terms</a> & <a href="#" className="text-[#0f172a] font-semibold hover:underline">Privacy Policy</a>.</p>
                        </form>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* RIGHT SIDE - SHOWCASE OR SUMMARY (Desktop Only) */}
            <div className="hidden lg:flex flex-1 flex-col bg-[#f8fafc] relative overflow-hidden">

              <div className="absolute top-8 right-12 text-[14px] font-medium z-30 flex items-center gap-3">
                {view === "signin" ? (
                  <>
                    <span className="text-[#64748b]">Need billing software?</span>
                    <button onClick={() => { setView("signup"); setSignupStep(1); setEmail(""); setPassword(""); }} className="text-[#0f172a] font-semibold hover:text-[#3b82f6] transition-colors">View Pricing</button>
                  </>
                ) : (
                  <>
                    <span className="text-[#64748b]">Already have an account?</span>
                    <button onClick={() => { setView("signin"); setEmail(""); setPassword(""); }} className="text-[#0f172a] font-semibold hover:text-[#3b82f6] transition-colors">Sign in</button>
                  </>
                )}
              </div>

              <AnimatePresence mode="wait">
                {view === "signin" ? (
                  /* --- SHOWCASE FOR SIGN IN --- */
                  <motion.div
                    key="showcase"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className="flex-1 flex flex-col justify-center items-start px-20 xl:px-32 z-10 w-full"
                  >
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#dcfce7] text-[#166534] text-[12px] font-bold uppercase tracking-widest mb-6">
                      <ShieldCheck className="w-4 h-4" /> ISO 27001 Certified
                    </div>

                    <h2 className="text-[40px] xl:text-[48px] font-bold text-[#0f172a] leading-tight mb-6 tracking-tighter">
                      Enterprise-grade<br />billing engine.
                    </h2>
                    <p className="text-[18px] text-[#64748b] leading-relaxed font-medium mb-12 max-w-md">
                      Streamline your financial operations with instant GST compliance, automated payment links, and real-time ledger sync.
                    </p>

                    <div className="space-y-6 w-full max-w-md">
                      <div className="flex gap-4 items-start">
                        <div className="w-12 h-12 rounded-xl bg-white shadow-sm border border-[#e2e8f0] flex items-center justify-center shrink-0">
                          <Receipt className="w-6 h-6 text-[#0f172a]" />
                        </div>
                        <div>
                          <h4 className="text-[16px] font-bold text-[#0f172a] mb-1">Automated e-Invoicing</h4>
                          <p className="text-[14px] text-[#64748b] leading-relaxed font-medium">Generate IRN e-invoices and e-way bills with one click, perfectly synced with GST portals.</p>
                        </div>
                      </div>
                      <div className="flex gap-4 items-start">
                        <div className="w-12 h-12 rounded-xl bg-white shadow-sm border border-[#e2e8f0] flex items-center justify-center shrink-0">
                          <CreditCard className="w-6 h-6 text-[#0f172a]" />
                        </div>
                        <div>
                          <h4 className="text-[16px] font-bold text-[#0f172a] mb-1">Smart Collections</h4>
                          <p className="text-[14px] text-[#64748b] leading-relaxed font-medium">Reduce days sales outstanding (DSO) by 40% with embedded payment links and auto-reminders.</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  /* --- PLAN SUMMARY FOR SIGN UP (STEP 2) --- */
                  <motion.div
                    key="plan-summary"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="flex-1 flex flex-col justify-center items-center p-12 z-10 w-full"
                  >
                    <div className="mb-10 text-center">
                      <h3 className="text-[28px] font-bold text-[#0f172a] mb-2 tracking-tight">Excellent Choice</h3>
                      <p className="text-[16px] text-[#64748b] font-medium">You're seconds away from upgrading your business.</p>
                    </div>

                    <div className="pointer-events-none w-full max-w-[380px]">
                      <PlanCard
                        planKey={selectedPlan}
                        plan={subscriptionPlans[selectedPlan]}
                        isSummary={true}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Auth;