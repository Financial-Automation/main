import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import { performance } from "perf_hooks";
import crypto from "crypto";

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

// Safe short TTL in-memory cache with Single-Flight / Request Coalescing
const userCache = new Map();
const subscriptionCache = new Map();
const inFlightUserPromises = new Map();
const inFlightSubscriptionPromises = new Map();
const CACHE_TTL_MS = 5000;

// Metric counters per worker
let subscriptionCacheHits = 0;
let subscriptionCacheMisses = 0;
let subscriptionCoalescedRequests = 0;
let subscriptionDbLookups = 0;

export const resetSubscriptionCacheMetrics = () => {
  subscriptionCacheHits = 0;
  subscriptionCacheMisses = 0;
  subscriptionCoalescedRequests = 0;
  subscriptionDbLookups = 0;
};

export const getSubscriptionCacheMetrics = () => ({
  hits: subscriptionCacheHits,
  misses: subscriptionCacheMisses,
  coalesced: subscriptionCoalescedRequests,
  dbLookups: subscriptionDbLookups
});

export const invalidateUserCache = (userId) => {
  if (!userId) return;
  const idStr = userId.toString();
  userCache.delete(idStr);
  subscriptionCache.delete(idStr);
  inFlightUserPromises.delete(idStr);
  inFlightSubscriptionPromises.delete(idStr);
};

const getCachedUser = async (User, userId) => {
  const idStr = userId.toString();
  const cached = userCache.get(idStr);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.user;
  }

  if (inFlightUserPromises.has(idStr)) {
    return inFlightUserPromises.get(idStr);
  }

  const fetchPromise = (async () => {
    try {
      const user = await User.findById(userId).select("-password").lean();
      if (user) {
        userCache.set(idStr, { user, timestamp: Date.now() });
      }
      return user || null;
    } finally {
      inFlightUserPromises.delete(idStr);
    }
  })();

  inFlightUserPromises.set(idStr, fetchPromise);
  return fetchPromise;
};

const getCachedSubscription = async (Subscription, userId) => {
  const idStr = userId.toString();
  const cached = subscriptionCache.get(idStr);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    subscriptionCacheHits++;
    return cached.subscription;
  }

  subscriptionCacheMisses++;

  // Single-Flight: Coalesce concurrent cache-miss requests onto existing in-flight promise
  if (inFlightSubscriptionPromises.has(idStr)) {
    subscriptionCoalescedRequests++;
    return inFlightSubscriptionPromises.get(idStr);
  }

  subscriptionDbLookups++;
  const fetchPromise = (async () => {
    try {
      const userObjectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null;
      const userFilter = userObjectId ? { $or: [{ userId: userObjectId }, { userId: idStr }] } : { userId: idStr };

      const subscription = await Subscription.findOne({ 
        ...userFilter, 
        status: "active" 
      }).populate("planId").lean();
      
      subscriptionCache.set(idStr, { subscription: subscription || null, timestamp: Date.now() });
      return subscription || null;
    } finally {
      inFlightSubscriptionPromises.delete(idStr);
    }
  })();

  inFlightSubscriptionPromises.set(idStr, fetchPromise);
  return fetchPromise;
};

const getPerfDebugConfig = (req) => {
  if (process.env.PERF_DEBUG !== "true") return null;
  if (!req._corrId) {
    req._corrId = crypto.randomBytes(4).toString("hex");
  }
  if (!req._reqStartTime) {
    req._reqStartTime = performance.now();
  }
  return {
    corrId: req._corrId,
    startTime: performance.now()
  };
};

const logPerf = (perf, name) => {
  if (perf) {
    const duration = (performance.now() - perf.startTime).toFixed(2);
    console.log(`[PERF_DEBUG] [${perf.corrId}] ${name} duration: ${duration} ms`);
  }
};

