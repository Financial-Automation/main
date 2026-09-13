import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cors from "cors";
import dotenv from "dotenv";
import Razorpay from "razorpay";
import Plan from "./models/Plan.js";
import Subscription from "./models/Subscription.js";
import { authenticateUser, checkSubscription, checkModuleAccess } from "./utils/authMiddleware.js";
import { sendResetEmail } from "./utils/emailService.js";
import crypto from "crypto";

const planKeyToName = {
  trial: "Sandbox",
  monthly: "Express",
  annual: "Professional",
  lifetime: "Enterprise"
};

import payrollRoutes from "./routes/payrollRoutes.js";
import taxRoutes from "./routes/taxRoutes.js";
import balanceSheetRoutes from "./routes/balanceSheetRoutes.js";
import profitLossRoutes from "./routes/profitLossRoutes.js";
import cashflowRoutes from "./routes/cashflowRoutes.js";
import financialRatiosRoutes from "./routes/financialRatiosRoutes.js";
import cashFlowStatementRoutes from "./routes/cashFlowStatementRoutes.js";
import civilRoutes from "./routes/civilRoutes.js";
import bookkeepingRoutes from "./routes/bookkeepingRoutes.js";
import inventoryRoutes from "./routes/inventoryRoutes.js";
import bankReconciliationRoutes from "./routes/bankReconciliationRoutes.js";
import fraudDetectionRoutes from "./routes/fraudDetectionRoutes.js";
import invoiceRoutes from "./routes/invoiceRoutes.js";
import invoiceSummaryRoutes from "./routes/invoiceSummaryRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import purchaseInvoiceRoutes from "./routes/purchaseInvoiceRoutes.js";
import scannedDocRoutes from "./routes/scannedDocRoutes.js";
import civilEngineeringRoutes from "./routes/civilEngineeringRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import invoiceTemplateRoutes from "./routes/invoiceTemplateRoutes.js";
import purchaseInvoiceTemplateRoutes from "./routes/purchaseInvoiceTemplateRoutes.js";
import leadRoutes from "./routes/leadRoutes.js";

dotenv.config();
const app = express();

// ✅ Razorpay Configuration
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.warn("⚠️  Razorpay keys not configured. Payment features will not work.");
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ✅ Middleware
// Increase payload limit for image/PDF uploads (50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// CORS configuration allowing local development and production origins
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowedOrigins = [
      'https://software.saaiss.in',
      'https://www.software.saaiss.in'
    ];
    const isLocalhost = origin.startsWith('http://localhost:') || 
                        origin.startsWith('http://127.0.0.1:') || 
                        origin === 'http://localhost' || 
                        origin === 'http://127.0.0.1';
    if (isLocalhost || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Serve static files from the uploads directory
app.use("/uploads", express.static("uploads"));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Security headers for production
if (process.env.DEV_MODE !== 'true') {
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
}

// ✅ MongoDB Connection - Dynamic based on DEV_MODE with fallback
const isDevelopment = process.env.DEV_MODE === 'true';
let mongoUri = isDevelopment ? process.env.DEV_MONGO_URI : process.env.PRO_MONGO_URI;

console.log(`🔧 Environment: ${isDevelopment ? 'Development' : 'Production'}`);
console.log(`🔧 Primary MongoDB: ${isDevelopment ? 'Local Database' : 'Cloud Database'}`);

// Connect to MongoDB with fallback mechanism (Cloud Atlas -> Local DB -> MongoMemoryServer)
const connectToMongoDB = async () => {
  try {
    await mongoose.connect(process.env.PRO_MONGO_URI, {
      serverSelectionTimeoutMS: 5000
    });
    console.log("✅ MongoDB Connected Successfully");
    console.log("📍 Database: Cloud Atlas");
  } catch (err) {
    console.error("❌ Cloud MongoDB Atlas Connection Failed:", err.message);
    try {
      if (process.env.DEV_MONGO_URI) {
        await mongoose.connect(process.env.DEV_MONGO_URI, { serverSelectionTimeoutMS: 2000 });
        console.log("✅ MongoDB Connected Successfully (Local DB)");
        return;
      }
    } catch (devErr) {
      console.error("❌ Local MongoDB Connection Failed:", devErr.message);
    }

    try {
      console.log("🔄 Initializing In-Memory MongoDB Server...");
      const { MongoMemoryServer } = await import("mongodb-memory-server");
      const mongod = await MongoMemoryServer.create();
      const uri = mongod.getUri();
      await mongoose.connect(uri);
      console.log("✅ MongoDB Connected Successfully (In-Memory Fallback)");
      console.log(`📍 Database URI: ${uri}`);
    } catch (memErr) {
      console.error("❌ Failed to start In-Memory MongoDB:", memErr.message);
      throw err;
    }
  }
};

// Don't call it here - we'll call it before starting the server
// connectToMongoDB();

// ✅ User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  storePassword: { type: String },
  name: { type: String },
  role: { type: String, enum: ["admin", "instore"], default: "admin" },
  subscriptionStatus: { type: String, enum: ["pending", "active", "expired"], default: "pending" },
  subscriptionPlan: { type: String, enum: ["trial", "monthly", "annual", "lifetime"], default: "monthly" },
  subscriptionAmount: { type: Number },
  subscriptionStartDate: { type: Date },
  subscriptionEndDate: { type: Date },
  pendingDowngradePlan: { type: String, enum: ["trial", "monthly", "annual", "lifetime"] },
  trialEndDate: { type: Date },
  razorpayPaymentId: { type: String },
  razorpayOrderId: { type: String },
  createdAt: { type: Date, default: Date.now },
  sellerName: { type: String },
  sellerPhone: { type: String },
  sellerEmail: { type: String },
  sellerGSTIN: { type: String },
  sellerState: { type: String },
  sellerAddress: { type: String },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
});

