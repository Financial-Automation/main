import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import InvoiceTemplate from "../models/InvoiceTemplate.js";
import InvoiceTemplateVersion from "../models/InvoiceTemplateVersion.js";

const router = express.Router();

// Middleware to verify JWT token and extract user details
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Access denied. No token provided." } });
  }

  try {
    const JWT_SECRET = process.env.JWT_SECRET || "fallback_jwt_secret_2024_finance_app";
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ success: false, error: { code: "INVALID_TOKEN", message: "Invalid token" } });
  }
};

const defaultTemplates = [
      {
        name: "Modern Indigo",
        description: "Sleek modern layout with indigo header banner and clean typography.",
        status: "active",
        isDefault: true,
        config: {
          layout: "modern-indigo",
          header: { showLogo: true, logoPosition: "left", logoSize: "medium", logoUrl: "", showCompanyName: true, showAddress: true, showPhone: true, showEmail: true },
          seller: { showName: true, showPhone: true, showEmail: true, showGSTIN: true, showAddress: true },
          customer: { showName: true, showGSTIN: true, showPhone: true, showEmail: true, showBillingAddress: true, showShippingAddress: true, showPlaceOfSupply: true },
          invoiceInfo: {
            showInvoiceNumber: true, showInvoiceDate: true, showDueDate: true, showPaymentTerms: true, showOrderNumber: true, showSalesperson: true,
            labels: { invoiceNumber: "Invoice No.", invoiceDate: "Invoice Date", dueDate: "Due Date", paymentTerms: "Payment Terms", orderNumber: "Order No.", salespersonName: "Salesperson" }
          },
          items: {
            columns: ["item", "hsn", "quantity", "rate", "tax", "amount"],
            labels: { item: "Item", description: "Description", sku: "SKU", hsn: "HSN/SAC", quantity: "Qty", rate: "Rate", tax: "Tax", amount: "Amount" }
          },
          tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTaxableAmount: true, showTotalTax: true },
          payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
          signature: { show: false, name: "", designation: "", imageUrl: "" },
          footer: { show: true, text: "Thank you for your business!" },
          design: { primaryColor: "#4f46e5", secondaryColor: "#f8fafc", textColor: "#0f172a", backgroundColor: "#ffffff", borderColor: "#cbd5e1", fontFamily: "Inter", fontSize: 12, borderStyle: "light" }
        }
      },
      {
        name: "Amber Gold Premium",
        description: "Warm gold and amber accents suitable for retail and commercial bills.",
        status: "active",
        isDefault: false,
        config: {
          layout: "amber-gold",
          header: { showLogo: true, logoPosition: "left", logoSize: "medium", logoUrl: "", showCompanyName: true, showAddress: true, showPhone: true, showEmail: true },
          seller: { showName: true, showPhone: true, showEmail: true, showGSTIN: true, showAddress: true },
          customer: { showName: true, showGSTIN: true, showPhone: true, showEmail: true, showBillingAddress: true, showShippingAddress: true, showPlaceOfSupply: true },
          invoiceInfo: {
            showInvoiceNumber: true, showInvoiceDate: true, showDueDate: true, showPaymentTerms: true, showOrderNumber: true, showSalesperson: true,
            labels: { invoiceNumber: "Bill No.", invoiceDate: "Bill Date", dueDate: "Due Date", paymentTerms: "Payment Terms", orderNumber: "Order No.", salespersonName: "Salesperson" }
          },
          items: {
            columns: ["item", "hsn", "quantity", "rate", "tax", "amount"],
            labels: { item: "Item", description: "Description", sku: "SKU", hsn: "HSN/SAC", quantity: "Qty", rate: "Rate", tax: "Tax", amount: "Amount" }
          },
          tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTaxableAmount: true, showTotalTax: true },
          payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
          signature: { show: false, name: "", designation: "", imageUrl: "" },
          footer: { show: true, text: "Thank you for your business!" },
          design: { primaryColor: "#d97706", secondaryColor: "#fffbeb", textColor: "#0f172a", backgroundColor: "#ffffff", borderColor: "#fde68a", fontFamily: "Inter", fontSize: 12, borderStyle: "light" }
        }
      },
      {
        name: "Emerald Corporate",
        description: "Professional emerald green theme suitable for B2B & corporate billing.",
        status: "active",
        isDefault: false,
        config: {
          layout: "emerald-corporate",
          header: { showLogo: true, logoPosition: "left", logoSize: "medium", logoUrl: "", showCompanyName: true, showAddress: true, showPhone: true, showEmail: true },
          seller: { showName: true, showPhone: true, showEmail: true, showGSTIN: true, showAddress: true },
          customer: { showName: true, showGSTIN: true, showPhone: true, showEmail: true, showBillingAddress: true, showShippingAddress: true, showPlaceOfSupply: true },
          invoiceInfo: {
            showInvoiceNumber: true, showInvoiceDate: true, showDueDate: true, showPaymentTerms: true, showOrderNumber: true, showSalesperson: true,
            labels: { invoiceNumber: "Invoice No.", invoiceDate: "Invoice Date", dueDate: "Due Date", paymentTerms: "Payment Terms", orderNumber: "Order No.", salespersonName: "Salesperson" }
          },
          items: {
            columns: ["item", "hsn", "quantity", "rate", "tax", "amount"],
            labels: { item: "Item", description: "Description", sku: "SKU", hsn: "HSN/SAC", quantity: "Qty", rate: "Rate", tax: "Tax", amount: "Amount" }
          },
          tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTaxableAmount: true, showTotalTax: true },
          payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
          signature: { show: false, name: "", designation: "", imageUrl: "" },
          footer: { show: true, text: "Thank you for your business!" },
          design: { primaryColor: "#059669", secondaryColor: "#ecfdf5", textColor: "#0f172a", backgroundColor: "#ffffff", borderColor: "#a7f3d0", fontFamily: "Inter", fontSize: 12, borderStyle: "light" }
        }
      },
      {
        name: "Swiss Minimal",
        description: "Clean white background, stark black typography, and generous whitespace with hairline dividers.",
        status: "active",
        isDefault: false,
        config: {
          layout: "swiss-minimal",
          header: { showLogo: true, logoPosition: "left", logoSize: "medium", logoUrl: "", showCompanyName: true, showAddress: true, showPhone: true, showEmail: true },
          seller: { showName: true, showPhone: true, showEmail: true, showGSTIN: true, showAddress: true },
          customer: { showName: true, showGSTIN: true, showPhone: true, showEmail: true, showBillingAddress: true, showShippingAddress: true, showPlaceOfSupply: true },
          invoiceInfo: {
            showInvoiceNumber: true, showInvoiceDate: true, showDueDate: true, showPaymentTerms: true, showOrderNumber: true, showSalesperson: true,
            labels: { invoiceNumber: "INVOICE REF", invoiceDate: "ISSUED ON", dueDate: "DUE ON", paymentTerms: "TERMS", orderNumber: "ORDER REF", salespersonName: "REP" }
          },
          items: {
            columns: ["item", "hsn", "quantity", "rate", "tax", "amount"],
            labels: { item: "DESCRIPTION", description: "DETAILS", sku: "SKU", hsn: "CODE", quantity: "QTY", rate: "PRICE", tax: "TAX", amount: "AMOUNT" }
          },
          tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTaxableAmount: true, showTotalTax: true },
          payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
          signature: { show: false, name: "", designation: "", imageUrl: "" },
          footer: { show: true, text: "DOCUMENT GENERATED WITH MATHEMATICAL PRECISION." },
          design: { primaryColor: "#000000", secondaryColor: "#f9fafb", textColor: "#111827", backgroundColor: "#ffffff", borderColor: "#e5e7eb", fontFamily: "Helvetica, Arial, sans-serif", fontSize: 11, borderStyle: "light" }
        }
      },
      {
        name: "Midnight Executive",
        description: "Deep navy header, refined gold accents, and authoritative corporate ledger styling.",
        status: "active",
        isDefault: false,
        config: {
          layout: "midnight-executive",
          header: { showLogo: true, logoPosition: "left", logoSize: "medium", logoUrl: "", showCompanyName: true, showAddress: true, showPhone: true, showEmail: true },
          seller: { showName: true, showPhone: true, showEmail: true, showGSTIN: true, showAddress: true },
          customer: { showName: true, showGSTIN: true, showPhone: true, showEmail: true, showBillingAddress: true, showShippingAddress: true, showPlaceOfSupply: true },
          invoiceInfo: {
            showInvoiceNumber: true, showInvoiceDate: true, showDueDate: true, showPaymentTerms: true, showOrderNumber: true, showSalesperson: true,
            labels: { invoiceNumber: "INVOICE NUMBER", invoiceDate: "ISSUE DATE", dueDate: "MATURITY DATE", paymentTerms: "TERMS", orderNumber: "PO NUMBER", salespersonName: "LEAD ADVISOR" }
          },
          items: {
            columns: ["item", "hsn", "quantity", "rate", "tax", "amount"],
            labels: { item: "DELIVERABLE", description: "SCOPE", sku: "SKU", hsn: "HSN/SAC", quantity: "UNITS", rate: "AGREED RATE", tax: "TAX", amount: "FEE" }
          },
          tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTaxableAmount: true, showTotalTax: true },
          payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
          signature: { show: false, name: "", designation: "", imageUrl: "" },
          footer: { show: true, text: "OFFICIAL CORPORATE FINANCIAL DOCUMENT." },
          design: { primaryColor: "#0f172a", secondaryColor: "#f8fafc", textColor: "#0f172a", backgroundColor: "#ffffff", borderColor: "#cbd5e1", fontFamily: "Inter", fontSize: 12, borderStyle: "light" }
        }
      },
      {
        name: "Modern Gradient",
        description: "Vibrant blue-to-violet accent header, rounded visual elements, and crisp modern typography.",
        status: "active",
        isDefault: false,
        config: {
          layout: "modern-gradient",
          header: { showLogo: true, logoPosition: "left", logoSize: "medium", logoUrl: "", showCompanyName: true, showAddress: true, showPhone: true, showEmail: true },
          seller: { showName: true, showPhone: true, showEmail: true, showGSTIN: true, showAddress: true },
          customer: { showName: true, showGSTIN: true, showPhone: true, showEmail: true, showBillingAddress: true, showShippingAddress: true, showPlaceOfSupply: true },
          invoiceInfo: {
            showInvoiceNumber: true, showInvoiceDate: true, showDueDate: true, showPaymentTerms: true, showOrderNumber: true, showSalesperson: true,
            labels: { invoiceNumber: "Invoice No.", invoiceDate: "Issued On", dueDate: "Due Date", paymentTerms: "Payment Terms", orderNumber: "Order Identifier", salespersonName: "Account Rep" }
          },
          items: {
            columns: ["item", "hsn", "quantity", "rate", "tax", "amount"],
            labels: { item: "Item & Specification", description: "Details", sku: "Code", hsn: "HSN/SAC", quantity: "Qty", rate: "Rate", tax: "Tax", amount: "Total" }
          },
          tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTaxableAmount: true, showTotalTax: true },
          payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
          signature: { show: false, name: "", designation: "", imageUrl: "" },
          footer: { show: true, text: "Thank you for your partnership!" },
          design: { primaryColor: "#2563eb", secondaryColor: "#f5f3ff", textColor: "#0f172a", backgroundColor: "#ffffff", borderColor: "#ddd6fe", fontFamily: "Poppins, Inter, sans-serif", fontSize: 12, borderStyle: "light" }
        }
      },
      {
        name: "Editorial / Luxury",
        description: "Editorial-style layout with serif typography, double hairline rules, and distinctive invoice numbering.",
        status: "active",
        isDefault: false,
        config: {
          layout: "editorial-luxury",
          header: { showLogo: true, logoPosition: "left", logoSize: "medium", logoUrl: "", showCompanyName: true, showAddress: true, showPhone: true, showEmail: true },
          seller: { showName: true, showPhone: true, showEmail: true, showGSTIN: true, showAddress: true },
          customer: { showName: true, showGSTIN: true, showPhone: true, showEmail: true, showBillingAddress: true, showShippingAddress: true, showPlaceOfSupply: true },
          invoiceInfo: {
            showInvoiceNumber: true, showInvoiceDate: true, showDueDate: true, showPaymentTerms: true, showOrderNumber: true, showSalesperson: true,
            labels: { invoiceNumber: "FOLIO NO.", invoiceDate: "DATE OF ISSUE", dueDate: "MATURITY", paymentTerms: "TERMS", orderNumber: "REFERENCE", salespersonName: "ADVISOR" }
          },
          items: {
            columns: ["item", "hsn", "quantity", "rate", "tax", "amount"],
            labels: { item: "Service Particulars", description: "Engagement Details", sku: "Ref", hsn: "SAC/HSN", quantity: "Quantity", rate: "Unit Rate", tax: "Tax %", amount: "Fee (INR)" }
          },
          tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTaxableAmount: true, showTotalTax: true },
          payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
          signature: { show: false, name: "", designation: "", imageUrl: "" },
          footer: { show: true, text: "Privileged and strictly confidential." },
          design: { primaryColor: "#1c1917", secondaryColor: "#fcfbf9", textColor: "#292524", backgroundColor: "#ffffff", borderColor: "#e7e5e4", fontFamily: "Georgia, serif", fontSize: 11.5, borderStyle: "light" }
        }
      },
      {
        name: "Bold Creative",
        description: "Asymmetric carbon spine, striking geometric accents, bold typography, and a prominent total callout.",
        status: "active",
        isDefault: false,
        config: {
          layout: "bold-creative",
          header: { showLogo: true, logoPosition: "left", logoSize: "medium", logoUrl: "", showCompanyName: true, showAddress: true, showPhone: true, showEmail: true },
          seller: { showName: true, showPhone: true, showEmail: true, showGSTIN: true, showAddress: true },
          customer: { showName: true, showGSTIN: true, showPhone: true, showEmail: true, showBillingAddress: true, showShippingAddress: true, showPlaceOfSupply: true },
          invoiceInfo: {
            showInvoiceNumber: true, showInvoiceDate: true, showDueDate: true, showPaymentTerms: true, showOrderNumber: true, showSalesperson: true,
            labels: { invoiceNumber: "REF NO", invoiceDate: "ISSUE DATE", dueDate: "DUE DATE", paymentTerms: "TERMS", orderNumber: "PO NUMBER", salespersonName: "DIRECTOR" }
          },
          items: {
            columns: ["item", "hsn", "quantity", "rate", "tax", "amount"],
            labels: { item: "Deliverable Item", description: "Scope", sku: "Code", hsn: "HSN/SAC", quantity: "Qty", rate: "Rate", tax: "Tax", amount: "Total (INR)" }
          },
          tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTaxableAmount: true, showTotalTax: true },
          payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
          signature: { show: false, name: "", designation: "", imageUrl: "" },
          footer: { show: true, text: "CREATIVE AGENCY INVOICE." },
          design: { primaryColor: "#ea580c", secondaryColor: "#fff7ed", textColor: "#18181b", backgroundColor: "#ffffff", borderColor: "#18181b", fontFamily: "Inter", fontSize: 12, borderStyle: "medium" }
        }
      },
      {
        name: "Eco / Natural",
        description: "Muted forest green, warm cream canvas, organic rounded panels, and sustainable spacing.",
        status: "active",
        isDefault: false,
        config: {
          layout: "eco-natural",
          header: { showLogo: true, logoPosition: "left", logoSize: "medium", logoUrl: "", showCompanyName: true, showAddress: true, showPhone: true, showEmail: true },
          seller: { showName: true, showPhone: true, showEmail: true, showGSTIN: true, showAddress: true },
          customer: { showName: true, showGSTIN: true, showPhone: true, showEmail: true, showBillingAddress: true, showShippingAddress: true, showPlaceOfSupply: true },
          invoiceInfo: {
            showInvoiceNumber: true, showInvoiceDate: true, showDueDate: true, showPaymentTerms: true, showOrderNumber: true, showSalesperson: true,
            labels: { invoiceNumber: "Invoice No.", invoiceDate: "Date", dueDate: "Due Date", paymentTerms: "Terms", orderNumber: "PO Ref", salespersonName: "Representative" }
          },
          items: {
            columns: ["item", "hsn", "quantity", "rate", "tax", "amount"],
            labels: { item: "Sustainable Product / Service", description: "Details", sku: "SKU", hsn: "HSN/SAC", quantity: "Qty", rate: "Price", tax: "Tax", amount: "Amount" }
          },
          tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTaxableAmount: true, showTotalTax: true },
          payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
          signature: { show: false, name: "", designation: "", imageUrl: "" },
          footer: { show: true, text: "Eco-certified digital invoice. Save paper, protect trees." },
          design: { primaryColor: "#2d5a43", secondaryColor: "#fbf9f4", textColor: "#1f2923", backgroundColor: "#ffffff", borderColor: "#e3ded2", fontFamily: "Open Sans, Inter, sans-serif", fontSize: 12, borderStyle: "light" }
        }
      },
      {
        name: "Compact Business",
        description: "Space-efficient tabular layout with dense metadata grid and structured tax schedule for multi-item invoices.",
        status: "active",
        isDefault: false,
        config: {
          layout: "compact-business",
          header: { showLogo: true, logoPosition: "left", logoSize: "medium", logoUrl: "", showCompanyName: true, showAddress: true, showPhone: true, showEmail: true },
          seller: { showName: true, showPhone: true, showEmail: true, showGSTIN: true, showAddress: true },
          customer: { showName: true, showGSTIN: true, showPhone: true, showEmail: true, showBillingAddress: true, showShippingAddress: true, showPlaceOfSupply: true },
          invoiceInfo: {
            showInvoiceNumber: true, showInvoiceDate: true, showDueDate: true, showPaymentTerms: true, showOrderNumber: true, showSalesperson: true,
            labels: { invoiceNumber: "Invoice No", invoiceDate: "Date", dueDate: "Due Date", paymentTerms: "Terms", orderNumber: "PO No", salespersonName: "Salesperson" }
          },
          items: {
            columns: ["item", "hsn", "quantity", "rate", "tax", "amount"],
            labels: { item: "Item Description", description: "Details", sku: "Code", hsn: "HSN/SAC", quantity: "Qty", rate: "Rate", tax: "Tax %", amount: "Amount (INR)" }
          },
          tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTaxableAmount: true, showTotalTax: true },
          payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
          signature: { show: false, name: "", designation: "", imageUrl: "" },
          footer: { show: true, text: "Thank you for your business!" },
          design: { primaryColor: "#1e293b", secondaryColor: "#f8fafc", textColor: "#0f172a", backgroundColor: "#ffffff", borderColor: "#cbd5e1", fontFamily: "Inter", fontSize: 10.5, borderStyle: "light" }
        }
      }
    ];

