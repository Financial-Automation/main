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
  Sliders, 
  Layout, 
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
  FolderOpen,
  Palette
} from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api";

const GOOGLE_FONTS = ["Inter", "Roboto", "Poppins", "Open Sans", "Outfit", "Courier New"];

const INITIAL_PURCHASE_CONFIG = {
  header: {
    showLogo: true,
    logoPosition: "left" as const,
    logoSize: "medium" as const,
    logoUrl: "",
    showCompanyName: true,
    showAddress: true,
    showPhone: true,
    showEmail: true,
    headerTitle: "TAX INVOICE / PURCHASE BILL"
  },
  supplier: {
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
      invoiceNumber: "Bill No.",
      invoiceDate: "Bill Date",
      dueDate: "Due Date",
      paymentTerms: "Payment Terms",
      orderNumber: "PO / Ref No.",
      salespersonName: "Received By"
    }
  },
  items: {
    columns: ["item", "description", "hsn", "quantity", "rate", "tax", "amount"],
    labels: {
      item: "Item",
      description: "Description",
      sku: "SKU",
      hsn: "HSN/SAC",
      quantity: "Qty",
      rate: "Purchase Rate",
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
    label: "Purchase Notes",
    defaultText: "Goods received in good condition and entered into inventory record."
  },
  terms: {
    show: true,
    label: "Terms & Conditions",
    defaultText: "Payment terms as per standard vendor agreement."
  },
  signature: {
    show: true,
    name: "Authorized Manager",
    designation: "Store Manager",
    imageUrl: ""
  },
  footer: {
    show: true,
    text: "Powered by SHREE ANDAL AI SOFTWARE SOLUTIONS (OPC) PRIVATE LIMITED ✨"
  },
  design: {
    primaryColor: "#d97706",
    secondaryColor: "#fffbeb",
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
    "supplier",
    "customer",
    "invoiceInfo",
    "items",
    "tax",
    "payment",
    "notes",
    "terms",
    "signature",
    "footer"
  ]
};

