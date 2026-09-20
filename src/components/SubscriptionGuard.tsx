import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { Loader2 } from "lucide-react";

interface SubscriptionGuardProps {
  children: React.ReactNode;
  module: string;
}

export const SubscriptionGuard: React.FC<SubscriptionGuardProps> = ({ children, module }) => {
  const { user, loading, hasAccess } = useSubscription();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <Loader2 className="w-10 h-10 animate-spin text-[#006aff]" />
        <p className="text-slate-500 text-sm mt-4 font-medium animate-pulse">Verifying module subscription access...</p>
      </div>
    );
  }

  if (!user) {
    // If not authenticated, redirect to sign-in
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (!hasAccess(module)) {
    // If authenticated but no access, redirect to dashboard
    if (user?.role === "instore") {
      return <Navigate to="/dashboard" replace />;
    }
    return <Navigate to="/dashboard" state={{ triggerUpgradeModal: module }} replace />;
  }

  return <>{children}</>;
};