const User = mongoose.model("User", userSchema);

// ✅ REGISTER (Sign Up)
app.post("/api/signup", async (req, res) => {
  try {
    const { email, password, storePassword, role = "admin" } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required" });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "User already exists" });

    const allowedRoles = ["admin", "instore"];
    const userRole = allowedRoles.includes(req.body.role) ? req.body.role : "admin";
    const hashedPassword = await bcrypt.hash(password, 10);
    const hashedStorePassword = storePassword ? await bcrypt.hash(storePassword, 10) : undefined;
    const newUser = new User({ email, password: hashedPassword, storePassword: hashedStorePassword, role: userRole });
    await newUser.save();

    const token = jwt.sign({ id: newUser._id, role: userRole }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({ message: "User registered successfully", token, user: { role: newUser.role } });
  } catch (error) {
    if (error.code === 11000)
      return res.status(400).json({ message: "Email already exists" });

    console.error("Signup Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ✅ START FREE TRIAL
app.post("/api/signup-trial", async (req, res) => {
  try {
    const { email, password, storePassword, name, role = "admin" } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const subscriptionStartDate = new Date();
    const trialEndDate = new Date(subscriptionStartDate);
    trialEndDate.setDate(trialEndDate.getDate() + 14);

    const allowedRoles = ["admin", "instore"];
    const userRole = allowedRoles.includes(role) ? role : "admin";
    const hashedPassword = await bcrypt.hash(password, 10);
    const hashedStorePassword = storePassword ? await bcrypt.hash(storePassword, 10) : undefined;
    const newUser = new User({
      email,
      name: name || email.split("@")[0],
      password: hashedPassword,
      storePassword: hashedStorePassword,
      subscriptionStatus: "active",
      subscriptionPlan: "trial",
      subscriptionAmount: 0,
      subscriptionStartDate,
      subscriptionEndDate: trialEndDate,
      trialEndDate,
      role: userRole
    });

    await newUser.save();

    // Create Subscription record in database
    const sandboxPlan = await Plan.findOne({ name: "Sandbox" });
    if (sandboxPlan) {
      const subscription = new Subscription({
        userId: newUser._id,
        planId: sandboxPlan._id,
        status: "active",
        startDate: subscriptionStartDate,
        endDate: trialEndDate
      });
      await subscription.save();
    }

    const token = jwt.sign({ id: newUser._id, role: userRole }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({
      message: "Free trial started successfully",
      token,
      user: {
        id: newUser._id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        subscriptionStatus: newUser.subscriptionStatus,
        subscriptionPlan: newUser.subscriptionPlan,
        subscriptionAmount: newUser.subscriptionAmount,
        subscriptionStartDate: newUser.subscriptionStartDate,
        subscriptionEndDate: newUser.subscriptionEndDate,
        trialEndDate: newUser.trialEndDate,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Email already exists" });
    }

    console.error("Trial Signup Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ✅ LOGIN (Sign In)
app.post("/api/signin", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    let validPass = false;
    let authenticatedRole = "admin";

    // 1. First check if password matches Admin Password
    const isAdminPass = await bcrypt.compare(password, user.password);
    if (isAdminPass) {
      validPass = true;
      authenticatedRole = "admin";
    } else if (user.storePassword) {
      // 2. Next check if password matches Store Password
      const isStorePass = await bcrypt.compare(password, user.storePassword);
      if (isStorePass) {
        validPass = true;
        authenticatedRole = "instore";
      }
    }

    if (!validPass) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign({ id: user._id, role: authenticatedRole }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: authenticatedRole,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionPlan: user.subscriptionPlan,
        subscriptionAmount: user.subscriptionAmount,
        subscriptionStartDate: user.subscriptionStartDate,
        subscriptionEndDate: user.subscriptionEndDate,
        trialEndDate: user.trialEndDate,
      },
    });
  } catch (error) {
    console.error("Signin Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ✅ FORGOT PASSWORD
app.post("/api/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required." });
    }

    const user = await User.findOne({ email });

    // Enforce generic response for security to avoid account enumeration
    const genericResponse = {
      success: true,
      message: "If an account exists for this email, a password reset link has been sent."
    };

    if (!user) {
      return res.json(genericResponse);
    }

    // Generate cryptographically secure token
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Hash the token for storage
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

    // Save token and expiry (30 minutes)
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 30 * 60 * 1000;
    await user.save();

    // Use APP_URL from env or fallback to client localhost port
    const appUrl = process.env.APP_URL || "http://localhost:5173";
    const resetUrl = `${appUrl}/reset-password?token=${resetToken}`;

    // Send email
    await sendResetEmail(user.email, resetUrl);

    res.json(genericResponse);
  } catch (error) {
    console.error("Forgot Password Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

// ✅ RESET PASSWORD
app.post("/api/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ success: false, message: "Token and password are required." });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters long." });
    }

    // Hash the incoming raw token to match the database hash
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Find user with matching token and valid expiry
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid or expired password reset token." });
    }

    // Hash new password using bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password and clear token fields
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ success: true, message: "Password reset successful. You can now log in with your new password." });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

// ✅ Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ message: "Invalid token" });
  }
};

// ✅ GET USER INFO (Protected Route)
app.get("/api/user", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      email: user.email,
      name: user.name,
      id: user._id,
      role: req.user?.role || user.role || "admin",
      subscriptionStatus: user.subscriptionStatus,
      subscriptionPlan: user.subscriptionPlan,
      subscriptionAmount: user.subscriptionAmount,
      subscriptionStartDate: user.subscriptionStartDate,
      subscriptionEndDate: user.subscriptionEndDate,
      trialEndDate: user.trialEndDate,
      sellerName: user.sellerName || "",
      sellerPhone: user.sellerPhone || "",
      sellerEmail: user.sellerEmail || "",
      sellerGSTIN: user.sellerGSTIN || "",
      sellerState: user.sellerState || "",
      sellerAddress: user.sellerAddress || "",
    });
  } catch (error) {
    console.error("Get User Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ✅ UPDATE USER PROFILE (Protected Route)
app.put("/api/user", verifyToken, async (req, res) => {
  try {
    const { name, email, sellerName, sellerPhone, sellerEmail, sellerGSTIN, sellerState, sellerAddress } = req.body;
    const trimmedEmail = email?.trim().toLowerCase();

    if (!trimmedEmail) {
      return res.status(400).json({ message: "Email is required" });
    }

    const duplicateUser = await User.findOne({
      email: trimmedEmail,
      _id: { $ne: req.user.id },
    });

    if (duplicateUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        name: name?.trim() || trimmedEmail.split("@")[0],
        email: trimmedEmail,
        sellerName,
        sellerPhone,
        sellerEmail,
        sellerGSTIN,
        sellerState,
        sellerAddress,
      },
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionPlan: user.subscriptionPlan,
        subscriptionAmount: user.subscriptionAmount,
        subscriptionStartDate: user.subscriptionStartDate,
        subscriptionEndDate: user.subscriptionEndDate,
        trialEndDate: user.trialEndDate,
        sellerName: user.sellerName || "",
        sellerPhone: user.sellerPhone || "",
        sellerEmail: user.sellerEmail || "",
        sellerGSTIN: user.sellerGSTIN || "",
        sellerState: user.sellerState || "",
        sellerAddress: user.sellerAddress || "",
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Email already exists" });
    }

    console.error("Update User Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ✅ Subscription Plans Configuration (matching frontend)
const subscriptionPlans = {
  trial: {
    id: "trial",
    name: "Sandbox Trial",
    price: 0,
    gst: 0,
    totalAmount: 0,
    duration: "14 days"
  },
  basic: {
    id: "basic",
    name: "Basic Plan",
    price: 950,
    gst: 171,
    totalAmount: 1121,
    duration: "month"
  },
  basic_annual: {
    id: "basic_annual",
    name: "Basic Plan (Annual)",
    price: 9120,
    gst: 1642,
    totalAmount: 10762,
    duration: "year"
  },
  intermediate: {
    id: "intermediate",
    name: "Intermediate Plan",
    price: 1950,
    gst: 351,
    totalAmount: 2301,
    duration: "month"
  },
  intermediate_annual: {
    id: "intermediate_annual",
    name: "Intermediate Plan (Annual)",
    price: 18720,
    gst: 3370,
    totalAmount: 22090,
    duration: "year"
  },
  premium: {
    id: "premium",
    name: "Premium Plan",
    price: 4950,
    gst: 891,
    totalAmount: 5841,
    duration: "month"
  },
  premium_annual: {
    id: "premium_annual",
    name: "Premium Plan (Annual)",
    price: 47520,
    gst: 8554,
    totalAmount: 56074,
    duration: "year"
  },
  // Legacy alias mapping for backward compatibility
  monthly: {
    id: "monthly",
    name: "Basic Plan",
    price: 950,
    gst: 171,
    totalAmount: 1121,
    duration: "month"
  },
  annual: {
    id: "annual",
    name: "Intermediate Plan",
    price: 1950,
    gst: 351,
    totalAmount: 2301,
    duration: "month"
  },
  lifetime: {
    id: "lifetime",
    name: "Premium Plan",
    price: 4950,
    gst: 891,
    totalAmount: 5841,
    duration: "month"
  }
};

// ✅ CREATE RAZORPAY ORDER
app.post("/api/create-order", async (req, res) => {
  try {
    const { email, plan = "monthly" } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Validate plan
    if (!subscriptionPlans[plan]) {
      return res.status(400).json({ message: "Invalid subscription plan" });
    }

    const selectedPlan = subscriptionPlans[plan];

    if (process.env.DEV_MODE === "true") {
      return res.json({
        orderId: `dev_order_${Date.now()}`,
        amount: selectedPlan.totalAmount * 100, // Convert to paise for consistency
        currency: "INR",
        key: "rzp_test_dev_mode",
        devMode: true,
        plan: plan,
        planDetails: selectedPlan
      });
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET ||
      process.env.RAZORPAY_KEY_ID === "rzp_test_1234567890") {
      return res.status(500).json({
        message: "Payment system not configured. Please contact administrator."
      });
    }

    // Allow existing user if they are logged in and upgrading (checking authorization header)
    const token = req.headers.authorization?.split(" ")[1];
    let isUpgrade = false;
    if (token) {
      try {
        jwt.verify(token, process.env.JWT_SECRET);
        isUpgrade = true;
      } catch (err) {
        // Ignore token error and proceed with standard check
      }
    }

    if (!isUpgrade) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }
    }

    // Razorpay expects amount in paise (smallest currency unit)
    const amountInPaise = selectedPlan.totalAmount * 100;

    console.log(`💰 Creating Razorpay order for ${plan} plan:`);
    console.log(`   Base Price: ₹${selectedPlan.price}`);
    console.log(`   GST: ₹${selectedPlan.gst}`);
    console.log(`   Total: ₹${selectedPlan.totalAmount}`);
    console.log(`   Amount in Paise: ${amountInPaise}`);

    const options = {
      amount: amountInPaise,
      currency: "INR",
      receipt: `receipt_${plan}_${Date.now()}`,
      notes: {
        email: email,
        purpose: "subscription",
        plan: plan,
        planName: selectedPlan.name,
        basePrice: selectedPlan.price,
        gst: selectedPlan.gst,
        totalAmount: selectedPlan.totalAmount
      }
    };

    const order = await razorpay.orders.create(options);

    console.log(`✅ Razorpay order created: ${order.id} for ₹${order.amount / 100}`);

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
      plan: plan,
      planDetails: selectedPlan
    });
  } catch (error) {
    console.error("Create Order Error:", error);

    if (error.statusCode === 401) {
      res.status(500).json({
        message: "Payment system authentication failed. Please contact administrator."
      });
    } else {
      res.status(500).json({
        message: "Failed to create payment order. Please try again."
      });
    }
  }
});

// ✅ VERIFY PAYMENT AND COMPLETE SIGNUP
app.post("/api/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      email,
      password,
      storePassword,
      plan = "monthly",
      name,
      role = "admin"
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Validate plan
    if (!subscriptionPlans[plan]) {
      return res.status(400).json({ message: "Invalid subscription plan" });
    }

    const selectedPlan = subscriptionPlans[plan];

    // Calculate subscription dates
    const subscriptionStartDate = new Date();
    let subscriptionEndDate = null;

    if (plan === "monthly") {
      subscriptionEndDate = new Date(subscriptionStartDate);
      subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1);
    } else if (plan === "annual") {
      subscriptionEndDate = new Date(subscriptionStartDate);
      subscriptionEndDate.setFullYear(subscriptionEndDate.getFullYear() + 1);
    }

    // Dev Mode Check
    const isDevOrder = process.env.DEV_MODE === "true" || razorpay_order_id?.startsWith("dev_order_");
    const paymentIdToCheck = razorpay_payment_id || (isDevOrder ? `dev_payment_${Date.now()}` : undefined);
    const orderIdToCheck = razorpay_order_id || `dev_order_${Date.now()}`;

    // Duplicate/Replay check
    if (paymentIdToCheck) {
      const duplicateCheck = await Subscription.findOne({ razorpayPaymentId: paymentIdToCheck });
      if (duplicateCheck) {
        return res.status(400).json({ message: "This payment has already been processed." });
      }
    }
    if (orderIdToCheck) {
      const duplicateOrder = await Subscription.findOne({ razorpayOrderId: orderIdToCheck });
      if (duplicateOrder) {
        return res.status(400).json({ message: "This order has already been processed." });
      }
    }

    // Check payment signature & amount mismatch
    if (!isDevOrder) {
      if (!razorpay_payment_id || !razorpay_order_id) {
        return res.status(400).json({ message: "Payment details are required" });
      }

      const crypto = await import('crypto');
      const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (expectedSignature !== razorpay_signature) {
        return res.status(400).json({ message: "Invalid payment signature" });
      }

      try {
        const razorpayOrder = await razorpay.orders.fetch(razorpay_order_id);
        const expectedAmountInPaise = selectedPlan.totalAmount * 100;
        if (razorpayOrder.amount !== expectedAmountInPaise) {
          return res.status(400).json({ message: "Payment amount mismatch. Verification failed." });
        }
      } catch (err) {
        console.error("Razorpay order fetch failed:", err);
        return res.status(400).json({ message: "Failed to verify order details with payment gateway." });
      }
    }

    const existingUser = await User.findOne({ email });
    let userToUse;

    if (existingUser) {
      // Authenticate password
      const isPasswordCorrect = await bcrypt.compare(password, existingUser.password);
      if (!isPasswordCorrect) {
        return res.status(400).json({ message: "An account with this email already exists. Please check your password to renew or upgrade your plan." });
      }

      // Update existing user properties
      existingUser.subscriptionStatus = "active";
      existingUser.subscriptionPlan = plan;
      existingUser.subscriptionAmount = selectedPlan.totalAmount;
      existingUser.subscriptionStartDate = subscriptionStartDate;
      existingUser.subscriptionEndDate = subscriptionEndDate;
      existingUser.razorpayPaymentId = paymentIdToCheck;
      existingUser.razorpayOrderId = orderIdToCheck;
      existingUser.pendingDowngradePlan = undefined;
      if (storePassword) {
        existingUser.storePassword = await bcrypt.hash(storePassword, 10);
      }
      
      await existingUser.save();
      userToUse = existingUser;

      // Mark older active subscriptions as expired
      await Subscription.updateMany(
        { userId: existingUser._id, status: "active" },
        { status: "expired" }
      );
    } else {
      // Create new user
      const allowedRoles = ["admin", "instore"];
      const userRole = allowedRoles.includes(role) ? role : "admin";
      const hashedPassword = await bcrypt.hash(password, 10);
      const hashedStorePassword = storePassword ? await bcrypt.hash(storePassword, 10) : undefined;
      const newUser = new User({
        email,
        name: name || email.split('@')[0],
        password: hashedPassword,
        storePassword: hashedStorePassword,
        subscriptionStatus: "active",
        subscriptionPlan: plan,
        subscriptionAmount: selectedPlan.totalAmount,
        subscriptionStartDate: subscriptionStartDate,
        subscriptionEndDate: subscriptionEndDate,
        razorpayPaymentId: paymentIdToCheck,
        razorpayOrderId: orderIdToCheck,
        role: userRole
      });

      await newUser.save();
      userToUse = newUser;
    }

    // Save Subscription document in database
    const planName = planKeyToName[plan] || "Express";
    const planDoc = await Plan.findOne({ name: planName });
    if (planDoc) {
      const subscription = new Subscription({
        userId: userToUse._id,
        planId: planDoc._id,
        status: "active",
        startDate: subscriptionStartDate,
        endDate: subscriptionEndDate,
        razorpayPaymentId: paymentIdToCheck,
        razorpayOrderId: orderIdToCheck
      });
      await subscription.save();
    }

    const token = jwt.sign({ id: userToUse._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({
      message: existingUser ? "Subscription upgraded/renewed successfully" : "Payment verified and user registered successfully",
      token,
      subscriptionStatus: "active",
      subscriptionPlan: plan,
      subscriptionEndDate: subscriptionEndDate,
      role: userToUse.role
    });
  } catch (error) {
    console.error("Verify Payment Error:", error);
    res.status(500).json({ message: "Payment verification failed" });
  }
});

// ✅ UPGRADE SUBSCRIPTION FOR LOGGED-IN USERS
app.post("/api/upgrade-subscription", authenticateUser, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      plan = "monthly"
    } = req.body;

    // Validate plan
    if (!subscriptionPlans[plan]) {
      return res.status(400).json({ message: "Invalid subscription plan" });
    }

    const selectedPlan = subscriptionPlans[plan];

    // Calculate subscription dates
    const subscriptionStartDate = new Date();
    let subscriptionEndDate = null;

    if (plan === "monthly") {
      subscriptionEndDate = new Date(subscriptionStartDate);
      subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1);
    } else if (plan === "annual") {
      subscriptionEndDate = new Date(subscriptionStartDate);
      subscriptionEndDate.setFullYear(subscriptionEndDate.getFullYear() + 1);
    }

    // Dev Mode Check
    // Dev Mode Check
    const isDevOrder = process.env.DEV_MODE === "true" || razorpay_order_id?.startsWith("dev_order_");
    const paymentIdToCheck = razorpay_payment_id || (isDevOrder ? `dev_payment_${Date.now()}` : undefined);
    const orderIdToCheck = razorpay_order_id || `dev_order_${Date.now()}`;
    // Duplicate/Replay check
    if (paymentIdToCheck) {
      const duplicateCheck = await Subscription.findOne({ razorpayPaymentId: paymentIdToCheck });
      if (duplicateCheck) {
        return res.status(400).json({ message: "This payment has already been processed." });
      }
    }
    if (orderIdToCheck) {
      const duplicateOrder = await Subscription.findOne({ razorpayOrderId: orderIdToCheck });
      if (duplicateOrder) {
        return res.status(400).json({ message: "This order has already been processed." });
      }
    }

    // Verify payment & amount mismatch
    if (!isDevOrder) {
      if (!razorpay_payment_id || !razorpay_order_id) {
        return res.status(400).json({ message: "Payment details are required" });
      }

      const crypto = await import('crypto');
      const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (expectedSignature !== razorpay_signature) {
        return res.status(400).json({ message: "Invalid payment signature" });
      }

      try {
        const razorpayOrder = await razorpay.orders.fetch(razorpay_order_id);
        const expectedAmountInPaise = selectedPlan.totalAmount * 100;
        if (razorpayOrder.amount !== expectedAmountInPaise) {
          return res.status(400).json({ message: "Payment amount mismatch. Verification failed." });
        }
      } catch (err) {
        console.error("Razorpay order fetch failed:", err);
        return res.status(400).json({ message: "Failed to verify order details with payment gateway." });
      }
    }

    // Find database Plan
    const planName = planKeyToName[plan] || "Express";
    const planDoc = await Plan.findOne({ name: planName });
    if (!planDoc) {
      return res.status(500).json({ message: "Subscription plan not found in database configuration." });
    }

    // Update user subscription plan details
    const User = mongoose.model("User");
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          subscriptionStatus: "active",
          subscriptionPlan: plan,
          subscriptionAmount: selectedPlan.totalAmount,
          subscriptionStartDate: subscriptionStartDate,
          subscriptionEndDate: subscriptionEndDate,
          razorpayPaymentId: paymentIdToCheck,
          razorpayOrderId: orderIdToCheck
        },
        $unset: { pendingDowngradePlan: 1 }
      },
      { new: true }
    ).select("-password");

    // Set any currently active subscriptions to expired
    await Subscription.updateMany(
      { userId: req.user._id, status: "active" },
      { status: "expired" }
    );

    // Create new active subscription
    const newSubscription = new Subscription({
      userId: req.user._id,
      planId: planDoc._id,
      status: "active",
      startDate: subscriptionStartDate,
      endDate: subscriptionEndDate,
      razorpayPaymentId: paymentIdToCheck,
      razorpayOrderId: orderIdToCheck
    });
    await newSubscription.save();

    res.json({
      message: "Subscription upgraded successfully",
      user: {
        id: updatedUser._id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        subscriptionStatus: updatedUser.subscriptionStatus,
        subscriptionPlan: updatedUser.subscriptionPlan,
        subscriptionAmount: updatedUser.subscriptionAmount,
        subscriptionStartDate: updatedUser.subscriptionStartDate,
        subscriptionEndDate: updatedUser.subscriptionEndDate,
        trialEndDate: updatedUser.trialEndDate
      }
    });

  } catch (error) {
    console.error("Upgrade Subscription Error:", error);
    res.status(500).json({ message: "Subscription upgrade failed" });
  }
});