// 1. Authenticate user from JWT token
export const authenticateUser = async (req, res, next) => {
  req._t_auth_start = performance.now();
  const perf = getPerfDebugConfig(req);

  // Public paths bypass auth
  if (req.path.startsWith("/public/")) {
    logPerf(perf, "authenticateUser");
    return next();
  }

  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    logPerf(perf, "authenticateUser");
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
    const JWT_SECRET = process.env.JWT_SECRET || "fallback_jwt_secret_2024_finance_app";
    const t_jwt_start = performance.now();
    const decoded = jwt.verify(token, JWT_SECRET);
    req._t_jwt_dur = performance.now() - t_jwt_start;

    const User = mongoose.model("User");
    const user = await getCachedUser(User, decoded.id);
    
    if (!user) {
      logPerf(perf, "authenticateUser");
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
          { userId: user._id || user.id, status: "active" },
          { status: "expired" }
        );

        // Mark user as expired (so they have to pay for the new plan)
        const UserMod = mongoose.model("User");
        await UserMod.findByIdAndUpdate(user._id || user.id, {
          subscriptionPlan: newPlanKey,
          subscriptionStatus: "expired",
          $unset: { pendingDowngradePlan: 1 }
        });
        invalidateUserCache(user._id || user.id);
      }
    }

    req.user = { ...user, id: user._id?.toString() || user.id };
    if (decoded.role) {
      req.user.role = decoded.role;
    }
    logPerf(perf, "authenticateUser");
    req._t_auth_done = performance.now();
    next();
  } catch (error) {
    logPerf(perf, "authenticateUser");
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired. Please log in again." });
    }
    return res.status(401).json({ message: "Invalid authorization token." });
  }
};

// 2. Validate user subscription status and date validity
export const checkSubscription = async (req, res, next) => {
  req._t_sub_start = performance.now();
  const perf = getPerfDebugConfig(req);

  // Public paths bypass subscription check
  if (req.path.startsWith("/public/")) {
    logPerf(perf, "checkSubscription");
    req._t_sub_done = performance.now();
    return next();
  }

  if (!req.user) {
    logPerf(perf, "checkSubscription");
    req._t_sub_done = performance.now();
    return res.status(401).json({ message: "User not authenticated." });
  }

  if (req.user.subscriptionStatus === "expired" || (req.user.subscriptionEndDate && new Date() > new Date(req.user.subscriptionEndDate))) {
    logPerf(perf, "checkSubscription");
    req._t_sub_done = performance.now();
    return res.status(403).json({ message: "Subscription has expired. Please upgrade or renew." });
  }

  try {
    // Find active subscription
    const userId = req.user._id || req.user.id;
    let subscription = await getCachedSubscription(Subscription, userId);

    // If no active subscription is found, check if user has a legacy plan key to migrate
    if (!subscription && req.user.subscriptionPlan) {
      console.log(`🔄 Migrating legacy user ${req.user.email} with plan key: ${req.user.subscriptionPlan}`);
      
      const planName = planKeyToName[req.user.subscriptionPlan] || "Express";
      const plan = await Plan.findOne({ name: planName });
      
      if (plan) {
        // Calculate end date based on user trial/subscription end date
        const endDate = req.user.subscriptionEndDate || req.user.trialEndDate;
        
        subscription = new Subscription({
          userId: userId,
          planId: plan._id,
          status: "active",
          startDate: req.user.subscriptionStartDate || new Date(),
          endDate: endDate
        });
        
        await subscription.save();
        
        // Update user status
        const User = mongoose.model("User");
        await User.findByIdAndUpdate(userId, { subscriptionStatus: "active" });
        invalidateUserCache(userId);
        subscription = await getCachedSubscription(Subscription, userId);
      }
    }

    if (!subscription) {
      logPerf(perf, "checkSubscription");
      req._t_sub_done = performance.now();
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

      logPerf(perf, "checkSubscription");
      req._t_sub_done = performance.now();
      return res.status(403).json({ message: "Subscription has expired. Please upgrade or renew." });
    }

    req.subscription = subscription;

    // Admin bypasses module restriction check if subscription is valid
    if (req.user.role === "admin") {
      logPerf(perf, "checkSubscription");
      req._t_sub_done = performance.now();
      return next();
    }

    logPerf(perf, "checkSubscription");
    req._t_sub_done = performance.now();
    next();
  } catch (error) {
    console.error("Subscription check error:", error);
    logPerf(perf, "checkSubscription");
    req._t_sub_done = performance.now();
    return res.status(500).json({ message: "Internal server error during subscription check." });
  }
};

