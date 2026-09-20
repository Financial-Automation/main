import express from "express";
import jwt from "jsonwebtoken";
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

// GET /api/invoice-templates - Get all templates for the user
router.get("/", verifyToken, async (req, res) => {
  try {
    const templates = await InvoiceTemplate.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
});

// GET /api/invoice-templates/:id - Get a specific template
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const template = await InvoiceTemplate.findOne({ _id: req.id || req.params.id, userId: req.user.id });
    if (!template) {
      return res.status(404).json({ success: false, error: { code: "TEMPLATE_NOT_FOUND", message: "Invoice template not found" } });
    }
    res.json({ success: true, data: template });
  } catch (error) {
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

  try {
    const template = await InvoiceTemplate.findOne({ _id: req.params.id, userId: req.user.id });
    if (!template) {
      return res.status(404).json({ success: false, error: { code: "TEMPLATE_NOT_FOUND", message: "Invoice template not found" } });
    }

    if (name && name.trim() !== template.name) {
      const existing = await InvoiceTemplate.findOne({ userId: req.user.id, name: name.trim() });
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
    res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: error.message } });
  }
});

// DELETE /api/invoice-templates/:id - Delete template and versions
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const template = await InvoiceTemplate.findOne({ _id: req.params.id, userId: req.user.id });
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
  try {
    const template = await InvoiceTemplate.findOne({ _id: req.params.id, userId: req.user.id });
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
  try {
    const template = await InvoiceTemplate.findOne({ _id: req.params.id, userId: req.user.id });
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
  try {
    const template = await InvoiceTemplate.findOne({ _id: req.params.id, userId: req.user.id });
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
  try {
    const template = await InvoiceTemplate.findOne({ _id: req.params.id, userId: req.user.id });
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
