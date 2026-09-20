import React, { createContext, useContext, useState, useEffect } from "react";
import { API_ENDPOINTS } from "@/lib/api";

export type UserProfile = {
  id: string;
  email: string;
  name?: string;
  role?: "admin" | "instore";
  subscriptionStatus?: "pending" | "active" | "expired";
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

type SubscriptionContextType = {
  user: UserProfile | null;
  loading: boolean;
  hasAccess: (moduleName: string) => boolean;
  refreshUser: (initialUser?: UserProfile | null) => Promise<UserProfile | null>;
  setUser: React.Dispatch<React.SetStateAction<UserProfile | null>>;
  showUpgradeModalFor: string | null;
  openUpgradeModal: (moduleName: string) => void;
  closeUpgradeModal: () => void;
};

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

// Syncing permitted modules list per plan
export const planModules: Record<string, string[]> = {
  trial: ["dashboard", "invoice", "inventory", "bookkeeping", "tax-gst", "balance-sheet", "profit-loss", "cashflow", "cashflow-statement", "financial-ratios", "export"], // Sandbox Trial (Bank, Payroll, Civil, Fraud locked)
  basic: ["dashboard", "invoice", "inventory", "export"],
  basic_annual: ["dashboard", "invoice", "inventory", "export"],
  monthly: ["dashboard", "invoice", "inventory", "bookkeeping", "tax-gst", "balance-sheet", "profit-loss", "cashflow", "cashflow-statement", "financial-ratios", "payroll", "bank-reconciliation", "fraud-detection", "civil-engineering", "export"],
  intermediate: ["dashboard", "invoice", "inventory", "bookkeeping", "tax-gst", "balance-sheet", "profit-loss", "cashflow", "cashflow-statement", "financial-ratios", "export"],
  intermediate_annual: ["dashboard", "invoice", "inventory", "bookkeeping", "tax-gst", "balance-sheet", "profit-loss", "cashflow", "cashflow-statement", "financial-ratios", "export"],
  annual: ["dashboard", "invoice", "inventory", "bookkeeping", "tax-gst", "balance-sheet", "profit-loss", "cashflow", "cashflow-statement", "financial-ratios", "export"],
  premium: ["dashboard", "invoice", "inventory", "bookkeeping", "tax-gst", "balance-sheet", "profit-loss", "cashflow", "cashflow-statement", "financial-ratios", "payroll", "bank-reconciliation", "fraud-detection", "civil-engineering", "export"],
  premium_annual: ["dashboard", "invoice", "inventory", "bookkeeping", "tax-gst", "balance-sheet", "profit-loss", "cashflow", "cashflow-statement", "financial-ratios", "payroll", "bank-reconciliation", "fraud-detection", "civil-engineering", "export"],
  lifetime: ["dashboard", "invoice", "inventory", "bookkeeping", "tax-gst", "balance-sheet", "profit-loss", "cashflow", "cashflow-statement", "financial-ratios", "payroll", "bank-reconciliation", "fraud-detection", "civil-engineering", "export"]
};

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpgradeModalFor, setShowUpgradeModalFor] = useState<string | null>(null);

  const refreshUser = async (initialUser?: UserProfile | null): Promise<UserProfile | null> => {
    if (initialUser !== undefined) {
      setUser(initialUser);
      setLoading(false);
      return initialUser;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      setUser(null);
      setLoading(false);
      return null;
    }

    try {
      const res = await fetch(API_ENDPOINTS.USER, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        return data;
      } else {
        // Token might be invalid
        localStorage.removeItem("token");
        setUser(null);
        return null;
      }
    } catch (err) {
      console.error("Error fetching user profile in SubscriptionProvider:", err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();

    // Dynamically load Razorpay checkout script on mount
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // Clean up script on unmount
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const hasAccess = (moduleName: string): boolean => {
    if (!user) return false;

    // dashboard is always accessible to authenticated users
    if (moduleName === "dashboard") return true;

    // In-store POS accounts are strictly restricted to Invoice and Inventory modules only
    if (user.role === "instore") {
      return ["invoice", "inventory"].includes(moduleName);
    }

    // Check if subscription has expired
    const isExpired = user.subscriptionStatus === "expired" || (
      user.subscriptionEndDate && new Date(user.subscriptionEndDate).getTime() < Date.now()
    ) || (
      user.subscriptionPlan === "trial" && user.trialEndDate && new Date(user.trialEndDate).getTime() < Date.now()
    );

    if (isExpired) {
      // Expired accounts only have dashboard access
      return false;
    }

    const plan = user.subscriptionPlan || "monthly";
    const allowed = planModules[plan] || [];
    return allowed.includes(moduleName);
  };

  const openUpgradeModal = (moduleName: string) => {
    if (user?.role === "instore") {
      // Store POS accounts cannot upgrade subscriptions
      return;
    }
    setShowUpgradeModalFor(moduleName);
  };

  const closeUpgradeModal = () => {
    setShowUpgradeModalFor(null);
  };

  return (
    <SubscriptionContext.Provider value={{
      user,
      loading,
      hasAccess,
      refreshUser,
      setUser,
      showUpgradeModalFor,
      openUpgradeModal,
      closeUpgradeModal
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error("useSubscription must be used within a SubscriptionProvider");
  }
  return context;
};
