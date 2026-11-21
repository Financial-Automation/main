import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ArrowLeft, 
  Save, 
  Eye, 
  Check, 
  Sliders, 
  Layout, 
  Type, 
  Paintbrush, 
  Image as ImageIcon,
  CheckCircle,
  FileText,
  Building2,
  User,
  Package,
  Calculator,
  PenTool,
  Loader2,
  FolderOpen
} from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api";
import { 
  InvoiceTemplateRenderer, 
  TEMPLATE_REGISTRY, 
  TemplateLayoutKey 
} from "@/components/invoice-templates";

const GOOGLE_FONTS = ["Inter", "Roboto", "Poppins", "Open Sans", "Arial", "Helvetica", "Georgia", "Times New Roman"];

const SAMPLE_INVOICE = {
  invoiceNumber: "INV-2026-00001",
  invoiceDate: "13 Aug 2026",
  dueDate: "28 Aug 2026",
  paymentTerms: "Net 15 Days",
  orderNumber: "PO-98210",
  salespersonName: "Rahul Sharma",
  eWayBillNo: "EWB-829103819",
  transactionType: "B2B",
  sellerName: "SHREE ANDAL AI SOFTWARE SOLUTIONS (OPC) PRIVATE LIMITED",
  sellerAddress: "3/124 Main Road, Andal Nagar, Trichy, Tamil Nadu - 620001",
  sellerPhone: "+91 94432 10101",
  sellerEmail: "billing@finsmart.com",
  sellerGSTIN: "33ANDAL8271A1Z5",
  customerName: "Acme Corporates Private Limited",
  customerAddress: "456 Corporate Towers, Outer Ring Road, Bangalore, Karnataka - 560001",
  customerPhone: "+91 99988 87776",
  customerEmail: "accounts@acme.com",
  customerGSTIN: "29ACMEP9812C1Z2",
  stateOfSupply: "Karnataka (29)",
  items: [
    {
      id: "1",
      name: "Dell XPS 15 Laptop",
      description: "Intel i7 | 16GB RAM | 512GB SSD",
      code: "DELL-XPS15-01",
      hsn: "84713010",
      quantity: 2,
      unit: "Pcs",
      unitPrice: 50000,
      discountPercent: 5,
      discountAmount: 5000,
      taxPercent: 18,
      taxAmount: 17100,
      total: 112100
    },
    {
      id: "2",
      name: "Logitech MX Master 3S Mouse",
      description: "Wireless Performance Mouse",
      code: "LOGI-MX3S-02",
      hsn: "84716060",
      quantity: 2,
      unit: "Pcs",
      unitPrice: 8500,
      discountPercent: 0,
      discountAmount: 0,
      taxPercent: 18,
      taxAmount: 3060,
      total: 20060
    }
  ],
  subtotal: 117000,
  totalDiscount: 5000,
  cgst: 10080,
  sgst: 10080,
  igst: 0,
  totalTax: 20160,
  shippingCharges: 0,
  packagingCharges: 0,
  freightCharges: 0,
  adjustment: 0,
  grandTotal: 132160,
  paidAmount: 82160,
  balanceDue: 50000,
  paymentMethod: "UPI Transfer",
  bankName: "HDFC Bank",
  accountType: "Current",
  accountNumber: "50200088991122",
  ifscCode: "HDFC0001234",
  authorisedSignature: "Authorized Finance Signatory",
  notes: "Thank you for partnering with Finsmart Solutions! All software licenses are valid for 12 months.",
  termsAndConditions: "Payment is due within 15 days of invoice date. Interest @ 18% p.a. will be levied on overdue payments."
};