// ✅ SCHEDULE DOWNGRADE SUBSCRIPTION
app.post("/api/downgrade-subscription", authenticateUser, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!subscriptionPlans[plan]) {
      return res.status(400).json({ message: "Invalid subscription plan" });
    }

    const User = mongoose.model("User");
    const user = await User.findById(req.user._id);

    // Validate that the requested plan is actually lower
    const planOrder = { trial: 0, monthly: 1, annual: 2, lifetime: 3 };
    const currentRank = planOrder[user.subscriptionPlan] || 0;
    const targetRank = planOrder[plan] || 0;
    
    if (targetRank >= currentRank) {
      return res.status(400).json({ message: "Downgrade requested to a higher or equal plan." });
    }

    // Find database Plan
    const planName = planKeyToName[plan] || "Express";
    const planDoc = await Plan.findOne({ name: planName });
    if (!planDoc) {
      return res.status(500).json({ message: "Subscription plan not found in database configuration." });
    }

    // Update user pending downgrade flag
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { pendingDowngradePlan: plan } },
      { new: true }
    ).select("-password");

    // Update active subscription with pending downgrade Plan ID
    await Subscription.updateMany(
      { userId: req.user._id, status: "active" },
      { pendingDowngradePlanId: planDoc._id }
    );

    res.json({
      message: "Downgrade scheduled successfully.",
      user: updatedUser
    });
  } catch (error) {
    console.error("Downgrade Subscription Error:", error);
    res.status(500).json({ message: "Scheduling downgrade failed." });
  }
});

