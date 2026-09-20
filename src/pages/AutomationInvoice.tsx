import React, { useState, useRef, useEffect, useMemo } from "react";
import { VoiceButton } from "@/components/ui/VoiceButton";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  Upload,
  FileText,
  Download,
  Plus,
  Trash2,
  Printer,
  Calculator,
  Eye,
  Copy,
  MessageCircle,
  CheckCircle,
  Camera,
  Loader2,
  Search,
  Calendar,
  User,
  Mail,
  Package,
  Percent,
  Sparkles,
  Database,
  ChevronRight,
  BarChart,
  TrendingUp,
  CreditCard,
  Receipt,
  Building,
  Shield,
  Banknote,
  Mic,
  ShoppingCart,
  Building2,
  Smartphone,
  X,
  IndianRupee,
  Wallet,
  AlertCircle,
  Share2,
  Save,
  Layout
} from "lucide-react";
import { parseVoiceInvoiceText, parseInvoiceText } from "@/lib/voiceInvoiceParser";
import { API_ENDPOINTS, API_BASE_URL } from "@/lib/api";
import { formatPDFCurrency } from "@/lib/reportBranding";
import Tesseract from "tesseract.js";
import DocScanner from "@/components/DocScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// Indian States for GST
const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
  "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka",
  "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan",
  "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

const GST_SLABS = ["0", "5", "12", "18", "28", "40"];
const UNITS = ["Pcs", "Kg", "Ltr", "Mtr", "Box", "Dozen", "Pair", "Set", "Nos"];
const COMPANY_NAME = "SHREE ANDAL AI SOFTWARE SOLUTIONS (OPC) PRIVATE LIMITED";
const COMPANY_EMAIL = "support@saaiss.in";

const HSN_SAC_AUTOMATION: Record<string, { code: string; codeType: 'HSN' | 'SAC'; gstRate: number }> = {
  laptop: { code: "8471", codeType: "HSN", gstRate: 18 },
  computer: { code: "8471", codeType: "HSN", gstRate: 18 },
  keyboard: { code: "8471", codeType: "HSN", gstRate: 18 },
  mouse: { code: "8471", codeType: "HSN", gstRate: 18 },
  software: { code: "9983", codeType: "SAC", gstRate: 18 },
  consulting: { code: "9983", codeType: "SAC", gstRate: 18 },
  service: { code: "9983", codeType: "SAC", gstRate: 18 },
  hotel: { code: "9963", codeType: "SAC", gstRate: 5 },
  restaurant: { code: "9963", codeType: "SAC", gstRate: 5 },
};

// Invoice Item interface
interface InvoiceItem {
  id: string;
  inventoryItemId?: string; // Track which inventory item this came from
  itemName: string;
  itemCode: string;
  codeType: 'HSN' | 'SAC';
  hsnCode: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  priceWithTax: boolean;
  discountPercent: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  // GST Breakdown
  sgstRate: number;
  sgstAmount: number;
  cgstRate: number;
  cgstAmount: number;
  igstRate: number;
  igstAmount: number;
  isInterState: boolean;
  amount: number;
  stockReserved?: boolean; // Track if stock was reserved for this item
}

// Default Business State (can be made configurable)
const BUSINESS_STATE = "Tamil Nadu";

// Invoice Data interface
interface InvoiceData {
  type: 'sales' | 'purchase';
  saleType: 'credit' | 'cash' | 'UPI' | 'Net Banking';
  partyName: string;
  phoneNo: string;
  sellerName: string;
  sellerPhone: string;
  sellerGSTIN: string;
  transactionType: 'B2B' | 'B2C';
  invoiceSize: 'A4' | 'QUARTER_A4' | 'A6';
  dueReminderDays: number;
  dueReminderDate?: string;
  eWayBillNo: string;
  invoiceNo: string;
  invoiceDate: string;
  stateOfSupply: string;
  businessState: string;
  items: InvoiceItem[];
  subtotal: number;
  totalSgst: number;
  totalCgst: number;
  totalIgst: number;
  totalTax: number;
  total: number;
  paid: number;
  balance: number;
  paymentMethod: string;
  uploadedBill: string | null;
  customerEmail?: string;
  customerGSTIN?: string;
  ocrJson?: unknown;
  orderNumber?: string;
  salespersonName?: string;
  currency?: string;
  exchangeRate?: number;
  shippingCharges?: number;
  packagingCharges?: number;
  freightCharges?: number;
  adjustment?: number;
  dueDate?: string;
  paymentTerms?: string;
  sellerEmail?: string;
  sellerAddress?: string;
  customerAddress?: string;
  bankName?: string;
  accountType?: string;
  accountNumber?: string;
  ifscCode?: string;
  authorisedSignature?: string;
  notes?: string;
  termsAndConditions?: string;
}

// Inventory Item interface (from Inventory Management)
interface InventoryStockItem {
  _id: string;
  itemName: string;
  sku: string;
  hsnCode?: string;
  quantity: number;
  unit?: string;
  price: number;
  category: string;
  gstRate?: number;
  stateOfSupply?: string;
}

