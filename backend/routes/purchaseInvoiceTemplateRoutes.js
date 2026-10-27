import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import PurchaseInvoiceTemplate from "../models/PurchaseInvoiceTemplate.js";

const router = express.Router();

// Middleware to verify JWT token
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

// Default Purchase Templates for auto-seeding (All 10 distinct designs)
const defaultPurchaseTemplates = (userId) => [
  {
    userId,
    name: "Amber Gold Purchase Bill (Default)",
    description: "Standard warm gold purchase invoice layout for retail & supermarket inventory.",
    status: "active",
    isDefault: true,
    config: {
      header: { showLogo: true, logoUrl: "", headerTitle: "TAX INVOICE / PURCHASE BILL", showCompanyName: true, showAddress: true, showPhone: true },
      supplier: { showName: true, showPhone: true, showGSTIN: true, showState: true },
      customer: { showName: true, showPhone: true, showGSTIN: true, showType: true },
      items: {
        columns: ["item", "hsn", "quantity", "unit", "rate", "tax", "amount"],
        labels: { item: "Item", hsn: "HSN/SAC", quantity: "Qty", unit: "Unit", rate: "Price/Unit", tax: "Tax", amount: "Amount" }
      },
      tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTotalTax: true },
      payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
      notes: { show: true, label: "Purchase Notes", defaultText: "Goods received in good condition." },
      terms: { show: true, label: "Terms & Conditions", defaultText: "Payment terms as per vendor agreement." },
      design: { primaryColor: "#d97706", secondaryColor: "#fffbeb", textColor: "#0f172a", fontFamily: "Inter", invoiceSize: "A4", invoiceFormat: "Supermarket" }
    }
  },
  {
    userId,
    name: "Emerald Wholesale Vendor",
    description: "Corporate emerald green design tailored for wholesale & B2B vendor receipts.",
    status: "active",
    isDefault: false,
    config: {
      header: { showLogo: true, logoUrl: "", headerTitle: "VENDOR TAX INVOICE", showCompanyName: true, showAddress: true, showPhone: true },
      supplier: { showName: true, showPhone: true, showGSTIN: true, showState: true },
      customer: { showName: true, showPhone: true, showGSTIN: true, showType: true },
      items: {
        columns: ["item", "hsn", "quantity", "unit", "rate", "tax", "amount"],
        labels: { item: "Item", hsn: "HSN/SAC", quantity: "Qty", unit: "Unit", rate: "Price/Unit", tax: "Tax", amount: "Amount" }
      },
      tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTotalTax: true },
      payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
      notes: { show: true, label: "Vendor Notes", defaultText: "Bulk delivery verified." },
      terms: { show: true, label: "Terms & Conditions", defaultText: "Net 30 days payment terms." },
      design: { primaryColor: "#059669", secondaryColor: "#ecfdf5", textColor: "#0f172a", fontFamily: "Inter", invoiceSize: "A4", invoiceFormat: "Wholesale" }
    }
  },
  {
    userId,
    name: "Slate Goods Received Note",
    description: "Minimalist slate layout focused on inventory receipt and stock intake.",
    status: "active",
    isDefault: false,
    config: {
      header: { showLogo: true, logoUrl: "", headerTitle: "GOODS RECEIVED NOTE", showCompanyName: true, showAddress: true, showPhone: true },
      supplier: { showName: true, showPhone: true, showGSTIN: true, showState: true },
      customer: { showName: true, showPhone: true, showGSTIN: true, showType: true },
      items: {
        columns: ["item", "hsn", "quantity", "unit", "rate", "tax", "amount"],
        labels: { item: "Item", hsn: "HSN/SAC", quantity: "Qty", unit: "Unit", rate: "Price/Unit", tax: "Tax", amount: "Amount" }
      },
      tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTotalTax: true },
      payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
      notes: { show: true, label: "Stock Intake Notes", defaultText: "Stock items verified against purchase order." },
      terms: { show: true, label: "Terms & Conditions", defaultText: "Subject to quality verification." },
      design: { primaryColor: "#475569", secondaryColor: "#f8fafc", textColor: "#0f172a", fontFamily: "Inter", invoiceSize: "A4", invoiceFormat: "Stationery Shop" }
    }
  },
  {
    userId,
    name: "Swiss Minimal Vendor Receipt",
    description: "Clean stark black typography, hairline dividers, and objective alignment for precision intake.",
    status: "active",
    isDefault: false,
    config: {
      header: { showLogo: true, logoUrl: "", headerTitle: "VENDOR RECEIPT / INWARD BILL", showCompanyName: true, showAddress: true, showPhone: true },
      supplier: { showName: true, showPhone: true, showGSTIN: true, showState: true },
      customer: { showName: true, showPhone: true, showGSTIN: true, showType: true },
      items: {
        columns: ["item", "hsn", "quantity", "unit", "rate", "tax", "amount"],
        labels: { item: "DESCRIPTION", hsn: "CODE", quantity: "QTY", unit: "UNIT", rate: "UNIT RATE", tax: "TAX", amount: "AMOUNT" }
      },
      tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTotalTax: true },
      payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
      notes: { show: true, label: "REMARKS", defaultText: "Items audited against procurement checklist." },
      terms: { show: true, label: "TERMS", defaultText: "Standard vendor settlement within agreed period." },
      design: { primaryColor: "#000000", secondaryColor: "#f9fafb", textColor: "#111827", fontFamily: "Helvetica, Arial, sans-serif", invoiceSize: "A4", invoiceFormat: "Supermarket" }
    }
  },
  {
    userId,
    name: "Midnight Executive Procurement",
    description: "Deep navy header banner with refined gold accents for corporate procurement & capital assets.",
    status: "active",
    isDefault: false,
    config: {
      header: { showLogo: true, logoUrl: "", headerTitle: "OFFICIAL PROCUREMENT RECORD", showCompanyName: true, showAddress: true, showPhone: true },
      supplier: { showName: true, showPhone: true, showGSTIN: true, showState: true },
      customer: { showName: true, showPhone: true, showGSTIN: true, showType: true },
      items: {
        columns: ["item", "hsn", "quantity", "unit", "rate", "tax", "amount"],
        labels: { item: "SUPPLY DELIVERABLE", hsn: "HSN/SAC", quantity: "UNITS", unit: "UNIT", rate: "CONTRACT RATE", tax: "TAX", amount: "TOTAL" }
      },
      tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTotalTax: true },
      payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
      notes: { show: true, label: "Executive Notes", defaultText: "Authorized for payment as per purchase order." },
      terms: { show: true, label: "Payment Terms", defaultText: "Net 30 days upon inspection." },
      design: { primaryColor: "#0f172a", secondaryColor: "#f8fafc", textColor: "#0f172a", fontFamily: "Georgia, serif", invoiceSize: "A4", invoiceFormat: "Wholesale" }
    }
  },
  {
    userId,
    name: "Modern Gradient Intake",
    description: "Contemporary blue-to-violet accent styling with rounded elements for tech supply chains.",
    status: "active",
    isDefault: false,
    config: {
      header: { showLogo: true, logoUrl: "", headerTitle: "SMART PURCHASE BILL", showCompanyName: true, showAddress: true, showPhone: true },
      supplier: { showName: true, showPhone: true, showGSTIN: true, showState: true },
      customer: { showName: true, showPhone: true, showGSTIN: true, showType: true },
      items: {
        columns: ["item", "hsn", "quantity", "unit", "rate", "tax", "amount"],
        labels: { item: "Product / Material", hsn: "HSN", quantity: "Qty", unit: "Unit", rate: "Rate", tax: "Tax", amount: "Amount" }
      },
      tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTotalTax: true },
      payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
      notes: { show: true, label: "Intake Notes", defaultText: "Verified against digital delivery note." },
      terms: { show: true, label: "Terms & Conditions", defaultText: "Standard vendor terms apply." },
      design: { primaryColor: "#2563eb", secondaryColor: "#f5f3ff", textColor: "#0f172a", fontFamily: "Poppins, Inter, sans-serif", invoiceSize: "A4", invoiceFormat: "Supermarket" }
    }
  },
  {
    userId,
    name: "Editorial / Luxury Consignment",
    description: "Serif masthead and stone rules for boutique consignments and luxury vendor orders.",
    status: "active",
    isDefault: false,
    config: {
      header: { showLogo: true, logoUrl: "", headerTitle: "CONSIGNMENT & VENDOR MANIFEST", showCompanyName: true, showAddress: true, showPhone: true },
      supplier: { showName: true, showPhone: true, showGSTIN: true, showState: true },
      customer: { showName: true, showPhone: true, showGSTIN: true, showType: true },
      items: {
        columns: ["item", "hsn", "quantity", "unit", "rate", "tax", "amount"],
        labels: { item: "Article / Specification", hsn: "Code", quantity: "Quantity", unit: "Unit", rate: "Unit Cost", tax: "Tax %", amount: "Total (INR)" }
      },
      tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTotalTax: true },
      payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
      notes: { show: true, label: "Consignment Folio", defaultText: "High-value consignment inspected and logged." },
      terms: { show: true, label: "Settlement Schedule", defaultText: "Payment release upon consignment verification." },
      design: { primaryColor: "#1c1917", secondaryColor: "#fcfbf9", textColor: "#292524", fontFamily: "Georgia, serif", invoiceSize: "A4", invoiceFormat: "Stationery Shop" }
    }
  },
  {
    userId,
    name: "Bold Creative Studio Intake",
    description: "Asymmetric orange side accent and bold typography for creative supplier and freelance deliverables.",
    status: "active",
    isDefault: false,
    config: {
      header: { showLogo: true, logoUrl: "", headerTitle: "STUDIO DELIVERABLE INVOICE", showCompanyName: true, showAddress: true, showPhone: true },
      supplier: { showName: true, showPhone: true, showGSTIN: true, showState: true },
      customer: { showName: true, showPhone: true, showGSTIN: true, showType: true },
      items: {
        columns: ["item", "hsn", "quantity", "unit", "rate", "tax", "amount"],
        labels: { item: "Deliverable Item", hsn: "HSN/SAC", quantity: "Qty", unit: "Unit", rate: "Price", tax: "Tax", amount: "Total" }
      },
      tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTotalTax: true },
      payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
      notes: { show: true, label: "Deliverable Scope", defaultText: "Creative assets received and signed off." },
      terms: { show: true, label: "Payment Terms", defaultText: "Settlement within 15 business days." },
      design: { primaryColor: "#ea580c", secondaryColor: "#fff7ed", textColor: "#18181b", fontFamily: "Inter", invoiceSize: "A4", invoiceFormat: "Supermarket" }
    }
  },
  {
    userId,
    name: "Eco / Natural Produce Bill",
    description: "Muted forest green and organic cream canvas for sustainable, farm, and eco supplies.",
    status: "active",
    isDefault: false,
    config: {
      header: { showLogo: true, logoUrl: "", headerTitle: "ORGANIC INWARD RECEIPT", showCompanyName: true, showAddress: true, showPhone: true },
      supplier: { showName: true, showPhone: true, showGSTIN: true, showState: true },
      customer: { showName: true, showPhone: true, showGSTIN: true, showType: true },
      items: {
        columns: ["item", "hsn", "quantity", "unit", "rate", "tax", "amount"],
        labels: { item: "Produce / Supply Item", hsn: "Code", quantity: "Qty", unit: "Unit", rate: "Price", tax: "Tax", amount: "Amount" }
      },
      tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTotalTax: true },
      payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
      notes: { show: true, label: "Quality Audit", defaultText: "Quality inspected according to organic procurement standards." },
      terms: { show: true, label: "Payment Terms", defaultText: "Prompt settlement for agricultural and direct produce." },
      design: { primaryColor: "#2d5a43", secondaryColor: "#fbf9f4", textColor: "#1f2923", fontFamily: "Open Sans, Inter, sans-serif", invoiceSize: "A4", invoiceFormat: "Supermarket" }
    }
  },
  {
    userId,
    name: "Modern Indigo Procurement",
    description: "Clean modern layout with indigo header banner for corporate accounts and vendor invoices.",
    status: "active",
    isDefault: false,
    config: {
      header: { showLogo: true, logoUrl: "", headerTitle: "ENTERPRISE PURCHASE INVOICE", showCompanyName: true, showAddress: true, showPhone: true },
      supplier: { showName: true, showPhone: true, showGSTIN: true, showState: true },
      customer: { showName: true, showPhone: true, showGSTIN: true, showType: true },
      items: {
        columns: ["item", "hsn", "quantity", "unit", "rate", "tax", "amount"],
        labels: { item: "Item Description", hsn: "HSN/SAC", quantity: "Qty", unit: "Unit", rate: "Unit Price", tax: "Tax", amount: "Total" }
      },
      tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTotalTax: true },
      payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
      notes: { show: true, label: "Procurement Notes", defaultText: "Enterprise procurement order verified." },
      terms: { show: true, label: "Payment Terms", defaultText: "Payment within 30 days of invoice receipt." },
      design: { primaryColor: "#4f46e5", secondaryColor: "#f8fafc", textColor: "#0f172a", fontFamily: "Inter", invoiceSize: "A4", invoiceFormat: "Wholesale" }
    }
  }
];