export default function PurchaseInvoiceTemplateEditor() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const templateId = searchParams.get("id");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [config, setConfig] = useState(INITIAL_PURCHASE_CONFIG);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"content" | "styles" | "ordering">("content");
  
  const [autosaveStatus, setAutosaveStatus] = useState<"saved" | "saving" | "idle">("idle");
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstLoad = useRef(true);

  // Fetch initial config if editing
  useEffect(() => {
    if (templateId) {
      const fetchTemplate = async () => {
        setIsLoading(true);
        try {
          const token = localStorage.getItem("token");
          const res = await fetch(`${API_BASE_URL}/purchase-templates/${templateId}`, {
            headers: { "Authorization": `Bearer ${token}` }
          });
          if (res.ok) {
            const result = await res.json();
            const template = result.data;
            setName(template.name);
            setDescription(template.description || "");
            setStatus(template.status || "active");
            setConfig({
              ...INITIAL_PURCHASE_CONFIG,
              ...template.config,
              header: { ...INITIAL_PURCHASE_CONFIG.header, ...template.config?.header },
              supplier: { ...INITIAL_PURCHASE_CONFIG.supplier, ...template.config?.supplier },
              customer: { ...INITIAL_PURCHASE_CONFIG.customer, ...template.config?.customer },
              invoiceInfo: { 
                ...INITIAL_PURCHASE_CONFIG.invoiceInfo, 
                ...template.config?.invoiceInfo,
                labels: { ...INITIAL_PURCHASE_CONFIG.invoiceInfo.labels, ...template.config?.invoiceInfo?.labels }
              },
              items: { 
                ...INITIAL_PURCHASE_CONFIG.items, 
                ...template.config?.items,
                labels: { ...INITIAL_PURCHASE_CONFIG.items.labels, ...template.config?.items?.labels }
              },
              tax: { ...INITIAL_PURCHASE_CONFIG.tax, ...template.config?.tax },
              payment: { ...INITIAL_PURCHASE_CONFIG.payment, ...template.config?.payment },
              notes: { ...INITIAL_PURCHASE_CONFIG.notes, ...template.config?.notes },
              terms: { ...INITIAL_PURCHASE_CONFIG.terms, ...template.config?.terms },
              signature: { ...INITIAL_PURCHASE_CONFIG.signature, ...template.config?.signature },
              footer: { ...INITIAL_PURCHASE_CONFIG.footer, ...template.config?.footer },
              design: { ...INITIAL_PURCHASE_CONFIG.design, ...template.config?.design },
              sectionsOrder: template.config?.sectionsOrder || INITIAL_PURCHASE_CONFIG.sectionsOrder
            });
          } else {
            toast.error("Purchase template not found.");
            navigate("/inventory/purchase-templates");
          }
        } catch (err) {
          console.error(err);
          toast.error("Connection error loading template.");
        } finally {
          setIsLoading(false);
          isFirstLoad.current = false;
        }
      };
      fetchTemplate();
    } else {
      setName("Amber Gold Purchase Layout");
      setDescription("Professional warm gold purchase bill layout for supplier invoices.");
      isFirstLoad.current = false;
    }
  }, [templateId]);

  // Trigger Autosave debounced
  useEffect(() => {
    if (isFirstLoad.current || !templateId) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    setAutosaveStatus("saving");
    autosaveTimerRef.current = setTimeout(async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE_URL}/purchase-templates/${templateId}`, {
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
  }, [config, name, description, status]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Purchase template name is required.");
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
      const url = templateId 
        ? `${API_BASE_URL}/purchase-templates/${templateId}` 
        : `${API_BASE_URL}/purchase-templates`;
      const method = templateId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ name, description, status, config })
      });

      if (res.status === 401 || res.status === 400) {
        localStorage.removeItem("token");
        toast.error("Session expired. Please log in again.");
        navigate("/auth");
        return;
      }

      if (res.ok) {
        toast.success(templateId ? "Purchase template updated successfully!" : "Purchase template created successfully!");
        navigate("/inventory/purchase-templates");
      } else {
        const errData = await res.json();
        toast.error(errData.error?.message || "Failed to save template.");
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
            onClick={() => navigate("/inventory/purchase-templates")}
            className="rounded-xl h-10 w-10 p-0 border border-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-bold text-slate-950 text-base flex items-center gap-1.5">
              <Layout className="h-5 w-5 text-amber-600" />
              {templateId ? "Edit Purchase Invoice Design" : "Create Purchase Invoice Design"}
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              {templateId ? `Autosave status: ${autosaveStatus === 'saving' ? 'Saving...' : autosaveStatus === 'saved' ? 'Saved ✓' : 'Idle'}` : 'Creating new purchase layout'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Input 
            value={name} 
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name..."
            className="h-10 w-48 rounded-xl border-slate-200 text-slate-900 bg-white"
          />
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="h-10 bg-amber-600 hover:bg-amber-700 text-white rounded-xl flex items-center gap-2 font-bold px-4"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Design
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50">
          <Loader2 className="h-12 w-12 animate-spin text-amber-600 mb-4" />
          <p className="text-slate-600 font-bold">Loading template studio...</p>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden h-[calc(100vh-64px)]">
          
          {/* Left Column - Configurations Accordions */}
          <div className="lg:col-span-3 border-r border-slate-200 bg-white flex flex-col h-full overflow-hidden">
            
            {/* Tabs */}
            <div className="grid grid-cols-3 border-b border-slate-200 text-center font-bold text-sm bg-slate-50/50">
              <button 
                onClick={() => setActiveTab("content")} 
                className={`py-3 flex flex-col items-center gap-1 transition-colors ${activeTab === "content" ? "border-b-2 border-amber-600 text-amber-700 bg-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                <FolderOpen className="h-4 w-4" />
                <span>Sections</span>
              </button>
              <button 
                onClick={() => setActiveTab("ordering")} 
                className={`py-3 flex flex-col items-center gap-1 transition-colors ${activeTab === "ordering" ? "border-b-2 border-amber-600 text-amber-700 bg-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                <Sliders className="h-4 w-4" />
                <span>Layout</span>
              </button>
              <button 
                onClick={() => setActiveTab("styles")} 
                className={`py-3 flex flex-col items-center gap-1 transition-colors ${activeTab === "styles" ? "border-b-2 border-amber-600 text-amber-700 bg-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                <Paintbrush className="h-4 w-4" />
                <span>Styles</span>
              </button>
            </div>

            {/* Config Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-slate-800 text-xs">
              {activeTab === "content" && (
                <div className="space-y-4">
                  {/* Header Toggles */}
                  <Card className="p-4 border-slate-200">
                    <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-amber-600" />
                      Header & Logo Details
                    </h3>
                    <div className="space-y-2.5">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase">HEADER TITLE</Label>
                        <Input
                          value={config.header.headerTitle}
                          onChange={(e) => updateSubConfig("header", "headerTitle", e.target.value)}
                          placeholder="TAX INVOICE / PURCHASE BILL"
                          className="h-8 text-xs bg-slate-50"
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <Label className="font-semibold text-slate-700">Show Logo</Label>
                        <input 
                          type="checkbox" 
                          checked={config.header.showLogo} 
                          onChange={(e) => updateSubConfig("header", "showLogo", e.target.checked)}
                          className="h-4 w-4 accent-amber-600"
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
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold text-slate-500 uppercase">Logo Position</Label>
                            <Select value={config.header.logoPosition} onValueChange={(val) => updateSubConfig("header", "logoPosition", val)}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-white border-slate-200 text-slate-900">
                                <SelectItem value="left">Left</SelectItem>
                                <SelectItem value="center">Center</SelectItem>
                                <SelectItem value="right">Right</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold text-slate-500 uppercase">Logo Size</Label>
                            <Select value={config.header.logoSize} onValueChange={(val) => updateSubConfig("header", "logoSize", val)}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-white border-slate-200 text-slate-900">
                                <SelectItem value="small">Small</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="large">Large</SelectItem>
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
                          className="h-4 w-4 accent-amber-600"
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <Label className="font-semibold text-slate-700">Company Address</Label>
                        <input 
                          type="checkbox" 
                          checked={config.header.showAddress} 
                          onChange={(e) => updateSubConfig("header", "showAddress", e.target.checked)}
                          className="h-4 w-4 accent-amber-600"
                        />
                      </div>
                    </div>
                  </Card>

                  {/* Supplier Details */}
                  <Card className="p-4 border-slate-200">
                    <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-amber-600" />
                      Supplier Information
                    </h3>
                    <div className="space-y-2.5">
                      {Object.keys(config.supplier).map((field) => (
                        <div key={field} className="flex items-center justify-between text-xs">
                          <Label className="font-semibold text-slate-700 capitalize">{field.replace("show", "Show ")}</Label>
                          <input 
                            type="checkbox" 
                            checked={(config.supplier as any)[field]} 
                            onChange={(e) => updateSubConfig("supplier", field, e.target.checked)}
                            className="h-4 w-4 accent-amber-600"
                          />
                        </div>
                      ))}
                    </div>
                  </Card>

                  {/* Customer Details */}
                  <Card className="p-4 border-slate-200">
                    <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                      <User className="h-4 w-4 text-amber-600" />
                      Customer (Bill To) Details
                    </h3>
                    <div className="space-y-2.5">
                      {Object.keys(config.customer).map((field) => (
                        <div key={field} className="flex items-center justify-between text-xs">
                          <Label className="font-semibold text-slate-700 capitalize">{field.replace("show", "Show ")}</Label>
                          <input 
                            type="checkbox" 
                            checked={(config.customer as any)[field]} 
                            onChange={(e) => updateSubConfig("customer", field, e.target.checked)}
                            className="h-4 w-4 accent-amber-600"
                          />
                        </div>
                      ))}
                    </div>
                  </Card>

                  {/* Invoice Meta Toggles & Label Renaming */}
                  <Card className="p-4 border-slate-200">
                    <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-amber-600" />
                      Bill Meta Info & Labels
                    </h3>
                    <div className="space-y-3.5">
                      {[
                        { show: "showInvoiceNumber", label: "invoiceNumber", defaultLabel: "Bill Number" },
                        { show: "showInvoiceDate", label: "invoiceDate", defaultLabel: "Bill Date" },
                        { show: "showDueDate", label: "dueDate", defaultLabel: "Due Date" },
                        { show: "showPaymentTerms", label: "paymentTerms", defaultLabel: "Payment Terms" },
                        { show: "showOrderNumber", label: "orderNumber", defaultLabel: "PO / Ref No." },
                        { show: "showSalesperson", label: "salespersonName", defaultLabel: "Received By" }
                      ].map((item) => (
                        <div key={item.show} className="space-y-1.5 border-b border-slate-50 pb-2.5">
                          <div className="flex items-center justify-between text-xs">
                            <Label className="font-semibold text-slate-700">{item.defaultLabel}</Label>
                            <input 
                              type="checkbox" 
                              checked={(config.invoiceInfo as any)[item.show]} 
                              onChange={(e) => updateSubConfig("invoiceInfo", item.show, e.target.checked)}
                              className="h-4 w-4 accent-amber-600"
                            />
                          </div>
                          {(config.invoiceInfo as any)[item.show] && (
                            <Input 
                              value={(config.invoiceInfo.labels as any)[item.label]}
                              onChange={(e) => updateLabel("invoiceInfo", item.label, e.target.value)}
                              className="h-8 text-xs bg-slate-50"
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
                      <Package className="h-4 w-4 text-amber-600" />
                      Items Table Columns & Labels
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
                                className="h-4 w-4 accent-amber-600"
                              />
                            </div>
                            {isEnabled && (
                              <Input 
                                value={(config.items.labels as any)[col]}
                                onChange={(e) => updateLabel("items", col, e.target.value)}
                                className="h-8 text-xs bg-slate-50"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Card>

                  {/* Tax Breakdown Summary */}
                  <Card className="p-4 border-slate-200">
                    <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                      <Calculator className="h-4 w-4 text-amber-600" />
                      Tax Summary Toggles
                    </h3>
                    <div className="space-y-2.5">
                      {Object.keys(config.tax).map((tField) => (
                        <div key={tField} className="flex items-center justify-between text-xs">
                          <Label className="font-semibold text-slate-700 capitalize">{tField.replace("show", "Show ")}</Label>
                          <input 
                            type="checkbox" 
                            checked={(config.tax as any)[tField]} 
                            onChange={(e) => updateSubConfig("tax", tField, e.target.checked)}
                            className="h-4 w-4 accent-amber-600"
                          />
                        </div>
                      ))}
                    </div>
                  </Card>

                  {/* Payment Summary */}
                  <Card className="p-4 border-slate-200">
                    <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-amber-600" />
                      Payment Status Toggles
                    </h3>
                    <div className="space-y-2.5">
                      {Object.keys(config.payment).map((pField) => (
                        <div key={pField} className="flex items-center justify-between text-xs">
                          <Label className="font-semibold text-slate-700 capitalize">{pField.replace("show", "Show ")}</Label>
                          <input 
                            type="checkbox" 
                            checked={(config.payment as any)[pField]} 
                            onChange={(e) => updateSubConfig("payment", pField, e.target.checked)}
                            className="h-4 w-4 accent-amber-600"
                          />
                        </div>
                      ))}
                    </div>
                  </Card>

                  {/* Signature Section */}
                  <Card className="p-4 border-slate-200">
                    <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                      <PenTool className="h-4 w-4 text-amber-600" />
                      Authorized Signature & Stamp
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <Label className="font-semibold text-slate-700">Show Signature</Label>
                        <input 
                          type="checkbox" 
                          checked={config.signature.show} 
                          onChange={(e) => updateSubConfig("signature", "show", e.target.checked)}
                          className="h-4 w-4 accent-amber-600"
                        />
                      </div>
                      {config.signature.show && (
                        <>
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold text-slate-500">SIGNATURE IMAGE URL</Label>
                            <Input 
                              value={config.signature.imageUrl} 
                              onChange={(e) => updateSubConfig("signature", "imageUrl", e.target.value)}
                              placeholder="Paste signature PNG URL"
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
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium">
                    Drag and drop sections to change the sequence in which elements appear on the printed A4 purchase invoice.
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
                        className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between cursor-move shadow-sm hover:border-amber-400 hover:shadow transition-all"
                      >
                        <span className="font-bold text-slate-800 text-xs capitalize flex items-center gap-2">
                          <span className="flex items-center justify-center bg-amber-100 rounded h-5 w-5 text-[10px] text-amber-800 font-extrabold">{idx + 1}</span>
                          {section.replace(/([A-Z])/g, ' $1')}
                        </span>
                        <div className="space-y-0.5 opacity-60">
                          <div className="w-4 h-0.5 bg-slate-600"></div>
                          <div className="w-4 h-0.5 bg-slate-600"></div>
                          <div className="w-4 h-0.5 bg-slate-600"></div>
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
                    <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2 mb-3 flex items-center gap-2">
                      <Palette className="h-4 w-4 text-amber-600" />
                      Color Theme Palette
                    </h3>
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
                        <Label className="text-xs font-semibold text-slate-700">Secondary / Row Accent Color</Label>
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
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {[
                          { name: "Amber Gold", hex: "#d97706" },
                          { name: "Emerald Green", hex: "#059669" },
                          { name: "Slate Gray", hex: "#475569" },
                          { name: "Royal Indigo", hex: "#4f46e5" },
                          { name: "Crimson Red", hex: "#dc2626" },
                          { name: "Purple", hex: "#7c3aed" }
                        ].map((c) => (
                          <button
                            key={c.hex}
                            type="button"
                            onClick={() => updateSubConfig("design", "primaryColor", c.hex)}
                            className="w-6 h-6 rounded-full border border-white shadow-sm transition-transform hover:scale-110"
                            style={{ backgroundColor: c.hex }}
                            title={c.name}
                          />
                        ))}
                      </div>
                    </div>
                  </Card>

                  {/* Typography */}
                  <Card className="p-4 border-slate-200">
                    <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2 mb-3">Typography & Size</h3>
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
                            <SelectItem value="16">Rounded (16px)</SelectItem>
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
            <div 
              id="purchase-a4-preview"
              className="w-[210mm] min-h-[297mm] bg-white p-12 shadow-2xl relative border border-slate-300 rounded-sm"
              style={{ 
                fontFamily: config.design.fontFamily,
                fontSize: `${config.design.fontSize}px`,
                color: config.design.textColor,
                lineHeight: "1.5"
              }}
            >
              {/* Dynamic Styled Layout from sectionsOrder */}
              {config.sectionsOrder.map((sectionName) => {
                if (sectionName === "header") {
                  const pos = config.header.logoPosition;
                  const sz = config.header.logoSize;
                  const logoHeight = sz === 'small' ? 'h-8' : sz === 'large' ? 'h-16' : 'h-11';

                  return (
                    <div 
                      key="header" 
                      className={`p-6 -mx-12 -mt-12 rounded-t-sm mb-6 flex text-white ${
                        pos === 'center' ? 'flex-col items-center text-center justify-center' : pos === 'right' ? 'flex-row-reverse justify-between items-start' : 'flex-row justify-between items-start'
                      }`}
                      style={{ backgroundColor: config.design.primaryColor }}
                    >
                      <div className={`flex items-center gap-4 ${pos === 'center' ? 'flex-col' : ''}`}>
                        {config.header.showLogo && (
                          config.header.logoUrl ? (
                            <img src={config.header.logoUrl} alt="Logo" className={`${logoHeight} w-auto object-contain rounded bg-white/10 p-1`} />
                          ) : (
                            <div className={`${logoHeight} w-24 bg-white/20 border border-dashed border-white/40 rounded flex items-center justify-center text-[10px] font-bold text-white`}>
                              LOGO
                            </div>
                          )
                        )}
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">{config.header.headerTitle || "TAX INVOICE / PURCHASE BILL"}</p>
                          {config.header.showCompanyName && <h2 className="text-2xl font-black text-white">SHREE ANDAL TRADERS</h2>}
                          {config.header.showAddress && <p className="text-xs opacity-90 mt-0.5">123 Market Road, Wholesale Hub, Chennai, TN 600001</p>}
                          <p className="text-xs opacity-90">
                            {config.header.showPhone && "Ph: +91 98765 43210"}
                            {config.header.showPhone && config.header.showEmail && " | "}
                            {config.header.showEmail && "Email: contact@shreeandal.ai"}
                          </p>
                        </div>
                      </div>
                      <div className={pos === 'center' ? 'mt-3 text-center' : 'text-right'}>
                        <p className="text-xs opacity-80 font-medium">{config.invoiceInfo.labels?.invoiceNumber || "Bill No."}</p>
                        <p className="text-xl font-black text-white">#PUR-2026-001</p>
                      </div>
                    </div>
                  );
                }

                if (sectionName === "supplier" && config.supplier.showName) {
                  return (
                    <div 
                      key="supplier" 
                      className="mb-5 p-4 border"
                      style={{ 
                        backgroundColor: config.design.secondaryColor || '#fffbeb',
                        borderColor: config.design.borderColor || '#cbd5e1',
                        borderRadius: `${config.design.cornerRadius}px`
                      }}
                    >
                      <h4 className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: config.design.primaryColor }}>Supplier (Vendor Details)</h4>
                      <p className="font-extrabold text-sm text-slate-950">Apex Wholesale Distributors Private Limited</p>
                      {config.supplier.showAddress && <p className="text-xs text-slate-600">Plot 45, Industrial Estate, Guindy, Chennai - 600032</p>}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 mt-1">
                        {config.supplier.showPhone && <span>Ph: +91 94433 22110</span>}
                        {config.supplier.showEmail && <span>Email: billing@apexwholesale.com</span>}
                        {config.supplier.showGSTIN && <span className="font-semibold text-slate-800">GSTIN: 33APEXD9182B1Z4</span>}
                      </div>
                    </div>
                  );
                }

                if (sectionName === "customer" && config.customer.showName) {
                  return (
                    <div key="customer" className="mb-5 p-4 border border-slate-200 rounded-xl bg-slate-50/50">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider mb-1 text-slate-500">Bill To (Customer / Receiving Branch)</h4>
                      <p className="font-bold text-xs text-slate-900">SHREE ANDAL TRADERS - Central Warehouse</p>
                      {config.customer.showBillingAddress && <p className="text-xs text-slate-600">Main Bazaar Road, Madurai, TN 625001</p>}
                      <div className="flex flex-wrap gap-x-4 text-xs text-slate-600 mt-1">
                        {config.customer.showPhone && <span>Ph: +91 98765 43210</span>}
                        {config.customer.showGSTIN && <span className="font-semibold">GSTIN: 33ANDAL8271A1Z5</span>}
                      </div>
                    </div>
                  );
                }

                if (sectionName === "invoiceInfo") {
                  const info = config.invoiceInfo;
                  return (
                    <div key="invoiceInfo" className="mb-5 grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                      {info.showInvoiceNumber && (
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold uppercase block">{info.labels?.invoiceNumber || "Bill No."}</span>
                          <span className="font-bold text-slate-900">PUR-2026-001</span>
                        </div>
                      )}
                      {info.showInvoiceDate && (
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold uppercase block">{info.labels?.invoiceDate || "Bill Date"}</span>
                          <span className="font-semibold text-slate-800">12 Sep 2026</span>
                        </div>
                      )}
                      {info.showDueDate && (
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold uppercase block">{info.labels?.dueDate || "Due Date"}</span>
                          <span className="font-semibold text-slate-800">27 Sep 2026</span>
                        </div>
                      )}
                      {info.showPaymentTerms && (
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold uppercase block">{info.labels?.paymentTerms || "Terms"}</span>
                          <span className="font-semibold text-slate-800">Net 15 Days</span>
                        </div>
                      )}
                    </div>
                  );
                }

                if (sectionName === "items") {
                  const borderCls = config.design.borderStyle === "none" ? "border-none" : config.design.borderStyle === "medium" ? "border-2 border-slate-300" : "border border-slate-200";
                  
                  return (
                    <div key="items" className="mb-6 overflow-hidden" style={{ borderRadius: `${config.design.cornerRadius}px` }}>
                      <table className={`w-full text-left border-collapse ${borderCls}`}>
                        <thead>
                          <tr className="text-white text-xs font-bold" style={{ backgroundColor: config.design.primaryColor }}>
                            <th className="py-2.5 px-3">#</th>
                            {config.items.columns.map((col) => (
                              <th key={col} className="py-2.5 px-3">
                                {(config.items.labels as any)[col] || col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          <tr>
                            <td className="py-3 px-3">1</td>
                            {config.items.columns.map((col) => {
                              if (col === "item") return <td key={col} className="py-3 px-3 font-bold text-slate-950">Premium Rice Bag 25kg</td>;
                              if (col === "description") return <td key={col} className="py-3 px-3 text-slate-500">Aromatic Superfine Grade</td>;
                              if (col === "sku") return <td key={col} className="py-3 px-3 text-slate-600 font-mono text-[11px]">RICE-25KG-01</td>;
                              if (col === "hsn") return <td key={col} className="py-3 px-3 text-slate-600">10063010</td>;
                              if (col === "quantity") return <td key={col} className="py-3 px-3">10 Bags</td>;
                              if (col === "rate") return <td key={col} className="py-3 px-3">₹1,400.00</td>;
                              if (col === "tax") return <td key={col} className="py-3 px-3">5% GST</td>;
                              if (col === "amount") return <td key={col} className="py-3 px-3 font-bold text-slate-950">₹14,700.00</td>;
                              return <td key={col}>-</td>;
                            })}
                          </tr>
                          <tr style={{ backgroundColor: config.design.secondaryColor || '#fffbeb' }}>
                            <td className="py-3 px-3">2</td>
                            {config.items.columns.map((col) => {
                              if (col === "item") return <td key={col} className="py-3 px-3 font-bold text-slate-950">Refined Sunflower Oil 1L</td>;
                              if (col === "description") return <td key={col} className="py-3 px-3 text-slate-500">Fortified Cooking Oil</td>;
                              if (col === "sku") return <td key={col} className="py-3 px-3 text-slate-600 font-mono text-[11px]">OIL-1L-05</td>;
                              if (col === "hsn") return <td key={col} className="py-3 px-3 text-slate-600">15121910</td>;
                              if (col === "quantity") return <td key={col} className="py-3 px-3">24 Cartons</td>;
                              if (col === "rate") return <td key={col} className="py-3 px-3">₹120.00</td>;
                              if (col === "tax") return <td key={col} className="py-3 px-3">5% GST</td>;
                              if (col === "amount") return <td key={col} className="py-3 px-3 font-bold text-slate-950">₹3,024.00</td>;
                              return <td key={col}>-</td>;
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                }

                if (sectionName === "tax") {
                  const taxCfg = config.tax;
                  return (
                    <div key="tax" className="mb-6 flex justify-end">
                      <div className="w-72 space-y-1.5 text-xs">
                        {taxCfg.showTaxableAmount && <div className="flex justify-between text-slate-600"><span>Taxable Amount</span><span>₹16,880.00</span></div>}
                        {taxCfg.showCGST && <div className="flex justify-between text-slate-500 text-[11px]"><span>CGST (2.5%)</span><span>₹422.00</span></div>}
                        {taxCfg.showSGST && <div className="flex justify-between text-slate-500 text-[11px]"><span>SGST (2.5%)</span><span>₹422.00</span></div>}
                        {taxCfg.showTotalTax && <div className="flex justify-between text-slate-600 font-medium border-t border-slate-100 pt-1"><span>Total Tax</span><span>₹844.00</span></div>}
                        <div 
                          className="flex justify-between items-center py-2.5 px-3.5 text-white font-bold rounded-lg mt-2 shadow-sm"
                          style={{ 
                            backgroundColor: config.design.primaryColor,
                            borderRadius: `${config.design.cornerRadius}px`
                          }}
                        >
                          <span>Grand Total Amount</span>
                          <span className="text-base font-black">₹17,724.00</span>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (sectionName === "payment" && (config.payment.showPaidAmount || config.payment.showBalance)) {
                  return (
                    <div key="payment" className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex justify-between items-center text-xs">
                      {config.payment.showPaidAmount && <div><span className="text-slate-500 block text-[10px] font-bold uppercase">Amount Paid</span><span className="font-bold text-emerald-800 text-sm">₹10,000.00</span></div>}
                      {config.payment.showBalance && <div><span className="text-slate-500 block text-[10px] font-bold uppercase">Balance Due</span><span className="font-bold text-rose-700 text-sm">₹7,724.00</span></div>}
                      {config.payment.showPaymentMethod && <div><span className="text-slate-500 block text-[10px] font-bold uppercase">Payment Mode</span><span className="font-semibold text-slate-800">Bank Wire / NEFT</span></div>}
                    </div>
                  );
                }

                if (sectionName === "notes" && config.notes.show) {
                  return (
                    <div key="notes" className="mb-4 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <p className="font-bold text-slate-800 uppercase tracking-wider text-[10px] mb-0.5">{config.notes.label || "Purchase Notes"}</p>
                      <p className="text-slate-600">{config.notes.defaultText}</p>
                    </div>
                  );
                }

                if (sectionName === "terms" && config.terms.show) {
                  return (
                    <div key="terms" className="mb-4 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <p className="font-bold text-slate-800 uppercase tracking-wider text-[10px] mb-0.5">{config.terms.label || "Terms & Conditions"}</p>
                      <p className="text-slate-500">{config.terms.defaultText}</p>
                    </div>
                  );
                }

                if (sectionName === "signature" && config.signature.show) {
                  return (
                    <div key="signature" className="mt-8 flex justify-end">
                      <div className="text-center w-52">
                        {config.signature.imageUrl ? (
                          <img src={config.signature.imageUrl} alt="Signature" className="h-12 w-auto mx-auto object-contain mb-1" />
                        ) : (
                          <div className="h-10 border-b border-slate-400 mb-1"></div>
                        )}
                        <p className="font-extrabold text-xs text-slate-900">{config.signature.name || "Inventory Manager"}</p>
                        <p className="text-[10px] text-slate-500">{config.signature.designation || "Authorized Stock Receiver"}</p>
                      </div>
                    </div>
                  );
                }

                if (sectionName === "footer" && config.footer.show) {
                  return (
                    <div key="footer" className="mt-8 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      {config.footer.text}
                    </div>
                  );
                }

                return null;
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