// ✅ CANCEL SCHEDULED DOWNGRADE
app.post("/api/cancel-downgrade", authenticateUser, async (req, res) => {
  try {
    const User = mongoose.model("User");
    
    // Clear user pending downgrade flag
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $unset: { pendingDowngradePlan: 1 } },
      { new: true }
    ).select("-password");

    // Clear active subscription pending downgrade Plan ID
    await Subscription.updateMany(
      { userId: req.user._id, status: "active" },
      { $unset: { pendingDowngradePlanId: 1 } }
    );

    res.json({
      message: "Downgrade cancelled successfully.",
      user: updatedUser
    });
  } catch (error) {
    console.error("Cancel Downgrade Error:", error);
    res.status(500).json({ message: "Failed to cancel downgrade." });
  }
});

// ✅ Use Routes
// ✅ RAZORPAY WEBHOOK HANDLER
app.post("/api/webhooks/razorpay", async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "razorpay_webhook_secret_default_123";
  const signature = req.headers["x-razorpay-signature"];

  if (!signature) {
    return res.status(400).json({ message: "Missing Razorpay webhook signature." });
  }

  try {
    const crypto = await import('crypto');
    const expectedSignature = crypto.createHmac('sha256', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    // For testing/fallback in local env where stringifying req.body might differ slightly, we check both signature validation and dev mode
    if (expectedSignature !== signature && process.env.DEV_MODE !== "true") {
      return res.status(400).json({ message: "Invalid webhook signature." });
    }

    const { event, payload } = req.body;
    console.log(`📡 Received Razorpay Webhook Event: ${event}`);

    // We handle order.paid and payment.captured
    if (event === "order.paid" || event === "payment.captured") {
      const paymentEntity = payload.payment?.entity || {};
      const orderEntity = payload.order?.entity || {};
      
      const email = paymentEntity.email || paymentEntity.notes?.email || orderEntity.notes?.email;
      const plan = paymentEntity.notes?.plan || orderEntity.notes?.plan || "monthly";
      const paymentId = paymentEntity.id;
      const orderId = paymentEntity.order_id || orderEntity.id;

      if (!email) {
        console.log("⚠️ Webhook event lacks email information. Skipping.");
        return res.json({ status: "skipped", reason: "no_email" });
      }

      // Check payment replay
      if (paymentId) {
        const duplicateCheck = await Subscription.findOne({ razorpayPaymentId: paymentId });
        if (duplicateCheck) {
          console.log(`ℹ️ Webhook duplicate check triggered: payment ${paymentId} already processed.`);
          return res.json({ status: "ignored_duplicate" });
        }
      }

      const selectedPlan = subscriptionPlans[plan];
      if (!selectedPlan) {
        console.log(`⚠️ Invalid plan key: ${plan}. Skipping.`);
        return res.json({ status: "skipped", reason: "invalid_plan" });
      }

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        const subscriptionStartDate = new Date();
        let subscriptionEndDate = null;

        if (plan === "monthly") {
          subscriptionEndDate = new Date(subscriptionStartDate);
          subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1);
        } else if (plan === "annual") {
          subscriptionEndDate = new Date(subscriptionStartDate);
          subscriptionEndDate.setFullYear(subscriptionEndDate.getFullYear() + 1);
        }

        // Update existing user properties
        existingUser.subscriptionStatus = "active";
        existingUser.subscriptionPlan = plan;
        existingUser.subscriptionAmount = selectedPlan.totalAmount;
        existingUser.subscriptionStartDate = subscriptionStartDate;
        existingUser.subscriptionEndDate = subscriptionEndDate;
        if (paymentId) existingUser.razorpayPaymentId = paymentId;
        if (orderId) existingUser.razorpayOrderId = orderId;
        
        await existingUser.save();

        // Mark older active subscriptions as expired
        await Subscription.updateMany(
          { userId: existingUser._id, status: "active" },
          { status: "expired" }
        );

        // Save Subscription document in database
        const planName = planKeyToName[plan] || "Express";
        const planDoc = await Plan.findOne({ name: planName });
        if (planDoc) {
          const subscription = new Subscription({
            userId: existingUser._id,
            planId: planDoc._id,
            status: "active",
            startDate: subscriptionStartDate,
            endDate: subscriptionEndDate,
            razorpayPaymentId: paymentId,
            razorpayOrderId: orderId
          });
          await subscription.save();
        }
        console.log(`🟢 Successfully processed webhook subscription update for ${email}`);
      } else {
        console.log(`⚠️ User not found for email: ${email}. Webhook cannot auto-create account without password credentials.`);
      }
    }

    res.json({ status: "ok" });
  } catch (error) {
    console.error("Webhook processing failed:", error);
    res.status(500).json({ message: "Webhook execution failed" });
  }
});