// 3. Factory middleware to check permissions for a specific module
export const checkModuleAccess = (moduleName) => {
  return (req, res, next) => {
    req._t_module_start = performance.now();
    const perf = getPerfDebugConfig(req);

    // Public paths bypass module check
    if (req.path.startsWith("/public/")) {
      logPerf(perf, "checkModuleAccess");
      req._t_module_done = performance.now();
      return next();
    }

    // Dashboard and Admin users always pass module check
    if (moduleName === "dashboard" || req.user?.role === "admin") {
      logPerf(perf, "checkModuleAccess");
      req._t_module_done = performance.now();
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
        logPerf(perf, "checkModuleAccess");
        return res.status(403).json({ message: "In-Store accounts only have access to Invoice and Inventory modules." });
      }
    }

    // Validate subscription plan allowed modules
    if (!req.subscription || !req.subscription.planId) {
      if (req.user?.subscriptionStatus === "active" || req.user?.subscriptionPlan) {
        logPerf(perf, "checkModuleAccess");
        return next();
      }
      logPerf(perf, "checkModuleAccess");
      return res.status(403).json({ message: "Subscription validation failed." });
    }

    const allowedModules = req.subscription.planId.allowedModules || [];
    if (!allowedModules.includes(moduleName)) {
      logPerf(perf, "checkModuleAccess");
      return res.status(403).json({ 
        message: "Module not included in current subscription", 
        requiredModule: moduleName 
      });
    }

    // Centralized Report Export restrictions for export paths
    if (req.originalUrl && req.originalUrl.includes("/export")) {
      if (!allowedModules.includes("export")) {
        logPerf(perf, "checkModuleAccess");
        return res.status(403).json({ 
          message: "Report exporting is not included in your current plan. Please upgrade to Professional or Enterprise.", 
          requiredModule: "export" 
        });
      }
    }

    logPerf(perf, "checkModuleAccess");
    req._t_module_done = performance.now();
    next();
  };
};

// 4. Check user plan limits (Invoices, Purchase Invoices, etc.)
export const checkPlanLimit = async (userId, userRole, resourceType) => {
  try {
    // Phase 10 — Change 2: Reuse the existing getCachedUser() single-flight cache
    // instead of a bare User.findById(). getCachedUser selects all fields except
    // password via .lean(), which is sufficient for role/status/plan checks below.
    const User = mongoose.model("User");
    const user = await getCachedUser(User, userId);
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

    // Phase 10 — Change 3: Reuse the existing getCachedSubscription() single-flight
    // cache. It already calls .populate("planId").lean(), so subscription.planId
    // is the fully populated plan document — identical to what the old inline query
    // returned. The legacy fallback path for users without a Subscription document
    // is preserved unchanged below.
    const Subscription = mongoose.model("Subscription");
    const subscription = await getCachedSubscription(Subscription, userId);

    let activePlan = null;
    if (subscription && subscription.planId) {
      activePlan = subscription.planId;
    } else {
      // Legacy plan mapping fallback: user has a subscriptionPlan key on the User
      // document but no Subscription document record exists yet.
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

      // Phase 10 — Change 1: Run both countDocuments queries in parallel instead
      // of sequentially. Filters are identical to the original:
      //   Sales:    { userId, isDeleted: false }
      //   Purchase: { userId }  (no soft-delete field on PurchaseInvoice)
      // Combined limit enforcement logic is unchanged.
      const [salesCount, purchaseCount] = await Promise.all([
        Invoice.countDocuments({ userId, isDeleted: false }),
        PurchaseInvoice
          ? PurchaseInvoice.countDocuments({ userId })
          : Promise.resolve(0)
      ]);

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
