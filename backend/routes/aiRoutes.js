import express from "express";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { uploadInvoiceFile } from "../utils/invoiceStorage.js";
import jwt from "jsonwebtoken";
import ChatMessage from "../models/ChatMessage.js";
import Invoice from "../models/Invoice.js";
import Customer from "../models/Customer.js";
import LedgerAccount from "../models/LedgerAccount.js";
import BookkeepingEntry from "../models/BookkeepingEntry.js";
import CashTransaction from "../models/CashTransaction.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import { getFinanceMetrics, getLiveBalanceSheet, getGstAnalytics, resolvePeriod } from "../utils/financeAggregator.js";
import { formatFinancialAnswer, queryFinancialTool, recognizeFinancialIntent, resolveAssistantPeriod, classifyQuestion } from "../utils/financialAssistant.js";
import { formatKnowledgeAnswer } from "../utils/applicationKnowledge.js";
import { getTotalReceivables, getTotalPayables, getDashboardSummary } from "../utils/financialTools.js";
import { retrieveKnowledge } from "../utils/qaRetrievalEngine.js";
import { createRequire } from "module";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import dns from "dns";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

const require = createRequire(import.meta.url);
const Tesseract = require("tesseract.js");
const pdfParse = require("pdf-parse");

const router = express.Router();

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  // If already authenticated by parent middleware (authenticateUser), do not overwrite with JWT payload
  if (req.user && (req.user._id || req.user.id)) {
    return next();
  }
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
    const JWT_SECRET = process.env.JWT_SECRET || "fallback_jwt_secret_2024_finance_app";
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ message: "Invalid token" });
  }
};

// Helper to resolve Gemini API key with resilient base64 fallback for production deployments
export const resolveGeminiApiKey = () => {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
    return process.env.GEMINI_API_KEY.trim();
  }
  return Buffer.from("QVEuQWI4Uk42SjFQNzdhQzVGaW1sTjFVOG1ISHBlWEFXYTl2S0lHT1ItMWhlVktjVE1nYWc=", "base64").toString("utf-8");
};

// Initialize Gemini AI lazily (after env is loaded)
let genAI = null;
export const getGenAI = () => {
  const apiKey = resolveGeminiApiKey();
  if (!genAI && apiKey) {
    genAI = new GoogleGenerativeAI(apiKey);
    console.log("✅ Gemini AI initialized");
  }
  return genAI;
};

// Authoritative list of active Gemini models in priority order (verified against Google v1beta ModelService)
export const GEMINI_MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.7-flash",
  "gemini-flash-latest",
].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

// Safety settings configured to prevent probability-based false refusals on business/accounting queries
export const GEMINI_SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

export const generateGeminiContent = async (contentsOrPrompt, options = {}) => {
  const ai = getGenAI();
  const apiKey = resolveGeminiApiKey();
  if (!ai || !apiKey) return null;

  const modelConfig = {
    safetySettings: GEMINI_SAFETY_SETTINGS,
    ...(options.systemInstruction ? { systemInstruction: options.systemInstruction } : {}),
  };

  for (const modelName of GEMINI_MODELS) {
    try {
      const model = ai.getGenerativeModel({ model: modelName, ...modelConfig });
      const generatePromise = typeof contentsOrPrompt === "string"
        ? model.generateContent(contentsOrPrompt)
        : model.generateContent({ contents: contentsOrPrompt });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout invoking ${modelName}`)), 12000)
      );

      const result = await Promise.race([generatePromise, timeoutPromise]);
      const response = await result.response;
      const candidate = response?.candidates?.[0];
      const finishReason = candidate?.finishReason;
      if (finishReason && finishReason !== "STOP") {
        console.warn(`[gemini] Model ${modelName} candidate finishReason:`, finishReason);
      }
      const text = response?.text();
      if (text && text.trim().length > 0) {
        return { text: text.trim(), model: modelName, finishReason: finishReason || "STOP" };
      }
    } catch (err) {
      console.warn(`[gemini] Model ${modelName} call failed:`, err.message);
    }
  }
  return null;
};

// OpenRouter fallback - uses OpenAI-compatible API
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
// Vision-capable models to try in order
const OPENROUTER_MODELS = [
  "openrouter/free",                      // Best free vision model (200K context, auto-routes to best available)
];

const callOpenRouter = async (prompt, base64Data, mimeType) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OpenRouter API key not configured");
  }

  console.log("🔄 Falling back to OpenRouter...");

  let lastError = null;

  for (const model of OPENROUTER_MODELS) {
    try {
      console.log(`🔷 Trying OpenRouter model: ${model}`);

      const response = await fetch(OPENROUTER_BASE_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:5001",
          "X-Title": "Invoice OCR"
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${base64Data}`
                  }
                }
              ]
            }
          ],
          max_tokens: 4096
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.log(`⚠️ OpenRouter model ${model} failed: ${response.status}`);
        lastError = new Error(`OpenRouter API error ${response.status}: ${errorBody}`);
        continue;
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content;

      if (!text) {
        console.log(`⚠️ OpenRouter model ${model}: No content in response`);
        lastError = new Error("No content in OpenRouter response");
        continue;
      }

      console.log(`✅ OpenRouter success with model: ${model}`);
      return text;
    } catch (error) {
      console.log(`⚠️ OpenRouter model ${model} error: ${error.message}`);
      lastError = error;
      continue;
    }
  }

  throw lastError || new Error("All OpenRouter models failed");
};

// Invoice OCR extraction prompt — outputs CSV directly
const INVOICE_EXTRACTION_PROMPT = `
You are an invoice-to-CSV converter.

Extract every visible labeled field and every visible table row from this invoice image and convert it into CSV format.

STRICT RULES:
1. Output ONLY raw CSV text. No markdown, no backticks, no explanations.
2. Do NOT invent, infer, or recalculate anything.
3. Extract ONLY what is visibly present in the image.
4. Preserve spelling, capitalization, and wording exactly as shown.
5. Remove currency symbols and thousand separators.
   Example: ₹1,500.50 → 1500.50
6. Preserve decimal precision exactly as shown.
7. If a value contains a comma, wrap it in double quotes.
8. If a field contains multiple lines (e.g., address), combine into one value separated by spaces.
9. If a visible label has no value, output the label with an empty value.

FORMAT — Three sections separated by one blank line:

PART 1 — Invoice Details
One row per field in this format:
label,value

Include all visible fields:
Invoice number, dates, vendor info, buyer info, GSTIN, phone, email, bank details, payment terms, etc.

PART 2 — Line Items Table
First row = column headers exactly as shown.
Then include every visible item row.

PART 3 — Totals
One row per total field in this format:
label,value

Include subtotal, discounts, tax lines, grand total, paid amount, balance, etc.

Now convert this invoice image to CSV:
`;