// Helper to look up a template by MongoDB ObjectId or preset layoutKey/name
const findTemplateByIdOrPreset = async (id, userId) => {
  if (!id) return null;
  let template = null;
  if (mongoose.Types.ObjectId.isValid(id)) {
    template = await InvoiceTemplate.findOne({ _id: id, userId });
  }
  if (!template) {
    const cleanKey = String(id).replace(/^tpl-/, "").toLowerCase();
    template = await InvoiceTemplate.findOne({
      userId,
      $or: [
        { "config.layout": cleanKey },
        { name: new RegExp(`^${cleanKey.replace(/-/g, " ")}$`, "i") }
      ]
    });
  }
  return template;
};

// Helper to match built-in system default templates
const findDefaultPreset = (id) => {
  if (!id) return null;
  const cleanKey = String(id).replace(/^tpl-/, "").toLowerCase();
  return defaultTemplates.find(dt => 
    dt.config?.layout === cleanKey ||
    dt.name.toLowerCase().replace(/[^a-z0-9]/g, "-") === cleanKey ||
    dt.name.toLowerCase() === cleanKey.replace(/-/g, " ") ||
    cleanKey.includes(dt.config?.layout || "")
  );
};

// GET /api/invoice-templates - Get all templates for the user (auto-seed system defaults if empty or missing)
router.get("/", verifyToken, async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      let templates = await InvoiceTemplate.find({ userId: req.user.id }).sort({ createdAt: 1 });

      if (templates.length === 0) {
        for (const t of defaultTemplates) {
          const created = new InvoiceTemplate({ ...t, userId: req.user.id });
          await created.save();

          const ver = new InvoiceTemplateVersion({
            templateId: created._id,
            versionNumber: 1,
            config: created.config
          });
          await ver.save();
        }

        templates = await InvoiceTemplate.find({ userId: req.user.id }).sort({ createdAt: 1 });
      } else {
        // Auto-seed any missing standard templates for existing users
        const existingNames = new Set(templates.map(t => t.name.toLowerCase()));
        const missing = defaultTemplates.filter(dt => !existingNames.has(dt.name.toLowerCase()));
        if (missing.length > 0) {
          for (const t of missing) {
            const created = new InvoiceTemplate({ ...t, userId: req.user.id, isDefault: false });
            await created.save();

            const ver = new InvoiceTemplateVersion({
              templateId: created._id,
              versionNumber: 1,
              config: created.config
            });
            await ver.save();
          }
          templates = await InvoiceTemplate.find({ userId: req.user.id }).sort({ createdAt: 1 });
        }
      }

      return res.json({ success: true, data: templates });
    }

    // Fallback if DB is offline or degraded
    return res.json({
      success: true,
      data: defaultTemplates.map((t) => ({
        ...t,
        _id: `tpl-${t.config.layout}`,
        userId: req.user.id,
        createdAt: new Date().toISOString()
      }))
    });
  } catch (error) {
    res.json({
      success: true,
      data: defaultTemplates.map((t) => ({
        ...t,
        _id: `tpl-${t.config.layout}`,
        userId: req.user.id,
        createdAt: new Date().toISOString()
      }))
    });
  }
});