const INITIAL_CONFIG = {
  layout: "modern-indigo" as TemplateLayoutKey,
  header: {
    showLogo: true,
    logoPosition: "left" as const,
    logoSize: "medium" as const,
    logoUrl: "",
    showCompanyName: true,
    showAddress: true,
    showPhone: true,
    showEmail: true
  },
  seller: {
    showName: true,
    showPhone: true,
    showEmail: true,
    showGSTIN: true,
    showAddress: true
  },
  customer: {
    showName: true,
    showGSTIN: true,
    showPhone: true,
    showEmail: true,
    showBillingAddress: true,
    showShippingAddress: true,
    showPlaceOfSupply: true
  },
  invoiceInfo: {
    showInvoiceNumber: true,
    showInvoiceDate: true,
    showDueDate: true,
    showPaymentTerms: true,
    showOrderNumber: true,
    showSalesperson: true,
    labels: {
      invoiceNumber: "Invoice No.",
      invoiceDate: "Invoice Date",
      dueDate: "Due Date",
      paymentTerms: "Payment Terms",
      orderNumber: "Order No.",
      salespersonName: "Salesperson"
    }
  },
  items: {
    columns: ["item", "sku", "description", "hsn", "quantity", "rate", "discount", "tax", "amount"],
    labels: {
      item: "Item",
      sku: "Item Code",
      description: "Description",
      hsn: "HSN/SAC",
      quantity: "Qty",
      rate: "Rate",
      discount: "Discount",
      tax: "Tax",
      amount: "Amount"
    }
  },
  tax: {
    showSummary: true,
    showCGST: true,
    showSGST: true,
    showIGST: true,
    showTaxableAmount: true,
    showTotalTax: true
  },
  payment: {
    showPaidAmount: true,
    showBalance: true,
    showPaymentMethod: true
  },
  notes: {
    show: true,
    label: "Notes",
    defaultText: "Thank you for your business!"
  },
  terms: {
    show: true,
    label: "Terms & Conditions",
    defaultText: "Payment is due within 15 days of invoice date."
  },
  signature: {
    show: false,
    name: "John Doe",
    designation: "Authorized Manager",
    imageUrl: ""
  },
  footer: {
    show: true,
    text: "Powered by SHREE ANDAL AI SOFTWARE SOLUTIONS (OPC) PRIVATE LIMITED ✨."
  },
  design: {
    primaryColor: "#4f46e5",
    secondaryColor: "#f8fafc",
    textColor: "#0f172a",
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    fontFamily: "Inter",
    fontSize: 12,
    headingSize: 18,
    bodySize: 12,
    borderStyle: "light" as const,
    cornerRadius: 8
  },
  sectionsOrder: [
    "header",
    "seller",
    "customer",
    "invoiceInfo",
    "items",
    "tax",
    "payment",
    "notes",
    "signature",
    "footer"
  ]
};