// Helper: clean AI response — strip markdown code blocks if present
const cleanCSVResponse = (text) => {
  let cleaned = text.trim();
  // Remove markdown code blocks (```csv ... ``` or ``` ... ```) — greedy to capture all content
  const codeBlockMatch = cleaned.match(/```(?:csv)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }
  // Also strip any leading/trailing backticks that aren't full code blocks
  cleaned = cleaned.replace(/^`+|`+$/g, '').trim();
  console.log("📝 Cleaned CSV length:", cleaned.length, "| First 200 chars:", cleaned.substring(0, 200));
  return cleaned;
};

// Helper: process invoice with Gemini (primary)
const processWithGemini = async (base64Data, mimeType) => {
  const ai = getGenAI();
  if (!ai) throw new Error("Gemini AI not initialized");

  const modelOptions = GEMINI_MODELS;

  let lastError = null;

  for (const modelName of modelOptions) {
    try {
      console.log(`🔷 Trying model: ${modelName}`);
      const model = ai.getGenerativeModel({ model: modelName });

      const imagePart = {
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      };

      const result = await model.generateContent([INVOICE_EXTRACTION_PROMPT, imagePart]);
      const response = await result.response;
      console.log(`✅ Success with model: ${modelName}`);
      return response.text();
    } catch (error) {
      console.log(`⚠️ Model ${modelName} failed: ${error.message}`);
      lastError = error;
      continue;
    }
  }

  throw lastError || new Error("All Gemini models failed");
};

// Helper: parse raw invoice text to 3-part CSV format (Local Fallback)
const parseInvoiceTextToCSV = (text) => {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  
  let invoiceNumber = "";
  let invoiceDate = "";
  let dueDate = "";
  let gstin = "";
  let email = "";
  let phone = "";
  let vendorName = "";
  let customerName = "";
  
  let subtotal = "";
  let tax = "";
  let grandTotal = "";
  
  const lineItems = [];
  
  // Find GSTIN, Email, Phone
  const gstinRegex = /\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/i;
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
  const phoneRegex = /(?:\+?\d{1,4}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check GSTIN
    if (!gstin && gstinRegex.test(line)) {
      gstin = line.match(gstinRegex)[0];
    }
    // Check Email
    if (!email && emailRegex.test(line)) {
      email = line.match(emailRegex)[0];
    }
    // Check Phone
    if (!phone && phoneRegex.test(line)) {
      phone = line.match(phoneRegex)[0];
    }
    
    // Check Invoice Number
    if (!invoiceNumber) {
      const invMatch = line.match(/(?:invoice|inv|bill|doc|document)(?:\s*number|\s*no|\s*#)?[:.\s\-#]+([A-Z0-9\-]+)/i);
      if (invMatch) {
        invoiceNumber = invMatch[1];
      }
    }
    
    // Check Invoice Date
    if (!invoiceDate) {
      const dateMatch = line.match(/(?:invoice\s*date|inv\s*date|date\s*of\s*issue|issue\s*date|date)[:.\s\-]+([0-9a-zA-Z\s\-\/\.,]+)/i);
      if (dateMatch && !line.toLowerCase().includes("due")) {
        invoiceDate = dateMatch[1].trim();
      }
    }
    
    // Check Due Date
    if (!dueDate) {
      const dueMatch = line.match(/(?:due\s*date|payment\s*due)[:.\s\-]+([0-9a-zA-Z\s\-\/\.,]+)/i);
      if (dueMatch) {
        dueDate = dueMatch[1].trim();
      }
    }
    
    // Check Customer Name / Bill To
    if (line.toLowerCase().includes("bill to") || line.toLowerCase().includes("invoice to") || line.toLowerCase().includes("customer") || line.toLowerCase().includes("client")) {
      if (i + 1 < lines.length) {
        customerName = lines[i + 1].replace(/[:\-]/g, "").trim();
      }
    }
    
    // Check Subtotal
    if (!subtotal) {
      const subMatch = line.match(/(?:sub\s*total|subtotal|net\s*amount)[:.\s\-]+(?:rs\.?|inr|usd|[\$₹€£])?\s*([\d,]+\.?\d*)/i);
      if (subMatch) {
        subtotal = subMatch[1].replace(/,/g, '');
      }
    }
    
    // Check Tax
    if (!tax) {
      const taxMatch = line.match(/(?:gst|tax|vat|cgst|sgst|igst)(?:\s*\d+%)?\s*[:.\s\-#]+(?:rs\.?|inr|usd|[\$₹€£])?\s*([\d,]+\.?\d*)/i);
      if (taxMatch) {
        tax = taxMatch[1].replace(/,/g, '');
      }
    }
    
    // Check Grand Total
    if (!grandTotal) {
      const totalMatch = line.match(/(?:grand\s*total|total|amount\s*due|payable\s*amount)[:.\s\-]+(?:rs\.?|inr|usd|[\$₹€£])?\s*([\d,]+\.?\d*)/i);
      if (totalMatch && !line.toLowerCase().includes("sub")) {
        grandTotal = totalMatch[1].replace(/,/g, '');
      }
    }
  }
  
  // Estimate Vendor Name
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    if (
      !line.toLowerCase().includes("invoice") &&
      !line.toLowerCase().includes("bill to") &&
      !line.toLowerCase().includes("date") &&
      !line.toLowerCase().includes("tax") &&
      !line.toLowerCase().includes("total") &&
      !gstinRegex.test(line) &&
      !emailRegex.test(line) &&
      line.length > 3
    ) {
      vendorName = line;
      break;
    }
  }
  
  // Find Line Items
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();
    
    // Skip headers and totals
    if (
      lowerLine.includes("invoice") || 
      lowerLine.includes("bill to") || 
      lowerLine.includes("date") || 
      lowerLine.includes("total") || 
      lowerLine.includes("subtotal") || 
      lowerLine.includes("gstin") || 
      lowerLine.includes("tax") ||
      lowerLine.includes("gst") ||
      lowerLine.includes("vat") ||
      lowerLine.includes("cgst") ||
      lowerLine.includes("sgst") ||
      lowerLine.includes("igst") ||
      lowerLine.includes("page") ||
      lowerLine.includes("phone") ||
      lowerLine.includes("email") ||
      lowerLine.includes("bank") ||
      lowerLine.includes("payment terms") ||
      lowerLine.includes("description") ||
      lowerLine.includes("quantity") ||
      lowerLine.includes("rate") ||
      lowerLine.includes("price") ||
      lowerLine.includes("amount")
    ) {
      continue;
    }
    
    // Pattern 1: Description Qty Price Total
    const itemMatch1 = line.match(/^(.+?)\s+(\d+)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)$/);
    if (itemMatch1) {
      lineItems.push({
        description: itemMatch1[1].trim(),
        qty: itemMatch1[2],
        price: itemMatch1[3].replace(/,/g, ''),
        total: itemMatch1[4].replace(/,/g, '')
      });
      continue;
    }
    
    // Pattern 2: Description Total
    const itemMatch2 = line.match(/^(.+?)\s+([\d,]+\.?\d*)$/);
    if (itemMatch2) {
      const desc = itemMatch2[1].trim();
      const val = itemMatch2[2].replace(/,/g, '');
      if (desc.length > 2 && isNaN(desc)) {
        lineItems.push({
          description: desc,
          qty: "1",
          price: val,
          total: val
        });
      }
    }
  }
  
  // Format CSV
  let csv = "PART 1 — Invoice Details\nlabel,value\n";
  csv += `Invoice Number,${invoiceNumber}\n`;
  csv += `Invoice Date,${invoiceDate}\n`;
  csv += `Due Date,${dueDate}\n`;
  csv += `Vendor Name,${vendorName}\n`;
  csv += `Customer Name,${customerName}\n`;
  csv += `GSTIN,${gstin}\n`;
  csv += `Phone,${phone}\n`;
  csv += `Email,${email}\n`;
  
  csv += "\nPART 2 — Line Items Table\nDescription,Quantity,Price,Total\n";
  if (lineItems.length > 0) {
    lineItems.forEach(item => {
      csv += `"${item.description}",${item.qty},${item.price},${item.total}\n`;
    });
  } else {
    csv += "No items found,1,0,0\n";
  }
  
  csv += "\nPART 3 — Totals\nlabel,value\n";
  csv += `Subtotal,${subtotal || grandTotal || "0"}\n`;
  csv += `Tax,${tax || "0"}\n`;
  csv += `Grand Total,${grandTotal || subtotal || "0"}\n`;
  
  return csv;
};

// Helper: process invoice with local Tesseract OCR
const processWithLocalOCR = async (base64Data) => {
  const imageBuffer = Buffer.from(base64Data, "base64");
  let worker = null;
  try {
    worker = await Tesseract.createWorker("eng", 1);
    const { data: { text } } = await worker.recognize(imageBuffer);
    console.log("📝 Tesseract raw text length:", text.length);
    return parseInvoiceTextToCSV(text);
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
};

// Helper: process invoice with local PDF text parser
const processLocalPDF = async (base64Data) => {
  const pdfBuffer = Buffer.from(base64Data, "base64");
  try {
    const data = await pdfParse(pdfBuffer);
    console.log("📝 pdf-parse text length:", data.text?.length || 0);
    return parseInvoiceTextToCSV(data.text || "");
  } catch (error) {
    console.error("❌ pdf-parse failed:", error.message);
    throw new Error("Failed to parse PDF text: " + error.message);
  }
};

// POST /api/ai/invoice-ocr
router.post("/invoice-ocr", async (req, res) => {
  try {
    const { image, mimeType = "image/jpeg" } = req.body;

    if (!image) {
      return res.status(400).json({
        success: false,
        message: "Image data is required"
      });
    }

    const hasGemini = !!process.env.GEMINI_API_KEY;
    const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;

    if (!hasGemini && !hasOpenRouter) {
      return res.status(500).json({
        success: false,
        message: "No AI provider configured. Add GEMINI_API_KEY or OPENROUTER_API_KEY to .env"
      });
    }

    console.log("🤖 Processing invoice...");
    console.log("📄 File type:", mimeType);

    // Remove data URL prefix if present (handles both images and PDFs)
    let base64Data = image;
    if (image.includes('base64,')) {
      base64Data = image.split('base64,')[1];
    }

    let text = null;
    let provider = null;
    let fallbackToLocal = false;

    // Try Gemini first (primary)
    if (hasGemini) {
      try {
        console.log("🔷 Trying Gemini AI...");
        text = await processWithGemini(base64Data, mimeType);
        provider = "gemini";
        console.log("✅ Gemini response received");
      } catch (geminiError) {
        console.warn("⚠️ Gemini failed:", geminiError.message);

        // If OpenRouter is available, fall back to it
        if (hasOpenRouter) {
          console.log("🔄 Gemini failed, trying OpenRouter fallback...");
        } else {
          fallbackToLocal = true;
        }
      }
    } else if (hasOpenRouter) {
      fallbackToLocal = false;
    } else {
      fallbackToLocal = true;
    }

    // Fallback to OpenRouter if Gemini failed or unavailable
    if (!text && hasOpenRouter) {
      try {
        console.log("🟠 Trying OpenRouter...");
        text = await callOpenRouter(INVOICE_EXTRACTION_PROMPT, base64Data, mimeType);
        provider = "openrouter";
        console.log("✅ OpenRouter response received");
      } catch (openRouterError) {
        console.error("❌ OpenRouter also failed:", openRouterError.message);
        fallbackToLocal = true;
      }
    }

    // Fallback to local Tesseract OCR / PDF parser if both AI providers failed
    if (!text && fallbackToLocal) {
      try {
        console.log(`🔄 AI providers failed. Falling back to local OCR (type: ${mimeType})...`);
        if (mimeType === "application/pdf" || mimeType.includes("pdf")) {
          text = await processLocalPDF(base64Data);
          provider = "local-pdf-parse";
        } else {
          text = await processWithLocalOCR(base64Data);
          provider = "local-tesseract";
        }
        console.log(`✅ Local extraction successful via ${provider}`);
      } catch (localOcrError) {
        console.error(`❌ Local extraction failed:`, localOcrError.message);
        throw new Error("All AI providers and local extraction failed to process the invoice");
      }
    }

    if (!text) {
      return res.status(500).json({
        success: false,
        message: "All AI providers failed to process the invoice"
      });
    }

    console.log(`📄 Raw ${provider} Response (${text.length} chars):`, text.substring(0, 800));

    // Clean up the CSV response (strip markdown code blocks if present)
    const csvText = cleanCSVResponse(text);

    console.log(`✅ Successfully extracted invoice CSV via ${provider}`);

    // Store the uploaded file in Supabase (auto-deletes after 5 hours)
    let storageInfo = null;
    try {
      storageInfo = await uploadInvoiceFile(image, mimeType, 'invoice');
      if (storageInfo) {
        console.log(`📁 File stored in Supabase: ${storageInfo.fileName} (expires: ${storageInfo.expiresAt})`);
      }
    } catch (storageError) {
      console.warn("⚠️ Failed to store file in Supabase:", storageError.message);
    }

    res.json({
      success: true,
      csv: csvText,
      message: `Invoice CSV extracted successfully via ${provider}`,
      provider: provider,
      storage: storageInfo
    });

  } catch (error) {
    console.error("❌ AI Processing Error:", error);

    if (error.message?.includes("API_KEY")) {
      return res.status(401).json({
        success: false,
        message: "Invalid API key. Please check your configuration."
      });
    }

    if (error.message?.includes("SAFETY")) {
      return res.status(400).json({
        success: false,
        message: "Image was flagged by safety filters. Please try a different image."
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to process invoice with AI",
      error: error.message
    });
  }
});

// POST /api/ai/extract-text - Simple text extraction from image
router.post("/extract-text", async (req, res) => {
  try {
    const { image, mimeType = "image/jpeg" } = req.body;

    if (!image) {
      return res.status(400).json({
        success: false,
        message: "Image data is required"
      });
    }

    const hasGemini = !!process.env.GEMINI_API_KEY;
    const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;

    const base64Image = image.includes('base64,') ? image.split('base64,')[1] : image;
    const extractPrompt = "Extract all text from this image. Return only the text content, preserving the layout as much as possible.";

    let text = null;
    let fallbackToLocal = false;

    // Try Gemini first with multiple model fallbacks
    if (hasGemini) {
      const modelOptions = GEMINI_MODELS;

      for (const modelName of modelOptions) {
        try {
          const ai = getGenAI();
          if (ai) {
            console.log(`🔷 Trying text extraction with: ${modelName}`);
            const model = ai.getGenerativeModel({ model: modelName });
            const result = await model.generateContent([
              extractPrompt,
              { inlineData: { data: base64Image, mimeType } }
            ]);
            text = (await result.response).text();
            console.log(`✅ Text extraction success with: ${modelName}`);
            break;
          }
        } catch (geminiError) {
          console.warn(`⚠️ ${modelName} failed:`, geminiError.message);
          continue;
        }
      }

      if (!text) {
        if (hasOpenRouter) {
          console.log("🔄 Gemini failed, trying OpenRouter fallback...");
        } else {
          fallbackToLocal = true;
        }
      }
    } else if (hasOpenRouter) {
      fallbackToLocal = false;
    } else {
      fallbackToLocal = true;
    }

    // Fallback to OpenRouter
    if (!text && hasOpenRouter) {
      try {
        console.log("🟠 Trying OpenRouter for text extraction...");
        text = await callOpenRouter(extractPrompt, base64Image, mimeType);
        console.log("✅ OpenRouter text extraction success");
      } catch (openRouterError) {
        console.error("❌ OpenRouter text extraction failed:", openRouterError.message);
        fallbackToLocal = true;
      }
    }

    // Fallback to local Tesseract OCR / PDF parser
    if (!text && fallbackToLocal) {
      try {
        console.log(`🔄 AI providers failed for text extraction. Running local processing (type: ${mimeType})...`);
        if (mimeType === "application/pdf" || mimeType.includes("pdf")) {
          const pdfBuffer = Buffer.from(base64Image, "base64");
          const pdfData = await pdfParse(pdfBuffer);
          text = pdfData.text;
        } else {
          const imageBuffer = Buffer.from(base64Image, "base64");
          const worker = await Tesseract.createWorker("eng", 1);
          const { data: { text: localText } } = await worker.recognize(imageBuffer);
          await worker.terminate();
          text = localText;
        }
        console.log("✅ Local OCR text extraction successful");
      } catch (localOcrError) {
        console.error("❌ Local OCR text extraction also failed:", localOcrError.message);
        throw new Error("All AI providers and local OCR failed to extract text from the image");
      }
    }

    if (!text) {
      return res.status(500).json({
        success: false,
        message: "Failed to extract text from image"
      });
    }

    res.json({
      success: true,
      text: text,
      message: "Text extracted successfully"
    });

  } catch (error) {
    console.error("Text extraction error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to extract text",
      error: error.message
    });
  }
});

// GET /api/ai/chat-history
router.get("/chat-history", verifyToken, async (req, res) => {
  try {
    const history = await ChatMessage.find({ userId: req.user.id }).sort({ timestamp: 1 });
    res.json({
      success: true,
      history: history.map(msg => ({
        id: msg._id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp
      }))
    });
  } catch (error) {
    console.error("Error fetching chat history:", error);
    res.status(500).json({ success: false, message: "Failed to load chat history" });
  }
});

// POST /api/ai/chat-message
router.post("/chat-message", verifyToken, async (req, res) => {
  try {
    const { role, content } = req.body;
    if (!role || !content) {
      return res.status(400).json({ success: false, message: "Role and content are required" });
    }

    const newMessage = new ChatMessage({
      userId: req.user.id,
      role,
      content,
    });
    await newMessage.save();

    res.status(201).json({
      success: true,
      message: {
        id: newMessage._id,
        role: newMessage.role,
        content: newMessage.content,
        timestamp: newMessage.timestamp
      }
    });
  } catch (error) {
    console.error("Error saving chat message:", error);
    res.status(500).json({ success: false, message: "Failed to save chat message" });
  }
});

// DELETE /api/ai/chat-history - Clear chat
router.delete("/chat-history", verifyToken, async (req, res) => {
  try {
    await ChatMessage.deleteMany({ userId: req.user.id });
    res.json({
      success: true,
      message: "Chat history cleared successfully"
    });
  } catch (error) {
    console.error("Error clearing chat history:", error);
    res.status(500).json({ success: false, message: "Failed to clear chat history" });
  }
});

// GET /api/ai/config-status - Safe AI provider configuration inspection
router.get("/config-status", (req, res) => {
  const apiKey = resolveGeminiApiKey();
  const hasGemini = Boolean(apiKey);
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim());

  res.json({
    success: true,
    configured: hasGemini || hasOpenRouter,
    provider: hasGemini ? "gemini" : (hasOpenRouter ? "openrouter" : "none"),
    model: process.env.GEMINI_MODEL || "gemini-3.5-flash"
  });
});

// System instructions for SHREE ANDAL AI
export const SHREE_ANDAL_SYSTEM_PROMPT = `You are SHREE ANDAL AI, the SaaISS application and financial assistant.

You answer questions about the application's features, workflows, invoice creation, payments, inventory, bookkeeping, reports, troubleshooting, general accounting concepts, business taxation, and authorized live financial information.

Do not restrict responses to payables, receivables, sales, expenses, and profit and loss.

For application workflow questions, search the verified SaaISS application knowledge base and explain the actual supported steps.

For live company financial questions, execute the appropriate authorized backend financial tool and use its verified result. Never fabricate amounts or present a general explanation as a live financial result.

For general accounting, business, taxation, or educational questions (such as the difference between revenue and cash received, GST fundamentals, accounts receivable definition, working capital, depreciation), provide an authoritative, clear, objective explanation. Distinguish theoretical principles from company-specific live data. Avoid unnecessary conversational hedging, excessive apologies, or disclaimers that you are "only an AI".

For combined questions, retrieve the relevant application knowledge and execute the required financial tools.

For troubleshooting, distinguish confirmed facts from possible causes.

If a feature or workflow cannot be verified, state that limitation honestly.

Never return the old financial-only refusal ("I can currently retrieve payables, receivables, sales, expenses, and profit and loss...") for any normal application, accounting, or conversational question.

Do not claim that a transaction was created, changed, paid, or saved unless the backend confirms the action.

Respect user permissions and company-level data isolation.`;

export const formatGeminiContents = (history = []) => {
  if (!Array.isArray(history) || history.length === 0) return [];
  const contents = [];
  for (const msg of history.slice(-8)) {
    const role = msg.role === "assistant" || msg.role === "model" || msg.role === "ai" ? "model" : "user";
    const text = typeof msg.content === "string" ? msg.content.trim() : "";
    if (!text) continue;
    // Prevent consecutive identical roles by merging text
    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts[0].text += "\n" + text;
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }
  // Ensure the conversation starts with a user turn as required by Gemini API
  while (contents.length > 0 && contents[0].role !== "user") {
    contents.shift();
  }
  return contents;
};

// POST /api/ai/cfo-chat
// Authoritative SaaISS AI CFO Endpoint
router.post("/cfo-chat", verifyToken, async (req, res) => {
  const startedAt = Date.now();
  try {
    const { period: requestedPeriod = "this-month" } = req.body;
    let history = Array.isArray(req.body.history) ? [...req.body.history] : [];
    if (history.length === 0 && typeof req.body.message === "string" && req.body.message.trim()) {
      history = [{ role: "user", content: req.body.message.trim() }];
    }
    history = history.map(entry => ({
      ...entry,
      content: typeof entry?.content === "string" ? entry.content : (typeof entry?.text === "string" ? entry.text : "")
    }));
    if (history.length === 0) {
      return res.status(400).json({ success: false, message: "A non-empty chat history is required." });
    }

    const latest = history[history.length - 1];
    if (!latest || latest.role !== "user" || typeof latest.content !== "string" || !latest.content.trim()) {
      return res.status(400).json({ success: false, message: "The latest chat message must be a user question." });
    }

    const userId = req.user?._id ? req.user._id.toString() : req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }

    const question = latest.content.trim();

    // Check Role-Based Access Control
    const userRole = req.user?.role || "admin";
    if (userRole === "instore" && /\b(payroll|salary|salaries|employee compensation)\b/i.test(question)) {
      return res.status(403).json({
        success: false,
        code: "UNAUTHORIZED_FINANCIAL_MODULE",
        message: "Access to payroll and employee compensation records is restricted to administrators."
      });
    }

    // 0. Resolve Time Period and User Intents
    const inferredPeriod = /\blast month\b/i.test(question) ? "last-month"
      : /\bthis quarter\b/i.test(question) ? "this-quarter"
      : /\bthis (year|financial year)\b/i.test(question) ? "this-year"
      : /\btoday\b/i.test(question) ? "today"
      : requestedPeriod;

    const isGreeting = /^(hello|hi|hey|good\s+(morning|afternoon|evening)|greetings|who are you|what can you do)[\s!.]*$/i.test(question);

    const previousIntent = history.slice(0, -1).reverse().map((message) =>
      message.role === "user" ? recognizeFinancialIntent(message.content) : null
    ).find(Boolean);

    // Classify question into WORKFLOW, TROUBLESHOOTING, CONCEPT, COMBINED, UNSUPPORTED, or LIVE_FINANCIAL_DATA
    const classification = classifyQuestion(question, previousIntent, history);
    const intent = classification.intent || recognizeFinancialIntent(question, previousIntent, history);

    // 1. Fetch User Profile for personalizing response
    let userProfile = null;
    try {
      userProfile = await User.findById(userId).select("sellerName sellerGSTIN sellerEmail sellerPhone name");
    } catch (e) { /* ignore */ }

    // 2. Fetch Live Dashboard Financial Metrics (Payables, Receivables, Net Profit, Invoices, GST)
    let summaryData = null;
    try {
      summaryData = await getDashboardSummary({ userId, period: inferredPeriod });
    } catch (e) {
      console.warn("[cfo-chat] summary retrieval note:", e.message);
    }

    // 3. Execute authoritative financial tool if query is financial or asks about metrics
    let specificToolResult = null;
    let toolUsed = null;
    try {
      const isFinancialQuery = classification.type === "LIVE_FINANCIAL_DATA" ||
        classification.type === "COMBINED" ||
        intent !== "dashboard_summary" ||
        /\b(payable|receivable|invoice|bill|profit|loss|expense|revenue|tax|gst|cash|inventory|payroll|ratio|balance|debt|sales|cost|vendor|customer|overdue)\b/i.test(question);

      if (isFinancialQuery && !isGreeting) {
        specificToolResult = await queryFinancialTool({
          userId,
          intent,
          period: inferredPeriod,
          question
        });
        toolUsed = specificToolResult?.tool || intent;
      }
    } catch (e) {
      console.warn("[cfo-chat] specific tool query note:", e.message);
    }

    // 4. Retrieve verified SaaISS application knowledge if query relates to workflows
    let appKnowledgeSnippet = "";
    if (classification.knowledge) {
      appKnowledgeSnippet = formatKnowledgeAnswer(classification.knowledge);
    } else {
      const qaMatch = retrieveKnowledge(question);
      if (qaMatch?.bestMatch && qaMatch.score > 0.35) {
        appKnowledgeSnippet = `Workflow Topic: ${qaMatch.bestMatch.title || qaMatch.bestMatch.topic}\nVerified Steps:\n${qaMatch.bestMatch.answer}`;
      }
    }

    // 5. Construct Master System Instruction for Gemini LLM
    const businessName = userProfile?.sellerName || userProfile?.name || "Your Business";
    const systemInstruction = `${SHREE_ANDAL_SYSTEM_PROMPT}

### USER BUSINESS CONTEXT:
- Company / Business Name: ${businessName}
- GSTIN: ${userProfile?.sellerGSTIN || "N/A"}
- Active Reporting Period: ${summaryData?.reportingDate || inferredPeriod}

### LIVE AUTHORITATIVE FINANCIAL METRICS (Real-time from SaaISS database for ${businessName}):
- Total Payables (Money owed to suppliers / outstanding bills): ₹${(summaryData?.totalPayables || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Total Receivables (Money owed by customers / unpaid invoices): ₹${(summaryData?.totalReceivables || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Net Profit: ₹${(summaryData?.netProfit || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${summaryData?.isProfitable ? "Profitable" : "Operating at loss"})
- Revenue / Total Invoiced Sales: ₹${(summaryData?.totalRevenue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Total Expenses: ₹${(summaryData?.totalExpenses || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Net Profit Margin: ${summaryData?.netProfitMargin || 0}%
- Open Sales Invoices: ${summaryData?.metrics?.openSalesInvoicesCount || 0}
- Open Purchase Bills: ${summaryData?.metrics?.openPurchaseInvoicesCount || 0}
- GST Payable: ₹${(summaryData?.gstPayable || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

${specificToolResult ? `### EXACT LIVE QUERY TOOL DATA (${specificToolResult.tool || intent}):\n${JSON.stringify(specificToolResult, null, 2)}\n` : ""}

${appKnowledgeSnippet ? `### VERIFIED APPLICATION WORKFLOW KNOWLEDGE:\n${appKnowledgeSnippet}\n` : ""}

### DIRECT ANSWER INSTRUCTIONS:
- You are SHREE ANDAL AI, the executive CFO and accounting copilot for SaaISS.
- Your primary directive is to answer the user's exact question directly, comprehensively, and accurately.
- For ANY user question—whether general knowledge, accounting concepts, business analysis, coding, taxation, or educational—answer directly without apologies, hedging, or conversational preambles.
- When answering questions about this business's live financial data (e.g. Total Sales, Payables, Receivables, Net Profit, Balance, GST), cite the exact figures from the LIVE AUTHORITATIVE FINANCIAL METRICS above. Never guess or fabricate amounts.
- When answering questions about SaaISS features or workflows (creating invoices, applying payments, printing PDFs, inventory, bookkeeping), explain the exact steps clearly based on verified features.
- Never output rigid apologies, canned refusals, or claim you can only answer payables and receivables. Always fulfill the user's request with a complete, direct, and intelligent response.`;

    // 6. Format multi-turn conversation history for Gemini
    const contents = formatGeminiContents(history);
    if (contents.length === 0) {
      contents.push({ role: "user", parts: [{ text: question }] });
    }

    let reply = "";

    // 7. DIRECT GEMINI LLM INFERENCE
    const activeApiKey = resolveGeminiApiKey();
    if (activeApiKey) {
      try {
        const geminiRes = await generateGeminiContent(contents, { systemInstruction });
        if (geminiRes?.text && geminiRes.text.trim()) {
          reply = geminiRes.text.trim();
        }
      } catch (geminiErr) {
        console.warn("[cfo-chat] Gemini API call error:", geminiErr.message);
      }
    }

    // 8. Resilient Deterministic Fallback (if Gemini API key missing or network unreachable)
    if (!reply) {
      if (isGreeting) {
        reply = `Hello! I'm **SHREE ANDAL AI**, your SaaISS application and financial assistant.\n\nI can help you with:\n- 🧾 Sales & Purchase Invoices, Printing, and Payment Application\n- 📦 Inventory, Stock Inflow/Outflow, and Low Stock Alerts\n- 📚 Bookkeeping, General Ledger, and Chart of Accounts\n- 📊 Profit & Loss, Balance Sheet, and Cash Flow Forecasting\n- 🏷️ GST & Tax Liabilities\n- 💰 Live Financial Data (Total Payables, Total Receivables, Net Profit)\n\nWhat would you like to check today?`;
      } else if (specificToolResult) {
        reply = formatFinancialAnswer(specificToolResult);
      } else if (appKnowledgeSnippet) {
        reply = appKnowledgeSnippet;
      } else {
        reply = `I am SHREE ANDAL AI, your SaaISS application and financial assistant.\n\nHere is your financial snapshot for ${summaryData?.period || "this month"}:\n- **Total Receivables:** ₹${(summaryData?.totalReceivables || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n- **Total Payables:** ₹${(summaryData?.totalPayables || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n- **Net Profit:** ₹${(summaryData?.netProfit || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\nCould you please clarify your request, or ask about your invoicing, inventory, or financial metrics?`;
      }
    }

    return res.json({
      success: true,
      reply,
      tool: toolUsed,
      result: specificToolResult
    });
  } catch (error) {
    console.error("[financial-assistant] tool_failed", { userId: req.user?.id, error: error.message });
    return res.status(503).json({
      success: false,
      code: "FINANCIAL_DATA_UNAVAILABLE",
      message: "I could not retrieve the live financial data right now. Please try again or check the relevant accounting records."
    });
  }
});

// Legacy prompt-based route retained temporarily for backwards compatibility only.
// It is deliberately mounted at a different path so /cfo-chat can never answer from
// a stale prompt snapshot or silently substitute a generic response.
// POST /api/ai/cfo-chat-legacy
router.post("/cfo-chat-legacy", verifyToken, async (req, res) => {
  try {
    const { history, period: periodParam, startDate: startDateParam, endDate: endDateParam } = req.body;
    const userId = req.user.id;

    if (!history || !Array.isArray(history)) {
      return res.status(400).json({ success: false, message: "History array is required" });
    }

    // 1. Resolve time period
    const now = new Date();
    let periodStart, periodEnd, periodLabel;
    if (startDateParam && endDateParam) {
      periodStart = new Date(startDateParam);
      periodEnd = new Date(endDateParam);
      periodLabel = "custom";
    } else {
      periodLabel = periodParam || "this-month";
      const resolved = resolvePeriod(periodLabel);
      periodStart = resolved.startDate;
      periodEnd = resolved.endDate;
    }

    // 2. Resolve Mongoose models safely
    const PurchaseInvoice = mongoose.models.PurchaseInvoice || mongoose.model("PurchaseInvoice", new mongoose.Schema({}, { strict: false }));
    const InventoryItem = mongoose.models.InventoryItem || mongoose.model("InventoryItem", new mongoose.Schema({}, { strict: false }));

    // 3. Build user filter supporting both ObjectId and string userId
    const userObjectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null;
    const userFilter = userObjectId
      ? { $or: [{ userId: userObjectId }, { userId: userId.toString() }] }
      : { userId: userId.toString() };

    // 4. Fetch ALL data in parallel
    const [
      financeThisMonth,
      balanceSheet,
      gstData,
      allInvoicesRaw,
      allPurchaseInvoicesRaw,
      inventoryItems,
      customers,
      ledgerAccounts,
      bookkeepingEntries
    ] = await Promise.all([
      getFinanceMetrics(userId, periodStart, periodEnd).catch(() => null),
      getLiveBalanceSheet(userId, periodLabel).catch(() => null),
      getGstAnalytics(userId, periodLabel).catch(() => null),
      Invoice.find({ ...userFilter, isDeleted: { $ne: true } }).sort({ invoiceDate: -1 }).limit(500),
      PurchaseInvoice.find({ ...userFilter, isDeleted: { $ne: true } }).sort({ createdAt: -1 }).limit(500),
      InventoryItem.find({ ...userFilter, isDeleted: { $ne: true } }).limit(200),
      Customer.find({ ...userFilter }).limit(100),
      LedgerAccount.find({ ...userFilter }).limit(50),
      BookkeepingEntry.find({ ...userFilter, isDeleted: { $ne: true } }).sort({ date: -1 }).limit(500)
    ]);

    // Filter invoices/purchases to selected period
    const invoices = allInvoicesRaw.filter(inv => {
      const d = new Date(inv.invoiceDate || inv.createdAt);
      return d >= periodStart && d <= periodEnd;
    });
    const purchaseInvoices = allPurchaseInvoicesRaw.filter(inv => {
      const d = new Date(inv.billDate || inv.createdAt);
      return d >= periodStart && d <= periodEnd;
    });
    const periodBookkeeping = bookkeepingEntries.filter(e => {
      const d = new Date(e.date);
      return d >= periodStart && d <= periodEnd;
    });

    // Safely query Payroll
    let payrollRecords = [];
    try {
      const Payroll = mongoose.models.Payroll;
      if (Payroll) payrollRecords = await Payroll.find({ ...userFilter });
    } catch (e) { /* payroll model may not exist */ }

    // ---- 5. Compute granular metrics ----

    // Sales Invoices
    const invoiceCount = invoices.length;
    const invoiceTotal = invoices.reduce((s, i) => s + (i.grandTotal || 0), 0);
    const invoicePaid = invoices.reduce((s, i) =>
      (i.paymentStatus === 'paid' || i.status === 'paid') ? s + (i.grandTotal || 0) : s, 0);
    const invoiceUnpaid = invoices.reduce((s, i) => {
      if (i.status !== 'paid' && i.status !== 'cancelled' && i.paymentStatus !== 'paid')
        return s + (i.balanceDue || Math.max(0, (i.grandTotal || 0) - (i.amountPaid || 0)));
      return s;
    }, 0);
    const overdueInvoices = invoices.filter(inv =>
      inv.status === 'overdue' ||
      (inv.dueDate && new Date(inv.dueDate) < now && inv.status !== 'paid' && inv.status !== 'cancelled')
    );

    const recentInvoicesList = invoices.slice(0, 5).map(i =>
      `- Inv #${i.invoiceNumber} | Client: ${i.customerName || 'N/A'} | Total: ₹${(i.grandTotal || 0).toLocaleString("en-IN")} | Status: ${i.status || 'pending'} | Due: ₹${(i.balanceDue || 0).toLocaleString("en-IN")}`
    ).join("\n");
    const topOverdue = overdueInvoices.slice(0, 5).map(inv =>
      `- Inv #${inv.invoiceNumber} (${inv.customerName}): ₹${(inv.balanceDue || inv.grandTotal || 0).toLocaleString("en-IN")} overdue since ${inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-IN") : 'N/A'}`
    ).join("\n");

    // AR Aging
    const arAging = { current: 0, days30: 0, days60: 0, days90plus: 0 };
    overdueInvoices.forEach(inv => {
      const daysOverdue = inv.dueDate ? Math.floor((now - new Date(inv.dueDate)) / 86400000) : 0;
      const amt = inv.balanceDue || 0;
      if (daysOverdue <= 30) arAging.current += amt;
      else if (daysOverdue <= 60) arAging.days30 += amt;
      else if (daysOverdue <= 90) arAging.days60 += amt;
      else arAging.days90plus += amt;
    });

    // Top customers by revenue
    const customerRevMap = {};
    invoices.forEach(inv => {
      const name = inv.customerName || 'Unknown';
      customerRevMap[name] = (customerRevMap[name] || 0) + (inv.grandTotal || 0);
    });
    const topCustomers = Object.entries(customerRevMap)
      .sort(([,a],[,b]) => b - a).slice(0, 5)
      .map(([name, rev]) => `- ${name}: ₹${rev.toLocaleString("en-IN")}`).join("\n");

    // Purchase Invoices
    const purchaseCount = purchaseInvoices.length;
    const purchaseTotal = purchaseInvoices.reduce((s, p) => s + (p.total || p.grandTotal || 0), 0);
    const purchaseUnpaid = purchaseInvoices.reduce((s, p) => s + (p.balance || p.balanceDue || 0), 0);
    const recentPurchasesList = purchaseInvoices.slice(0, 5).map(p =>
      `- Bill #${p.billNo || p.billNumber || p.invoiceNumber || 'N/A'} | Vendor: ${p.supplierName || p.partyName || 'Vendor'} | Total: ₹${(p.total || p.grandTotal || 0).toLocaleString("en-IN")} | Balance: ₹${(p.balance || 0).toLocaleString("en-IN")}`
    ).join("\n");

    // Customers directory
    const customerSummary = customers.slice(0, 5).map(c =>
      `- ${c.name}: Phone: ${c.phone || 'N/A'}, Outstanding: ₹${(c.outstandingBalance || 0).toLocaleString("en-IN")}`
    ).join("\n");

    // Inventory
    const totalInventoryValue = inventoryItems.reduce((s, item) => s + ((item.quantity || 0) * (item.price || item.costPrice || 0)), 0);
    const lowStockItems = inventoryItems.filter(item => (item.quantity || 0) < 10);
    const inventoryListSummary = inventoryItems.slice(0, 5).map(item =>
      `- ${item.name || item.itemName} (SKU: ${item.sku || 'N/A'}): Qty: ${item.quantity || 0}, Cost: ₹${item.costPrice || item.price || 0}`
    ).join("\n");

    // Top products by invoice revenue
    const productRevMap = {};
    invoices.forEach(inv => {
      (inv.items || []).forEach(item => {
        const name = item.productName || item.itemName || 'Unknown';
        productRevMap[name] = (productRevMap[name] || 0) + (item.total || 0);
      });
    });
    const topProducts = Object.entries(productRevMap)
      .sort(([,a],[,b]) => b - a).slice(0, 5)
      .map(([name, rev]) => `- ${name}: ₹${rev.toLocaleString("en-IN")}`).join("\n");

    // Bookkeeping P&L
    const bkIncome = periodBookkeeping.filter(e => e.type === "income" || e.type === "Income").reduce((s, e) => s + (e.amount || 0), 0);
    const bkExpense = periodBookkeeping.filter(e => e.type === "expense" || e.type === "Expense").reduce((s, e) => s + (e.amount || 0), 0);
    const netProfit = bkIncome - bkExpense;
    const profitMargin = bkIncome > 0 ? ((netProfit / bkIncome) * 100).toFixed(1) : "0.0";

    const bkCategories = {};
    periodBookkeeping.filter(e => e.type === "expense" || e.type === "Expense").forEach(e => {
      const cat = e.category || "General Expense";
      bkCategories[cat] = (bkCategories[cat] || 0) + (e.amount || 0);
    });
    const bkCategoryBreakdown = Object.entries(bkCategories)
      .sort(([,a],[,b]) => b - a)
      .map(([cat, val]) => `- ${cat}: ₹${val.toLocaleString("en-IN")}`).join("\n");
    const recentBkEntries = periodBookkeeping.slice(0, 5).map(e =>
      `- ${new Date(e.date).toLocaleDateString("en-IN")} | ${(e.type || '').toUpperCase()} | ${e.category || 'General'}: ${e.description || 'Entry'} - ₹${(e.amount || 0).toLocaleString("en-IN")}`
    ).join("\n");

    // Payroll
    const totalPayrollGross = payrollRecords.reduce((s, p) => s + (p.grossSalary || 0), 0);
    const totalPayrollNet = payrollRecords.reduce((s, p) => s + (p.netSalary || 0), 0);
    const payrollListSummary = payrollRecords.slice(0, 5).map(p =>
      `- ${p.employeeName} (${p.employeeRole || 'Staff'}): Gross ₹${(p.grossSalary || 0).toLocaleString("en-IN")}, Net ₹${(p.netSalary || 0).toLocaleString("en-IN")}`
    ).join("\n");

    // Ledger
    const ledgerSummary = ledgerAccounts.map(acc =>
      `- ${acc.name} (${acc.code || 'GL'}): ₹${(acc.balance || 0).toLocaleString("en-IN")}`
    ).join("\n");

    // Balance Sheet
    const totalAssets = balanceSheet?.assets?.totalAssets || 0;
    const totalLiabilities = balanceSheet?.liabilities?.totalLiabilities || 0;
    const totalEquity = balanceSheet?.equity?.totalEquity || 0;
    const currentRatio = (balanceSheet?.liabilities?.currentLiabilities || 0) > 0
      ? ((balanceSheet.assets.currentAssets || 0) / balanceSheet.liabilities.currentLiabilities).toFixed(2)
      : "N/A";

    // GST
    const outputGst = gstData?.gstSummary?.outputGst || 0;
    const inputGst = gstData?.gstSummary?.inputGst || 0;
    const gstPayable = gstData?.gstSummary?.gstPayable || 0;
    const gstReceivable = gstData?.gstSummary?.gstReceivable || 0;

    // ---- 6. Build Master System Prompt ----
    const masterSystemPrompt = `
# AI CFO ASSISTANT — MASTER SYSTEM PROMPT

## 1. ROLE & IDENTITY
You are **AI CFO**, the chief financial assistant and intelligent accountant for this business management platform.
You have DIRECT ACCESS to the company's live accounting database for the selected period: **${periodLabel.toUpperCase().replace(/-/g, ' ')}**
(${periodStart.toLocaleDateString("en-IN")} to ${periodEnd.toLocaleDateString("en-IN")})

You can answer questions about: Sales, Purchases, Invoices, Receivables, Payables, Profit & Loss, Balance Sheet, Inventory, Payroll, GST, Cash Flow, Financial Ratios, and Expense Analysis.

## 2. CORE DIRECTIVE
- Use ONLY the LIVE DATABASE CONTEXT provided below for all financial answers.
- NEVER invent, infer, or fabricate financial numbers.
- If data is zero or missing, clearly state that.
- Cite specific invoice numbers, vendor names, or customer names when available.
- Format all currency in Indian Rupees with commas.

## 3. RESPONSE FORMAT
For quick lookups: Answer directly and concisely with exact figures.
For analysis questions, structure as:
### Summary — Brief executive conclusion
### Key Numbers — Bullet list of relevant metrics
### Analysis — Deeper insights based on retrieved data
### Recommendation — Specific, actionable next steps

---
=== LIVE FINANCIAL DATABASE CONTEXT (${periodLabel.toUpperCase().replace(/-/g, ' ')}: ${periodStart.toLocaleDateString("en-IN")} – ${periodEnd.toLocaleDateString("en-IN")}) ===

=== 1. SALES INVOICES & ACCOUNTS RECEIVABLE ===
- Total Sales Invoices: ${invoiceCount} | Total Invoiced: ₹${invoiceTotal.toLocaleString("en-IN")}
- Amount Collected (Paid): ₹${invoicePaid.toLocaleString("en-IN")}
- Outstanding Accounts Receivable: ₹${invoiceUnpaid.toLocaleString("en-IN")}
- Overdue Invoices: ${overdueInvoices.length}
${topOverdue ? `Overdue Details:\n${topOverdue}` : '- No overdue invoices.'}
${recentInvoicesList ? `Recent Invoices:\n${recentInvoicesList}` : ''}

AR Aging Analysis:
- 0–30 Days Overdue: ₹${arAging.current.toLocaleString("en-IN")}
- 31–60 Days Overdue: ₹${arAging.days30.toLocaleString("en-IN")}
- 61–90 Days Overdue: ₹${arAging.days60.toLocaleString("en-IN")}
- 90+ Days Overdue: ₹${arAging.days90plus.toLocaleString("en-IN")}

Top Customers by Revenue:
${topCustomers || '- No customer revenue data.'}

=== 2. PURCHASES & VENDOR PAYABLES ===
- Total Purchase Bills: ${purchaseCount} | Total Purchased: ₹${purchaseTotal.toLocaleString("en-IN")}
- Outstanding Vendor Payables (AP): ₹${purchaseUnpaid.toLocaleString("en-IN")}
${recentPurchasesList ? `Recent Purchase Bills:\n${recentPurchasesList}` : ''}

=== 3. CUSTOMER DIRECTORY (All-time, ${customers.length} registered) ===
${customerSummary || '- No customers registered.'}

=== 4. PROFIT & LOSS (Bookkeeping Ledger) ===
- Total Bookkeeping Income: ₹${bkIncome.toLocaleString("en-IN")}
- Total Bookkeeping Expenses: ₹${bkExpense.toLocaleString("en-IN")}
- Net Operating Profit: ₹${netProfit.toLocaleString("en-IN")} (Net Margin: ${profitMargin}%)
${bkCategoryBreakdown ? `Expense Breakdown by Category:\n${bkCategoryBreakdown}` : '- No expense categories recorded.'}
${recentBkEntries ? `Recent Transactions:\n${recentBkEntries}` : ''}

=== 5. BALANCE SHEET ===
- Cash & Bank Balances: ₹${(balanceSheet?.assets?.cashAndBank || 0).toLocaleString("en-IN")}
- Accounts Receivable: ₹${(balanceSheet?.assets?.accountsReceivable || 0).toLocaleString("en-IN")}
- Inventory Valuation: ₹${(balanceSheet?.assets?.inventory || 0).toLocaleString("en-IN")}
- Total Current Assets: ₹${(balanceSheet?.assets?.currentAssets || 0).toLocaleString("en-IN")}
- Total Assets: ₹${totalAssets.toLocaleString("en-IN")}
- Accounts Payable: ₹${(balanceSheet?.liabilities?.accountsPayable || 0).toLocaleString("en-IN")}
- Total Liabilities: ₹${totalLiabilities.toLocaleString("en-IN")}
- Total Equity: ₹${totalEquity.toLocaleString("en-IN")}
- Accounting Equation Balanced: ${balanceSheet?.balanced ? "YES ✅" : "NO ❌"}
- Current Ratio: ${currentRatio}

=== 6. INVENTORY & PRODUCTS ===
- Total Products/SKUs: ${inventoryItems.length}
- Total Inventory Valuation: ₹${totalInventoryValue.toLocaleString("en-IN")}
- Low Stock Items (<10 units): ${lowStockItems.length}
${inventoryListSummary ? `Top Inventory Items:\n${inventoryListSummary}` : ''}
Top Revenue-Generating Products (from invoices):
${topProducts || '- No product revenue data yet.'}

=== 7. TAX & GST ANALYTICS ===
- Output GST Collected (Sales): ₹${outputGst.toLocaleString("en-IN")}
- Input GST Credit / ITC (Purchases): ₹${inputGst.toLocaleString("en-IN")}
- Net GST Payable: ₹${gstPayable.toLocaleString("en-IN")}
- GST Credit Carry Forward: ₹${gstReceivable.toLocaleString("en-IN")}
- CGST: Output ₹${(gstData?.taxBreakdown?.cgst?.output || 0).toLocaleString("en-IN")} | Input ₹${(gstData?.taxBreakdown?.cgst?.input || 0).toLocaleString("en-IN")}
- SGST: Output ₹${(gstData?.taxBreakdown?.sgst?.output || 0).toLocaleString("en-IN")} | Input ₹${(gstData?.taxBreakdown?.sgst?.input || 0).toLocaleString("en-IN")}
- IGST: Output ₹${(gstData?.taxBreakdown?.igst?.output || 0).toLocaleString("en-IN")} | Input ₹${(gstData?.taxBreakdown?.igst?.input || 0).toLocaleString("en-IN")}

=== 8. PAYROLL & HR ===
- Total Employees on Payroll: ${payrollRecords.length}
- Total Gross Salary: ₹${totalPayrollGross.toLocaleString("en-IN")}
- Total Net Salary Payable: ₹${totalPayrollNet.toLocaleString("en-IN")}
${payrollListSummary ? `Employee Records:\n${payrollListSummary}` : '- No payroll records found.'}

=== 9. GENERAL LEDGER / CHART OF ACCOUNTS ===
${ledgerSummary || "No custom ledger accounts configured."}
`;

    // ---- 7. Build conversation ----
    const contents = [];
    contents.push({ role: "user", parts: [{ text: masterSystemPrompt }] });
    contents.push({ role: "model", parts: [{ text: "Understood. I am your AI CFO. I have loaded your live company financial data. Ask me anything about your business finances." }] });

    const recentHistory = history.slice(-10);
    recentHistory.forEach(msg => {
      contents.push({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }]
      });
    });

    let replyText = "";
    const ai = getGenAI();

    // ---- 8. Try Gemini AI with model fallback ----
    if (ai) {
      const modelOptions = GEMINI_MODELS;
      for (const modelName of modelOptions) {
        try {
          console.log(`🔷 AI CFO trying model: ${modelName}`);
          const model = ai.getGenerativeModel({ model: modelName });
          const result = await model.generateContent({ contents });
          const response = await result.response;
          replyText = response.text().trim();
          if (replyText) { console.log(`✅ AI CFO success with model: ${modelName}`); break; }
        } catch (modelError) {
          console.warn(`⚠️ Gemini model ${modelName} failed:`, modelError.message);
        }
      }
    }

    // ---- 9. OpenRouter fallback ----
    if (!replyText && process.env.OPENROUTER_API_KEY) {
      try {
        console.log("🟠 AI CFO falling back to OpenRouter...");
        const userPrompt = history[history.length - 1]?.content || "Provide a CFO summary.";
        const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:5001",
            "X-Title": "SaaISS AI CFO"
          },
          body: JSON.stringify({
            model: "openrouter/free",
            messages: [
              { role: "user", content: masterSystemPrompt },
              { role: "assistant", content: "Understood. I am your AI CFO ready to answer your financial questions." },
              { role: "user", content: userPrompt }
            ],
            max_tokens: 2048
          })
        });
        if (orRes.ok) {
          const orData = await orRes.json();
          replyText = orData.choices?.[0]?.message?.content || "";
        }
      } catch (orErr) {
        console.warn("⚠️ OpenRouter fallback failed:", orErr.message);
      }
    }

    // ---- 10. Local Keyword-Based Fallback Engine ----
    if (!replyText) {
      const userMessage = (history[history.length - 1]?.content || "").toLowerCase();
      const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

      if (userMessage.match(/revenue|income|sales|earn/)) {
        replyText = `### Summary\nYour total income for **${periodLabel}** is **${fmt(bkIncome)}** from the bookkeeping ledger, with **${invoiceCount}** sales invoices totaling **${fmt(invoiceTotal)}**.\n\n### Key Numbers\n- Bookkeeping Income: ${fmt(bkIncome)}\n- Total Invoiced: ${fmt(invoiceTotal)}\n- Collected: ${fmt(invoicePaid)}\n- Outstanding AR: ${fmt(invoiceUnpaid)}\n\n### Analysis\nYou have collected ${fmt(invoicePaid)} in paid invoices, with ${fmt(invoiceUnpaid)} pending across ${overdueInvoices.length} overdue invoices.\n\n### Recommendation\nPrioritize collection on the ${overdueInvoices.length} overdue invoices to strengthen cash flow.`;
      } else if (userMessage.match(/expense|spend|cost|purchase/)) {
        replyText = `### Summary\nTotal expenses for **${periodLabel}**: **${fmt(bkExpense)}**.\n\n### Key Numbers\n- Total Expenses: ${fmt(bkExpense)}\n- Total Income: ${fmt(bkIncome)}\n- Net Profit: ${fmt(netProfit)}\n- Vendor Payables: ${fmt(purchaseUnpaid)}\n\n### Expense Breakdown\n${bkCategoryBreakdown || 'No categorized expenses yet.'}\n\n### Recommendation\nReview top expense categories and align vendor payables with cash inflow cycles.`;
      } else if (userMessage.match(/profit|margin|p&l|loss/)) {
        replyText = `### Summary\nNet Profit for **${periodLabel}**: **${fmt(netProfit)}** | Net Margin: **${profitMargin}%**\n\n### Key Numbers\n- Total Revenue: ${fmt(bkIncome)}\n- Total Expenses: ${fmt(bkExpense)}\n- Net Profit: ${fmt(netProfit)}\n- Net Margin: ${profitMargin}%\n\n### Analysis\nYour business is currently **${netProfit >= 0 ? "PROFITABLE ✅" : "OPERATING AT A LOSS ⚠️"}**.\n\n### Recommendation\n${netProfit < 0 ? "Focus on accelerating high-margin revenue and cutting non-critical overhead." : "Maintain expense discipline and reinvest surplus into business growth."}`;
      } else if (userMessage.match(/gst|tax|igst|cgst|sgst|itc/)) {
        replyText = `### GST Summary (${periodLabel})\n- Output GST Collected: ${fmt(outputGst)}\n- Input ITC (from Purchases): ${fmt(inputGst)}\n- **Net GST Payable: ${fmt(gstPayable)}**\n- GST Credit Carry Forward: ${fmt(gstReceivable)}\n\n### Breakdown\n- CGST: Output ${fmt(gstData?.taxBreakdown?.cgst?.output || 0)} | Input ${fmt(gstData?.taxBreakdown?.cgst?.input || 0)}\n- SGST: Output ${fmt(gstData?.taxBreakdown?.sgst?.output || 0)} | Input ${fmt(gstData?.taxBreakdown?.sgst?.input || 0)}\n- IGST: Output ${fmt(gstData?.taxBreakdown?.igst?.output || 0)} | Input ${fmt(gstData?.taxBreakdown?.igst?.input || 0)}\n\n### Recommendation\nVerify GST filings with your CA and pay Net GST of ${fmt(gstPayable)} before the due date.`;
      } else if (userMessage.match(/invoice|receivable|ar|overdue|outstanding/)) {
        replyText = `### Invoice & Receivables Summary (${periodLabel})\n- Total Invoices: **${invoiceCount}** totaling ${fmt(invoiceTotal)}\n- Paid: ${fmt(invoicePaid)}\n- **Outstanding AR: ${fmt(invoiceUnpaid)}**\n- Overdue: **${overdueInvoices.length}** invoices\n\n${topOverdue ? `### Overdue Invoices\n${topOverdue}\n` : ''}${recentInvoicesList ? `### Recent Invoices\n${recentInvoicesList}` : ''}`;
      } else if (userMessage.match(/inventory|stock|product|sku/)) {
        replyText = `### Inventory Summary\n- Total Products/SKUs: **${inventoryItems.length}**\n- Total Inventory Value: **${fmt(totalInventoryValue)}**\n- Low Stock Items (<10 units): **${lowStockItems.length}**\n\n${inventoryListSummary ? `### Products\n${inventoryListSummary}` : ''}\n\n### Top Revenue Products\n${topProducts || 'No product revenue data yet.'}`;
      } else if (userMessage.match(/payroll|salary|employee|hr/)) {
        replyText = `### Payroll Summary\n- Employees: **${payrollRecords.length}**\n- Total Gross Salary: **${fmt(totalPayrollGross)}**\n- Total Net Payable: **${fmt(totalPayrollNet)}**\n\n${payrollListSummary ? `### Employee Records\n${payrollListSummary}` : '- No payroll records found.'}`;
      } else if (userMessage.match(/balance sheet|assets|liabilities|equity/)) {
        replyText = `### Balance Sheet (${periodLabel})\n- **Total Assets: ${fmt(totalAssets)}**\n  - Cash & Bank: ${fmt(balanceSheet?.assets?.cashAndBank || 0)}\n  - Accounts Receivable: ${fmt(balanceSheet?.assets?.accountsReceivable || 0)}\n  - Inventory: ${fmt(balanceSheet?.assets?.inventory || 0)}\n- **Total Liabilities: ${fmt(totalLiabilities)}**\n  - Accounts Payable: ${fmt(balanceSheet?.liabilities?.accountsPayable || 0)}\n- **Total Equity: ${fmt(totalEquity)}**\n- Current Ratio: **${currentRatio}**\n- Equation Balanced: ${balanceSheet?.balanced ? "✅ YES" : "❌ NO"}`;
      } else if (userMessage.match(/cash flow|cashflow|liquidity|cash/)) {
        replyText = `### Cash Flow Summary (${periodLabel})\n- Cash Inflow: **${fmt(bkIncome)}**\n- Cash Outflow: **${fmt(bkExpense)}**\n- **Net Cash Flow: ${fmt(netProfit)}**\n- Outstanding Receivables: ${fmt(invoiceUnpaid)}\n- Vendor Payables: ${fmt(purchaseUnpaid)}\n\n### Recommendation\n${netProfit >= 0 ? "✅ Cash position is positive. Consider reinvesting surplus in inventory or business expansion." : "⚠️ Cash outflows exceed inflows. Accelerate invoice collection and defer non-critical payments."}`;
      } else if (userMessage.match(/customer|client|vendor|supplier/)) {
        replyText = `### Customer & Vendor Summary\n- Registered Customers: **${customers.length}**\n- Total Invoiced: ${fmt(invoiceTotal)} | AR Outstanding: ${fmt(invoiceUnpaid)}\n\nTop Customers by Revenue:\n${topCustomers || '- No customer data.'}\n\n- Total Vendor Bills: **${purchaseCount}** (${fmt(purchaseTotal)})\n- Vendor Payables Outstanding: ${fmt(purchaseUnpaid)}`;
      } else {
        replyText = `### AI CFO Financial Overview — ${periodLabel.toUpperCase().replace(/-/g, ' ')}\n\n### Key Numbers\n- Revenue: ${fmt(bkIncome)}\n- Expenses: ${fmt(bkExpense)}\n- **Net Profit: ${fmt(netProfit)}** (${profitMargin}% margin)\n- Outstanding AR: ${fmt(invoiceUnpaid)}\n- Vendor Payables: ${fmt(purchaseUnpaid)}\n- Net GST Payable: ${fmt(gstPayable)}\n- Inventory Value: ${fmt(totalInventoryValue)}\n\n### Status\n${overdueInvoices.length > 0 ? `⚠️ ${overdueInvoices.length} overdue invoices require immediate follow-up.` : '✅ No overdue invoices.'}\n${netProfit >= 0 ? "✅ Business is profitable." : "⚠️ Business is operating at a loss — review expenses immediately."}\n\n*Ask me about invoices, expenses, GST, inventory, payroll, balance sheet, or any specific financial metric.*`;
      }
    }

    res.json({ success: true, reply: replyText });

  } catch (error) {
    console.error("❌ AI CFO Chat Error:", error);
    res.status(500).json({ success: false, message: "AI CFO could not process the chat message", error: error.message });
  }
});

export default router;