// GET /api/invoice-templates/:id - Get a specific template (supports ObjectId or preset id)
router.get("/:id", verifyToken, async (req, res) => {
  const rawId = req.id || req.params.id;
  try {
    let template = null;
    if (mongoose.connection.readyState === 1) {
      template = await findTemplateByIdOrPreset(rawId, req.user.id);
      
      // If not found in DB, auto-seed this specific preset for the user so it has an ObjectId
      if (!template) {
        const preset = findDefaultPreset(rawId);
        if (preset) {
          template = new InvoiceTemplate({
            ...preset,
            userId: req.user.id,
            isDefault: false
          });
          await template.save();

          const ver = new InvoiceTemplateVersion({
            templateId: template._id,
            versionNumber: 1,
            config: template.config
          });
          await ver.save();
        }
      }
    }

    if (!template) {
      const preset = findDefaultPreset(rawId);
      if (preset) {
        template = {
          ...preset,
          _id: `tpl-${preset.config.layout}`,
          userId: req.user.id,
          createdAt: new Date().toISOString()
        };
      }
    }

    if (!template) {
      return res.status(404).json({ success: false, error: { code: "TEMPLATE_NOT_FOUND", message: "Invoice template not found" } });
    }
    res.json({ success: true, data: template });
  } catch (error) {
    const preset = findDefaultPreset(rawId);
    if (preset) {
      return res.json({
        success: true,
        data: {
          ...preset,
          _id: `tpl-${preset.config.layout}`,
          userId: req.user.id,
          createdAt: new Date().toISOString()
        }
      });
    }
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
});

// POST /api/invoice-templates - Create a template
router.post("/", verifyToken, async (req, res) => {
  const { name, description, config, status } = req.body;

  if (!name || name.trim() === "") {
    return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Template name is required" } });
  }

  try {
    // Check if name is already taken for this user
    const existing = await InvoiceTemplate.findOne({ userId: req.user.id, name: name.trim() });
    if (existing) {
      return res.status(400).json({ success: false, error: { code: "DUPLICATE_NAME", message: "A template with this name already exists." } });
    }

    // Check if it's the first template or explicit default
    const count = await InvoiceTemplate.countDocuments({ userId: req.user.id });
    const isDefault = count === 0 ? true : false;

    const template = new InvoiceTemplate({
      userId: req.user.id,
      name: name.trim(),
      description: description || "",
      status: status || "active",
      isDefault,
      config: config || {}
    });

    await template.save();

    // Create Version 1 snapshot
    const version = new InvoiceTemplateVersion({
      templateId: template._id,
      versionNumber: 1,
      config: template.config
    });
    await version.save();

    res.status(201).json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
});

// PUT /api/invoice-templates/:id - Update template config & increment version
router.put("/:id", verifyToken, async (req, res) => {
  const { name, description, config, status } = req.body;
  const rawId = req.params.id;

  try {
    let template = await findTemplateByIdOrPreset(rawId, req.user.id);

    // If not found in DB, check if it's a built-in default preset and create it with the updated values
    if (!template) {
      const preset = findDefaultPreset(rawId);
      if (preset) {
        template = new InvoiceTemplate({
          ...preset,
          name: name ? name.trim() : preset.name,
          description: description !== undefined ? description : preset.description,
          status: status || "active",
          config: config || preset.config,
          userId: req.user.id,
          isDefault: false
        });
        await template.save();

        const newVer = new InvoiceTemplateVersion({
          templateId: template._id,
          versionNumber: 1,
          config: template.config
        });
        await newVer.save();

        return res.json({ success: true, data: template });
      }
      return res.status(404).json({ success: false, error: { code: "TEMPLATE_NOT_FOUND", message: "Invoice template not found" } });
    }

    if (name && name.trim() !== template.name) {
      const existing = await InvoiceTemplate.findOne({ 
        userId: req.user.id, 
        name: name.trim(), 
        _id: { $ne: template._id } 
      });
      if (existing) {
        return res.status(400).json({ success: false, error: { code: "DUPLICATE_NAME", message: "A template with this name already exists." } });
      }
      template.name = name.trim();
    }

    if (description !== undefined) template.description = description;
    if (status !== undefined) template.status = status;
    
    // Save previous config for checking changes
    const configChanged = config && JSON.stringify(config) !== JSON.stringify(template.config);
    if (config) {
      template.config = config;
    }

    await template.save();

    if (configChanged) {
      // Find highest version number
      const lastVersion = await InvoiceTemplateVersion.findOne({ templateId: template._id })
        .sort({ versionNumber: -1 });
      const nextVerNum = lastVersion ? lastVersion.versionNumber + 1 : 1;

      const newVer = new InvoiceTemplateVersion({
        templateId: template._id,
        versionNumber: nextVerNum,
        config: template.config
      });
      await newVer.save();
    }

    res.json({ success: true, data: template });
  } catch (error) {
    const preset = findDefaultPreset(rawId);
    if (preset) {
      return res.json({
        success: true,
        data: {
          ...preset,
          _id: rawId,
          name: name ? name.trim() : preset.name,
          description: description !== undefined ? description : preset.description,
          status: status || "active",
          config: config || preset.config,
          userId: req.user.id
        }
      });
    }
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
});

// DELETE /api/invoice-templates/:id - Delete template and versions
router.delete("/:id", verifyToken, async (req, res) => {
  const rawId = req.params.id;
  try {
    if (!mongoose.Types.ObjectId.isValid(rawId)) {
      return res.status(400).json({ success: false, error: { code: "CANNOT_DELETE_BUILTIN", message: "Built-in standard templates cannot be deleted." } });
    }

    const template = await InvoiceTemplate.findOne({ _id: rawId, userId: req.user.id });
    if (!template) {
      return res.status(404).json({ success: false, error: { code: "TEMPLATE_NOT_FOUND", message: "Invoice template not found" } });
    }

    // Standard business rule: Do not delete default template unless it's the only one
    if (template.isDefault) {
      const count = await InvoiceTemplate.countDocuments({ userId: req.user.id });
      if (count > 1) {
        return res.status(400).json({ success: false, error: { code: "DELETE_DEFAULT_FAILED", message: "Cannot delete the default template. Set another template as default first." } });
      }
    }

    await InvoiceTemplate.deleteOne({ _id: template._id });
    await InvoiceTemplateVersion.deleteMany({ templateId: template._id });

    res.json({ success: true, message: "Template deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
});

// POST /api/invoice-templates/:id/duplicate - Duplicate template config
router.post("/:id/duplicate", verifyToken, async (req, res) => {
  const rawId = req.params.id;
  try {
    let template = await findTemplateByIdOrPreset(rawId, req.user.id);
    if (!template) {
      template = findDefaultPreset(rawId);
    }
    if (!template) {
      return res.status(404).json({ success: false, error: { code: "TEMPLATE_NOT_FOUND", message: "Invoice template not found" } });
    }

    // Generate unique name
    let newName = `${template.name} Copy`;
    let isUnique = false;
    let index = 1;
    while (!isUnique) {
      const existing = await InvoiceTemplate.findOne({ userId: req.user.id, name: newName });
      if (!existing) {
        isUnique = true;
      } else {
        newName = `${template.name} Copy (${index++})`;
      }
    }

    const duplicate = new InvoiceTemplate({
      userId: req.user.id,
      name: newName,
      description: `Copy of ${template.name}`,
      status: "active",
      isDefault: false,
      config: template.config
    });

    await duplicate.save();

    // Create Version 1 of duplicate
    const version = new InvoiceTemplateVersion({
      templateId: duplicate._id,
      versionNumber: 1,
      config: duplicate.config
    });
    await version.save();

    res.status(201).json({ success: true, data: duplicate });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
});

// POST /api/invoice-templates/:id/set-default - Set selected template as default
router.post("/:id/set-default", verifyToken, async (req, res) => {
  const rawId = req.params.id;
  try {
    let template = await findTemplateByIdOrPreset(rawId, req.user.id);
    if (!template) {
      const preset = findDefaultPreset(rawId);
      if (preset) {
        template = new InvoiceTemplate({
          ...preset,
          userId: req.user.id,
          isDefault: true
        });
        await template.save();

        const version = new InvoiceTemplateVersion({
          templateId: template._id,
          versionNumber: 1,
          config: template.config
        });
        await version.save();
      }
    }

    if (!template) {
      return res.status(404).json({ success: false, error: { code: "TEMPLATE_NOT_FOUND", message: "Invoice template not found" } });
    }

    // Set all templates default value to false
    await InvoiceTemplate.updateMany({ userId: req.user.id }, { isDefault: false });

    // Set this template default to true
    template.isDefault = true;
    await template.save();

    res.json({ success: true, message: "Template set as default successfully", data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
});

// GET /api/invoice-templates/:id/versions - List all versions
router.get("/:id/versions", verifyToken, async (req, res) => {
  const rawId = req.params.id;
  try {
    const template = await findTemplateByIdOrPreset(rawId, req.user.id);
    if (!template) {
      return res.status(404).json({ success: false, error: { code: "TEMPLATE_NOT_FOUND", message: "Invoice template not found" } });
    }

    const versions = await InvoiceTemplateVersion.find({ templateId: template._id })
      .sort({ versionNumber: -1 })
      .select("versionNumber createdAt");

    res.json({ success: true, data: versions });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
});

// GET /api/invoice-templates/:id/versions/:versionNum - Get specific version config
router.get("/:id/versions/:versionNum", verifyToken, async (req, res) => {
  const rawId = req.params.id;
  try {
    const template = await findTemplateByIdOrPreset(rawId, req.user.id);
    if (!template) {
      return res.status(404).json({ success: false, error: { code: "TEMPLATE_NOT_FOUND", message: "Invoice template not found" } });
    }

    const versionNum = parseInt(req.params.versionNum);
    const version = await InvoiceTemplateVersion.findOne({ templateId: template._id, versionNumber: versionNum });
    if (!version) {
      return res.status(404).json({ success: false, error: { code: "VERSION_NOT_FOUND", message: "Version snapshot not found" } });
    }

    res.json({ success: true, data: version });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
});

export default router;