export default function InvoiceTemplateEditor() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const templateId = searchParams.get("id");

  const [actualDbId, setActualDbId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [config, setConfig] = useState(INITIAL_CONFIG);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"content" | "styles" | "ordering">("content");
  
  // Autosave Status
  const [autosaveStatus, setAutosaveStatus] = useState<"saved" | "saving" | "idle">("idle");
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstLoad = useRef(true);

  // Fetch initial config if editing
  useEffect(() => {
    if (templateId) {
      // Find matching preset from registry if it exists
      const matchingPreset = TEMPLATE_REGISTRY.find(t => 
        t.id === templateId || 
        t.layoutKey === templateId || 
        t.id === `tpl-${templateId}` ||
        templateId?.replace(/^tpl-/, "") === t.layoutKey
      );

      // Pre-seed matching preset immediately so UI is loaded with correct style
      if (matchingPreset) {
        setName(matchingPreset.name);
        setDescription(matchingPreset.description || "");
        setConfig(prev => ({
          ...INITIAL_CONFIG,
          ...prev,
          ...matchingPreset.config,
          layout: matchingPreset.layoutKey,
          header: { ...INITIAL_CONFIG.header, ...matchingPreset.config?.header },
          seller: { ...INITIAL_CONFIG.seller, ...matchingPreset.config?.seller },
          customer: { ...INITIAL_CONFIG.customer, ...matchingPreset.config?.customer },
          invoiceInfo: { 
            ...INITIAL_CONFIG.invoiceInfo, 
            ...matchingPreset.config?.invoiceInfo,
            labels: { ...INITIAL_CONFIG.invoiceInfo.labels, ...matchingPreset.config?.invoiceInfo?.labels }
          },
          items: { 
            ...INITIAL_CONFIG.items, 
            ...matchingPreset.config?.items,
            labels: { ...INITIAL_CONFIG.items.labels, ...matchingPreset.config?.items?.labels }
          },
          tax: { ...INITIAL_CONFIG.tax, ...matchingPreset.config?.tax },
          payment: { ...INITIAL_CONFIG.payment, ...matchingPreset.config?.payment },
          notes: { ...INITIAL_CONFIG.notes, ...matchingPreset.config?.notes },
          terms: { ...INITIAL_CONFIG.terms, ...matchingPreset.config?.terms },
          signature: { ...INITIAL_CONFIG.signature, ...matchingPreset.config?.signature },
          footer: { ...INITIAL_CONFIG.footer, ...matchingPreset.config?.footer },
          design: { ...INITIAL_CONFIG.design, ...matchingPreset.config?.design }
        }));
      }

      const fetchTemplate = async () => {
        setIsLoading(true);
        try {
          const token = localStorage.getItem("token");
          const res = await fetch(`${API_BASE_URL}/invoice-templates/${templateId}`, {
            headers: { "Authorization": `Bearer ${token}` }
          });
          if (res.ok) {
            const result = await res.json();
            const template = result.data;
            if (template) {
              if (template._id) {
                setActualDbId(template._id);
              }
              setName(template.name || matchingPreset?.name || "Invoice Template");
              setDescription(template.description || matchingPreset?.description || "");
              setStatus(template.status || "active");
              if (template.config) {
                setConfig(prev => ({
                  ...INITIAL_CONFIG,
                  ...prev,
                  ...template.config,
                  header: { ...INITIAL_CONFIG.header, ...template.config?.header },
                  seller: { ...INITIAL_CONFIG.seller, ...template.config?.seller },
                  customer: { ...INITIAL_CONFIG.customer, ...template.config?.customer },
                  invoiceInfo: { 
                    ...INITIAL_CONFIG.invoiceInfo, 
                    ...template.config?.invoiceInfo,
                    labels: { ...INITIAL_CONFIG.invoiceInfo.labels, ...template.config?.invoiceInfo?.labels }
                  },
                  items: { 
                    ...INITIAL_CONFIG.items, 
                    ...template.config?.items,
                    labels: { ...INITIAL_CONFIG.items.labels, ...template.config?.items?.labels }
                  },
                  tax: { ...INITIAL_CONFIG.tax, ...template.config?.tax },
                  payment: { ...INITIAL_CONFIG.payment, ...template.config?.payment },
                  notes: { ...INITIAL_CONFIG.notes, ...template.config?.notes },
                  terms: { ...INITIAL_CONFIG.terms, ...template.config?.terms },
                  signature: { ...INITIAL_CONFIG.signature, ...template.config?.signature },
                  footer: { ...INITIAL_CONFIG.footer, ...template.config?.footer },
                  design: { ...INITIAL_CONFIG.design, ...template.config?.design }
                }));
              }
            }
          } else if (matchingPreset) {
            // Built-in template preset already loaded, smoothly keep editing
            console.info(`Editing built-in template preset: ${matchingPreset.name}`);
          } else {
            toast.error("Template not found.");
            navigate("/invoice/templates");
          }
        } catch (err) {
          console.error(err);
          if (!matchingPreset) {
            toast.error("Connection error loading template.");
          }
        } finally {
          setIsLoading(false);
          isFirstLoad.current = false;
        }
      };
      fetchTemplate();
    } else {
      setName("Modern Layout");
      isFirstLoad.current = false;
    }
  }, [templateId]);

  // Trigger Autosave debounced
  useEffect(() => {
    const saveId = actualDbId || (templateId && !templateId.startsWith("tpl-") ? templateId : null);
    if (isFirstLoad.current || !saveId) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    setAutosaveStatus("saving");
    autosaveTimerRef.current = setTimeout(async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE_URL}/invoice-templates/${saveId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ name, description, status, config })
        });
        if (res.ok) {
          setAutosaveStatus("saved");
        } else {
          setAutosaveStatus("idle");
        }
      } catch (err) {
        console.error(err);
        setAutosaveStatus("idle");
      }
    }, 2500);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [config, name, description, status, actualDbId, templateId]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Template name is required.");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("Session expired. Please log in again.");
      navigate("/auth");
      return;
    }

    setIsSaving(true);
    try {
      const targetId = actualDbId || (templateId && !templateId.startsWith("tpl-") ? templateId : null);
      let res;

      if (targetId) {
        // Direct update on existing database record
        res = await fetch(`${API_BASE_URL}/invoice-templates/${targetId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ name, description, status, config })
        });
      } else if (templateId && templateId.startsWith("tpl-")) {
        // Try PUT with preset ID (backend auto-creates if missing)
        res = await fetch(`${API_BASE_URL}/invoice-templates/${templateId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ name, description, status, config })
        });
        // Fallback to POST if server is running older route version
        if (!res.ok && res.status === 404) {
          res = await fetch(`${API_BASE_URL}/invoice-templates`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ name, description, status, config })
          });
        }
      } else {
        // Create new template
        res = await fetch(`${API_BASE_URL}/invoice-templates`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ name, description, status, config })
        });
      }

      if (res.status === 401 || res.status === 400) {
        const errData = await res.json().catch(() => null);
        if (errData?.error?.code === "UNAUTHORIZED" || errData?.error?.code === "INVALID_TOKEN") {
          localStorage.removeItem("token");
          toast.error("Session expired. Please log in again.");
          navigate("/auth");
          return;
        }
        if (errData?.error?.message) {
          toast.error(errData.error.message);
          return;
        }
      }

      if (res.ok) {
        toast.success(templateId ? "Template updated successfully!" : "Template created successfully!");
        navigate("/invoice/templates");
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData?.error?.message || "Failed to save template.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Connection error saving template.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateSubConfig = (section: keyof typeof config, field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      [section]: {
        ...(prev[section] as object),
        [field]: value
      }
    }));
  };

  const updateLabel = (section: 'invoiceInfo' | 'items', field: string, value: string) => {
    setConfig(prev => {
      const sectionConfig = prev[section] as any;
      return {
        ...prev,
        [section]: {
          ...sectionConfig,
          labels: {
            ...sectionConfig.labels,
            [field]: value
          }
        }
      };
    });
  };

  // HTML5 Drag and Drop for Section Reordering
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const handleSort = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const items = [...config.sectionsOrder];
    const draggedItemContent = items[dragItem.current];
    items.splice(dragItem.current, 1);
    items.splice(dragOverItem.current, 0, draggedItemContent);
    dragItem.current = null;
    dragOverItem.current = null;
    setConfig(prev => ({ ...prev, sectionsOrder: items }));
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      
      {/* Editor Toolbar */}
      <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            onClick={() => navigate("/invoice/templates")}
            className="rounded-xl h-10 w-10 p-0 border border-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-bold text-slate-950 text-base flex items-center gap-1.5">
              <Layout className="h-5 w-5 text-indigo-600" />
              {templateId ? "Edit Invoice Template" : "Create Invoice Template"}
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              {templateId ? `Autosave status: ${autosaveStatus === 'saving' ? 'Saving...' : autosaveStatus === 'saved' ? 'Saved ✓' : 'Idle'}` : 'Creating new design'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Select
            value={config.layout || "modern-indigo"}
            onValueChange={(val: string) => {
              const preset = TEMPLATE_REGISTRY.find(t => t.layoutKey === val);
              if (preset) {
                if (!name || TEMPLATE_REGISTRY.some(t => t.name === name)) {
                  setName(preset.name);
                }
                setDescription(preset.description);
                setConfig(prev => ({
                  ...prev,
                  layout: preset.layoutKey,
                  design: {
                    ...prev.design,
                    ...preset.config.design
                  },
                  invoiceInfo: {
                    ...prev.invoiceInfo,
                    labels: {
                      ...prev.invoiceInfo.labels,
                      ...preset.config.invoiceInfo.labels
                    }
                  },
                  items: {
                    ...prev.items,
                    labels: {
                      ...prev.items.labels,
                      ...preset.config.items.labels
                    }
                  }
                }));
                toast.success(`Applied ${preset.name} template preset`);
              }
            }}
          >
            <SelectTrigger className="h-10 w-44 rounded-xl border-slate-200 bg-white text-xs font-semibold text-slate-800">
              <SelectValue placeholder="Select Style Preset" />
            </SelectTrigger>
            <SelectContent className="bg-white border border-slate-200">
              {TEMPLATE_REGISTRY.map(t => (
                <SelectItem key={t.layoutKey} value={t.layoutKey} className="text-xs">
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input 
            value={name} 
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name..."
            className="h-10 w-48 rounded-xl border-slate-200 text-slate-900 bg-white"
          />
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="h-10 bg-slate-950 hover:bg-slate-800 text-white rounded-xl flex items-center gap-2 font-bold px-4"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Design
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50">
          <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mb-4" />
          <p className="text-slate-600 font-bold">Loading template editor...</p>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden h-[calc(100vh-64px)]">
          
          {/* Left Column - Configurations Accordions */}
          <div className="lg:col-span-3 border-r border-slate-200 bg-white flex flex-col h-full overflow-hidden">
            
            {/* Tabs */}
            <div className="grid grid-cols-3 border-b border-slate-200 text-center font-bold text-sm bg-slate-50/50">
              <button 
                onClick={() => setActiveTab("content")} 
                className={`py-3 flex flex-col items-center gap-1 transition-colors ${activeTab === "content" ? "border-b-2 border-indigo-600 text-indigo-700 bg-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                <FolderOpen className="h-4 w-4" />
                <span>Sections</span>
              </button>
              <button 
                onClick={() => setActiveTab("ordering")} 
                className={`py-3 flex flex-col items-center gap-1 transition-colors ${activeTab === "ordering" ? "border-b-2 border-indigo-600 text-indigo-700 bg-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                <Sliders className="h-4 w-4" />
                <span>Layout</span>
              </button>
              <button 
                onClick={() => setActiveTab("styles")} 
                className={`py-3 flex flex-col items-center gap-1 transition-colors ${activeTab === "styles" ? "border-b-2 border-indigo-600 text-indigo-700 bg-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                <Paintbrush className="h-4 w-4" />
                <span>Styles</span>
              </button>
            </div>

            {/* Config Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-slate-800">
              {activeTab === "content" && (
                <div className="space-y-4">
                  {/* Header Toggles */}
                  <Card className="p-4 border-slate-200">
                    <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-slate-800" />
                      Header Details
                    </h3>
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <Label className="font-semibold text-slate-700">Show Logo</Label>
                        <input 
                          type="checkbox" 
                          checked={config.header.showLogo} 
                          onChange={(e) => updateSubConfig("header", "showLogo", e.target.checked)}
                          className="h-4 w-4 accent-indigo-600"
                        />
                      </div>
                      {config.header.showLogo && (
                        <>
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold text-slate-500 uppercase">Logo URL</Label>
                            <Input 
                              value={config.header.logoUrl} 
                              onChange={(e) => updateSubConfig("header", "logoUrl", e.target.value)}
                              placeholder="Paste logo image url"
                              className="h-8 rounded-lg text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold text-slate-500 uppercase">Logo Position</Label>
                            <Select value={config.header.logoPosition} onValueChange={(val) => updateSubConfig("header", "logoPosition", val)}>
                              <SelectTrigger className="h-8 text-xs rounded-lg">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-white border-slate-200 text-slate-900">
                                <SelectItem value="left">Left</SelectItem>
                                <SelectItem value="center">Center</SelectItem>
                                <SelectItem value="right">Right</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      )}
                      <div className="flex items-center justify-between text-xs">
                        <Label className="font-semibold text-slate-700">Company Name</Label>
                        <input 
                          type="checkbox" 
                          checked={config.header.showCompanyName} 
                          onChange={(e) => updateSubConfig("header", "showCompanyName", e.target.checked)}
                          className="h-4 w-4 accent-indigo-600"
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <Label className="font-semibold text-slate-700">Company Address</Label>
                        <input 
                          type="checkbox" 
                          checked={config.header.showAddress} 
                          onChange={(e) => updateSubConfig("header", "showAddress", e.target.checked)}
                          className="h-4 w-4 accent-indigo-600"
                        />
                      </div>
                    </div>
                  </Card>

                  {/* Seller Details */}
                  <Card className="p-4 border-slate-200">
                    <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-slate-800" />
                      Seller Information
                    </h3>
                    <div className="space-y-2.5">
                      {Object.keys(config.seller).map((field) => (
                        <div key={field} className="flex items-center justify-between text-xs">
                          <Label className="font-semibold text-slate-700 capitalize">{field.replace("show", "Show ")}</Label>
                          <input 
                            type="checkbox" 
                            checked={(config.seller as any)[field]} 
                            onChange={(e) => updateSubConfig("seller", field, e.target.checked)}
                            className="h-4 w-4 accent-indigo-600"
                          />
                        </div>
                      ))}
                    </div>
                  </Card>

                  {/* Customer Details */}
                  <Card className="p-4 border-slate-200">
                    <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                      <User className="h-4 w-4 text-slate-800" />
                      Customer Details
                    </h3>
                    <div className="space-y-2.5">
                      {Object.keys(config.customer).map((field) => (
                        <div key={field} className="flex items-center justify-between text-xs">
                          <Label className="font-semibold text-slate-700 capitalize">{field.replace("show", "Show ")}</Label>
                          <input 
                            type="checkbox" 
                            checked={(config.customer as any)[field]} 
                            onChange={(e) => updateSubConfig("customer", field, e.target.checked)}
                            className="h-4 w-4 accent-indigo-600"
                          />
                        </div>
                      ))}
                    </div>
                  </Card>

                  {/* Invoice Meta Toggles & Label Renaming */}
                  <Card className="p-4 border-slate-200">
                    <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-slate-850" />
                      Invoice Meta Info
                    </h3>
                    <div className="space-y-3.5">
                      {[
                        { show: "showInvoiceNumber", label: "invoiceNumber", defaultLabel: "Invoice Number" },
                        { show: "showInvoiceDate", label: "invoiceDate", defaultLabel: "Invoice Date" },
                        { show: "showDueDate", label: "dueDate", defaultLabel: "Due Date" },
                        { show: "showPaymentTerms", label: "paymentTerms", defaultLabel: "Payment Terms" },
                        { show: "showOrderNumber", label: "orderNumber", defaultLabel: "Order Number" },
                        { show: "showSalesperson", label: "salespersonName", defaultLabel: "Salesperson" }
                      ].map((item) => (
                        <div key={item.show} className="space-y-1.5 border-b border-slate-50 pb-2.5">
                          <div className="flex items-center justify-between text-xs">
                            <Label className="font-semibold text-slate-700">{item.defaultLabel}</Label>
                            <input 
                              type="checkbox" 
                              checked={(config.invoiceInfo as any)[item.show]} 
                              onChange={(e) => updateSubConfig("invoiceInfo", item.show, e.target.checked)}
                              className="h-4 w-4 accent-indigo-600"
                            />
                          </div>
                          {(config.invoiceInfo as any)[item.show] && (
                            <Input 
                              value={(config.invoiceInfo.labels as any)[item.label]}
                              onChange={(e) => updateLabel("invoiceInfo", item.label, e.target.value)}
                              className="h-8 text-xs rounded-lg bg-slate-50"
                              placeholder="Display Label"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>

                  {/* Item Table Column Toggles */}
                  <Card className="p-4 border-slate-200">
                    <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                      <Package className="h-4 w-4 text-slate-800" />
                      Items Table Columns
                    </h3>
                    <div className="space-y-3">
                      {Object.keys(config.items.labels).map((col) => {
                        const isEnabled = config.items.columns.includes(col);
                        return (
                          <div key={col} className="space-y-1.5 border-b border-slate-50 pb-2">
                            <div className="flex items-center justify-between text-xs">
                              <Label className="font-semibold text-slate-700 capitalize">{col}</Label>
                              <input 
                                type="checkbox" 
                                checked={isEnabled} 
                                onChange={(e) => {
                                  let cols = [...config.items.columns];
                                  if (e.target.checked) {
                                    if (!cols.includes(col)) cols.push(col);
                                  } else {
                                    cols = cols.filter(c => c !== col);
                                  }
                                  updateSubConfig("items", "columns", cols);
                                }}
                                className="h-4 w-4 accent-indigo-600"
                              />
                            </div>
                            {isEnabled && (
                              <Input 
                                value={(config.items.labels as any)[col]}
                                onChange={(e) => updateLabel("items", col, e.target.value)}
                                className="h-8 text-xs rounded-lg bg-slate-50"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Card>

                  {/* Signature Section */}
                  <Card className="p-4 border-slate-200">
                    <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                      <PenTool className="h-4 w-4 text-slate-800" />
                      Authorized Signature
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <Label className="font-semibold text-slate-700">Show Signature</Label>
                        <input 
                          type="checkbox" 
                          checked={config.signature.show} 
                          onChange={(e) => updateSubConfig("signature", "show", e.target.checked)}
                          className="h-4 w-4 accent-indigo-600"
                        />
                      </div>
                      {config.signature.show && (
                        <>
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold text-slate-500">SIGNATURE IMAGE URL</Label>
                            <Input 
                              value={config.signature.imageUrl} 
                              onChange={(e) => updateSubConfig("signature", "imageUrl", e.target.value)}
                              placeholder="Paste signature png link"
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold text-slate-500">SIGNATORY NAME</Label>
                            <Input 
                              value={config.signature.name} 
                              onChange={(e) => updateSubConfig("signature", "name", e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold text-slate-500">DESIGNATION</Label>
                            <Input 
                              value={config.signature.designation} 
                              onChange={(e) => updateSubConfig("signature", "designation", e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </Card>
                </div>
              )}

              {activeTab === "ordering" && (
                <div className="space-y-4">
                  <div className="p-3 bg-slate-50 border border-indigo-100 rounded-xl text-xs text-slate-700 mb-2">
                    Drag and drop sections to change the sequence in which elements appear on the printed A4 invoice.
                  </div>
                  <div className="space-y-2">
                    {config.sectionsOrder.map((section, idx) => (
                      <div
                        key={section}
                        draggable
                        onDragStart={() => { dragItem.current = idx; }}
                        onDragEnter={() => { dragOverItem.current = idx; }}
                        onDragEnd={handleSort}
                        onDragOver={(e) => e.preventDefault()}
                        className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between cursor-move shadow-sm hover:border-indigo-400 hover:shadow transition-all"
                      >
                        <span className="font-bold text-slate-800 text-xs capitalize flex items-center gap-2">
                          <span className="flex items-center justify-center bg-slate-100 rounded h-5 w-5 text-[10px] text-slate-500 font-extrabold">{idx + 1}</span>
                          {section.replace(/([A-Z])/g, ' $1')}
                        </span>
                        <div className="space-y-0.5">
                          <div className="w-4 h-0.5 bg-slate-400"></div>
                          <div className="w-4 h-0.5 bg-slate-400"></div>
                          <div className="w-4 h-0.5 bg-slate-400"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "styles" && (
                <div className="space-y-4">
                  {/* Colors */}
                  <Card className="p-4 border-slate-200">
                    <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2 mb-3">Color Theme</h3>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-slate-700">Primary Color</Label>
                        <div className="flex gap-2">
                          <Input 
                            type="color" 
                            value={config.design.primaryColor} 
                            onChange={(e) => updateSubConfig("design", "primaryColor", e.target.value)}
                            className="h-8 w-12 p-0 border-slate-200 rounded cursor-pointer"
                          />
                          <Input 
                            type="text" 
                            value={config.design.primaryColor} 
                            onChange={(e) => updateSubConfig("design", "primaryColor", e.target.value)}
                            className="h-8 flex-1 text-xs"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-slate-700">Secondary/Row Color</Label>
                        <div className="flex gap-2">
                          <Input 
                            type="color" 
                            value={config.design.secondaryColor} 
                            onChange={(e) => updateSubConfig("design", "secondaryColor", e.target.value)}
                            className="h-8 w-12 p-0 border-slate-200 rounded cursor-pointer"
                          />
                          <Input 
                            type="text" 
                            value={config.design.secondaryColor} 
                            onChange={(e) => updateSubConfig("design", "secondaryColor", e.target.value)}
                            className="h-8 flex-1 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  </Card>

                  {/* Typography */}
                  <Card className="p-4 border-slate-200">
                    <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2 mb-3">Typography</h3>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-slate-700">Font Family</Label>
                        <Select value={config.design.fontFamily} onValueChange={(val) => updateSubConfig("design", "fontFamily", val)}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white text-slate-950 border-slate-200">
                            {GOOGLE_FONTS.map(font => (
                              <SelectItem key={font} value={font}>{font}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-slate-700">Base Font Size (px)</Label>
                        <Select value={String(config.design.fontSize)} onValueChange={(val) => updateSubConfig("design", "fontSize", Number(val))}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white text-slate-950 border-slate-200">
                            <SelectItem value="10">10px (Compact)</SelectItem>
                            <SelectItem value="12">12px (Regular)</SelectItem>
                            <SelectItem value="14">14px (Large)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </Card>

                  {/* Borders & Corners */}
                  <Card className="p-4 border-slate-200">
                    <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2 mb-3">Table Borders & Corners</h3>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-slate-700">Border Style</Label>
                        <Select value={config.design.borderStyle} onValueChange={(val) => updateSubConfig("design", "borderStyle", val)}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white text-slate-950 border-slate-200">
                            <SelectItem value="none">No Borders</SelectItem>
                            <SelectItem value="light">Light Borders</SelectItem>
                            <SelectItem value="medium">Medium Borders</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-slate-700">Corner Radius (px)</Label>
                        <Select value={String(config.design.cornerRadius)} onValueChange={(val) => updateSubConfig("design", "cornerRadius", Number(val))}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white text-slate-950 border-slate-200">
                            <SelectItem value="0">Square (0px)</SelectItem>
                            <SelectItem value="4">Small (4px)</SelectItem>
                            <SelectItem value="8">Medium (8px)</SelectItem>
                            <SelectItem value="12">Large (12px)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          </div>

          {/* Center Column - Real-time A4 Layout Preview */}
          <div className="lg:col-span-9 bg-slate-100 p-8 overflow-y-auto flex justify-center h-full no-print">
            <div id="a4-preview" className="w-full flex justify-center">
              <InvoiceTemplateRenderer
                invoice={SAMPLE_INVOICE}
                templateConfig={config}
                layoutKey={config.layout as TemplateLayoutKey}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
