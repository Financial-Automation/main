import express from "express";
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ success: false, error: { code: "INVALID_TOKEN", message: "Invalid token" } });
  }
};

// Default Purchase Templates for auto-seeding
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
  }
];

// GET /api/purchase-templates - Get all purchase templates for user
router.get("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    let templates = await PurchaseInvoiceTemplate.find({ userId }).sort({ createdAt: -1 });

    // Auto-seed defaults if user has no templates yet
    if (templates.length === 0) {
      const defaults = defaultPurchaseTemplates(userId);
      for (const t of defaults) {
        const created = new PurchaseInvoiceTemplate(t);
        await created.save();
      }
      templates = await PurchaseInvoiceTemplate.find({ userId }).sort({ createdAt: -1 });
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
  try {
    const template = await PurchaseInvoiceTemplate.findOne({ _id: req.params.id, userId });
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
    const template = await PurchaseInvoiceTemplate.findOne({ _id: req.params.id, userId });
    if (!template) {
      return res.status(404).json({ success: false, error: { code: "TEMPLATE_NOT_FOUND", message: "Purchase template not found" } });
    }

    if (name && name.trim() !== template.name) {
      const existing = await PurchaseInvoiceTemplate.findOne({ userId, name: name.trim() });
      if (existing) {
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
    const template = await PurchaseInvoiceTemplate.findOne({ _id: req.params.id, userId });
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
    const template = await PurchaseInvoiceTemplate.findOne({ _id: req.params.id, userId });
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
    const template = await PurchaseInvoiceTemplate.findOne({ _id: req.params.id, userId });
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
