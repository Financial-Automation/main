import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";

const planKeyToName = {
  trial: "Sandbox",
  basic: "Basic",
  basic_annual: "Basic",
  intermediate: "Intermediate",
  intermediate_annual: "Intermediate",
  premium: "Premium",
  premium_annual: "Premium",
  monthly: "Basic",
  annual: "Intermediate",
  lifetime: "Premium"
};

// 1. Authenticate user from JWT token
export const authenticateUser = async (req, res, next) => {
  // Public paths bypass auth
  if (req.path.startsWith("/public/")) {
    return next();
  }

  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
    const JWT_SECRET = process.env.JWT_SECRET || "fallback_jwt_secret_2024_finance_app";
    const decoded = jwt.verify(token, JWT_SECRET);
    const User = mongoose.model("User");
    const user = await User.findById(decoded.id).select("-password");
    
    if (!user) {
      return res.status(401).json({ message: "User not found or account deleted." });
    }

    // Lazy check: Apply pending downgrade if subscription has expired
    if (user.pendingDowngradePlan && user.subscriptionEndDate && new Date() >= new Date(user.subscriptionEndDate)) {
      const Plan = mongoose.model("Plan");
      const Subscription = mongoose.model("Subscription");
      
      const newPlanKey = user.pendingDowngradePlan;
      const planName = newPlanKey === "annual" ? "Professional" : newPlanKey === "monthly" ? "Express" : newPlanKey === "lifetime" ? "Enterprise" : "Express";
      const planDoc = await Plan.findOne({ name: planName });
      
      if (planDoc) {
        // Set old active subscriptions to expired
        await Subscription.updateMany(
          { userId: user._id, status: "active" },
          { status: "expired" }
        );

        // Mark user as expired (so they have to pay for the new plan)
        user.subscriptionPlan = newPlanKey;
        user.subscriptionStatus = "expired"; 
        user.pendingDowngradePlan = undefined;
        await user.save();
      }
    }

    req.user = user;
    if (decoded.role) {
      req.user.role = decoded.role;
    }
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired. Please log in again." });
    }
    return res.status(401).json({ message: "Invalid authorization token." });
  }
};

// 2. Validate user subscription status and date validity
export const checkSubscription = async (req, res, next) => {
  // Public paths bypass subscription check
  if (req.path.startsWith("/public/")) {
    return next();
  }

  if (!req.user) {
    return res.status(401).json({ message: "User not authenticated." });
  }

  if (req.user.subscriptionStatus === "expired" || (req.user.subscriptionEndDate && new Date() > new Date(req.user.subscriptionEndDate))) {
    return res.status(403).json({ message: "Subscription has expired. Please upgrade or renew." });
  }

  try {
    // Find active subscription
    let subscription = await Subscription.findOne({ 
      userId: req.user._id, 
      status: "active" 
    }).populate("planId");

    // If no active subscription is found, check if user has a legacy plan key to migrate
    if (!subscription && req.user.subscriptionPlan) {
      console.log(`🔄 Migrating legacy user ${req.user.email} with plan key: ${req.user.subscriptionPlan}`);
      
      const planName = planKeyToName[req.user.subscriptionPlan] || "Express";
      const plan = await Plan.findOne({ name: planName });
      
      if (plan) {
        // Calculate end date based on user trial/subscription end date
        const endDate = req.user.subscriptionEndDate || req.user.trialEndDate;
        
        subscription = new Subscription({
          userId: req.user._id,
          planId: plan._id,
          status: "active",
          startDate: req.user.subscriptionStartDate || new Date(),
          endDate: endDate
        });
        
        await subscription.save();
        subscription = await subscription.populate("planId");
        
        // Update user status
        const User = mongoose.model("User");
        await User.findByIdAndUpdate(req.user._id, { subscriptionStatus: "active" });
      }
    }

    if (!subscription) {
      return res.status(403).json({ message: "No active subscription found. Please purchase a plan." });
    }

    // Check if subscription has expired
    if (subscription.endDate && new Date(subscription.endDate).getTime() < Date.now()) {
      // Update subscription to expired
      subscription.status = "expired";
      await subscription.save();

      // Update user status
      const User = mongoose.model("User");
      await User.findByIdAndUpdate(req.user._id, { subscriptionStatus: "pending" }); // Reset status to pending

      return res.status(403).json({ message: "Subscription has expired. Please upgrade or renew." });
    }

    req.subscription = subscription;

    // Admin bypasses module restriction check if subscription is valid
    if (req.user.role === "admin") {
      return next();
    }

    next();
  } catch (error) {
    console.error("Subscription check error:", error);
    return res.status(500).json({ message: "Internal server error during subscription check." });
  }
};