app.use("/api/payroll", authenticateUser, checkSubscription, checkModuleAccess("payroll"), payrollRoutes);
app.use("/api/tax", authenticateUser, checkSubscription, checkModuleAccess("tax-gst"), taxRoutes);
app.use("/api/balance", authenticateUser, checkSubscription, checkModuleAccess("balance-sheet"), balanceSheetRoutes);
app.use("/api/profitloss", authenticateUser, checkSubscription, checkModuleAccess("profit-loss"), profitLossRoutes);
app.use("/api/cashflow", authenticateUser, checkSubscription, checkModuleAccess("cashflow"), cashflowRoutes);
app.use("/api/financial-ratios", authenticateUser, checkSubscription, checkModuleAccess("financial-ratios"), financialRatiosRoutes);
app.use("/api/cashflow-statement", authenticateUser, checkSubscription, checkModuleAccess("cashflow-statement"), cashFlowStatementRoutes);
app.use("/api/civil", authenticateUser, checkSubscription, checkModuleAccess("civil-engineering"), civilRoutes);
app.use("/api/bookkeeping", authenticateUser, checkSubscription, checkModuleAccess("bookkeeping"), bookkeepingRoutes);
app.use("/api/inventory", authenticateUser, checkSubscription, checkModuleAccess("inventory"), inventoryRoutes);
app.use("/api/bank-reconciliation", authenticateUser, checkSubscription, checkModuleAccess("bank-reconciliation"), bankReconciliationRoutes);
app.use("/api/fraud-detection", authenticateUser, checkSubscription, checkModuleAccess("fraud-detection"), fraudDetectionRoutes);
app.use("/api/invoice", authenticateUser, checkSubscription, checkModuleAccess("invoice"), invoiceRoutes);
app.use("/api/invoice-summary", authenticateUser, checkSubscription, checkModuleAccess("invoice"), invoiceSummaryRoutes);
app.use("/api/ai", authenticateUser, checkSubscription, aiRoutes);
app.use("/api/purchase-invoice", authenticateUser, checkSubscription, checkModuleAccess("invoice"), purchaseInvoiceRoutes);
app.use("/api/scanned-docs", authenticateUser, checkSubscription, checkModuleAccess("invoice"), scannedDocRoutes);
app.use("/api/civil-engineering", authenticateUser, checkSubscription, checkModuleAccess("civil-engineering"), civilEngineeringRoutes);
app.use("/api/customers", authenticateUser, checkSubscription, checkModuleAccess("invoice"), customerRoutes);
app.use("/api/invoice-templates", authenticateUser, checkSubscription, checkModuleAccess("invoice"), invoiceTemplateRoutes);
app.use("/api/purchase-templates", authenticateUser, checkSubscription, checkModuleAccess("invoice"), purchaseInvoiceTemplateRoutes);
app.use("/api/leads", leadRoutes);