const AutomationInvoice = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const billUploadRef = useRef<HTMLInputElement>(null);
  const inventoryDropdownRef = useRef<HTMLDivElement>(null);

  const initialTab = location.pathname === '/invoice/ocr' ? 'ocr' : 'create';
  const [activeTab, setActiveTabState] = useState<'create' | 'ocr' | 'history' | 'voice'>(initialTab);
  const [invoiceType, setInvoiceType] = useState<'sales' | 'purchase'>('sales');

  // Sync URL with active tab
  const setActiveTab = (tab: 'create' | 'ocr' | 'history' | 'voice') => {
    setActiveTabState(tab);
    if (tab === 'ocr') {
      navigate('/invoice/ocr', { replace: true });
    } else if (location.pathname === '/invoice/ocr') {
      navigate('/invoice', { replace: true });
    }
  };

  // Generate invoice number
  const generateInvoiceNo = (type: 'sales' | 'purchase') => {
    const prefix = type === 'sales' ? 'INV' : 'PUR';
    const saved = localStorage.getItem('savedInvoices');
    let next = 1;
    if (saved) {
      try {
        const invoices = JSON.parse(saved) as InvoiceData[];
        const matchingNos = invoices
          .filter(inv => inv.type === type && inv.invoiceNo && inv.invoiceNo.startsWith(`${prefix}-`))
          .map(inv => {
            const parts = inv.invoiceNo.split('-');
            const numStr = parts[parts.length - 1];
            const num = parseInt(numStr, 10);
            return isNaN(num) ? 0 : num;
          });

        if (matchingNos.length > 0) {
          next = Math.max(...matchingNos) + 1;
        }
      } catch (e) {
        console.error(e);
      }
    }
    return `${prefix}-${String(next).padStart(5, '0')}`;
  };

  const classifyTransaction = (sellerGSTIN = currentInvoice.sellerGSTIN, customerGSTIN = currentInvoice.customerGSTIN || ''): 'B2B' | 'B2C' => {
    return sellerGSTIN.trim().length >= 15 && customerGSTIN.trim().length >= 15 ? 'B2B' : 'B2C';
  };

  const getDueReminderDate = (invoiceDate: string, reminderDays: number) => {
    if (!reminderDays) return undefined;
    const reminderDate = new Date(invoiceDate);
    reminderDate.setDate(reminderDate.getDate() + Math.max(reminderDays - 1, 0));
    return reminderDate.toISOString().split('T')[0];
  };

  const getAutomatedCode = (itemName = '', itemCode = '') => {
    const haystack = `${itemName} ${itemCode}`.toLowerCase();
    return Object.entries(HSN_SAC_AUTOMATION).find(([keyword]) => haystack.includes(keyword))?.[1];
  };

  const updateNewItemWithAutomation = (field: 'itemName' | 'itemCode', value: string) => {
    setNewItem(prev => {
      const next = { ...prev, [field]: value };
      const automation = getAutomatedCode(next.itemName, next.itemCode);
      if (automation && !next.hsnCode) {
        next.hsnCode = automation.code;
        next.codeType = automation.codeType;
        next.taxPercent = automation.gstRate;
      }
      return next;
    });
  };

  const downloadJsonFile = (filename: string, data: unknown) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const buildGstPortalJson = (invoice: InvoiceData, rawOcrText = ocrText) => ({
    title: "Invoice Automation GST Export",
    generatedAt: new Date().toISOString(),
    transactionType: invoice.transactionType,
    forms: {
      gstr1: invoice.type === 'sales' ? [{
        invoiceNumber: invoice.invoiceNo,
        invoiceDate: invoice.invoiceDate,
        customerName: invoice.partyName,
        customerGSTIN: invoice.customerGSTIN || null,
        taxableValue: invoice.subtotal,
        taxAmount: invoice.totalTax,
        totalValue: invoice.total,
        items: invoice.items.map(item => ({
          productName: item.itemName,
          codeType: item.codeType,
          hsnSacCode: item.hsnCode,
          quantity: item.quantity,
          taxableValue: item.amount - item.taxAmount,
          taxRate: item.taxPercent,
          taxAmount: item.taxAmount,
          totalValue: item.amount
        }))
      }] : [],
      gstr2b: invoice.type === 'purchase' ? [{
        billNumber: invoice.invoiceNo,
        billDate: invoice.invoiceDate,
        supplierName: invoice.sellerName || invoice.partyName,
        supplierGSTIN: invoice.sellerGSTIN || null,
        totalValue: invoice.total,
        taxAmount: invoice.totalTax
      }] : [],
      gstr3b: {
        outwardTaxableSupply: invoice.type === 'sales' ? invoice.subtotal : 0,
        inwardTaxableSupply: invoice.type === 'purchase' ? invoice.subtotal : 0,
        outputTax: invoice.type === 'sales' ? invoice.totalTax : 0,
        inputTaxCredit: invoice.type === 'purchase' ? invoice.totalTax : 0,
        netTax: invoice.type === 'sales' ? invoice.totalTax : -invoice.totalTax
      }
    },
    ocr: {
      rawText: rawOcrText || "",
      uploadedImagePresent: Boolean(uploadedImage)
    }
  });

  // Invoice state
  const [currentInvoice, setCurrentInvoice] = useState<InvoiceData>({
    type: 'sales',
    saleType: 'cash',
    partyName: '',
    phoneNo: '',
    sellerName: '',
    sellerPhone: '',
    sellerGSTIN: '',
    transactionType: 'B2C',
    invoiceSize: 'A4',
    dueReminderDays: 7,
    eWayBillNo: '',
    invoiceNo: generateInvoiceNo('sales'),
    invoiceDate: new Date().toISOString().split('T')[0],
    stateOfSupply: '',
    businessState: BUSINESS_STATE,
    items: [],
    subtotal: 0,
    totalSgst: 0,
    totalCgst: 0,
    totalIgst: 0,
    totalTax: 0,
    total: 0,
    paid: 0,
    balance: 0,
    paymentMethod: 'cash',
    uploadedBill: null,
    customerEmail: '',
    customerGSTIN: '',
    orderNumber: '',
    salespersonName: '',
    currency: 'INR',
    exchangeRate: 1,
    shippingCharges: 0,
    packagingCharges: 0,
    freightCharges: 0,
    adjustment: 0,
    dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    paymentTerms: 'Due on Receipt',
    sellerEmail: '',
    sellerAddress: '',
    customerAddress: '',
    notes: '',
    termsAndConditions: ''
  });

  // New item form state
  const [newItem, setNewItem] = useState<Partial<InvoiceItem>>({
    inventoryItemId: undefined,
    itemName: '',
    itemCode: '',
    codeType: 'HSN',
    hsnCode: '',
    quantity: 1,
    unit: 'Pcs',
    pricePerUnit: 0,
    priceWithTax: false,
    discountPercent: 0,
    taxPercent: 18
  });

  // Track max available quantity for selected inventory item
  const [selectedInventoryMaxQty, setSelectedInventoryMaxQty] = useState<number | null>(null);

  // State for invoice history
  const [invoiceHistory, setInvoiceHistory] = useState<InvoiceData[]>([]);

  // State for invoice templates theme selection
  const [userTemplates, setUserTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const activeTemplateConfig = useMemo(() => {
    const active = userTemplates.find((t: any) => t._id === selectedTemplateId);
    if (active?.config) return active.config;
    
    // Default initialConfig structure
    return {
      header: { showLogo: true, logoPosition: "left", logoSize: "medium", logoUrl: "", showCompanyName: true, showAddress: true, showPhone: true, showEmail: true },
      seller: { showName: true, showPhone: true, showEmail: true, showGSTIN: true, showAddress: true },
      customer: { showName: true, showGSTIN: true, showPhone: true, showEmail: true, showBillingAddress: true, showShippingAddress: true, showPlaceOfSupply: true },
      invoiceInfo: {
        showInvoiceNumber: true, showInvoiceDate: true, showDueDate: true, showPaymentTerms: true, showOrderNumber: true, showSalesperson: true,
        labels: { invoiceNumber: "Invoice No.", invoiceDate: "Invoice Date", dueDate: "Due Date", paymentTerms: "Payment Terms", orderNumber: "Order No.", salespersonName: "Salesperson" }
      },
      items: {
        columns: ["item", "sku", "description", "hsn", "quantity", "rate", "discount", "tax", "amount"],
        labels: { item: "Item", sku: "Item Code", description: "Description", hsn: "HSN/SAC", quantity: "Qty", rate: "Rate", discount: "Discount", tax: "Tax", amount: "Amount" }
      },
      tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTaxableAmount: true, showTotalTax: true },
      payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
      notes: { show: true, label: "Notes", defaultText: "Thank you for your business!" },
      terms: { show: true, label: "Terms & Conditions", defaultText: "Payment is due within 15 days of invoice date." },
      signature: { show: false, name: "", designation: "", imageUrl: "" },
      footer: { show: true, text: "" },
      design: { primaryColor: "#4f46e5", secondaryColor: "#f8fafc", textColor: "#0f172a", backgroundColor: "#ffffff", borderColor: "#cbd5e1", fontFamily: "Inter", fontSize: 12, borderStyle: "light" },
      sectionsOrder: ["header", "seller", "customer", "invoiceInfo", "items", "tax", "payment", "notes", "terms", "signature", "footer"]
    };
  }, [userTemplates, selectedTemplateId]);

  const fetchUserTemplates = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        toast.error("Session expired. Please log in again.");
        navigate("/auth");
        return;
      }
      const res = await fetch(`${API_BASE_URL}/invoice-templates`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 400) {
        // Token expired or invalid — clear it and redirect
        localStorage.removeItem("token");
        toast.error("Session expired. Please log in again.");
        navigate("/auth");
        return;
      }
      if (res.ok) {
        const result = await res.json();
        const list = result.data || [];
        setUserTemplates(list);
        const def = list.find((t: any) => t.isDefault);
        if (def) {
          setSelectedTemplateId(def._id);
          setCurrentInvoice(prev => ({ ...prev, templateId: def._id }));
        } else if (list.length > 0) {
          setSelectedTemplateId(list[0]._id);
          setCurrentInvoice(prev => ({ ...prev, templateId: list[0]._id }));
        }
      }
    } catch (err) {
      console.error("Error loading user templates:", err);
    }
  };

  const fetchUserProfile = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      
      const res = await fetch(`${API_BASE_URL}/user`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentInvoice(prev => ({
          ...prev,
          sellerName: data.sellerName || prev.sellerName || "",
          sellerPhone: data.sellerPhone || prev.sellerPhone || "",
          sellerEmail: data.sellerEmail || prev.sellerEmail || "",
          sellerGSTIN: data.sellerGSTIN || prev.sellerGSTIN || "",
          businessState: data.sellerState || prev.businessState || "Tamil Nadu",
          sellerAddress: data.sellerAddress || prev.sellerAddress || "",
          bankName: data.bankName || prev.bankName || "",
          accountType: data.accountType || prev.accountType || "Current",
          accountNumber: data.accountNumber || prev.accountNumber || "",
          ifscCode: data.ifscCode || prev.ifscCode || "",
          authorisedSignature: data.authorisedSignature || prev.authorisedSignature || "",
          salespersonName: data.sellerName || prev.salespersonName || ""
        }));
      }
    } catch (err) {
      console.error("Error loading user profile details:", err);
    }
  };

  useEffect(() => {
    fetchUserTemplates();
    fetchUserProfile();
  }, []);

  // State for OCR
  const [ocrText, setOcrText] = useState("");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  // State for voice dictation
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);

  // Search state for history
  const [searchTerm, setSearchTerm] = useState("");

  // Customers list and suggestions
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);

  // New customer inline form state
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: "",
    email: "",
    phone: "",
    billingAddress: "",
    shippingAddress: "",
    gstin: "",
    placeOfSupply: "",
    paymentTerms: "Due on Receipt"
  });

  // Record Manual Payment State
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: "cash",
    depositAccount: "Cash/Bank",
    referenceNumber: "",
    notes: ""
  });

  // Inventory stock items state
  const [inventoryItems, setInventoryItems] = useState<InventoryStockItem[]>([]);
  const [inventorySearchTerm, setInventorySearchTerm] = useState("");
  const [isInventoryDropdownOpen, setIsInventoryDropdownOpen] = useState(false);
  const [isLoadingInventory, setIsLoadingInventory] = useState(false);

  // Fetch customers from backend
  const fetchCustomers = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/customers`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCustomersList(data);
      }
    } catch (error) {
      console.error("Error fetching customers:", error);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  // Inline Customer Create
  const handleCreateCustomer = async () => {
    if (!newCustomerForm.name.trim()) {
      toast.error("Customer name is required");
      return;
    }
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(newCustomerForm)
      });
      if (res.ok) {
        const data = await res.json();
        toast.success("Customer created successfully!");
        setCurrentInvoice(prev => ({
          ...prev,
          partyName: data.customer.name,
          phoneNo: data.customer.phone || prev.phoneNo,
          customerEmail: data.customer.email || prev.customerEmail,
          customerGSTIN: data.customer.gstin || prev.customerGSTIN,
          stateOfSupply: data.customer.placeOfSupply || prev.stateOfSupply,
          customerAddress: data.customer.billingAddress || prev.customerAddress
        }));
        setNewCustomerForm({
          name: "",
          email: "",
          phone: "",
          billingAddress: "",
          shippingAddress: "",
          gstin: "",
          placeOfSupply: "",
          paymentTerms: "Due on Receipt"
        });
        setIsAddCustomerOpen(false);
        fetchCustomers();
      } else {
        const err = await res.json();
        toast.error(err.message || "Failed to create customer");
      }
    } catch (error) {
      console.error("Error adding customer:", error);
      toast.error("Error adding customer inline");
    }
  };

  // Record Manual Payment
  const handleRecordPaymentSubmit = async () => {
    if (!lastSavedId) {
      toast.error("Please save the invoice first before recording payments.");
      return;
    }
    if (paymentForm.amount <= 0) {
      toast.error("Payment amount must be greater than zero.");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/invoice/${lastSavedId}/payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(paymentForm)
      });

      if (res.ok) {
        const data = await res.json();
        toast.success("Payment recorded successfully!");
        const updated = data.invoice;
        setCurrentInvoice(prev => ({
          ...prev,
          paid: updated.amountPaid,
          balance: updated.balanceDue,
          paymentStatus: updated.paymentStatus,
          status: updated.status
        }));
        setIsRecordPaymentOpen(false);
        
        // Refresh local history
        const savedList = JSON.parse(localStorage.getItem('savedInvoices') || '[]');
        const idx = savedList.findIndex((inv: any) => inv.id === lastSavedId);
        if (idx !== -1) {
          savedList[idx].paid = updated.amountPaid;
          savedList[idx].balance = updated.balanceDue;
          savedList[idx].status = updated.status;
          localStorage.setItem('savedInvoices', JSON.stringify(savedList));
          setInvoiceHistory(savedList);
        }
      } else {
        const err = await res.json();
        toast.error(err.message || "Failed to record payment");
      }
    } catch (error) {
      console.error("Error recording payment:", error);
      toast.error("Error recording payment");
    }
  };

  // Cancel / Reverse Invoice
  const handleCancelInvoice = async () => {
    if (!lastSavedId) {
      toast.error("Please save the invoice first.");
      return;
    }
    if (!confirm("Are you sure you want to cancel this invoice? This will reverse all ledger entries and restore stock!")) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/invoice/${lastSavedId}/cancel`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        toast.success("Invoice cancelled and reversed successfully!");
        const updated = data.invoice;
        setCurrentInvoice(prev => ({
          ...prev,
          status: updated.status,
          paymentStatus: updated.paymentStatus,
          paid: updated.amountPaid,
          balance: updated.balanceDue
        }));
        
        // Refresh local history
        const savedList = JSON.parse(localStorage.getItem('savedInvoices') || '[]');
        const idx = savedList.findIndex((inv: any) => inv.id === lastSavedId);
        if (idx !== -1) {
          savedList[idx].paid = updated.amountPaid;
          savedList[idx].balance = updated.balanceDue;
          savedList[idx].status = updated.status;
          localStorage.setItem('savedInvoices', JSON.stringify(savedList));
          setInvoiceHistory(savedList);
        }
      } else {
        const err = await res.json();
        toast.error(err.message || "Failed to cancel invoice");
      }
    } catch (error) {
      console.error("Error cancelling invoice:", error);
      toast.error("Error cancelling invoice");
    }
  };

  // Fetch inventory items on mount
  useEffect(() => {
    const fetchInventory = async () => {
      setIsLoadingInventory(true);
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE_URL}/inventory/all`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          // Filter only items with quantity > 0 (in stock)
          const inStockItems = data.filter((item: InventoryStockItem) => item.quantity > 0);
          setInventoryItems(inStockItems);
        }
      } catch (error) {
        console.error("Error fetching inventory:", error);
      } finally {
        setIsLoadingInventory(false);
      }
    };
    fetchInventory();
  }, []);

  // Load saved invoices from localStorage and backend on mount
  useEffect(() => {
    const loadInvoices = async () => {
      let mergedInvoices: InvoiceData[] = [];

      // Load from localStorage
      const saved = localStorage.getItem('savedInvoices');
      if (saved) {
        try {
          mergedInvoices = JSON.parse(saved);
        } catch (e) {
          console.error(e);
        }
      }

      // Load from backend
      try {
        const token = localStorage.getItem("token");
        const [salesRes, purchaseRes] = await Promise.all([
          fetch(`${API_BASE_URL}/invoice/all?limit=100`, { headers: { "Authorization": `Bearer ${token}` } }).catch(() => null),
          fetch(`${API_BASE_URL}/purchase-invoice/all`, { headers: { "Authorization": `Bearer ${token}` } }).catch(() => null)
        ]);

        let backendInvoices: any[] = [];

        if (salesRes && salesRes.ok) {
          const salesData = await salesRes.json();
          if (salesData.invoices && Array.isArray(salesData.invoices)) {
            const mappedSales = salesData.invoices.map((inv: any) => ({
              ...inv,
              id: inv._id,
              type: 'sales',
              saleType: inv.paymentMethod || 'cash',
              partyName: inv.customerName || 'Customer',
              phoneNo: inv.customerPhone || '',
              items: inv.items ? inv.items.map((item: any) => ({
                itemName: item.productName || item.itemName,
                quantity: item.quantity,
                pricePerUnit: item.unitPrice || item.pricePerUnit,
                amount: item.total || item.amount,
                taxPercent: item.taxRate || item.taxPercent,
                discountAmount: item.discount || 0,
                codeType: item.codeType || 'HSN',
                hsnCode: item.hsnCode || item.sacCode || ''
              })) : [],
              subtotal: inv.subtotal,
              totalTax: inv.taxAmount,
              totalSgst: inv.sgst || 0,
              totalCgst: inv.cgst || 0,
              totalIgst: inv.igst || 0,
              total: inv.grandTotal || inv.total,
              paid: inv.amountPaid || inv.paid || 0,
              balance: inv.balanceDue || inv.balance || 0
            }));
            backendInvoices.push(...mappedSales);
          }
        }

        if (purchaseRes && purchaseRes.ok) {
          const purchaseData = await purchaseRes.json();
          if (purchaseData.invoices && Array.isArray(purchaseData.invoices)) {
            const mappedPurchases = purchaseData.invoices.map((inv: any) => ({
              ...inv,
              id: inv._id,
              type: 'purchase',
              invoiceNo: inv.billNo || `PUR-${inv._id.slice(-6)}`,
              invoiceDate: inv.billDate || inv.createdAt,
              partyName: inv.supplierName || inv.customerName || 'Supplier',
              phoneNo: inv.phone || inv.customerPhone || '',
              gstin: inv.gstin || inv.customerGstin || '',
              items: inv.items ? inv.items.map((item: any) => ({
                itemName: item.itemName,
                quantity: item.quantity,
                pricePerUnit: item.pricePerUnit,
                amount: item.amount,
                taxPercent: item.taxPercent,
                discountAmount: item.discountAmount || 0,
                codeType: item.codeType || 'HSN',
                hsnCode: item.hsnCode || ''
              })) : [],
              subtotal: inv.subtotal,
              totalTax: inv.totalTax,
              totalSgst: inv.totalSgst || 0,
              totalCgst: inv.totalCgst || 0,
              totalIgst: inv.totalIgst || 0,
              total: inv.total,
              paid: inv.paid || 0,
              balance: inv.balance || 0
            }));
            backendInvoices.push(...mappedPurchases);
          }
        }

        // Merge and de-duplicate by invoiceNo & id
        const existingNos = new Set(mergedInvoices.map(inv => inv.invoiceNo));
        backendInvoices.forEach((inv: any) => {
          if (!existingNos.has(inv.invoiceNo)) {
            mergedInvoices.push(inv);
          }
        });
      } catch (err) {
        console.warn("Failed to fetch backend invoices:", err);
      }

      setInvoiceHistory(mergedInvoices);

      // Recalculate invoice number dynamically based on maximum sequence number
      const prefix = invoiceType === 'sales' ? 'INV' : 'PUR';
      const matchingNos = mergedInvoices
        .filter(inv => inv.type === invoiceType && inv.invoiceNo && inv.invoiceNo.startsWith(`${prefix}-`))
        .map(inv => {
          const parts = inv.invoiceNo.split('-');
          const numStr = parts[parts.length - 1];
          const num = parseInt(numStr, 10);
          return isNaN(num) ? 0 : num;
        });

      let next = 1;
      if (matchingNos.length > 0) {
        next = Math.max(...matchingNos) + 1;
      }

      const newNo = `${prefix}-${String(next).padStart(5, '0')}`;
      setCurrentInvoice(prev => ({
        ...prev,
        invoiceNo: newNo
      }));
    };

    loadInvoices();
  }, [invoiceType]);

  // Close inventory dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inventoryDropdownRef.current && !inventoryDropdownRef.current.contains(event.target as Node)) {
        setIsInventoryDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Switch between Sales and Purchase
  const handleInvoiceTypeChange = (type: 'sales' | 'purchase') => {
    setLastSavedId(null);
    setInvoiceType(type);
    setCurrentInvoice(prev => ({
      ...prev,
      type: type,
      invoiceNo: generateInvoiceNo(type),
      items: [],
      subtotal: 0,
      totalSgst: 0,
      totalCgst: 0,
      totalIgst: 0,
      totalTax: 0,
      total: 0,
      paid: 0,
      balance: 0
    }));
  };

  // Check if inter-state transaction
  const isInterStateTransaction = (): boolean => {
    const customerState = currentInvoice.stateOfSupply;
    const businessState = currentInvoice.businessState || BUSINESS_STATE;
    return customerState !== '' && businessState !== '' && customerState !== businessState;
  };

  // Calculate item amounts with GST breakdown
  const calculateItemAmounts = (item: Partial<InvoiceItem>, forceInterState?: boolean): Partial<InvoiceItem> => {
    const qty = item.quantity || 0;
    const price = item.pricePerUnit || 0;
    const discountPct = item.discountPercent || 0;
    const priceWithTax = item.priceWithTax || false;
    const taxPct = priceWithTax ? (item.taxPercent || 0) : 0;

    let baseAmount = qty * price;
    let discountAmount = (baseAmount * discountPct) / 100;
    let afterDiscount = baseAmount - discountAmount;

    // Determine if inter-state
    const isInterState = forceInterState !== undefined ? forceInterState : isInterStateTransaction();

    let sgstRate = 0, cgstRate = 0, igstRate = 0;
    let sgstAmount = 0, cgstAmount = 0, igstAmount = 0;
    let taxAmount = 0;
    let finalAmount = afterDiscount;

    if (priceWithTax && taxPct > 0) {
      if (isInterState) {
        igstRate = taxPct;
        igstAmount = (afterDiscount * igstRate) / 100;
        taxAmount = igstAmount;
      } else {
        sgstRate = taxPct / 2;
        cgstRate = taxPct / 2;
        sgstAmount = (afterDiscount * sgstRate) / 100;
        cgstAmount = (afterDiscount * cgstRate) / 100;
        taxAmount = sgstAmount + cgstAmount;
      }
      finalAmount = afterDiscount + taxAmount;
    }

    return {
      ...item,
      taxPercent: taxPct,
      discountAmount: Math.round(discountAmount * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      sgstRate: Math.round(sgstRate * 100) / 100,
      sgstAmount: Math.round(sgstAmount * 100) / 100,
      cgstRate: Math.round(cgstRate * 100) / 100,
      cgstAmount: Math.round(cgstAmount * 100) / 100,
      igstRate: Math.round(igstRate * 100) / 100,
      igstAmount: Math.round(igstAmount * 100) / 100,
      isInterState,
      amount: Math.round(finalAmount * 100) / 100
    };
  };

  // Calculate invoice totals from items
  const calculateInvoiceTotals = (
    items: InvoiceItem[],
    shipping = currentInvoice.shippingCharges || 0,
    packaging = currentInvoice.packagingCharges || 0,
    freight = currentInvoice.freightCharges || 0,
    adjustment = currentInvoice.adjustment || 0
  ) => {
    const subtotal = items.reduce((sum, i) => sum + (i.quantity * i.pricePerUnit) - i.discountAmount, 0);
    const totalSgst = items.reduce((sum, i) => sum + i.sgstAmount, 0);
    const totalCgst = items.reduce((sum, i) => sum + i.cgstAmount, 0);
    const totalIgst = items.reduce((sum, i) => sum + i.igstAmount, 0);
    const totalTax = totalSgst + totalCgst + totalIgst;
    const itemsTotal = items.reduce((sum, i) => sum + i.amount, 0);
    const total = itemsTotal + shipping + packaging + freight + adjustment;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      totalSgst: Math.round(totalSgst * 100) / 100,
      totalCgst: Math.round(totalCgst * 100) / 100,
      totalIgst: Math.round(totalIgst * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      total: Math.round(total * 100) / 100
    };
  };

  // Refresh inventory items
  const refreshInventory = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/inventory/all`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const inStockItems = data.filter((item: InventoryStockItem) => item.quantity > 0);
        setInventoryItems(inStockItems);
      }
    } catch (error) {
      console.error("Error refreshing inventory:", error);
    }
  };

  const deleteInventoryItem = async (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this item from inventory?")) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/inventory/${itemId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        toast.success("Item deleted from inventory");
        refreshInventory();
      } else {
        const error = await res.json();
        toast.error(error.message || "Failed to delete item");
      }
    } catch (error) {
      console.error("Error deleting item:", error);
      toast.error("Error deleting item from inventory");
    }
  };

  // Add item to invoice
  const addItemToInvoice = async () => {
    if (!newItem.itemName || !newItem.pricePerUnit) {
      toast.error("Please enter item name and price");
      return;
    }

    // Check if state is selected for GST calculation
    if (!currentInvoice.stateOfSupply) {
      toast.error("Please select State of Supply for GST calculation");
      return;
    }

    const quantity = newItem.quantity || 1;

    // If item is from inventory, check stock and reserve it
    if (newItem.inventoryItemId) {
      if (selectedInventoryMaxQty !== null && quantity > selectedInventoryMaxQty) {
        toast.error(`Insufficient stock! Only ${selectedInventoryMaxQty} available.`);
        return;
      }

      // Reserve stock in inventory
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE_URL}/inventory/reserve/${newItem.inventoryItemId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ quantity })
        });

        if (!res.ok) {
          const data = await res.json();
          toast.error(data.message || "Failed to reserve stock");
          return;
        }

        // Refresh inventory to show updated stock
        refreshInventory();
      } catch (error) {
        console.error("Error reserving stock:", error);
        toast.error("Error reserving stock from inventory");
        return;
      }
    }

    const calculatedItem = calculateItemAmounts(newItem);
    const item: InvoiceItem = {
      id: `item-${Date.now()}`,
      inventoryItemId: newItem.inventoryItemId,
      itemName: newItem.itemName || '',
      itemCode: newItem.itemCode || '',
      codeType: newItem.codeType || 'HSN',
      hsnCode: newItem.hsnCode || '',
      quantity: quantity,
      unit: newItem.unit || 'Pcs',
      pricePerUnit: newItem.pricePerUnit || 0,
      priceWithTax: newItem.priceWithTax || false,
      discountPercent: newItem.discountPercent || 0,
      discountAmount: calculatedItem.discountAmount || 0,
      taxPercent: newItem.taxPercent || 0,
      taxAmount: calculatedItem.taxAmount || 0,
      sgstRate: calculatedItem.sgstRate || 0,
      sgstAmount: calculatedItem.sgstAmount || 0,
      cgstRate: calculatedItem.cgstRate || 0,
      cgstAmount: calculatedItem.cgstAmount || 0,
      igstRate: calculatedItem.igstRate || 0,
      igstAmount: calculatedItem.igstAmount || 0,
      isInterState: calculatedItem.isInterState || false,
      amount: calculatedItem.amount || 0,
      stockReserved: !!newItem.inventoryItemId
    };

    const updatedItems = [...currentInvoice.items, item];
    const totals = calculateInvoiceTotals(
      updatedItems,
      currentInvoice.shippingCharges,
      currentInvoice.packagingCharges,
      currentInvoice.freightCharges,
      currentInvoice.adjustment
    );

    setLastSavedId(null);
    setCurrentInvoice(prev => ({
      ...prev,
      items: updatedItems,
      ...totals,
      balance: totals.total - prev.paid
    }));

    // Reset new item form
    setNewItem({
      inventoryItemId: undefined,
      itemName: '',
      itemCode: '',
      codeType: 'HSN',
      hsnCode: '',
      quantity: 1,
      unit: 'Pcs',
      pricePerUnit: 0,
      priceWithTax: false,
      discountPercent: 0,
      taxPercent: 18
    });
    setSelectedInventoryMaxQty(null);

    toast.success(newItem.inventoryItemId ? "Item added & stock reserved" : "Item added to invoice");
  };

  const resetItemForm = () => {
    setNewItem({
      inventoryItemId: undefined,
      itemName: '',
      itemCode: '',
      codeType: 'HSN',
      hsnCode: '',
      quantity: 1,
      unit: 'Pcs',
      pricePerUnit: 0,
      priceWithTax: false,
      discountPercent: 0,
      taxPercent: 18
    });
    setSelectedInventoryMaxQty(null);
    toast.info("Item form cleared");
  };

  // Select inventory item and auto-populate form
  const selectInventoryItem = (inventoryItem: InventoryStockItem) => {
    setNewItem({
      inventoryItemId: inventoryItem._id,
      itemName: inventoryItem.itemName,
      itemCode: inventoryItem.sku,
      codeType: 'HSN',
      hsnCode: inventoryItem.hsnCode || '',
      quantity: 1,
      unit: inventoryItem.unit || 'Pcs',
      pricePerUnit: inventoryItem.price,
      priceWithTax: false,
      discountPercent: 0,
      taxPercent: inventoryItem.gstRate || 18
    });
    setSelectedInventoryMaxQty(inventoryItem.quantity);
    setInventorySearchTerm("");
    setIsInventoryDropdownOpen(false);
    toast.success(`Selected: ${inventoryItem.itemName} (${inventoryItem.quantity} in stock)`);
  };

  // Filter inventory items based on search
  const filteredInventoryItems = inventoryItems.filter(item =>
    item.itemName.toLowerCase().includes(inventorySearchTerm.toLowerCase()) ||
    item.sku.toLowerCase().includes(inventorySearchTerm.toLowerCase()) ||
    item.category.toLowerCase().includes(inventorySearchTerm.toLowerCase())
  );

  // Remove item from invoice
  const removeItem = async (itemId: string) => {
    // Find the item being removed
    const itemToRemove = currentInvoice.items.find(i => i.id === itemId);

    // If item was from inventory and stock was reserved, restore it
    if (itemToRemove?.inventoryItemId && itemToRemove?.stockReserved) {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE_URL}/inventory/restore/${itemToRemove.inventoryItemId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ quantity: itemToRemove.quantity })
        });

        if (res.ok) {
          toast.success(`Stock restored: ${itemToRemove.quantity} ${itemToRemove.itemName}`);
          refreshInventory();
        } else {
          console.error("Failed to restore stock");
        }
      } catch (error) {
        console.error("Error restoring stock:", error);
      }
    }

    setLastSavedId(null);
    const updatedItems = currentInvoice.items.filter(i => i.id !== itemId);
    const totals = calculateInvoiceTotals(
      updatedItems,
      currentInvoice.shippingCharges,
      currentInvoice.packagingCharges,
      currentInvoice.freightCharges,
      currentInvoice.adjustment
    );

    setCurrentInvoice(prev => ({
      ...prev,
      items: updatedItems,
      ...totals,
      balance: totals.total - prev.paid
    }));
  };

  // Update paid amount
  const updatePaidAmount = (paid: number) => {
    setLastSavedId(null);
    setCurrentInvoice(prev => ({
      ...prev,
      paid: paid,
      balance: prev.total - paid
    }));
  };

  // Handle file upload for purchase bill
  const handleBillUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCurrentInvoice(prev => ({
          ...prev,
          uploadedBill: event.target?.result as string
        }));
        toast.success("Bill uploaded successfully");
      };
      reader.readAsDataURL(file);
    }
  };

  // Save invoice
  // Save invoice
  const saveInvoice = async (statusOverride?: 'draft' | 'sent') => {
    if (currentInvoice.items.length === 0) {
      toast.error("Please add at least one item to the invoice.");
      return;
    }

    if (!currentInvoice.partyName?.trim()) {
      toast.error(`Please enter ${currentInvoice.type === 'sales' ? 'customer' : 'party'} name.`);
      return;
    }

    setIsSaving(true);

    try {
      const statusValue = statusOverride || (currentInvoice.balance <= 0 ? 'paid' : 'sent');
      const dueReminderDate = getDueReminderDate(currentInvoice.invoiceDate, currentInvoice.dueReminderDays);
      // 1. Save to Backend to get a real ID for sharing
      const backendData = {
        invoiceNumber: currentInvoice.invoiceNo,
        invoiceDate: currentInvoice.invoiceDate,
        dueDate: currentInvoice.dueDate || new Date(new Date(currentInvoice.invoiceDate).getTime() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        paymentTerms: currentInvoice.paymentTerms || 'Due on Receipt',
        orderNumber: currentInvoice.orderNumber || '',
        salespersonName: currentInvoice.salespersonName || '',
        currency: currentInvoice.currency || 'INR',
        exchangeRate: currentInvoice.exchangeRate || 1,
        customerName: currentInvoice.partyName,
        customerEmail: currentInvoice.customerEmail || `customer@finsmart.in`,
        customerPhone: currentInvoice.phoneNo,
        customerGSTIN: currentInvoice.customerGSTIN,
        customerAddress: currentInvoice.customerAddress || '',
        businessName: currentInvoice.sellerName || COMPANY_NAME,
        businessEmail: currentInvoice.sellerEmail || COMPANY_EMAIL,
        businessPhone: currentInvoice.sellerPhone,
        businessGSTIN: currentInvoice.sellerGSTIN,
        businessAddress: currentInvoice.sellerAddress || '',
        bankName: currentInvoice.bankName || '',
        accountType: currentInvoice.accountType || 'Current',
        accountNumber: currentInvoice.accountNumber || '',
        ifscCode: currentInvoice.ifscCode || '',
        authorisedSignature: currentInvoice.authorisedSignature || '',
        transactionType: currentInvoice.transactionType,
        invoiceSize: currentInvoice.invoiceSize,
        dueReminderDays: currentInvoice.dueReminderDays,
        dueReminderDate,
        sourceInvoiceType: currentInvoice.type,
        eWayBillNo: currentInvoice.eWayBillNo,
        stateOfSupply: currentInvoice.stateOfSupply,
        items: currentInvoice.items.map(item => ({
          productName: item.itemName,
          description: `${item.codeType}: ${item.hsnCode || 'N/A'} | Unit: ${item.unit}`,
          codeType: item.codeType,
          hsnCode: item.codeType === 'HSN' ? item.hsnCode : '',
          sacCode: item.codeType === 'SAC' ? item.hsnCode : '',
          unit: item.unit,
          priceWithTax: item.priceWithTax,
          quantity: item.quantity,
          unitPrice: item.pricePerUnit,
          taxRate: item.taxPercent,
          discount: item.discountAmount,
          total: item.amount
        })),
        shippingCharges: currentInvoice.shippingCharges || 0,
        packagingCharges: currentInvoice.packagingCharges || 0,
        freightCharges: currentInvoice.freightCharges || 0,
        adjustment: currentInvoice.adjustment || 0,
        subtotal: currentInvoice.subtotal,
        taxAmount: currentInvoice.totalTax,
        sgst: currentInvoice.totalSgst,
        cgst: currentInvoice.totalCgst,
        igst: currentInvoice.totalIgst,
        grandTotal: currentInvoice.total,
        amountPaid: currentInvoice.paid,
        balanceDue: currentInvoice.balance,
        paymentMethod: currentInvoice.saleType || 'cash',
        gstPortalJson: buildGstPortalJson({ ...currentInvoice, dueReminderDate }),
        notes: currentInvoice.notes || '',
        termsAndConditions: currentInvoice.termsAndConditions || '',
        status: statusValue,
        // ✅ Snapshot the currently active template design so the public view matches exactly
        templateId: selectedTemplateId || undefined,
        templateSnapshot: activeTemplateConfig
      };

      let backendId = '';
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(`${API_ENDPOINTS.INVOICE}/create`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(backendData)
        });
        const result = await response.json();
        if (response.ok) {
          backendId = result.invoiceId || result.invoice?._id;
          setLastSavedId(backendId);
        } else {
          toast.error(result.message || "Failed to save invoice to server. Try changing the invoice number.");
          setIsSaving(false);
          return null;
        }
      } catch (err) {
        console.warn("Backend save failed:", err);
        toast.error("Failed to connect to the server. Please check your network.");
        setIsSaving(false);
        return null;
      }

      // 2. Save to localStorage
      const savedList = JSON.parse(localStorage.getItem('savedInvoices') || '[]');
      const invoiceToSave = {
        ...currentInvoice,
        dueReminderDate,
        ocrJson: buildGstPortalJson({ ...currentInvoice, dueReminderDate }),
        savedAt: new Date().toISOString(),
        id: backendId
      };
      savedList.unshift(invoiceToSave);
      localStorage.setItem('savedInvoices', JSON.stringify(savedList));
      setInvoiceHistory(savedList);

      toast.success(`${currentInvoice.type === 'sales' ? 'Invoice' : 'Purchase Bill'} saved! You can now share on WhatsApp.`);
      return backendId;
    } catch (error: any) {
      console.error("Save Error:", error);
      toast.error(`Error saving invoice: ${error.message}`);
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  // Save and create new
  const saveAndNew = async () => {
    if (currentInvoice.items.length === 0) {
      toast.error("Please add items before saving");
      return;
    }
    await saveInvoice();
    // Reset form after saving for new invoice
    setTimeout(() => {
      resetForm();
      toast.info("Ready for new invoice");
    }, 500);
  };

  // Reset form
  const resetForm = () => {
    setLastSavedId(null);
    setCurrentInvoice(prev => ({
      type: invoiceType,
      saleType: 'cash',
      partyName: '',
      phoneNo: '',
      sellerName: prev.sellerName,
      sellerPhone: prev.sellerPhone,
      sellerGSTIN: prev.sellerGSTIN,
      sellerEmail: prev.sellerEmail,
      sellerAddress: prev.sellerAddress,
      businessState: prev.businessState,
      salespersonName: prev.sellerName,
      transactionType: 'B2C',
      invoiceSize: 'A4',
      dueReminderDays: 7,
      eWayBillNo: '',
      invoiceNo: generateInvoiceNo(invoiceType),
      invoiceDate: new Date().toISOString().split('T')[0],
      stateOfSupply: '',
      items: [],
      subtotal: 0,
      totalSgst: 0,
      totalCgst: 0,
      totalIgst: 0,
      totalTax: 0,
      total: 0,
      paid: 0,
      balance: 0,
      paymentMethod: 'cash',
      uploadedBill: null,
      customerEmail: '',
      customerGSTIN: '',
      notes: '',
      termsAndConditions: ''
    }));
    // Reset new item form
    setNewItem({
      inventoryItemId: undefined,
      itemName: '',
      itemCode: '',
      codeType: 'HSN',
      hsnCode: '',
      quantity: 1,
      unit: 'Pcs',
      pricePerUnit: 0,
      priceWithTax: false,
      discountPercent: 0,
      taxPercent: 18
    });
    setSelectedInventoryMaxQty(null);
  };

  // Handle file upload for OCR
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessingOcr(true);
    setOcrProgress(0);
    setUploadedImage(URL.createObjectURL(file));

    try {
      const result = await Tesseract.recognize(file, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round(m.progress * 100));
          }
        }
      });
      setOcrText(result.data.text);
    } catch (error) {
      console.error("OCR Error:", error);
      toast.error("Failed to extract text from image.");
    } finally {
      setIsProcessingOcr(false);
      setOcrProgress(0);
    }
  };

  // Generate Invoice PDF using jsPDF and jspdf-autotable
  const generateInvoicePDF = (data: InvoiceData) => {
    try {
      const doc = new jsPDF();
      const sellerName = data.sellerName || COMPANY_NAME;
      const customerName = data.partyName || 'Valued Customer';

      // Safe default configuration fallback
      const initialConfig = {
        header: { showLogo: true, logoPosition: "left" as const, logoSize: "medium" as const, logoUrl: "", showCompanyName: true, showAddress: true, showPhone: true, showEmail: true },
        seller: { showName: true, showPhone: true, showEmail: true, showGSTIN: true, showAddress: true },
        customer: { showName: true, showGSTIN: true, showPhone: true, showEmail: true, showBillingAddress: true, showShippingAddress: true, showPlaceOfSupply: true },
        invoiceInfo: {
          showInvoiceNumber: true, showInvoiceDate: true, showDueDate: true, showPaymentTerms: true, showOrderNumber: true, showSalesperson: true,
          labels: { invoiceNumber: "Invoice No.", invoiceDate: "Invoice Date", dueDate: "Due Date", paymentTerms: "Payment Terms", orderNumber: "Order No.", salespersonName: "Salesperson" }
        },
        items: {
          columns: ["item", "sku", "description", "hsn", "quantity", "rate", "discount", "tax", "amount"],
          labels: { item: "Item", sku: "Item Code", description: "Description", hsn: "HSN/SAC", quantity: "Qty", rate: "Rate", discount: "Discount", tax: "Tax", amount: "Amount" }
        },
        tax: { showSummary: true, showCGST: true, showSGST: true, showIGST: true, showTaxableAmount: true, showTotalTax: true },
        payment: { showPaidAmount: true, showBalance: true, showPaymentMethod: true },
        notes: { show: true, label: "Notes", defaultText: "Thank you for your business!" },
        terms: { show: true, label: "Terms & Conditions", defaultText: "Payment is due within 15 days of invoice date." },
        signature: { show: false, name: "", designation: "", imageUrl: "" },
        footer: { show: true, text: "" },
        design: { primaryColor: "#4f46e5", secondaryColor: "#f8fafc", textColor: "#0f172a", backgroundColor: "#ffffff", borderColor: "#cbd5e1", fontFamily: "Inter", fontSize: 12, borderStyle: "light" as const },
        sectionsOrder: ["header", "seller", "customer", "invoiceInfo", "items", "tax", "payment", "notes", "terms", "signature", "footer"]
      };

      // Resolve active template config — prefer snapshot, then selected template, then defaults
      const config = (data as any).templateSnapshot
        || (userTemplates.find((t: any) => t._id === selectedTemplateId)?.config)
        || initialConfig;

      const header   = config.header   || initialConfig.header;
      const seller   = config.seller   || initialConfig.seller;
      const customer = config.customer || initialConfig.customer;
      const invoiceInfo = config.invoiceInfo || initialConfig.invoiceInfo;
      const itemsCfg = config.items   || initialConfig.items;
      const tax      = config.tax     || initialConfig.tax;
      const payment  = config.payment || initialConfig.payment;
      const notes    = config.notes   || initialConfig.notes;
      const terms    = config.terms   || initialConfig.terms;
      const signature = config.signature || initialConfig.signature;
      const footer   = config.footer  || initialConfig.footer;
      const design   = config.design  || initialConfig.design;
      const sectionsOrder = config.sectionsOrder || initialConfig.sectionsOrder;

      // Hex to RGB parser helper
      const hexToRgb = (hex: string): [number, number, number] => {
        const clean = (hex || "#4f46e5").replace("#", "");
        const num = parseInt(clean.padEnd(6, "0"), 16);
        return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
      };
      const primaryRgb = hexToRgb(design.primaryColor || "#4f46e5");

      let currentY = 15;

      // Loop through all sections dynamically to respect user-ordered sequence
      sectionsOrder.forEach((sectionName: string) => {
        // Enforce page breaks dynamically if layout overflows vertical A4 height (297mm)
        if (currentY > 250 && sectionName !== "footer") {
          doc.addPage();
          currentY = 20;
        }

        if (sectionName === "header") {
          // Plain white background
          doc.setFillColor(255, 255, 255);
          doc.rect(0, currentY, 210, 35, 'F');
          
          let logoX = 15;
          if (header.showLogo && header.logoUrl) {
            try {
              doc.addImage(header.logoUrl, 'PNG', logoX, currentY + 2, 35, 15);
            } catch (err) {
              console.warn("Logo failed to load in PDF:", err);
            }
          } else {
            // Draw placeholder dotted-like border
            doc.setDrawColor(200, 200, 200);
            doc.setLineDashPattern([2, 2], 0);
            doc.rect(logoX, currentY + 2, 35, 15);
            doc.setLineDashPattern([], 0); // reset
            doc.setTextColor(150, 150, 150);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.text("[ Company Logo ]", logoX + 6, currentY + 10);
          }

          // Company info on the right
          doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(18);
          
          if (header.showCompanyName) {
            doc.text(sellerName.toUpperCase(), 195, currentY + 8, { align: "right" });
          }

          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(100, 116, 139); // slate-500
          
          let headerY = currentY + 13;
          if (header.showAddress && data.sellerAddress) {
            const addrLines = doc.splitTextToSize(data.sellerAddress, 100);
            addrLines.forEach((line: string) => {
              doc.text(line, 195, headerY, { align: "right" });
              headerY += 4;
            });
          }
          if (header.showPhone && data.sellerPhone) {
            doc.text(`Phone: ${data.sellerPhone}`, 195, headerY, { align: "right" });
            headerY += 4;
          }
          if (header.showEmail && data.sellerEmail) {
            doc.text(`Email: ${data.sellerEmail}`, 195, headerY, { align: "right" });
            headerY += 4;
          }
          if (data.sellerGSTIN) {
            doc.setFont("helvetica", "bold");
            doc.text(`GSTIN: ${data.sellerGSTIN}`, 195, headerY, { align: "right" });
            headerY += 4;
          }

          currentY = Math.max(headerY + 8, currentY + 30);
        }

        else if (sectionName === "seller") {
          // Duplicate seller section removed as details are in company letterhead
        }

        else if (sectionName === "customer" && customer.showName) {
          doc.setTextColor(100, 116, 139); // slate-500
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.text("BILL TO", 15, currentY);

          // Left side: Name, Address, Contact
          doc.setTextColor(15, 23, 42); // slate-900
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.text(customerName, 15, currentY + 7);

          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(71, 85, 105); // slate-600
          let custY = currentY + 12;
          if (customer.showBillingAddress && data.customerAddress) {
            const addrLines = doc.splitTextToSize(data.customerAddress, 100);
            addrLines.forEach((line: string) => {
              doc.text(line, 15, custY);
              custY += 4;
            });
          }
          if (customer.showPhone && data.phoneNo) {
            doc.text(`Phone: ${data.phoneNo}`, 15, custY);
            custY += 4;
          }
          if (customer.showEmail && data.customerEmail) {
            doc.text(`Email: ${data.customerEmail}`, 15, custY);
            custY += 4;
          }

          // Right side: GSTIN, Place of Supply
          let rightY = currentY + 7;
          if (customer.showGSTIN && data.customerGSTIN) {
            doc.setTextColor(15, 23, 42);
            doc.setFont("helvetica", "normal");
            doc.text("Customer GSTIN: ", 130, rightY);
            doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
            doc.setFont("helvetica", "bold");
            doc.text(data.customerGSTIN, 195, rightY, { align: "right" });
            rightY += 5;
          }

          if (customer.showPlaceOfSupply && data.stateOfSupply) {
            doc.setTextColor(100, 116, 139);
            doc.setFont("helvetica", "normal");
            doc.text("Place of Supply: ", 130, rightY);
            doc.setTextColor(15, 23, 42);
            doc.setFont("helvetica", "bold");
            doc.text(data.stateOfSupply, 195, rightY, { align: "right" });
          }

          currentY = Math.max(custY + 5, rightY + 8);
        }

        else if (sectionName === "invoiceInfo") {
          // Draw container border box
          const boxHeight = 18;
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(226, 232, 240);
          doc.roundedRect(15, currentY, 180, boxHeight, 3, 3, 'FD');

          let colWidth = 45;
          let colX = 20;

          const renderCol = (label: string, value: string, isColored = false) => {
            doc.setTextColor(100, 116, 139); // slate-500
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.text(label.toUpperCase(), colX, currentY + 6);

            if (isColored) {
              doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
            } else {
              doc.setTextColor(15, 23, 42);
            }
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.text(value, colX, currentY + 12);
            colX += colWidth;
          };

          if (invoiceInfo.showInvoiceNumber && data.invoiceNo) {
            renderCol(invoiceInfo.labels?.invoiceNumber || "INVOICE NO.", `#${data.invoiceNo}`, true);
          }
          if (invoiceInfo.showInvoiceDate && data.invoiceDate) {
            renderCol(invoiceInfo.labels?.invoiceDate || "INVOICE DATE", data.invoiceDate);
          }
          if (invoiceInfo.showDueDate && data.dueDate) {
            renderCol(invoiceInfo.labels?.dueDate || "DUE DATE", data.dueDate);
          }
          if (invoiceInfo.showPaymentTerms && data.paymentTerms) {
            renderCol(invoiceInfo.labels?.paymentTerms || "PAYMENT TERMS", data.paymentTerms);
          }

          currentY += boxHeight + 8;
        }

        else if (sectionName === "items") {
          // Render item table
          const activeCols = itemsCfg.columns || ["item", "sku", "description", "hsn", "quantity", "rate", "discount", "tax", "amount"];
          const colMapping: any = {
            item: itemsCfg.labels?.item || "Item",
            sku: itemsCfg.labels?.sku || "Item Code",
            description: itemsCfg.labels?.description || "Description",
            hsn: itemsCfg.labels?.hsn || "HSN/SAC",
            quantity: itemsCfg.labels?.quantity || "Qty",
            rate: itemsCfg.labels?.rate || "Rate",
            discount: itemsCfg.labels?.discount || "Discount",
            tax: itemsCfg.labels?.tax || "Tax",
            amount: itemsCfg.labels?.amount || "Amount"
          };

          const tableHead = activeCols.map(col => colMapping[col] || col);
          const tableBody = data.items.map((item: InvoiceItem) => {
            return activeCols.map(col => {
              switch (col) {
                case "item":        return item.itemName || "";
                case "sku":         return item.itemCode || "-";
                case "description": return item.description || "-";
                case "hsn":         return item.hsnCode || "-";
                case "quantity":    return `${item.quantity} ${item.unit || 'Pcs'}`;
                case "rate":        return formatPDFCurrency(item.pricePerUnit || 0, "INR ");
                case "discount":    return item.discountPercent ? `${item.discountPercent}%` : (item.discountAmount ? formatPDFCurrency(item.discountAmount, "INR ") : "0%");
                case "tax":         return `${item.taxPercent || 0}%`;
                case "amount":      return formatPDFCurrency(item.amount || 0, "INR ");
                default:            return "";
              }
            });
          });

          autoTable(doc, {
            startY: currentY,
            head: [tableHead],
            body: tableBody,
            theme: design.borderStyle === 'none' ? 'plain' : 'striped',
            headStyles: { fillColor: primaryRgb as [number,number,number], textColor: [255, 255, 255] as [number,number,number], fontStyle: 'bold', fontSize: 9 },
            bodyStyles: { textColor: [15, 23, 42] as [number,number,number], fontSize: 9 },
            columnStyles: activeCols.reduce((acc: any, col: string, i: number) => {
              if (col === 'amount' || col === 'rate') acc[i] = { halign: 'right' };
              return acc;
            }, {})
          });

          currentY = ((doc as any).lastAutoTable?.finalY ?? (currentY + 50)) + 8;
        }

        else if (sectionName === "tax" && tax.showSummary) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.text(`Subtotal:`, 130, currentY);
          doc.text(formatPDFCurrency(data.subtotal || 0, "INR "), 190, currentY, { align: 'right' });
          let totY = currentY + 6;

          const addTotalRow = (label: string, value: number, isBold = false) => {
            if (isBold) {
              doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
              doc.rect(125, totY - 4, 70, 8, 'F');
              doc.setTextColor(255, 255, 255);
              doc.setFont("helvetica", "bold");
              doc.setFontSize(10);
            }
            doc.text(label, 130, totY);
            doc.text(formatPDFCurrency(value || 0, "INR "), 190, totY, { align: 'right' });
            if (isBold) {
              doc.setTextColor(15, 23, 42);
              doc.setFont("helvetica", "normal");
              doc.setFontSize(9);
            }
            totY += 6;
          };

          const totalDiscount = (data.items || []).reduce((sum: number, i: any) => sum + (i.discountAmount || 0), 0);
          if (totalDiscount > 0) addTotalRow("Total Discount:", -totalDiscount);

          if (tax.showCGST && (data.totalCgst || 0) > 0) addTotalRow("CGST:", data.totalCgst);
          if (tax.showSGST && (data.totalSgst || 0) > 0) addTotalRow("SGST:", data.totalSgst);
          if (tax.showIGST && (data.totalIgst || 0) > 0) addTotalRow("IGST:", data.totalIgst);
          if (tax.showTotalTax && (data.totalTax || 0) > 0) addTotalRow("Total Tax:", data.totalTax);

          const shipping  = data.shippingCharges  || 0;
          const packaging = data.packagingCharges || 0;
          const freight   = data.freightCharges   || 0;
          const adjustment = data.adjustment      || 0;

          if (shipping  > 0) addTotalRow("Shipping:", shipping);
          if (packaging > 0) addTotalRow("Packaging:", packaging);
          if (freight   > 0) addTotalRow("Freight:", freight);
          if (adjustment !== 0) addTotalRow("Adjustment:", adjustment);

          addTotalRow("GRAND TOTAL:", data.total || 0, true);
          currentY = totY + 4;
        }

        else if (sectionName === "payment") {
          // Draw rounded container box matching preview styles
          const boxHeight = 24;
          const bgCol = hexToRgb(design.secondaryColor || "#f8fafc");
          const borderCol = hexToRgb(design.borderColor || "#cbd5e1");
          const radius = design.cornerRadius || 3;
          
          doc.setFillColor(bgCol[0], bgCol[1], bgCol[2]);
          doc.setDrawColor(borderCol[0], borderCol[1], borderCol[2]);
          doc.roundedRect(15, currentY, 180, boxHeight, radius, radius, 'FD');

          let colWidth = 45;
          let colX = 20;

          const renderCol = (label: string, value: string, isColored = false, colorHex = "") => {
            doc.setTextColor(100, 116, 139); // slate-500
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.text(label.toUpperCase(), colX, currentY + 6);

            if (isColored && colorHex) {
              const rgb = hexToRgb(colorHex);
              doc.setTextColor(rgb[0], rgb[1], rgb[2]);
            } else if (isColored) {
              doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
            } else {
              doc.setTextColor(15, 23, 42); // slate-900
            }
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.text(value, colX, currentY + 12);
            colX += colWidth;
          };

          renderCol("Paid Amount", formatPDFCurrency(data.paid || 0, "INR "));
          renderCol("Balance Due", formatPDFCurrency(data.balance ?? ((data.total || 0) - (data.paid || 0)), "INR "), true, "#e11d48");
          if (data.paymentMethod) {
            renderCol("Method", data.paymentMethod);
          }

          // Banking details in PDF
          doc.setTextColor(100, 116, 139);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          doc.text(`BANKING DETAILS: ${data.bankName || 'ABC Bank'} | A/C: ${data.accountNumber || 'XXXXXXXX'} (${data.accountType || 'Current'}) | IFSC: ${data.ifscCode || 'ABCD0001234'}`, 20, currentY + 19);

          currentY += boxHeight + 8;
        }

        else if (sectionName === "notes" && notes.show) {
          const notesText = data.notes || notes.defaultText;
          if (notesText) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.text(notes.label || "Notes:", 15, currentY);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            const noteLines = doc.splitTextToSize(notesText, 100);
            doc.text(noteLines, 15, currentY + 5);
            currentY += (noteLines.length * 4) + 8;
          }
        }

        else if (sectionName === "terms" && terms.show) {
          const termsText = data.termsAndConditions || terms.defaultText;
          if (termsText) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.text(terms.label || "Terms & Conditions:", 15, currentY);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            const termLines = doc.splitTextToSize(termsText, 100);
            doc.text(termLines, 15, currentY + 5);
            currentY += (termLines.length * 4) + 8;
          }
        }

        else if (sectionName === "signature") {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          const sigName = data.authorisedSignature || signature.name || "Authorized Signatory";
          doc.text(sigName, 150, currentY + 18);
          doc.line(150, currentY + 20, 195, currentY + 20);
          doc.text("Authorised Signature", 150, currentY + 25);
          if (signature.designation) doc.text(signature.designation, 150, currentY + 29);
          if (signature.imageUrl) {
            try {
              doc.addImage(signature.imageUrl, 'PNG', 150, currentY + 2, 30, 12);
            } catch (e) {
              console.log("Signature image loading error:", e);
            }
          }
          currentY += 32;
        }

        else if (sectionName === "footer") {
          doc.setFont("helvetica", "italic");
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          doc.text(footer.text || "This is a digitally generated invoice.", 15, 282, { maxWidth: 180 });
        }
      });

      // Generate Blob URL and open print preview natively
      const pdfBlob = doc.output('blob');
      const blobURL = URL.createObjectURL(pdfBlob);
      
      const printWindow = window.open(blobURL);
      if (printWindow) {
        toast.success("Opening print preview...");
      } else {
        doc.save(`invoice_${data.invoiceNo}.pdf`);
        toast.success("PDF saved! Please check your downloads.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate PDF");
    }
  };

  // Export invoice
  const exportInvoice = (format: 'csv' | 'pdf') => {
    if (currentInvoice.items.length === 0) {
      toast.error("No items to export. Please add items first.");
      return;
    }

    if (format === 'csv') {
      const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
      const items = currentInvoice.items;
      const anyTax = items.some(i => i.taxAmount > 0);
      const anyDiscount = items.some(i => i.discountAmount > 0);
      const anyCode = items.some(i => i.itemCode);
      const anyHSN = items.some(i => i.hsnCode);

      // Invoice Header — only non-empty fields
      let csvContent = "INVOICE DETAILS\n";
      if (currentInvoice.invoiceNo) csvContent += `Invoice No,${currentInvoice.invoiceNo}\n`;
      if (currentInvoice.invoiceDate) csvContent += `Invoice Date,${currentInvoice.invoiceDate}\n`;
      if (currentInvoice.partyName) csvContent += `Customer Name,${esc(currentInvoice.partyName)}\n`;
      if (currentInvoice.phoneNo) csvContent += `Phone,${currentInvoice.phoneNo}\n`;
      if (currentInvoice.stateOfSupply) csvContent += `State of Supply,${currentInvoice.stateOfSupply}\n`;
      if (currentInvoice.businessState) csvContent += `Business State,${currentInvoice.businessState}\n`;
      if (currentInvoice.saleType) csvContent += `Payment Mode,${currentInvoice.saleType}\n`;
      csvContent += "\n";

      // Items — dynamic columns based on actual data
      csvContent += "ITEMS\n";
      const cols: string[] = ['Item Name'];
      if (anyCode) cols.push('Item Code');
      if (anyHSN) cols.push('HSN Code');
      cols.push('Quantity', 'Unit', 'Price');
      if (anyDiscount) cols.push('Discount');
      if (anyTax) cols.push('Tax %', 'Tax Amt');
      cols.push('Line Total');
      csvContent += cols.join(',') + '\n';

      items.forEach(item => {
        const row: string[] = [esc(item.itemName)];
        if (anyCode) row.push(esc(item.itemCode || ''));
        if (anyHSN) row.push(esc(item.hsnCode || ''));
        row.push(String(item.quantity), esc(item.unit), String(item.pricePerUnit));
        if (anyDiscount) row.push(String(item.discountAmount));
        if (anyTax) {
          const taxPct = item.isInterState ? `IGST ${item.igstRate}%` : `${item.sgstRate + item.cgstRate}%`;
          row.push(item.taxAmount > 0 ? taxPct : '0%');
          row.push(String(item.taxAmount));
        }
        row.push(String(item.amount));
        csvContent += row.join(',') + '\n';
      });

      // Summary — only non-zero values
      csvContent += "\nSUMMARY\n";
      // Recalculate from items to ensure correctness
      const grandTotal = items.reduce((sum, i) => sum + i.amount, 0);
      const totalTax = items.reduce((sum, i) => sum + i.taxAmount, 0);
      const subtotal = grandTotal - totalTax;

      if (subtotal > 0) csvContent += `Subtotal,${Math.round(subtotal * 100) / 100}\n`;
      if (anyDiscount) {
        const discTotal = items.reduce((sum, i) => sum + i.discountAmount, 0);
        if (discTotal > 0) csvContent += `Total Discount,${Math.round(discTotal * 100) / 100}\n`;
      }
      if (totalTax > 0) csvContent += `Total Tax,${Math.round(totalTax * 100) / 100}\n`;
      csvContent += `Grand Total,${Math.round(grandTotal * 100) / 100}\n`;
      if (currentInvoice.paid > 0) csvContent += `Amount Paid,${currentInvoice.paid}\n`;
      const balance = grandTotal - currentInvoice.paid;
      if (balance > 0) csvContent += `Balance Due,${Math.round(balance * 100) / 100}\n`;

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice_${currentInvoice.invoiceNo}_${currentInvoice.invoiceDate}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Invoice exported to CSV!");
    } else {
      generateInvoicePDF(currentInvoice);
    }
  };

  // Print invoice — uses active template (colors, fonts, columns) via PDF
  const printInvoice = () => {
    if (currentInvoice.items.length === 0) {
      toast.error("Add at least one item before printing.");
      return;
    }
    // Use the template-aware PDF generator and print the result
    generateInvoicePDF(currentInvoice);
  };

  // Copy invoice details
  const copyInvoiceDetails = () => {
    const itemsList = currentInvoice.items.map(item =>
      `- ${item.itemName}: ${item.quantity} ${item.unit} x ₹${item.pricePerUnit} = ₹${item.amount}`
    ).join('\n');

    const details = `
Invoice: ${currentInvoice.invoiceNo}
Date: ${currentInvoice.invoiceDate}
${currentInvoice.type === 'sales' ? 'Customer' : 'Party'}: ${currentInvoice.partyName}
Phone: ${currentInvoice.phoneNo}

Items:
${itemsList}

Total: ₹${currentInvoice.total.toFixed(2)}
Paid: ₹${currentInvoice.paid.toFixed(2)}
Balance: ₹${currentInvoice.balance.toFixed(2)}`;

    navigator.clipboard.writeText(details)
      .then(() => toast.success("Invoice details copied to clipboard!"))
      .catch(err => console.error("Failed to copy:", err));
  };

  // Share on WhatsApp — auto-saves first if needed
  const shareOnWhatsApp = async () => {
    if (currentInvoice.items.length === 0 && invoiceHistory.length === 0) {
      toast.error("Add items to the invoice before sharing.");
      return;
    }

    let idToUse = lastSavedId;

    // Auto-save if not yet saved
    if (!idToUse && currentInvoice.items.length > 0) {
      toast.info("Saving invoice before sharing...");
      const savedId = await saveInvoice('sent');
      if (!savedId) {
        toast.error("Could not save invoice. Share cancelled.");
        return;
      }
      idToUse = savedId;
    }

    // Use saved invoice data
    const data = currentInvoice;
    const customerName = data.partyName || 'Valued Customer';
    const grandTotal = data.total || 0;
    const amountPaid = data.paid || 0;
    const balanceDue = data.balance || 0;

    // Always use production domain for the shareable link — localhost links won't work for customers
    const productionBase = 'https://software.saaiss.in';
    const shareLink = idToUse ? `${productionBase}/invoice/view/${idToUse}` : null;

    // Build professional WhatsApp message
    let message = `*INVOICE: ${data.invoiceNo}*\n`;
    message += `__________________________\n\n`;
    message += `Dear *${customerName}*,\n\n`;
    message += `A new invoice has been generated for your recent transaction with *${data.sellerName || 'us'}*.\n\n`;
    message += `*Bill Summary:*\n`;
    message += `• Invoice No: #${data.invoiceNo}\n`;
    message += `• Date: ${data.invoiceDate}\n`;
    message += `• Total Amount: ₹${grandTotal.toFixed(2)}\n`;
    if (amountPaid > 0) message += `• Amount Paid: ₹${amountPaid.toFixed(2)}\n`;
    if (balanceDue > 0) message += `• Balance Due: ₹${balanceDue.toFixed(2)}\n`;
    message += `\n`;

    if (shareLink) {
      message += `📄 *View & Download Invoice:*\n🔗 ${shareLink}\n\n`;
    }

    message += `For any queries, please feel free to reach out.\n\n`;
    message += `Best regards,\n`;
    message += `*${data.sellerName || 'Your Business'}*\n`;
    message += `__________________________\n`;
    message += `_Powered by AIBASS Financial Automation_`;

    const encodedMessage = encodeURIComponent(message);

    // If customer phone is available, open direct WhatsApp chat; otherwise open share sheet
    const rawPhone = data.phoneNo?.replace(/\D/g, '') || '';
    const phoneWithCode = rawPhone && !rawPhone.startsWith('91') && rawPhone.length === 10
      ? `91${rawPhone}`
      : rawPhone;

    const waUrl = phoneWithCode
      ? `https://wa.me/${phoneWithCode}?text=${encodedMessage}`
      : `https://wa.me/?text=${encodedMessage}`;

    window.open(waUrl, '_blank');
    toast.success("WhatsApp opened! Send the message to your customer.");
  };

  // Apply parsed voice data
  const handleApplyVoiceData = () => {
    if (!voiceTranscript) return;

    setIsProcessingVoice(true);

    const parsedData = parseVoiceInvoiceText(voiceTranscript);

    setTimeout(() => {
      let fieldsUpdated = 0;

      if (parsedData.invoiceNumber) {
        setCurrentInvoice(prev => ({ ...prev, invoiceNo: parsedData.invoiceNumber || prev.invoiceNo }));
        fieldsUpdated++;
      }

      if (parsedData.customerName) {
        setCurrentInvoice(prev => ({ ...prev, partyName: parsedData.customerName || prev.partyName }));
        fieldsUpdated++;
      }

      if (parsedData.items.length > 0) {
        let newItems: InvoiceItem[] = [...currentInvoice.items];

        parsedData.items.forEach(item => {
          const automation = getAutomatedCode(item.product, '');
          const taxPct = automation?.gstRate || 18;
          const calculated = calculateItemAmounts({
            ...newItem,
            itemName: item.product,
            codeType: automation?.codeType || 'HSN',
            hsnCode: automation?.code || '',
            quantity: item.quantity,
            unit: 'Pcs',
            pricePerUnit: item.rate,
            priceWithTax: false,
            taxPercent: taxPct
          });

          newItems.push({
            id: `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            itemName: item.product,
            itemCode: '',
            codeType: automation?.codeType || 'HSN',
            hsnCode: automation?.code || '',
            quantity: item.quantity,
            unit: 'Pcs',
            pricePerUnit: item.rate,
            priceWithTax: false,
            discountPercent: 0,
            discountAmount: 0,
            taxPercent: taxPct,
            ...calculated
          } as InvoiceItem);
        });

        const newTotal = newItems.reduce((sum, item) => sum + item.amount, 0);

        setCurrentInvoice(prev => ({
          ...prev,
          items: newItems,
          total: newTotal,
          balance: newTotal - prev.paid
        }));

        fieldsUpdated += parsedData.items.length;
      }

      setIsProcessingVoice(false);

      if (fieldsUpdated > 0) {
        toast.success(`Voice data applied! Updated ${fieldsUpdated} fields/items.`);
        setActiveTab('create');
      } else {
        toast.error("Could not extract any invoice details from the transcript.");
      }
    }, 1000);
  };

  // Calculate item preview
  const itemPreview = calculateItemAmounts(newItem);

  // Filter invoice history
  const filteredHistory = invoiceHistory.filter(invoice => {
    const query = searchTerm.toLowerCase().trim();
    if (!query) return true;
    return [
      invoice.invoiceNo,
      invoice.partyName,
      invoice.phoneNo,
      invoice.customerGSTIN,
      invoice.sellerName,
      invoice.sellerGSTIN,
      invoice.transactionType,
      invoice.invoiceDate,
      invoice.saleType
    ].some(value => String(value || '').toLowerCase().includes(query));
  });

  const deleteHistoryInvoice = async (invoiceId?: string, invoiceNo?: string, type?: string) => {
    if (invoiceId) {
      try {
        const token = localStorage.getItem("token");
        const isPurchase = type === 'purchase' || (invoiceNo && invoiceNo.startsWith('PUR'));
        const endpoint = isPurchase ? `${API_BASE_URL}/purchase-invoice` : API_ENDPOINTS.INVOICE;
        await fetch(`${endpoint}/${invoiceId}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${token}` }
        });
      } catch (err) {
        console.error("Error deleting invoice from server:", err);
      }
    }
    const savedList = JSON.parse(localStorage.getItem('savedInvoices') || '[]');
    const updatedList = savedList.filter((invoice: InvoiceData & { id?: string }) => {
      if (invoiceId) return invoice.id !== invoiceId;
      return invoice.invoiceNo !== invoiceNo;
    });
    localStorage.setItem('savedInvoices', JSON.stringify(updatedList));
    setInvoiceHistory(prev => prev.filter(inv => {
      if (invoiceId) return (inv as any).id !== invoiceId && (inv as any)._id !== invoiceId;
      return inv.invoiceNo !== invoiceNo;
    }));
    toast.success("Invoice deleted from history and server");
  };

  // Handle back to dashboard
  const handleBackToDashboard = () => {
    navigate("/dashboard");
  };

  return (
    <div className="liquid-page min-h-screen overflow-hidden text-slate-950">
      <div className="liquid-backdrop fixed inset-0 pointer-events-none" />

      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          /* Reset containers for print */
          body, html, .liquid-page, main {
            background: white !important;
            color: #0f172a !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          #invoice-official-copy {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
          }
          @page {
            size: ${currentInvoice.invoiceSize === 'A6' ? '105mm 148mm' : 'A4'};
            margin: 8mm;
          }
        }
      `}</style>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/40 bg-white/24 backdrop-blur-2xl no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={handleBackToDashboard}
              className="mb-4 rounded-full border border-white/60 bg-white/45 text-slate-700 hover:bg-white/70 hover:text-slate-950"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate("/invoice/templates")}
              className="mb-4 rounded-full border border-white/60 bg-white/45 text-slate-700 hover:bg-white/70 hover:text-slate-950 flex items-center gap-1.5"
            >
              <Layout className="h-4 w-4 text-indigo-600" />
              Invoice Templates
            </Button>
          </div>
          <div className="flex items-center gap-4">
            <div className="liquid-icon flex h-16 w-16 items-center justify-center rounded-[22px]">
              <Receipt className="h-8 w-8 text-slate-900" />
            </div>
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
                Invoice Automation
              </h1>
              <p className="mt-1 text-slate-600">Professional Invoice with OCR & Voice Input</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        {/* Tabs Navigation */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8 no-print">
          {[
            { id: 'create', label: 'Create Invoice', icon: Plus, desc: 'Generate new' },
            { id: 'ocr', label: 'Invoice OCR', icon: Camera, desc: 'Scan & Auto-Extract' },
            { id: 'voice', label: 'Voice', icon: Mic, desc: 'Dictate invoice' },
            { id: 'history', label: 'History', icon: Eye, desc: 'Past invoices' }
          ].map(({ id, label, icon: Icon, desc }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={`flex items-center justify-between p-4 md:p-6 rounded-[24px] border transition-all duration-300 ${activeTab === id
                ? 'bg-slate-950 text-white border-slate-950 shadow-lg'
                : 'bg-white/42 border-white/55 text-slate-700 hover:bg-white/70 hover:text-slate-950'
                }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 md:p-3 rounded-[16px] ${activeTab === id ? 'bg-white/10' : 'bg-slate-100'}`}>
                  <Icon className={`h-5 w-5 md:h-6 md:w-6 ${activeTab === id ? 'text-white' : 'text-slate-900'}`} />
                </div>
                <div className="text-left">
                  <h3 className="text-sm md:text-xl font-bold">{label}</h3>
                  {desc && <p className={`text-xs ${activeTab === id ? 'text-white/70' : 'text-slate-500'} hidden md:block`}>{desc}</p>}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Create Invoice Tab */}
        {activeTab === 'create' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Form */}
            <div className="lg:col-span-2 space-y-6 no-print">
              {/* Payment and Document Options */}
              <Card className="liquid-panel overflow-hidden rounded-[36px] border-white/55 p-5">
                <Label className="text-slate-900 mb-3 block font-bold">Payment Mode</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { type: 'cash', label: 'Cash', icon: Banknote, activeClass: 'bg-emerald-600 text-white' },
                    { type: 'credit', label: 'Credit', icon: CreditCard, activeClass: 'bg-blue-600 text-white' },
                    { type: 'UPI', label: 'UPI', icon: Smartphone, activeClass: 'bg-violet-600 text-white' },
                    { type: 'netbanking', label: 'Netbanking', icon: Building2, activeClass: 'bg-indigo-600 text-white' }
                  ].map((mode) => (
                    <button
                      key={mode.type}
                      onClick={() => {
                        setLastSavedId(null);
                        setCurrentInvoice(prev => ({ ...prev, saleType: mode.type as any }));
                      }}
                      className={`py-2.5 px-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${currentInvoice.saleType === mode.type
                        ? mode.activeClass
                        : 'bg-white/80 border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                    >
                      <mode.icon className="h-4 w-4" />
                      {mode.label}
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  <div className="space-y-2">
                    <Label className="text-slate-800 text-sm font-semibold">Print Size</Label>
                    <Select value={currentInvoice.invoiceSize} onValueChange={(val: 'A4' | 'QUARTER_A4' | 'A6') => setCurrentInvoice(prev => ({ ...prev, invoiceSize: val }))}>
                      <SelectTrigger className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border border-slate-200 text-slate-900">
                        <SelectItem value="A4">A4</SelectItem>
                        <SelectItem value="A6">A6 Receipt</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-800 text-sm font-semibold">Due Reminder</Label>
                    <Select value={String(currentInvoice.dueReminderDays)} onValueChange={(val) => setCurrentInvoice(prev => ({ ...prev, dueReminderDays: Number(val) }))}>
                      <SelectTrigger className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border border-slate-200 text-slate-900">
                        <SelectItem value="0">No reminder</SelectItem>
                        <SelectItem value="7">1 week</SelectItem>
                        <SelectItem value="14">2 weeks</SelectItem>
                        <SelectItem value="30">1 month</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-800 text-sm font-semibold">Transaction Type</Label>
                    <Select value={currentInvoice.transactionType} onValueChange={(val: 'B2B' | 'B2C') => setCurrentInvoice(prev => ({ ...prev, transactionType: val }))}>
                      <SelectTrigger className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-350">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border border-slate-200 text-slate-900">
                        <SelectItem value="B2B">B2B</SelectItem>
                        <SelectItem value="B2C">B2C</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-800 text-sm font-semibold">Due Date</Label>
                    <Input
                      type="date"
                      value={currentInvoice.dueDate}
                      onChange={(e) => setCurrentInvoice(prev => ({ ...prev, dueDate: e.target.value }))}
                      className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-350"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-800 text-sm font-semibold">Payment Terms</Label>
                    <Select value={currentInvoice.paymentTerms} onValueChange={(val) => setCurrentInvoice(prev => ({ ...prev, paymentTerms: val }))}>
                      <SelectTrigger className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-350">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border border-slate-200 text-slate-900">
                        <SelectItem value="Due on Receipt">Due on Receipt</SelectItem>
                        <SelectItem value="Net 15">Net 15</SelectItem>
                        <SelectItem value="Net 30">Net 30</SelectItem>
                        <SelectItem value="Net 60">Net 60</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-800 text-sm font-semibold">Order / Reference No.</Label>
                    <Input
                      value={currentInvoice.orderNumber || ''}
                      onChange={(e) => setCurrentInvoice(prev => ({ ...prev, orderNumber: e.target.value }))}
                      placeholder="e.g. PO-98211"
                      className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 placeholder:text-slate-400 focus:border-slate-350"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-800 text-sm font-semibold">Salesperson</Label>
                    <Input
                      value={currentInvoice.salespersonName || ''}
                      onChange={(e) => setCurrentInvoice(prev => ({ ...prev, salespersonName: e.target.value }))}
                      placeholder="Sales agent name"
                      className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 placeholder:text-slate-400 focus:border-slate-350"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-800 text-sm font-semibold">Currency</Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Select value={currentInvoice.currency} onValueChange={(val) => setCurrentInvoice(prev => ({ ...prev, currency: val }))}>
                        <SelectTrigger className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-350">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border border-slate-200 text-slate-900">
                          <SelectItem value="INR">INR ₹</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        value={currentInvoice.exchangeRate}
                        onChange={(e) => setCurrentInvoice(prev => ({ ...prev, exchangeRate: parseFloat(e.target.value) || 1 }))}
                        placeholder="Ex. Rate"
                        disabled={currentInvoice.currency === 'INR'}
                        className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-350 disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>
              </Card>

              {invoiceType === 'sales' && (
                <Card className="liquid-panel overflow-hidden rounded-[36px] border-white/55 p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                    <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-slate-800" />
                      Seller Details
                    </h2>
                    <span 
                      onClick={() => navigate("/profile")} 
                      className="text-xs text-indigo-600 font-semibold hover:underline cursor-pointer flex items-center gap-1"
                    >
                      Edit in Profile Settings →
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-slate-800 text-sm font-semibold">Seller Name *</Label>
                      <Input
                        value={currentInvoice.sellerName}
                        readOnly={true}
                        placeholder="Enter seller name"
                        className="h-10 rounded-[14px] border-slate-200 bg-slate-50 text-slate-900 cursor-not-allowed placeholder:text-slate-400 focus:border-slate-350"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-800 text-sm font-semibold">Phone Number</Label>
                      <Input
                        value={currentInvoice.sellerPhone}
                        readOnly={true}
                        placeholder="Enter phone number"
                        className="h-10 rounded-[14px] border-slate-200 bg-slate-50 text-slate-900 cursor-not-allowed placeholder:text-slate-400 focus:border-slate-350"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-800 text-sm font-semibold">Seller Email</Label>
                      <Input
                        value={currentInvoice.sellerEmail || ''}
                        readOnly={true}
                        placeholder="seller@example.com"
                        className="h-10 rounded-[14px] border-slate-200 bg-slate-50 text-slate-900 cursor-not-allowed placeholder:text-slate-400 focus:border-slate-350"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-800 text-sm font-semibold">Seller GSTIN</Label>
                      <Input
                        value={currentInvoice.sellerGSTIN}
                        readOnly={true}
                        placeholder="Enter seller GSTIN"
                        className="h-10 rounded-[14px] border-slate-200 bg-slate-50 text-slate-900 cursor-not-allowed placeholder:text-slate-400 focus:border-slate-350"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-800 text-sm font-semibold">Seller State</Label>
                      <Select
                        value={currentInvoice.businessState}
                        disabled={true}
                      >
                        <SelectTrigger className="h-10 rounded-[14px] border-slate-200 bg-slate-50 text-slate-900 cursor-not-allowed focus:border-slate-350">
                          <SelectValue placeholder="Select Business State" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border border-slate-200 text-slate-900 max-h-48 overflow-y-auto">
                          {INDIAN_STATES.map(st => (
                            <SelectItem key={st} value={st}>{st}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-800 text-sm font-semibold">Seller Address</Label>
                      <Input
                        value={currentInvoice.sellerAddress || ''}
                        readOnly={true}
                        placeholder="Full seller address"
                        className="h-10 rounded-[14px] border-slate-200 bg-slate-50 text-slate-900 cursor-not-allowed placeholder:text-slate-400 focus:border-slate-350"
                      />
                    </div>
                  </div>
                </Card>
              )}

              {/* Banking Details Card */}
              <Card className="liquid-panel overflow-hidden rounded-[36px] border-white/55 p-5">
                <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Building className="h-5 w-5 text-slate-800" />
                  Banking Details
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-800 text-sm font-semibold">Bank Name</Label>
                    <Input
                      value={currentInvoice.bankName || ''}
                      onChange={(e) => setCurrentInvoice(prev => ({ ...prev, bankName: e.target.value }))}
                      placeholder="e.g. HDFC Bank / ICICI Bank"
                      className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-400 placeholder:text-slate-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-800 text-sm font-semibold">Account Type</Label>
                    <Select
                      value={currentInvoice.accountType || 'Current'}
                      onValueChange={(val) => setCurrentInvoice(prev => ({ ...prev, accountType: val }))}
                    >
                      <SelectTrigger className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-400">
                        <SelectValue placeholder="Select Account Type" />
                      </SelectTrigger>
                      <SelectContent className="bg-white border border-slate-200 text-slate-900">
                        <SelectItem value="Current">Current</SelectItem>
                        <SelectItem value="Savings">Savings</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-800 text-sm font-semibold">Account Number</Label>
                    <Input
                      value={currentInvoice.accountNumber || ''}
                      onChange={(e) => setCurrentInvoice(prev => ({ ...prev, accountNumber: e.target.value }))}
                      placeholder="Enter Account Number"
                      className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-400 placeholder:text-slate-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-800 text-sm font-semibold">IFSC Code</Label>
                    <Input
                      value={currentInvoice.ifscCode || ''}
                      onChange={(e) => setCurrentInvoice(prev => ({ ...prev, ifscCode: e.target.value.toUpperCase() }))}
                      placeholder="e.g. HDFC0001234"
                      className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-400 placeholder:text-slate-400 uppercase"
                    />
                  </div>
                </div>
              </Card>

              {/* Customer Details */}
              <Card className="liquid-panel overflow-hidden rounded-[36px] border-white/55 p-5">
                <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <User className="h-5 w-5 text-slate-800" />
                  {invoiceType === 'sales' ? 'Customer Details' : 'Customer Details (Purchase Invoice)'}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2 relative">
                    <div className="flex justify-between items-center">
                      <Label className="text-slate-800 text-sm font-semibold">Customer Name *</Label>
                      <button
                        type="button"
                        onClick={() => setIsAddCustomerOpen(true)}
                        className="text-xs text-indigo-700 hover:text-indigo-900 font-bold hover:underline"
                      >
                        + Add Customer
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          value={currentInvoice.partyName}
                          onChange={(e) => {
                            setLastSavedId(null);
                            setCurrentInvoice(prev => ({ ...prev, partyName: e.target.value }));
                            setCustomerSearchTerm(e.target.value);
                            setIsCustomerDropdownOpen(true);
                          }}
                          onFocus={() => {
                            setCustomerSearchTerm(currentInvoice.partyName);
                            setIsCustomerDropdownOpen(true);
                          }}
                          placeholder="Search or enter name"
                          className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 placeholder:text-slate-400 focus:border-slate-300"
                        />
                        {isCustomerDropdownOpen && (
                          <div className="absolute z-30 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-[14px] shadow-lg p-2 space-y-1">
                            {customersList.filter(cust =>
                              cust.name.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
                              cust.phone.includes(customerSearchTerm)
                            ).length > 0 ? (
                              customersList.filter(cust =>
                                cust.name.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
                                cust.phone.includes(customerSearchTerm)
                              ).map((cust) => (
                                <div
                                  key={cust._id}
                                  onClick={() => {
                                    setCurrentInvoice(prev => ({
                                      ...prev,
                                      partyName: cust.name,
                                      phoneNo: cust.phone || "",
                                      customerEmail: cust.email || "",
                                      customerGSTIN: cust.gstin || "",
                                      stateOfSupply: cust.placeOfSupply || "",
                                      customerAddress: cust.billingAddress || ""
                                    }));
                                    setIsCustomerDropdownOpen(false);
                                  }}
                                  className="p-2.5 rounded-lg hover:bg-indigo-50 cursor-pointer flex justify-between items-center text-xs text-left"
                                >
                                  <div>
                                    <p className="font-semibold text-slate-900">{cust.name}</p>
                                    <p className="text-slate-500">{cust.email || "No email"}</p>
                                  </div>
                                  <div className="text-right text-slate-500">
                                    <p>{cust.phone || "No phone"}</p>
                                    {cust.gstin && <p className="text-[10px] font-bold text-indigo-700">GST: {cust.gstin}</p>}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="p-3 text-center text-slate-500 text-xs">
                                No customers found. Click "+ Add Customer" to create one.
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsCustomerDropdownOpen(false);
                              }}
                              className="w-full py-1.5 text-[11px] text-slate-500 hover:text-slate-700 border-t border-slate-100 mt-1 text-center font-bold"
                            >
                              Close
                            </button>
                          </div>
                        )}
                      </div>
                      <VoiceButton
                        onTranscript={(text) => {
                          setLastSavedId(null);
                          setCurrentInvoice(prev => ({ ...prev, partyName: text }));
                          setCustomerSearchTerm(text);
                          setIsCustomerDropdownOpen(true);
                        }}
                        onClear={() => {
                          setLastSavedId(null);
                          setCurrentInvoice(prev => ({ ...prev, partyName: '' }));
                          setCustomerSearchTerm('');
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-800 text-sm font-semibold">Phone No.</Label>
                    <div className="flex gap-2">
                      <Input
                        value={currentInvoice.phoneNo}
                        onChange={(e) => {
                          setLastSavedId(null);
                          setCurrentInvoice(prev => ({ ...prev, phoneNo: e.target.value }));
                        }}
                        placeholder="Phone number"
                        className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 placeholder:text-slate-400 focus:border-slate-300"
                      />
                      <VoiceButton
                        onTranscript={(text) => {
                          setLastSavedId(null);
                          setCurrentInvoice(prev => ({ ...prev, phoneNo: text.replace(/\s/g, '') }));
                        }}
                        onClear={() => {
                          setLastSavedId(null);
                          setCurrentInvoice(prev => ({ ...prev, phoneNo: '' }));
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-800 text-sm font-semibold">Customer Email</Label>
                    <Input
                      value={currentInvoice.customerEmail || ''}
                      onChange={(e) => {
                        setLastSavedId(null);
                        setCurrentInvoice(prev => ({ ...prev, customerEmail: e.target.value }));
                      }}
                      placeholder="customer@example.com"
                      className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 placeholder:text-slate-400 focus:border-slate-300"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-800 text-sm font-semibold">Customer GSTIN</Label>
                    <Input
                      value={currentInvoice.customerGSTIN || ''}
                      onChange={(e) => {
                        setLastSavedId(null);
                        const customerGSTIN = e.target.value.toUpperCase();
                        setCurrentInvoice(prev => ({ ...prev, customerGSTIN, transactionType: classifyTransaction(prev.sellerGSTIN, customerGSTIN) }));
                      }}
                      placeholder="Enter GSTIN"
                      className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 placeholder:text-slate-400 focus:border-slate-300"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-800 text-sm font-semibold">Customer Address</Label>
                    <Input
                      value={currentInvoice.customerAddress || ''}
                      onChange={(e) => {
                        setLastSavedId(null);
                        setCurrentInvoice(prev => ({ ...prev, customerAddress: e.target.value }));
                      }}
                      placeholder="Billing Address"
                      className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 placeholder:text-slate-400 focus:border-slate-300"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-800 text-sm font-semibold">E-Way Bill No.</Label>
                    <Input
                      value={currentInvoice.eWayBillNo}
                      onChange={(e) => {
                        setLastSavedId(null);
                        setCurrentInvoice(prev => ({ ...prev, eWayBillNo: e.target.value }));
                      }}
                      placeholder="E-Way bill"
                      className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 placeholder:text-slate-400 focus:border-slate-300"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-800 text-sm font-semibold">{invoiceType === 'sales' ? 'Invoice' : 'Bill'} No.</Label>
                    <Input
                      value={currentInvoice.invoiceNo}
                      onChange={(e) => {
                        setLastSavedId(null);
                        setCurrentInvoice(prev => ({ ...prev, invoiceNo: e.target.value }));
                      }}
                      className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-300"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-800 text-sm font-semibold">{invoiceType === 'sales' ? 'Invoice' : 'Bill'} Date</Label>
                    <Input
                      type="date"
                      value={currentInvoice.invoiceDate}
                      onChange={(e) => {
                        setLastSavedId(null);
                        setCurrentInvoice(prev => ({ ...prev, invoiceDate: e.target.value }));
                      }}
                      className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-300"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-800 text-sm font-semibold">State of Supply</Label>
                    <Select
                      value={currentInvoice.stateOfSupply}
                      onValueChange={(val) => setCurrentInvoice(prev => ({ ...prev, stateOfSupply: val }))}
                    >
                      <SelectTrigger className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-300">
                        <SelectValue placeholder="Select State" />
                      </SelectTrigger>
                      <SelectContent className="bg-white border border-slate-200 text-slate-900 max-h-[250px]">
                        {INDIAN_STATES.map(state => (
                          <SelectItem key={state} value={state}>{state}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </Card>

              {/* Add Items Section */}
              <Card className="liquid-panel overflow-hidden rounded-[36px] border-white/55 p-5">
                <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Package className="h-5 w-5 text-slate-800" />
                  Add Items
                </h2>

                <div className="space-y-4">
                  {/* Select from Inventory Stock */}
                  {inventoryItems.length > 0 && (
                    <div className="relative" ref={inventoryDropdownRef}>
                      <Label className="text-slate-800 text-sm mb-2 block font-semibold">Select from Inventory Stock</Label>
                      <div className="relative">
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                            <Input
                              value={inventorySearchTerm}
                              onChange={(e) => {
                                setInventorySearchTerm(e.target.value);
                                setIsInventoryDropdownOpen(true);
                              }}
                              onFocus={() => setIsInventoryDropdownOpen(true)}
                              placeholder="Search inventory by name, SKU, or category..."
                              className="pl-10 h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-300"
                            />
                          </div>
                          <button
                            onClick={() => setIsInventoryDropdownOpen(!isInventoryDropdownOpen)}
                            className="px-4 h-10 bg-slate-950 text-white rounded-xl transition-all flex items-center gap-2 hover:bg-slate-800"
                          >
                            <Database className="h-4 w-4" />
                            <span className="hidden md:inline">{inventoryItems.length} in stock</span>
                          </button>
                        </div>

                        {/* Inventory Dropdown */}
                        {isInventoryDropdownOpen && (
                          <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                            {isLoadingInventory ? (
                              <div className="p-4 text-center text-slate-650">
                                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-slate-800" />
                                Loading inventory...
                              </div>
                            ) : filteredInventoryItems.length > 0 ? (
                              filteredInventoryItems.map((item) => (
                                <div
                                  key={item._id}
                                  className="w-full px-4 py-3 hover:bg-slate-100 transition-all border-b border-slate-100 last:border-b-0 flex items-center justify-between group"
                                >
                                  <div
                                    onClick={() => selectInventoryItem(item)}
                                    className="flex-1 cursor-pointer flex justify-between items-center mr-4"
                                  >
                                    <div>
                                      <p className="font-medium text-slate-900 group-hover:text-slate-950 transition-colors">{item.itemName}</p>
                                      <p className="text-xs text-slate-500">SKU: {item.sku} • {item.category}</p>
                                    </div>
                                    <div className="text-right">
                                      <p className="font-bold text-emerald-700">₹{item.price}</p>
                                      <p className="text-xs text-slate-500">{item.quantity} in stock</p>
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => deleteInventoryItem(e, item._id)}
                                    className="text-slate-400 hover:text-red-650 hover:bg-red-50 rounded-full h-8 w-8 shrink-0"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))
                            ) : (
                              <div className="p-4 text-center text-slate-500">
                                No items found matching "{inventorySearchTerm}"
                              </div>
                            )}
                            {filteredInventoryItems.length > 0 && (
                              <button
                                onClick={() => setIsInventoryDropdownOpen(false)}
                                className="w-full py-2 text-xs text-slate-600 hover:text-slate-800 border-t border-slate-100"
                              >
                                Close
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="col-span-2 space-y-2">
                      <Label className="text-slate-800 text-sm font-semibold">Item Name *</Label>
                      <div className="flex gap-2">
                        <Input
                          value={newItem.itemName}
                          onChange={(e) => updateNewItemWithAutomation('itemName', e.target.value)}
                          placeholder="Enter item name"
                          className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-300"
                        />
                        <VoiceButton
                          onTranscript={(text) => setNewItem(prev => ({ ...prev, itemName: text }))}
                          onClear={() => setNewItem(prev => ({ ...prev, itemName: '' }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-800 text-sm font-semibold">Item Code</Label>
                      <Input
                        value={newItem.itemCode}
                        onChange={(e) => updateNewItemWithAutomation('itemCode', e.target.value)}
                        placeholder="SKU"
                        className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-300"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-800 text-sm font-semibold">HSN / SAC Code</Label>
                      <div className="grid grid-cols-[88px_1fr] gap-2">
                        <Select value={newItem.codeType || 'HSN'} onValueChange={(val: 'HSN' | 'SAC') => setNewItem(prev => ({ ...prev, codeType: val }))}>
                          <SelectTrigger className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white border border-slate-200 text-slate-900">
                            <SelectItem value="HSN">HSN</SelectItem>
                            <SelectItem value="SAC">SAC</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={newItem.hsnCode}
                          onChange={(e) => setNewItem(prev => ({ ...prev, hsnCode: e.target.value }))}
                          placeholder={newItem.codeType === 'SAC' ? 'SAC' : 'HSN'}
                          className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-300"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                    <div className="space-y-2">
                      <Label className="text-slate-800 text-sm font-semibold">
                        Qty {selectedInventoryMaxQty !== null && (
                          <span className="text-emerald-700 text-xs">(max: {selectedInventoryMaxQty})</span>
                        )}
                      </Label>
                      <Input
                        type="number"
                        value={newItem.quantity}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          if (selectedInventoryMaxQty !== null && val > selectedInventoryMaxQty) {
                            toast.error(`Max available: ${selectedInventoryMaxQty}`);
                            setNewItem(prev => ({ ...prev, quantity: selectedInventoryMaxQty }));
                          } else {
                            setNewItem(prev => ({ ...prev, quantity: val }));
                          }
                        }}
                        min="1"
                        className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-300"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-800 text-sm font-semibold">Unit</Label>
                      <Select value={newItem.unit} onValueChange={(val) => setNewItem(prev => ({ ...prev, unit: val }))}>
                        <SelectTrigger className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-300">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border border-slate-200 text-slate-900">
                          {UNITS.map(unit => (
                            <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-800 text-sm font-semibold">Price *</Label>
                      <Input
                        type="number"
                        value={newItem.pricePerUnit ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewItem(prev => ({ ...prev, pricePerUnit: val }));
                        }}
                        onFocus={() => {
                          if (parseFloat(String(newItem.pricePerUnit)) === 0) {
                            setNewItem(prev => ({ ...prev, pricePerUnit: '' }));
                          }
                        }}
                        onBlur={() => {
                          if (newItem.pricePerUnit === '' || newItem.pricePerUnit === undefined) {
                            setNewItem(prev => ({ ...prev, pricePerUnit: 0 }));
                          } else {
                            setNewItem(prev => ({ ...prev, pricePerUnit: parseFloat(String(newItem.pricePerUnit)) || 0 }));
                          }
                        }}
                        min="0"
                        className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-300"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-800 text-sm font-semibold">Disc %</Label>
                      <Input
                        type="number"
                        value={newItem.discountPercent ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewItem(prev => ({ ...prev, discountPercent: val }));
                        }}
                        onFocus={() => {
                          if (parseFloat(String(newItem.discountPercent)) === 0) {
                            setNewItem(prev => ({ ...prev, discountPercent: '' }));
                          }
                        }}
                        onBlur={() => {
                          if (newItem.discountPercent === '' || newItem.discountPercent === undefined) {
                            setNewItem(prev => ({ ...prev, discountPercent: 0 }));
                          } else {
                            setNewItem(prev => ({ ...prev, discountPercent: parseFloat(String(newItem.discountPercent)) || 0 }));
                          }
                        }}
                        min="0"
                        max="100"
                        className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-300"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-800 text-sm font-semibold">Tax %</Label>
                      <Select 
                        value={newItem.priceWithTax ? (newItem.taxPercent?.toString() || "18") : "0"} 
                        onValueChange={(val) => setNewItem(prev => ({ ...prev, taxPercent: parseFloat(val) }))}
                        disabled={!newItem.priceWithTax}
                      >
                        <SelectTrigger className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-300">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border border-slate-200 text-slate-900">
                          {GST_SLABS.map(rate => (
                            <SelectItem key={rate} value={rate}>{rate}%</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-800 text-sm font-semibold">Price Type</Label>
                      <Select
                        value={newItem.priceWithTax ? 'with_tax' : 'without_tax'}
                        onValueChange={(val) => setNewItem(prev => ({ ...prev, priceWithTax: val === 'with_tax' }))}
                      >
                        <SelectTrigger className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-300">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border border-slate-200 text-slate-900">
                          <SelectItem value="without_tax">Without Tax</SelectItem>
                          <SelectItem value="with_tax">With Tax</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Item Preview with GST Breakdown */}
                  {newItem.itemName && newItem.pricePerUnit ? (
                    <div className="bg-slate-100 rounded-xl p-4 border border-slate-200 space-y-3">
                      {currentInvoice.stateOfSupply && (
                        <div className={`text-xs py-1.5 px-3 rounded-lg inline-block ${isInterStateTransaction()
                          ? 'bg-orange-100 text-orange-800 border border-orange-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                          {isInterStateTransaction()
                            ? `Inter-State: ${currentInvoice.businessState} → ${currentInvoice.stateOfSupply} (IGST ${newItem.priceWithTax ? newItem.taxPercent || 0 : 0}%)`
                            : `Intra-State: ${currentInvoice.stateOfSupply} (SGST ${(newItem.priceWithTax ? newItem.taxPercent || 0 : 0) / 2}% + CGST ${(newItem.priceWithTax ? newItem.taxPercent || 0 : 0) / 2}%)`
                          }
                        </div>
                      )}
                      <div className="flex justify-between items-center text-slate-800">
                        <div className="flex flex-wrap gap-3 text-sm">
                          <span>Disc: <span className="font-semibold">₹{(itemPreview.discountAmount || 0).toFixed(2)}</span></span>
                          {isInterStateTransaction() ? (
                            <span>IGST ({newItem.priceWithTax ? newItem.taxPercent || 0 : 0}%): <span className="font-semibold text-orange-700">₹{(itemPreview.igstAmount || 0).toFixed(2)}</span></span>
                          ) : (
                            <>
                              <span>SGST ({(newItem.priceWithTax ? newItem.taxPercent || 0 : 0) / 2}%): <span className="font-semibold text-emerald-700">₹{(itemPreview.sgstAmount || 0).toFixed(2)}</span></span>
                              <span>CGST ({(newItem.priceWithTax ? newItem.taxPercent || 0 : 0) / 2}%): <span className="font-semibold text-emerald-700">₹{(itemPreview.cgstAmount || 0).toFixed(2)}</span></span>
                            </>
                          )}
                        </div>
                        <span className="text-lg font-bold text-slate-950">₹{(itemPreview.amount || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex gap-3">
                    <Button
                      onClick={addItemToInvoice}
                      className="flex-1 h-12 rounded-full bg-slate-950 font-semibold text-white transition-all duration-300 hover:bg-slate-800"
                    >
                      <Plus className="h-5 w-5 mr-2" />
                      Add Item
                    </Button>
                    <Button
                      variant="outline"
                      onClick={resetItemForm}
                      className="px-6 h-12 rounded-full border-slate-200 text-slate-700 hover:bg-slate-100"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Items Table */}
              {currentInvoice.items.length > 0 && (
                <Card className="liquid-panel overflow-hidden rounded-[36px] border-white/55 p-5">
                  <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Calculator className="h-5 w-5 text-slate-850" />
                    Items ({currentInvoice.items.length})
                  </h2>
                  <div className="overflow-x-auto">
                    {(() => {
                      const items = currentInvoice.items;
                      const anyTax = items.some(i => i.taxAmount > 0);
                      const anyDiscount = items.some(i => i.discountAmount > 0);
                      return (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="text-left py-2.5 px-2 text-slate-700 font-bold">Item</th>
                              <th className="text-center py-2.5 px-2 text-slate-700 font-bold">Qty</th>
                              <th className="text-right py-2.5 px-2 text-slate-700 font-bold">Price</th>
                              {anyDiscount && <th className="text-right py-2.5 px-2 text-slate-700 font-bold">Disc.</th>}
                              {anyTax && <th className="text-right py-2.5 px-2 text-slate-700 font-bold">Tax %</th>}
                              {anyTax && <th className="text-right py-2.5 px-2 text-slate-700 font-bold">Tax Amt</th>}
                              <th className="text-right py-2.5 px-2 text-slate-700 font-bold">Amount</th>
                              <th className="text-center py-2.5 px-2 text-slate-700 font-bold"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((item) => (
                              <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="py-3 px-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-900 font-semibold">{item.itemName}</span>
                                    {item.stockReserved && (
                                      <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-bold rounded">STOCK</span>
                                    )}
                                  </div>
                                  <div className="text-slate-500 text-xs">{item.hsnCode || item.itemCode || ''}</div>
                                </td>
                                <td className="py-3 px-2 text-center text-slate-700 font-medium">{item.quantity}</td>
                                <td className="py-3 px-2 text-right text-slate-700 font-medium">₹{item.pricePerUnit.toFixed(2)}</td>
                                {anyDiscount && (
                                  <td className="py-3 px-2 text-right text-orange-600 font-medium">
                                    {item.discountAmount > 0 ? `₹${item.discountAmount.toFixed(2)}` : ''}
                                  </td>
                                )}
                                {anyTax && (
                                  <td className="py-3 px-2 text-right text-slate-600 text-xs">
                                    {item.taxAmount > 0
                                      ? item.isInterState
                                        ? `IGST ${item.igstRate}%`
                                        : `${item.sgstRate + item.cgstRate}%`
                                      : ''}
                                  </td>
                                )}
                                {anyTax && (
                                  <td className="py-3 px-2 text-right text-slate-600 font-medium">
                                    {item.taxAmount > 0 ? `₹${item.taxAmount.toFixed(2)}` : ''}
                                  </td>
                                )}
                                <td className="py-3 px-2 text-right font-bold text-slate-900">₹{item.amount.toFixed(2)}</td>
                                <td className="py-3 px-2 text-center">
                                  <button onClick={() => removeItem(item.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                </Card>
              )}

              {/* Additional Charges Section */}
              <Card className="liquid-panel overflow-hidden rounded-[36px] border-white/55 p-5">
                <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Plus className="h-5 w-5 text-slate-800" />
                  Additional Charges
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-slate-800 text-sm font-semibold">Shipping Charges</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">₹</span>
                      <Input
                        type="number"
                        value={currentInvoice.shippingCharges || 0}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setCurrentInvoice(prev => {
                            const next = { ...prev, shippingCharges: val };
                            const computed = calculateInvoiceTotals(next.items, val, next.packagingCharges, next.freightCharges, next.adjustment);
                            return { ...next, ...computed, balance: computed.total - next.paid };
                          });
                        }}
                        className="pl-8 rounded-xl border-slate-200 text-slate-900 focus:border-slate-350"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-800 text-sm font-semibold">Packaging Charges</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">₹</span>
                      <Input
                        type="number"
                        value={currentInvoice.packagingCharges || 0}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setCurrentInvoice(prev => {
                            const next = { ...prev, packagingCharges: val };
                            const computed = calculateInvoiceTotals(next.items, next.shippingCharges, val, next.freightCharges, next.adjustment);
                            return { ...next, ...computed, balance: computed.total - next.paid };
                          });
                        }}
                        className="pl-8 rounded-xl border-slate-200 text-slate-900 focus:border-slate-350"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-800 text-sm font-semibold">Freight/Other Charges</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">₹</span>
                      <Input
                        type="number"
                        value={currentInvoice.freightCharges || 0}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setCurrentInvoice(prev => {
                            const next = { ...prev, freightCharges: val };
                            const computed = calculateInvoiceTotals(next.items, next.shippingCharges, next.packagingCharges, val, next.adjustment);
                            return { ...next, ...computed, balance: computed.total - next.paid };
                          });
                        }}
                        className="pl-8 rounded-xl border-slate-200 text-slate-900 focus:border-slate-350"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-800 text-sm font-semibold">Adjustment</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">₹</span>
                      <Input
                        type="number"
                        value={currentInvoice.adjustment || 0}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setCurrentInvoice(prev => {
                            const next = { ...prev, adjustment: val };
                            const computed = calculateInvoiceTotals(next.items, next.shippingCharges, next.packagingCharges, next.freightCharges, val);
                            return { ...next, ...computed, balance: computed.total - next.paid };
                          });
                        }}
                        className="pl-8 rounded-xl border-slate-200 text-slate-900 focus:border-slate-350"
                      />
                    </div>
                  </div>
                </div>
              </Card>

              {/* Notes & Terms Section */}
              <Card className="liquid-panel overflow-hidden rounded-[36px] border-white/55 p-5">
                <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-slate-800" />
                  Notes & Terms
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-slate-800 text-sm font-semibold">Customer Notes</Label>
                    <textarea
                      value={currentInvoice.notes || ""}
                      onChange={(e) => setCurrentInvoice(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Thanks for your business. It was a pleasure working with you!"
                      className="w-full p-2.5 text-sm rounded-xl border border-slate-200 bg-white/80 text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-300"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-800 text-sm font-semibold">Terms & Conditions</Label>
                    <textarea
                      value={currentInvoice.termsAndConditions || ""}
                      onChange={(e) => setCurrentInvoice(prev => ({ ...prev, termsAndConditions: e.target.value }))}
                      placeholder="Payment is due within 15 days of invoice date."
                      className="w-full p-2.5 text-sm rounded-xl border border-slate-200 bg-white/80 text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-300"
                      rows={3}
                    />
                  </div>
                </div>
              </Card>
            </div>

            {/* Right Column - Summary */}
            <div className="space-y-6 no-print">
              <Card className="liquid-panel overflow-hidden rounded-[36px] border-white/55 p-5 sticky top-6">
                <h2 className="text-xl font-bold text-slate-950 mb-6 flex items-center gap-3">
                  <IndianRupee className="h-5 w-5 text-slate-900" />
                  Summary
                </h2>

                {/* Business State Info */}
                <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <p className="text-xs text-slate-600">Business State: <span className="text-slate-900 font-medium">{currentInvoice.businessState}</span></p>
                  {currentInvoice.stateOfSupply && (
                    <p className="text-xs text-slate-600 mt-1.5">
                      Customer State: <span className="text-slate-900 font-medium">{currentInvoice.stateOfSupply}</span>
                      <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold ${isInterStateTransaction() ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800'}`}>
                        {isInterStateTransaction() ? 'INTER-STATE' : 'INTRA-STATE'}
                      </span>
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-600">Subtotal</span>
                    <span className="text-slate-900 font-medium">₹{currentInvoice.subtotal.toFixed(2)}</span>
                  </div>

                  {currentInvoice.totalSgst > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">SGST</span>
                      <span className="text-slate-900">₹{currentInvoice.totalSgst.toFixed(2)}</span>
                    </div>
                  )}
                  {currentInvoice.totalCgst > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">CGST</span>
                      <span className="text-slate-900">₹{currentInvoice.totalCgst.toFixed(2)}</span>
                    </div>
                  )}
                  {currentInvoice.totalIgst > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">IGST (18%)</span>
                      <span className="text-slate-900">₹{currentInvoice.totalIgst.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-sm border-t border-slate-200 pt-2">
                    <span className="text-slate-600 font-semibold">Total Tax</span>
                    <span className="text-slate-900">₹{currentInvoice.totalTax.toFixed(2)}</span>
                  </div>

                  {currentInvoice.shippingCharges > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">Shipping</span>
                      <span className="text-slate-900">₹{currentInvoice.shippingCharges.toFixed(2)}</span>
                    </div>
                  )}
                  {currentInvoice.packagingCharges > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">Packaging</span>
                      <span className="text-slate-900">₹{currentInvoice.packagingCharges.toFixed(2)}</span>
                    </div>
                  )}
                  {currentInvoice.freightCharges > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">Freight/Other</span>
                      <span className="text-slate-900">₹{currentInvoice.freightCharges.toFixed(2)}</span>
                    </div>
                  )}
                  {currentInvoice.adjustment !== 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">Adjustment</span>
                      <span className={`font-medium ${currentInvoice.adjustment < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                        {currentInvoice.adjustment < 0 ? '-' : ''}₹{Math.abs(currentInvoice.adjustment).toFixed(2)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center py-3 border-t border-slate-200">
                    <span className="text-slate-900 font-bold text-lg">Grand Total</span>
                    <span className="text-2xl font-black text-slate-950">
                      ₹{currentInvoice.total.toFixed(2)}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-slate-800 text-sm font-semibold">Paid Amount</Label>
                    <Input
                      type="number"
                      value={currentInvoice.paid}
                      onChange={(e) => updatePaidAmount(parseFloat(e.target.value) || 0)}
                      min="0"
                      className="h-10 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 font-bold"
                    />
                  </div>

                  <div className="flex justify-between items-center py-2 border-t border-slate-200">
                    <span className="text-slate-600 font-semibold">Balance</span>
                    <span className={`text-xl font-bold ${currentInvoice.balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                      ₹{currentInvoice.balance.toFixed(2)}
                    </span>
                  </div>

                  {currentInvoice.balance > 0 && (
                    <div className="flex items-center gap-2 text-rose-700 text-sm bg-rose-50 p-2.5 rounded-lg border border-rose-100">
                      <AlertCircle className="h-4 w-4" />
                      <span>Due: ₹{currentInvoice.balance.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Template Selection */}
                <div className="mt-4 pt-4 border-t border-slate-200 space-y-1.5">
                  <Label className="text-slate-800 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Layout className="h-3.5 w-3.5 text-slate-800" />
                    Invoice Theme Template
                  </Label>
                  <Select 
                    value={selectedTemplateId} 
                    onValueChange={(val) => {
                      if (val !== "none") {
                        setSelectedTemplateId(val);
                        setCurrentInvoice(prev => ({ ...prev, templateId: val }));
                      }
                    }}
                  >
                    <SelectTrigger className="h-10 rounded-[14px] border-slate-200 bg-white text-slate-900 focus:border-slate-350">
                      <SelectValue placeholder="Select Template" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border border-slate-250 text-slate-900 max-h-48 overflow-y-auto">
                      {userTemplates.length === 0 ? (
                        <SelectItem value="none" disabled>No templates. Using default.</SelectItem>
                      ) : (
                        userTemplates.map(t => (
                          <SelectItem key={t._id} value={t._id}>
                            {t.name} {t.isDefault ? "(Default)" : ""}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Action Buttons */}
                <div className="mt-6 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => saveInvoice('draft')}
                      disabled={isSaving || currentInvoice.items.length === 0}
                      variant="outline"
                      className="h-12 rounded-xl bg-white border-slate-200 text-slate-900 font-semibold"
                    >
                      Save Draft
                    </Button>
                    <Button
                      onClick={() => saveInvoice('sent')}
                      disabled={isSaving || currentInvoice.items.length === 0}
                      className="h-12 rounded-xl bg-slate-950 font-semibold text-white transition-all duration-300 hover:bg-slate-800"
                    >
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                      Save & Send
                    </Button>
                  </div>

                  {lastSavedId && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {currentInvoice.balance > 0 && currentInvoice.status !== 'cancelled' && (
                        <Button
                          onClick={() => {
                            setPaymentForm(prev => ({ ...prev, amount: currentInvoice.balance }));
                            setIsRecordPaymentOpen(true);
                          }}
                          className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold w-full"
                        >
                          <CreditCard className="h-4 w-4 mr-1.5" />
                          Record Payment
                        </Button>
                      )}
                      {currentInvoice.status !== 'cancelled' && (
                        <Button
                          onClick={handleCancelInvoice}
                          variant="outline"
                          className="h-11 rounded-xl border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold w-full"
                        >
                          <X className="h-4 w-4 mr-1.5" />
                          Cancel/Reverse
                        </Button>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <Button onClick={printInvoice} variant="outline" className="h-10 rounded-xl bg-white/60 border-slate-200 text-slate-850 hover:bg-slate-50">
                      <Printer className="h-4 w-4 mr-1.5" />
                      Print
                    </Button>
                    <Button onClick={copyInvoiceDetails} variant="outline" className="h-10 rounded-xl bg-white/60 border-slate-200 text-slate-850 hover:bg-slate-50">
                      <Copy className="h-4 w-4 mr-1.5" />
                      Copy
                    </Button>
                  </div>

                  <button
                    onClick={shareOnWhatsApp}
                    className="w-full py-3 bg-[#25D366] text-white rounded-full font-bold hover:bg-[#20ba56] transition-all duration-300 flex items-center justify-center gap-2 shadow-sm"
                  >
                    <MessageCircle className="h-5 w-5" />
                    Share on WhatsApp
                  </button>

                  <Button onClick={saveAndNew} disabled={isSaving || currentInvoice.items.length === 0} variant="outline" className="w-full h-10 rounded-xl bg-white/60 border-slate-200 text-slate-850 hover:bg-slate-50">
                    <Plus className="h-4 w-4 mr-1.5" />
                    Save & New
                  </Button>

                  <Button onClick={() => exportInvoice('csv')} variant="outline" className="w-full h-10 rounded-xl bg-white/60 border-slate-200 text-slate-850 hover:bg-slate-50">
                    <Download className="h-4 w-4 mr-1.5" />
                    Export CSV
                  </Button>
                </div>
              </Card>
            </div>

            {/* Print Preview Copy */}
            {currentInvoice.items.length > 0 && (
              <div className="lg:col-span-3 mt-8">
                <h3 className="text-xl font-bold text-slate-950 mb-4 no-print">Invoice Print Preview</h3>
                <div 
                  id="invoice-official-copy" 
                  className="w-[210mm] min-h-[297mm] bg-white p-12 shadow-2xl relative border rounded-sm mx-auto overflow-x-auto text-slate-950"
                  style={{
                    backgroundColor: activeTemplateConfig.design?.backgroundColor || "#ffffff",
                    borderColor: activeTemplateConfig.design?.borderColor || "#cbd5e1",
                    color: activeTemplateConfig.design?.textColor || "#0f172a",
                    fontFamily: activeTemplateConfig.design?.fontFamily || "Inter",
                    fontSize: `${activeTemplateConfig.design?.fontSize || 12}px`,
                    lineHeight: "1.5"
                  }}
                >
                  {activeTemplateConfig.sectionsOrder.map((sectionName: string) => {
                    if (sectionName === "header") {
                      return (
                        <div 
                          key="header" 
                          className={`mb-6 flex ${activeTemplateConfig.header?.logoPosition === 'center' ? 'flex-col items-center text-center' : activeTemplateConfig.header?.logoPosition === 'right' ? 'flex-row-reverse justify-between items-start' : 'justify-between items-start'}`}
                        >
                          {activeTemplateConfig.header?.showLogo && (
                            <div className="mb-2">
                              {activeTemplateConfig.header.logoUrl ? (
                                <img 
                                  src={activeTemplateConfig.header.logoUrl} 
                                  alt="Logo" 
                                  className={`object-contain ${activeTemplateConfig.header.logoSize === 'small' ? 'h-10 w-24' : activeTemplateConfig.header.logoSize === 'large' ? 'h-20 w-44' : 'h-14 w-32'}`} 
                                />
                              ) : (
                                <div 
                                  className={`bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-xs font-bold rounded-lg ${activeTemplateConfig.header.logoSize === 'small' ? 'h-10 w-24' : activeTemplateConfig.header.logoSize === 'large' ? 'h-20 w-44' : 'h-14 w-32'}`}
                                  style={{ borderRadius: `${activeTemplateConfig.design?.cornerRadius || 0}px` }}
                                >
                                  [ Company Logo ]
                                </div>
                              )}
                            </div>
                          )}

                          <div className={`max-w-md ${activeTemplateConfig.header?.logoPosition === 'right' ? 'text-left' : activeTemplateConfig.header?.logoPosition === 'center' ? 'text-center' : 'text-right'}`}>
                            {activeTemplateConfig.header?.showCompanyName && (
                              <h2 className="text-xl font-black" style={{ color: activeTemplateConfig.design?.primaryColor || "#4f46e5" }}>
                                {currentInvoice.sellerName || 'SHREE ANDAL AI SOFTWARE SOLUTIONS (OPC) PRIVATE LIMITED'}
                              </h2>
                            )}
                            {activeTemplateConfig.header?.showAddress && (
                              <p className="text-slate-500 text-xs mt-1">
                                {currentInvoice.sellerAddress || '3/124 Main Road, Andal Nagar, Trichy, Tamil Nadu - 620001'}
                              </p>
                            )}
                            {activeTemplateConfig.header?.showPhone && (
                              <p className="text-slate-500 text-xs">
                                Phone: {currentInvoice.sellerPhone || '+91 94432 10101'}
                              </p>
                            )}
                            {activeTemplateConfig.header?.showEmail && (
                              <p className="text-slate-500 text-xs">
                                Email: {currentInvoice.sellerEmail || 'support@saaiss.in'}
                              </p>
                            )}
                            {currentInvoice.sellerGSTIN && (
                              <p className="text-xs font-bold mt-1" style={{ color: activeTemplateConfig.design?.primaryColor || "#4f46e5" }}>
                                GSTIN: {currentInvoice.sellerGSTIN}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    }

                    if (sectionName === "seller") {
                      // Duplicate seller details section removed as information is in company letterhead
                      return null;
                    }

                    if (sectionName === "customer" && activeTemplateConfig.customer?.showName) {
                      return (
                        <div key="customer" className="mb-6 grid grid-cols-2 gap-4 text-left">
                          <div>
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Bill To</h4>
                            {activeTemplateConfig.customer.showName && <p className="font-bold text-sm">{currentInvoice.partyName || 'Valued Customer'}</p>}
                            {activeTemplateConfig.customer.showBillingAddress && (
                              <p className="text-slate-600 text-xs mt-0.5">
                                {currentInvoice.customerAddress || 'Billing Address'}
                              </p>
                            )}
                            {activeTemplateConfig.customer.showPhone && currentInvoice.phoneNo && <p className="text-slate-650 text-xs">Phone: {currentInvoice.phoneNo}</p>}
                            {activeTemplateConfig.customer.showEmail && currentInvoice.customerEmail && <p className="text-slate-650 text-xs">Email: {currentInvoice.customerEmail}</p>}
                          </div>
                          <div className="text-right">
                            {activeTemplateConfig.customer.showGSTIN && currentInvoice.customerGSTIN && (
                              <p className="text-xs font-bold mt-6">
                                Customer GSTIN: <span style={{ color: activeTemplateConfig.design?.primaryColor || "#4f46e5" }}>{currentInvoice.customerGSTIN}</span>
                              </p>
                            )}
                            {activeTemplateConfig.customer.showPlaceOfSupply && currentInvoice.stateOfSupply && (
                              <p className="text-xs text-slate-600">
                                Place of Supply: <span className="font-medium text-slate-900">{currentInvoice.stateOfSupply}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    }

                    if (sectionName === "invoiceInfo") {
                      return (
                        <div 
                          key="invoiceInfo" 
                          className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 border bg-white text-left" 
                          style={{ 
                            borderColor: activeTemplateConfig.design?.borderColor || "#cbd5e1",
                            borderRadius: `${activeTemplateConfig.design?.cornerRadius || 0}px` 
                          }}
                        >
                          {activeTemplateConfig.invoiceInfo?.showInvoiceNumber && (
                            <div>
                              <p className="text-[10px] text-slate-500 uppercase font-bold">{activeTemplateConfig.invoiceInfo.labels?.invoiceNumber || "Invoice Number"}</p>
                              <p className="font-extrabold text-sm" style={{ color: activeTemplateConfig.design?.primaryColor || "#4f46e5" }}>#{currentInvoice.invoiceNo}</p>
                            </div>
                          )}
                          {activeTemplateConfig.invoiceInfo?.showInvoiceDate && (
                            <div>
                              <p className="text-[10px] text-slate-500 uppercase font-bold">{activeTemplateConfig.invoiceInfo.labels?.invoiceDate || "Invoice Date"}</p>
                              <p className="font-bold text-slate-900">{currentInvoice.invoiceDate}</p>
                            </div>
                          )}
                          {activeTemplateConfig.invoiceInfo?.showDueDate && (
                            <div>
                              <p className="text-[10px] text-slate-500 uppercase font-bold">{activeTemplateConfig.invoiceInfo.labels?.dueDate || "Due Date"}</p>
                              <p className="font-bold text-slate-900">{currentInvoice.dueDate || currentInvoice.invoiceDate}</p>
                            </div>
                          )}
                          {activeTemplateConfig.invoiceInfo?.showPaymentTerms && (
                            <div>
                              <p className="text-[10px] text-slate-500 uppercase font-bold">{activeTemplateConfig.invoiceInfo.labels?.paymentTerms || "Payment Terms"}</p>
                              <p className="text-slate-700">{currentInvoice.paymentTerms || "Net 15 Days"}</p>
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (sectionName === "items") {
                      return (
                        <div key="items" className="mb-6">
                          <table 
                            className={`w-full text-left border-collapse ${
                              activeTemplateConfig.design?.borderStyle === 'light' 
                                ? 'border' 
                                : activeTemplateConfig.design?.borderStyle === 'medium' 
                                  ? 'border-2' 
                                  : 'border-none'
                            }`}
                            style={{ borderColor: activeTemplateConfig.design?.borderColor || "#cbd5e1" }}
                          >
                            <thead>
                              <tr 
                                className="text-white text-xs font-bold"
                                style={{ backgroundColor: activeTemplateConfig.design?.primaryColor || "#4f46e5" }}
                              >
                                <th className="py-2.5 px-3">#</th>
                                {(activeTemplateConfig.items?.columns || ["item", "sku", "description", "hsn", "quantity", "rate", "discount", "tax", "amount"]).map((col: string) => (
                                  <th key={col} className="py-2.5 px-3 text-left">
                                    {(activeTemplateConfig.items?.labels as any)[col] || col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {currentInvoice.items.map((item, idx) => (
                                <tr 
                                  key={item.id || idx} 
                                  className="border-b text-xs hover:bg-slate-50"
                                  style={{ borderColor: activeTemplateConfig.design?.borderColor || "#cbd5e1" }}
                                >
                                  <td className="py-3 px-3">{idx + 1}</td>
                                  {(activeTemplateConfig.items?.columns || ["item", "sku", "description", "hsn", "quantity", "rate", "discount", "tax", "amount"]).map((col: string) => {
                                    if (col === "item") {
                                      return (
                                        <td key={col} className="py-3 px-3 font-bold text-left">
                                          {item.itemName}
                                          {item.itemCode && <p className="text-[10px] text-slate-500 font-normal">Code: {item.itemCode}</p>}
                                        </td>
                                      );
                                    }
                                    if (col === "description") return <td key={col} className="py-3 px-3 text-slate-500 text-[11px] text-left">{item.description || "-"}</td>;
                                    if (col === "sku") return <td key={col} className="py-3 px-3 text-slate-650 text-left">{item.sku || "-"}</td>;
                                    if (col === "hsn") return <td key={col} className="py-3 px-3 text-left">{item.hsnCode || "-"}</td>;
                                    if (col === "quantity") return <td key={col} className="py-3 px-3 text-left">{item.quantity} {item.unit || "Pcs"}</td>;
                                    if (col === "rate") return <td key={col} className="py-3 px-3 text-left">₹{item.pricePerUnit.toFixed(2)}</td>;
                                    if (col === "discount") return <td key={col} className="py-3 px-3 text-left text-amber-700 font-medium">{item.discountPercent ? `${item.discountPercent}%` : (item.discountAmount ? `₹${item.discountAmount.toFixed(2)}` : "0%")}</td>;
                                    if (col === "tax") return <td key={col} className="py-3 px-3 text-left">{item.taxPercent}% GST</td>;
                                    if (col === "amount") return <td key={col} className="py-3 px-3 font-bold text-slate-950 text-left">₹{item.amount.toFixed(2)}</td>;
                                    return <td key={col} className="text-left">-</td>;
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    }

                    if (sectionName === "tax" && activeTemplateConfig.tax?.showSummary) {
                      const totalDiscount = currentInvoice.items.reduce((sum, i) => sum + (i.discountAmount || 0), 0);
                      return (
                        <div key="tax" className="mb-6 flex justify-end">
                          <div className="w-80 space-y-2 border-t pt-3" style={{ borderColor: activeTemplateConfig.design?.borderColor || "#cbd5e1" }}>
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-500">Subtotal</span>
                              <span className="font-semibold">₹{currentInvoice.subtotal.toFixed(2)}</span>
                            </div>
                            {totalDiscount > 0 && (
                              <div className="flex justify-between items-center text-xs text-amber-700">
                                <span>Total Discount</span>
                                <span>-₹{totalDiscount.toFixed(2)}</span>
                              </div>
                            )}
                            {activeTemplateConfig.tax.showTaxableAmount && (
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500">Taxable Amount</span>
                                <span>₹{currentInvoice.subtotal.toFixed(2)}</span>
                              </div>
                            )}
                            {activeTemplateConfig.tax.showCGST && currentInvoice.totalCgst > 0 && (
                              <div className="flex justify-between items-center text-xs text-slate-650">
                                <span>CGST</span>
                                <span>₹{currentInvoice.totalCgst.toFixed(2)}</span>
                              </div>
                            )}
                            {activeTemplateConfig.tax.showSGST && currentInvoice.totalSgst > 0 && (
                              <div className="flex justify-between items-center text-xs text-slate-650">
                                <span>SGST</span>
                                <span>₹{currentInvoice.totalSgst.toFixed(2)}</span>
                              </div>
                            )}
                            {activeTemplateConfig.tax.showIGST && currentInvoice.totalIgst > 0 && (
                              <div className="flex justify-between items-center text-xs text-slate-650">
                                <span>IGST</span>
                                <span>₹{currentInvoice.totalIgst.toFixed(2)}</span>
                              </div>
                            )}
                            {activeTemplateConfig.tax.showTotalTax && (
                              <div className="flex justify-between items-center text-xs border-t pt-1.5 font-bold" style={{ borderColor: activeTemplateConfig.design?.borderColor || "#cbd5e1" }}>
                                <span className="text-slate-650">Total Tax</span>
                                <span>₹{currentInvoice.totalTax.toFixed(2)}</span>
                              </div>
                            )}
                            <div className="flex justify-between items-center py-2 border-t" style={{ borderColor: activeTemplateConfig.design?.borderColor || "#cbd5e1" }}>
                              <span className="font-extrabold text-slate-900">Grand Total</span>
                              <span className="text-base font-black" style={{ color: activeTemplateConfig.design?.primaryColor || "#4f46e5" }}>
                                ₹{currentInvoice.total.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (sectionName === "payment") {
                      return (
                        <div 
                          key="payment" 
                          className="mb-6 p-4 border text-left space-y-3" 
                          style={{ 
                            backgroundColor: activeTemplateConfig.design?.secondaryColor || "#f8fafc", 
                            borderColor: activeTemplateConfig.design?.borderColor || "#cbd5e1",
                            borderRadius: `${activeTemplateConfig.design?.cornerRadius || 0}px` 
                          }}
                        >
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <span className="text-slate-500 block">Amount Paid</span>
                              <span className="font-bold text-emerald-600">₹{(currentInvoice.paid || 0).toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Balance Due</span>
                              <span className="font-black text-rose-600">₹{(currentInvoice.balance ?? (currentInvoice.total - currentInvoice.paid)).toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Method</span>
                              <span className="text-slate-700 capitalize">{currentInvoice.paymentMethod || "Cash"}</span>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-650">
                            <span className="font-bold uppercase text-[10px] text-slate-500 block mb-1">BANKING DETAILS</span>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <div><span className="text-slate-400 block text-[9px]">Bank Name</span>{currentInvoice.bankName || 'ABC Bank'}</div>
                              <div><span className="text-slate-400 block text-[9px]">Account Type</span>{currentInvoice.accountType || 'Current'}</div>
                              <div><span className="text-slate-400 block text-[9px]">Account Number</span>{currentInvoice.accountNumber || 'XXXXXXXX'}</div>
                              <div><span className="text-slate-400 block text-[9px]">IFSC Code</span>{currentInvoice.ifscCode || 'ABCD0001234'}</div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (sectionName === "notes" && activeTemplateConfig.notes?.show) {
                      return (
                        <div key="notes" className="mb-6 text-left">
                          <h5 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">{activeTemplateConfig.notes.label}</h5>
                          <p className="text-xs text-slate-600 whitespace-pre-line">{currentInvoice.notes || activeTemplateConfig.notes.defaultText}</p>
                        </div>
                      );
                    }

                    if (sectionName === "terms" && activeTemplateConfig.terms?.show) {
                      return (
                        <div key="terms" className="mb-6 text-left">
                          <h5 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">{activeTemplateConfig.terms.label}</h5>
                          <p className="text-xs text-slate-500 whitespace-pre-line leading-relaxed">{currentInvoice.termsAndConditions || activeTemplateConfig.terms.defaultText}</p>
                        </div>
                      );
                    }

                    if (sectionName === "signature") {
                      return (
                        <div key="signature" className="mb-6 flex flex-col items-end">
                          <div className="text-center w-48 mt-4">
                            {activeTemplateConfig.signature?.imageUrl ? (
                              <img 
                                src={activeTemplateConfig.signature.imageUrl} 
                                alt="Signature" 
                                className="h-10 object-contain mx-auto mb-1.5" 
                              />
                            ) : null}
                            <div className="border-t pt-1 border-slate-900">
                              {currentInvoice.authorisedSignature ? (
                                <p className="font-bold text-xs text-slate-900 mb-0.5">{currentInvoice.authorisedSignature}</p>
                              ) : null}
                              <p className="font-bold text-xs text-slate-900 uppercase tracking-wider">Authorised Signature</p>
                              {activeTemplateConfig.signature?.designation && (
                                <p className="text-[10px] text-slate-500">{activeTemplateConfig.signature.designation}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (sectionName === "footer" && activeTemplateConfig.footer?.show) {
                      return (
                        <div key="footer" className="mt-12 pt-4 border-t text-center text-[10px] text-slate-450" style={{ borderColor: activeTemplateConfig.design?.borderColor || "#cbd5e1" }}>
                          <p className="leading-relaxed">{activeTemplateConfig.footer.text || "This is a digitally generated invoice. No signature required."}</p>
                        </div>
                      );
                    }

                    return null;
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* OCR Tab */}
        {activeTab === 'ocr' && (
          <Card className="liquid-panel overflow-hidden rounded-[36px] border-white/55 p-8 shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950 mb-4 flex items-center gap-3">
              <Camera className="h-6 w-6 text-slate-900" />
              Invoice OCR Scanner
            </h2>
            <p className="text-slate-600 mb-6">
              Capture or upload invoice images to automatically extract vendor details, line items, taxes, and totals using AI-powered OCR.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <Camera className="h-4 w-4 text-slate-800" />
                  <span className="text-slate-900 font-bold text-sm">Capture / Upload</span>
                </div>
                <p className="text-slate-600 text-xs">Scan with camera or upload invoice images & PDFs</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-amber-600" />
                  <span className="text-slate-900 font-bold text-sm">AI Extract & Share</span>
                </div>
                <p className="text-slate-600 text-xs">Auto-enhanced, AI auto-fill, download PDF, share via WhatsApp</p>
              </div>
            </div>

            <DocScanner
              onTextExtracted={(text) => {
                setOcrText(text);
                const parsed = parseInvoiceText(text);
                if (parsed.items.length > 0 || parsed.invoiceNumber || parsed.customerName) {
                  const newInvoiceItems = parsed.items.map(item => {
                    const automation = getAutomatedCode(item.product, '');
                    const taxPct = automation?.gstRate || 18;
                    const calculated = calculateItemAmounts({
                      ...newItem,
                      itemName: item.product,
                      codeType: automation?.codeType || 'HSN',
                      hsnCode: automation?.code || '',
                      quantity: item.quantity,
                      unit: 'Pcs',
                      pricePerUnit: item.rate,
                      priceWithTax: false,
                      taxPercent: taxPct
                    });
                    return {
                      id: Math.random().toString(36).substr(2, 9),
                      itemName: item.product,
                      itemCode: '',
                      codeType: automation?.codeType || 'HSN',
                      hsnCode: automation?.code || '',
                      quantity: item.quantity,
                      unit: 'Pcs',
                      pricePerUnit: item.rate,
                      priceWithTax: false,
                      discountPercent: 0,
                      discountAmount: 0,
                      taxPercent: taxPct,
                      ...calculated
                    };
                  });

                  const newTotal = newInvoiceItems.reduce((sum, item) => sum + item.amount, 0);

                  setCurrentInvoice(prev => ({
                    ...prev,
                    invoiceNo: parsed.invoiceNumber || prev.invoiceNo,
                    partyName: parsed.customerName || prev.partyName,
                    invoiceDate: parsed.invoiceDate || prev.invoiceDate,
                    items: newInvoiceItems.length > 0 ? newInvoiceItems : prev.items,
                    total: newInvoiceItems.length > 0 ? newTotal : prev.total,
                    balance: newInvoiceItems.length > 0 ? newTotal - prev.paid : prev.balance
                  }));

                  toast.success("Data extracted! Go to Create tab to review.");
                }
              }}
              onImageProcessed={(imageData) => {
                setUploadedImage(imageData);
              }}
            />
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => {
                  const gstJson = buildGstPortalJson(currentInvoice, ocrText);
                  setCurrentInvoice(prev => ({ ...prev, ocrJson: gstJson }));
                  downloadJsonFile(`gst-export-${currentInvoice.invoiceNo}.json`, gstJson);
                  toast.success("GST portal JSON exported for GSTR-1, GSTR-2B, and GSTR-3B.");
                }}
                className="rounded-full bg-slate-950 text-white hover:bg-slate-800"
              >
                <Download className="mr-2 h-4 w-4" />
                Export GST JSON
              </Button>
              <Button
                variant="outline"
                onClick={() => setActiveTab('create')}
                className="rounded-full border-slate-200 bg-white/80 text-slate-800 hover:bg-white"
              >
                Review Invoice
              </Button>
            </div>
          </Card>
        )}

        {/* Voice Tab */}
        {activeTab === 'voice' && (
          <Card className="liquid-panel overflow-hidden rounded-[36px] border-white/55 p-8 shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950 mb-6 flex items-center gap-3">
              <Mic className="h-6 w-6 text-slate-900" />
              Voice Dictation Mode
            </h2>
            <p className="text-slate-600 mb-8">
              Dictate your invoice details naturally. Mention invoice number, customer name, and items with quantities and rates.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="border border-slate-200 rounded-[24px] p-12 text-center bg-slate-50">
                  <div className="flex flex-col items-center gap-6">
                    <VoiceButton
                      onTranscript={(text) => setVoiceTranscript(prev => prev + " " + text)}
                      onClear={() => setVoiceTranscript("")}
                      size="lg"
                      className="scale-150 mb-4"
                    />
                    <div>
                      <p className="text-xl font-bold text-slate-900 mb-2">Hold the mic to speak</p>
                      <p className="text-sm text-slate-500">
                        Try: "Invoice number INV-101, customer John Doe, add item Table quantity 2 rate 5000"
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleApplyVoiceData}
                    disabled={!voiceTranscript || isProcessingVoice}
                    className={`flex-1 h-14 rounded-full font-bold flex items-center justify-center gap-3 transition-all duration-300 ${!voiceTranscript || isProcessingVoice
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-slate-950 text-white hover:bg-slate-800'
                      }`}
                  >
                    {isProcessingVoice ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                    Apply Voice Data
                  </button>
                  <button
                    onClick={() => setVoiceTranscript("")}
                    className="px-6 py-4 bg-white border border-slate-200 text-slate-850 rounded-[24px] font-medium hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <label className="block text-sm font-semibold text-slate-800">Live Transcript Preview</label>
                <div className="border border-slate-200 rounded-[24px] p-6 bg-slate-50 min-h-[300px]">
                  <textarea
                    value={voiceTranscript}
                    onChange={(e) => setVoiceTranscript(e.target.value)}
                    placeholder="Transcript will appear here..."
                    className="w-full h-full min-h-[250px] bg-transparent text-slate-900 font-medium resize-none focus:outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>
            </div>

            <div className="mt-8 p-5 rounded-[24px] bg-slate-100/60 border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4 text-slate-700" />
                Voice Command Tips
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-slate-700">
                <div>
                  <p className="font-bold text-slate-900">Invoice No:</p>
                  <p className="font-mono text-xs">"invoice number ABC-123"</p>
                </div>
                <div>
                  <p className="font-bold text-slate-900">Customer:</p>
                  <p className="font-mono text-xs">"customer name Jane Smith"</p>
                </div>
                <div>
                  <p className="font-bold text-slate-900">Adding Items:</p>
                  <p className="font-mono text-xs">"item Laptop quantity 1 price 45000"</p>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="space-y-8">
            <Card className="liquid-panel overflow-hidden rounded-[36px] border-white/55 p-8 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950 flex items-center gap-3">
                    <Eye className="h-6 w-6 text-slate-900" />
                    Invoice History
                  </h2>
                  <p className="text-slate-500 mt-1">{invoiceHistory.length} invoice{invoiceHistory.length !== 1 ? 's' : ''} saved</p>
                </div>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search invoices..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-12 pr-4 py-2.5 h-11 border border-slate-200 text-slate-900 rounded-[14px] focus:ring-2 focus:ring-slate-350 focus:border-slate-350 w-full sm:w-64"
                  />
                </div>
              </div>

              {filteredHistory.length > 0 ? (
                <div className="grid gap-4">
                  {filteredHistory.map((invoice, index) => (
                    <div
                      key={invoice.invoiceNo + index}
                      className="rounded-[24px] border border-white/55 bg-white/42 p-5 hover:border-slate-300 transition-all shadow-sm"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-bold text-lg text-slate-900">{invoice.invoiceNo}</h3>
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                              {invoice.type === 'sales' ? 'SALES' : 'PURCHASE'}
                            </span>
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-100">
                              {invoice.transactionType || 'B2C'}
                            </span>
                          </div>
                          <p className="text-slate-650 text-sm">
                            {invoice.partyName} | {invoice.invoiceDate}
                          </p>
                          <p className="text-slate-500 text-xs mt-1">
                            {invoice.items.length} items | {invoice.saleType?.toUpperCase()} | {invoice.invoiceSize || 'A4'}
                            {invoice.dueReminderDate ? ` | Reminder: ${invoice.dueReminderDate}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center justify-between md:justify-end gap-4">
                          <div className="text-right">
                            <p className="text-xl font-bold text-slate-950">
                              ₹{invoice.total.toFixed(2)}
                            </p>
                            {invoice.balance > 0 && (
                              <p className="text-rose-700 text-sm font-semibold">Due: ₹{invoice.balance.toFixed(2)}</p>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteHistoryInvoice((invoice as InvoiceData & { id?: string }).id, invoice.invoiceNo, invoice.type)}
                            className="rounded-full border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                          >
                            <Trash2 className="mr-1.5 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <FileText className="h-16 w-16 text-slate-400 mx-auto mb-4" />
                  <p className="text-slate-800 text-lg">No invoices found</p>
                  <p className="text-slate-600 text-sm">Create your first invoice to see it here</p>
                </div>
              )}
            </Card>
          </div>
        )}
      </main>

      <div className="mt-8 text-center">
        <p className="text-slate-500 text-sm backdrop-blur-md inline-block px-6 py-2 rounded-full border border-white/40 bg-white/30">
          Powered by SHREE ANDAL AI SOFTWARE SOLUTIONS (OPC) PRIVATE LIMITED ✨
        </p>
      </div>

      {isAddCustomerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[32px] border border-slate-100 shadow-2xl p-6 w-full max-w-lg animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-900">Add New Customer</h3>
              <button onClick={() => setIsAddCustomerOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="mt-4 space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              <div className="space-y-1.5">
                <Label className="text-slate-800 text-sm font-semibold">Customer Name *</Label>
                <Input
                  value={newCustomerForm.name}
                  onChange={(e) => setNewCustomerForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Acme Corp"
                  className="rounded-xl border-slate-200 text-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-slate-800 text-sm font-semibold">Email</Label>
                  <Input
                    value={newCustomerForm.email}
                    onChange={(e) => setNewCustomerForm(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="customer@example.com"
                    className="rounded-xl border-slate-200 text-slate-900"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-800 text-sm font-semibold">Phone</Label>
                  <Input
                    value={newCustomerForm.phone}
                    onChange={(e) => setNewCustomerForm(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="e.g. 9876543210"
                    className="rounded-xl border-slate-200 text-slate-900"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-800 text-sm font-semibold">GSTIN</Label>
                <Input
                  value={newCustomerForm.gstin}
                  onChange={(e) => setNewCustomerForm(prev => ({ ...prev, gstin: e.target.value.toUpperCase() }))}
                  placeholder="22AAAAA1111A1Z1"
                  className="rounded-xl border-slate-200 text-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-slate-800 text-sm font-semibold">Place of Supply</Label>
                  <Select
                    value={newCustomerForm.placeOfSupply}
                    onValueChange={(val) => setNewCustomerForm(prev => ({ ...prev, placeOfSupply: val }))}
                  >
                    <SelectTrigger className="rounded-xl border-slate-200 text-left text-slate-900">
                      <SelectValue placeholder="Select Supply State" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900 border-slate-200 max-h-48 overflow-y-auto">
                      {INDIAN_STATES.map(st => (
                        <SelectItem key={st} value={st}>{st}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-800 text-sm font-semibold">Payment Terms</Label>
                  <Input
                    value={newCustomerForm.paymentTerms}
                    onChange={(e) => setNewCustomerForm(prev => ({ ...prev, paymentTerms: e.target.value }))}
                    placeholder="Due on Receipt"
                    className="rounded-xl border-slate-200 text-slate-900"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-800 text-sm font-semibold">Billing Address</Label>
                <textarea
                  value={newCustomerForm.billingAddress}
                  onChange={(e) => setNewCustomerForm(prev => ({ ...prev, billingAddress: e.target.value }))}
                  placeholder="Enter full address"
                  className="w-full p-2.5 text-sm rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  rows={2}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
              <Button variant="outline" onClick={() => setIsAddCustomerOpen(false)} className="rounded-full">Cancel</Button>
              <Button onClick={handleCreateCustomer} className="rounded-full bg-slate-950 text-white hover:bg-slate-850">Create Customer</Button>
            </div>
          </div>
        </div>
      )}

      {isRecordPaymentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[32px] border border-slate-100 shadow-2xl p-6 w-full max-w-md animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-900">Record Payment</h3>
              <button onClick={() => setIsRecordPaymentOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-slate-800 text-sm font-semibold">Payment Amount *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">₹</span>
                  <Input
                    type="number"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                    className="pl-8 rounded-xl border-slate-200 font-bold text-slate-900"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-slate-800 text-sm font-semibold">Payment Date</Label>
                  <Input
                    type="date"
                    value={paymentForm.paymentDate}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, paymentDate: e.target.value }))}
                    className="rounded-xl border-slate-200 text-xs text-slate-900"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-800 text-sm font-semibold">Method</Label>
                  <Select
                    value={paymentForm.paymentMethod}
                    onValueChange={(val) => setPaymentForm(prev => ({ ...prev, paymentMethod: val }))}
                  >
                    <SelectTrigger className="rounded-xl border-slate-200 text-slate-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900 border-slate-200">
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="credit_card">Credit Card</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="netbanking">Netbanking</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-800 text-sm font-semibold">Deposit To</Label>
                <Input
                  value={paymentForm.depositAccount}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, depositAccount: e.target.value }))}
                  placeholder="e.g. Cash/Bank"
                  className="rounded-xl border-slate-200 text-slate-900"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-800 text-sm font-semibold">Reference Number</Label>
                <Input
                  value={paymentForm.referenceNumber}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, referenceNumber: e.target.value }))}
                  placeholder="Transaction/Cheque ID"
                  className="rounded-xl border-slate-200 text-slate-900"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-800 text-sm font-semibold">Notes</Label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Internal receipt description"
                  className="w-full p-2.5 text-sm rounded-xl border border-slate-200 text-slate-900 focus:outline-none"
                  rows={2}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
              <Button variant="outline" onClick={() => setIsRecordPaymentOpen(false)} className="rounded-full">Cancel</Button>
              <Button onClick={handleRecordPaymentSubmit} className="rounded-full bg-slate-950 text-white hover:bg-slate-850">Apply Payment</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutomationInvoice;