// 3. Factory middleware to check permissions for a specific module
export const checkModuleAccess = (moduleName) => {
  return (req, res, next) => {
    // Public paths bypass module check
    if (req.path.startsWith("/public/")) {
      return next();
    }

    // Dashboard and Admin users always pass module check
    if (moduleName === "dashboard" || req.user?.role === "admin") {
      return next();
    }

    // In-store POS accounts are strictly restricted to invoice and inventory modules for full UI access.
    // However, read-only aggregation/generation endpoints used by the Dashboard (GET requests to /generate, /analytics, /summary, /all, /overview)
    // are allowed so that Store Dashboard displays the exact same company financial metrics as Admin Dashboard.
    if (req.user?.role === "instore") {
      const isReadAggregation = req.method === "GET" && (
        req.path.includes("/generate") ||
        req.path.includes("/analytics") ||
        req.path.includes("/summary") ||
        req.path.includes("/all") ||
        req.path.includes("/overview")
      );
      if (!["invoice", "inventory"].includes(moduleName) && !isReadAggregation) {
        return res.status(403).json({ message: "In-Store accounts only have access to Invoice and Inventory modules." });
      }
    }

    // Validate subscription plan allowed modules
    if (!req.subscription || !req.subscription.planId) {
      if (req.user?.subscriptionStatus === "active" || req.user?.subscriptionPlan) {
        return next();
      }
      return res.status(403).json({ message: "Subscription validation failed." });
    }

     const allowedModules = req.subscription.planId.allowedModules || [];
    if (!allowedModules.includes(moduleName)) {
      return res.status(403).json({ 
        message: "Module not included in current subscription", 
        requiredModule: moduleName 
      });
    }

    // Centralized Report Export restrictions for export paths
    if (req.originalUrl && req.originalUrl.includes("/export")) {
      if (!allowedModules.includes("export")) {
        return res.status(403).json({ 
          message: "Report exporting is not included in your current plan. Please upgrade to Professional or Enterprise.", 
          requiredModule: "export" 
        });
      }
    }

    next();
  };
};

// 4. Check user plan limits (Invoices, Purchase Invoices, etc.)
export const checkPlanLimit = async (userId, userRole, resourceType) => {
  try {
    const User = mongoose.model("User");
    const user = await User.findById(userId);
    if (!user) return { allowed: true };

    // Admin bypasses all limits
    if (userRole === "admin" || user.role === "admin") return { allowed: true };

    // Block expired users
    if (user.subscriptionStatus === "expired" || new Date() > new Date(user.subscriptionEndDate)) {
      return {
        allowed: false,
        code: "SUBSCRIPTION_EXPIRED",
        message: "Your subscription has expired. Please renew to continue."
      };
    }

    let invoiceLimit = 50; // default Sandbox limit
    
    // Fetch active subscription
    const Subscription = mongoose.model("Subscription");
    const subscription = await Subscription.findOne({ 
      userId, 
      status: "active" 
    }).populate("planId");

    let activePlan = null;
    if (subscription && subscription.planId) {
      activePlan = subscription.planId;
    } else {
      // Legacy plan mapping fallback
      const Plan = mongoose.model("Plan");
      const planName = planKeyToName[user.subscriptionPlan || "trial"] || "Sandbox";
      activePlan = await Plan.findOne({ name: planName });
    }

    if (activePlan) {
      invoiceLimit = activePlan.invoiceLimit ?? 50;
    }

    let count = 0;
    if (resourceType === "invoice" || resourceType === "purchase-invoice") {
      const Invoice = mongoose.model("Invoice");
      let PurchaseInvoice = null;
      try {
        PurchaseInvoice = mongoose.model("PurchaseInvoice");
      } catch (err) {
        // Model might not be initialized yet
      }

      // Sales invoices (exclude soft-deleted)
      const salesCount = await Invoice.countDocuments({ userId, isDeleted: false });
      // Purchase invoices (no soft-delete field exists)
      const purchaseCount = PurchaseInvoice ? await PurchaseInvoice.countDocuments({ userId }) : 0;

      count = salesCount + purchaseCount;
    }

    if (count >= invoiceLimit) {
      return {
        allowed: false,
        code: "PLAN_LIMIT_REACHED",
        resource: resourceType,
        limit: invoiceLimit,
        message: `You have reached the limit of ${invoiceLimit.toLocaleString()} total invoices (sales + purchase) on your ${activePlan?.name || "current"} plan. Please upgrade to create more.`
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error("Error checking plan limit:", error);
    return { allowed: true }; // Allow fallback on internal error so we don't break operation
  }
};