const seedPlans = async () => {
  const plans = [
    { 
      name: "Sandbox", 
      allowedModules: ["dashboard", "invoice", "inventory", "bookkeeping", "tax-gst", "balance-sheet", "profit-loss", "cashflow", "cashflow-statement", "financial-ratios", "export"],
      invoiceLimit: 50,
      transactionLimit: 100,
      seatLimit: 1,
      aiLimit: 10,
      ocrLimit: 10,
      exportPermissions: true
    },
    { 
      name: "Express", 
      allowedModules: ["dashboard", "invoice", "inventory", "export"],
      invoiceLimit: 5000,
      transactionLimit: 10000,
      seatLimit: 1,
      aiLimit: 100,
      ocrLimit: 100,
      exportPermissions: true
    },
    { 
      name: "Professional", 
      allowedModules: ["dashboard", "invoice", "inventory", "bookkeeping", "tax-gst", "balance-sheet", "profit-loss", "cashflow", "cashflow-statement", "financial-ratios", "export"],
      invoiceLimit: 25000,
      transactionLimit: 50000,
      seatLimit: 5,
      aiLimit: 1000,
      ocrLimit: 1000,
      exportPermissions: true
    },
    { 
      name: "Enterprise", 
      allowedModules: ["dashboard", "invoice", "inventory", "bookkeeping", "tax-gst", "balance-sheet", "profit-loss", "cashflow", "cashflow-statement", "financial-ratios", "payroll", "bank-reconciliation", "fraud-detection", "civil-engineering", "export"],
      invoiceLimit: 100000,
      transactionLimit: 1000000,
      seatLimit: 999999,
      aiLimit: 999999,
      ocrLimit: 999999,
      exportPermissions: true
    }
  ];

  try {
    for (const p of plans) {
      await Plan.findOneAndUpdate(
        { name: p.name },
        { 
          allowedModules: p.allowedModules,
          invoiceLimit: p.invoiceLimit,
          transactionLimit: p.transactionLimit,
          seatLimit: p.seatLimit,
          aiLimit: p.aiLimit,
          ocrLimit: p.ocrLimit,
          exportPermissions: p.exportPermissions
        },
        { upsert: true, new: true }
      );
    }
    console.log("✅ Subscription Plans Seeded Successfully");
  } catch (err) {
    console.error("❌ Failed to seed subscription plans:", err.message);
  }
};

// ✅ Start Server (after MongoDB connection)
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';

const startServer = async () => {
  try {
    // Connect to MongoDB first
    await connectToMongoDB();

    // Seed subscription plans
    await seedPlans();

    // Then start the server
    app.listen(PORT, HOST, () => {
      console.log(`🚀 Server running on http://${HOST}:${PORT}`);
      console.log(`🌐 Local access: http://localhost:${PORT}`);
      console.log(`📡 Network access: http://192.168.29.49:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();