// Helper to reliably find or instantiate a template by ObjectId, key, or name
const findTemplateByIdOrKey = async (rawId, userId) => {
  let template = null;
  if (rawId && mongoose.Types.ObjectId.isValid(rawId)) {
    template = await PurchaseInvoiceTemplate.findOne({ _id: rawId, userId });
  }

  if (!template) {
    const cleanKey = String(rawId || "").replace(/^tpl-/, "").toLowerCase();
    template = await PurchaseInvoiceTemplate.findOne({
      userId,
      $or: [
        { name: new RegExp(`^${cleanKey.replace(/-/g, " ")}$`, "i") },
        { name: new RegExp(cleanKey.replace(/-/g, " "), "i") },
        { "config.design.invoiceFormat": new RegExp(`^${cleanKey}$`, "i") }
      ]
    });
  }

  if (!template) {
    const defaults = defaultPurchaseTemplates(userId);
    const cleanKey = String(rawId || "").replace(/^tpl-/, "").toLowerCase();
    const defaultMatch = defaults.find(d => 
      d.name.toLowerCase().includes(cleanKey.replace(/-/g, " ")) ||
      cleanKey.split("-").some(w => w.length > 3 && d.name.toLowerCase().includes(w)) ||
      d.config.design?.invoiceFormat?.toLowerCase() === cleanKey
    );
    if (defaultMatch) {
      // Create and persist it into the database so it's permanently stored with a real _id
      template = new PurchaseInvoiceTemplate(defaultMatch);
      await template.save();
    }
  }

  return template;
};

// GET /api/purchase-templates - Get all purchase templates for user (auto-seed system defaults if missing)
router.get("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    let templates = await PurchaseInvoiceTemplate.find({ userId }).sort({ createdAt: 1 });
    const defaults = defaultPurchaseTemplates(userId);

    // Auto-seed defaults if user has no templates yet
    if (templates.length === 0) {
      for (const t of defaults) {
        const created = new PurchaseInvoiceTemplate(t);
        await created.save();
      }
      templates = await PurchaseInvoiceTemplate.find({ userId }).sort({ createdAt: 1 });
    } else {
      // Auto-seed any missing standard templates for existing users
      const existingNames = new Set(templates.map(t => t.name.toLowerCase()));
      const missing = defaults.filter(dt => !existingNames.has(dt.name.toLowerCase()));
      if (missing.length > 0) {
        for (const t of missing) {
          const created = new PurchaseInvoiceTemplate({ ...t, isDefault: false });
          await created.save();
        }
        templates = await PurchaseInvoiceTemplate.find({ userId }).sort({ createdAt: 1 });
      }
    }

    res.json({ success: true, data: templates });
  } catch (error) {
    console.error("Error fetching purchase templates:", error);
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
});

// GET /api/purchase-templates/:id - Get single purchase template by ID
router.get("/:id", verifyToken, async (req, res) => {
  const userId = req.user.id || req.user._id;
  const rawId = req.params.id;
  try {
    const template = await findTemplateByIdOrKey(rawId, userId);

    if (!template) {
      return res.status(404).json({ success: false, error: { code: "TEMPLATE_NOT_FOUND", message: "Purchase template not found" } });
    }
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
});

// POST /api/purchase-templates - Create custom purchase template
router.post("/", verifyToken, async (req, res) => {
  const { name, description, config, status } = req.body;
  const userId = req.user.id || req.user._id;

  if (!name || name.trim() === "") {
    return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Purchase template name is required" } });
  }

  try {
    const existing = await PurchaseInvoiceTemplate.findOne({ userId, name: name.trim() });
    if (existing) {
      return res.status(400).json({ success: false, error: { code: "DUPLICATE_NAME", message: "A purchase template with this name already exists." } });
    }

    const count = await PurchaseInvoiceTemplate.countDocuments({ userId });
    const isDefault = count === 0 ? true : false;

    const template = new PurchaseInvoiceTemplate({
      userId,
      name: name.trim(),
      description: description || "",
      status: status || "active",
      isDefault,
      config: config || {}
    });

    await template.save();
    res.status(201).json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
});

// PUT /api/purchase-templates/:id - Update purchase template config
router.put("/:id", verifyToken, async (req, res) => {
  const { name, description, config, status } = req.body;
  const userId = req.user.id || req.user._id;

  try {
    const template = await findTemplateByIdOrKey(req.params.id, userId);
    if (!template) {
      return res.status(404).json({ success: false, error: { code: "TEMPLATE_NOT_FOUND", message: "Purchase template not found" } });
    }

    if (name && name.trim() !== template.name) {
      const existing = await PurchaseInvoiceTemplate.findOne({ userId, name: name.trim() });
      if (existing && String(existing._id) !== String(template._id)) {
        return res.status(400).json({ success: false, error: { code: "DUPLICATE_NAME", message: "A purchase template with this name already exists." } });
      }
      template.name = name.trim();
    }

    if (description !== undefined) template.description = description;
    if (status !== undefined) template.status = status;
    if (config) template.config = config;

    await template.save();
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
});

// DELETE /api/purchase-templates/:id - Delete purchase template
router.delete("/:id", verifyToken, async (req, res) => {
  const userId = req.user.id || req.user._id;
  try {
    const template = await findTemplateByIdOrKey(req.params.id, userId);
    if (!template) {
      return res.status(404).json({ success: false, error: { code: "TEMPLATE_NOT_FOUND", message: "Purchase template not found" } });
    }

    if (template.isDefault) {
      const count = await PurchaseInvoiceTemplate.countDocuments({ userId });
      if (count > 1) {
        return res.status(400).json({ success: false, error: { code: "DELETE_DEFAULT_FAILED", message: "Cannot delete default purchase template. Set another as default first." } });
      }
    }

    await PurchaseInvoiceTemplate.deleteOne({ _id: template._id });
    res.json({ success: true, message: "Purchase template deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
});

// POST /api/purchase-templates/:id/duplicate - Duplicate purchase template
router.post("/:id/duplicate", verifyToken, async (req, res) => {
  const userId = req.user.id || req.user._id;
  try {
    const template = await findTemplateByIdOrKey(req.params.id, userId);
    if (!template) {
      return res.status(404).json({ success: false, error: { code: "TEMPLATE_NOT_FOUND", message: "Purchase template not found" } });
    }

    let newName = `${template.name} Copy`;
    let isUnique = false;
    let index = 1;
    while (!isUnique) {
      const existing = await PurchaseInvoiceTemplate.findOne({ userId, name: newName });
      if (!existing) {
        isUnique = true;
      } else {
        newName = `${template.name} Copy (${index++})`;
      }
    }

    const duplicate = new PurchaseInvoiceTemplate({
      userId,
      name: newName,
      description: `Copy of ${template.name}`,
      status: "active",
      isDefault: false,
      config: template.config
    });

    await duplicate.save();
    res.status(201).json({ success: true, data: duplicate });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
});

// POST /api/purchase-templates/:id/set-default - Set default purchase template
router.post("/:id/set-default", verifyToken, async (req, res) => {
  const userId = req.user.id || req.user._id;
  try {
    const template = await findTemplateByIdOrKey(req.params.id, userId);
    if (!template) {
      return res.status(404).json({ success: false, error: { code: "TEMPLATE_NOT_FOUND", message: "Purchase template not found" } });
    }

    await PurchaseInvoiceTemplate.updateMany({ userId }, { isDefault: false });
    template.isDefault = true;
    await template.save();

    res.json({ success: true, message: "Default purchase template updated successfully", data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
});

export default router;
