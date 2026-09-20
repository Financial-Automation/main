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

const GOOGLE_FONTS = ["Inter", "Roboto", "Poppins", "Open Sans", "Arial", "Helvetica"];

const INITIAL_CONFIG = {
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
            setName(template.name);
            setDescription(template.description || "");
            setStatus(template.status || "active");
            setConfig({
              ...INITIAL_CONFIG,
              ...template.config,
              // Deep merge logic fallback
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
            });
          } else {
            toast.error("Template not found.");
            navigate("/invoice/templates");
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
      setName("Modern Layout");
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
        const res = await fetch(`${API_BASE_URL}/invoice-templates/${templateId}`, {
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
      const url = templateId 
        ? `${API_BASE_URL}/invoice-templates/${templateId}` 
        : `${API_BASE_URL}/invoice-templates`;
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
        toast.success(templateId ? "Template updated successfully!" : "Template created successfully!");
        navigate("/invoice/templates");
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
            <div 
              id="a4-preview"
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
                  return (
                    <div 
                      key="header" 
                      className={`mb-6 flex ${config.header.logoPosition === 'center' ? 'flex-col items-center text-center' : config.header.logoPosition === 'right' ? 'flex-row-reverse justify-between items-start' : 'justify-between items-start'}`}
                    >
                      {config.header.showLogo && (
                        <div className="mb-2">
                          {config.header.logoUrl ? (
                            <img 
                              src={config.header.logoUrl} 
                              alt="Logo" 
                              className={`object-contain ${config.header.logoSize === 'small' ? 'h-10 w-24' : config.header.logoSize === 'large' ? 'h-20 w-44' : 'h-14 w-32'}`} 
                            />
                          ) : (
                            <div 
                              className={`bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-xs font-bold rounded-lg ${config.header.logoSize === 'small' ? 'h-10 w-24' : config.header.logoSize === 'large' ? 'h-20 w-44' : 'h-14 w-32'}`}
                              style={{ borderRadius: `${config.design.cornerRadius}px` }}
                            >
                              [ Company Logo ]
                            </div>
                          )}
                        </div>
                      )}

                      <div className="text-right max-w-md">
                        {config.header.showCompanyName && <h2 className="text-xl font-black" style={{ color: config.design.primaryColor }}>FINSMART DEMO CO.</h2>}
                        {config.header.showAddress && <p className="text-slate-500 text-xs mt-1">123 Financial Avenue, Tech District, Chennai, Tamil Nadu - 600001</p>}
                        {config.header.showPhone && <p className="text-slate-500 text-xs">Phone: +91 98765 43210</p>}
                        {config.header.showEmail && <p className="text-slate-500 text-xs">Email: billing@finsmart.com</p>}
                      </div>
                    </div>
                  );
                }

                if (sectionName === "seller" && config.seller.showName) {
                  return (
                    <div key="seller" className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200/50" style={{ backgroundColor: config.design.secondaryColor, borderRadius: `${config.design.cornerRadius}px` }}>
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Seller Details</h4>
                      {config.seller.showName && <p className="font-extrabold">SHREE ANDAL AI SOFTWARE SOLUTIONS (OPC) PRIVATE LIMITED</p>}
                      {config.seller.showAddress && <p className="text-slate-600 text-xs mt-0.5">3/124 Main Road, Andal Nagar, Trichy, Tamil Nadu - 620001</p>}
                      {config.seller.showPhone && <p className="text-slate-600 text-xs">Phone: +91 94432 10101</p>}
                      {config.seller.showEmail && <p className="text-slate-600 text-xs">Email: billing@andalai.com</p>}
                      {config.seller.showGSTIN && <p className="text-xs font-bold text-indigo-700 mt-1">GSTIN: 33ANDAL8271A1Z5</p>}
                    </div>
                  );
                }

                if (sectionName === "customer" && config.customer.showName) {
                  return (
                    <div key="customer" className="mb-6 grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Bill To</h4>
                        {config.customer.showName && <p className="font-bold text-sm">Acme Corporates Private Limited</p>}
                        {config.customer.showBillingAddress && <p className="text-slate-600 text-xs mt-0.5">456 Corporate Towers, Outer Ring Road, Bangalore, Karnataka - 560001</p>}
                        {config.customer.showPhone && <p className="text-slate-650 text-xs">Phone: +91 99988 87776</p>}
                        {config.customer.showEmail && <p className="text-slate-650 text-xs">Email: accounts@acme.com</p>}
                      </div>
                      <div className="text-right">
                        {config.customer.showGSTIN && <p className="text-xs font-bold text-slate-900 mt-6">Customer GSTIN: <span className="text-indigo-700">29ACMEP9812C1Z2</span></p>}
                        {config.customer.showPlaceOfSupply && <p className="text-xs text-slate-600">Place of Supply: <span className="font-medium text-slate-900">Karnataka (29)</span></p>}
                      </div>
                    </div>
                  );
                }

                if (sectionName === "invoiceInfo") {
                  return (
                    <div key="invoiceInfo" className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 border border-slate-200 rounded-xl bg-white" style={{ borderRadius: `${config.design.cornerRadius}px` }}>
                      {config.invoiceInfo.showInvoiceNumber && (
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-bold">{config.invoiceInfo.labels.invoiceNumber}</p>
                          <p className="font-extrabold text-sm" style={{ color: config.design.primaryColor }}>#INV-2026-00001</p>
                        </div>
                      )}
                      {config.invoiceInfo.showInvoiceDate && (
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-bold">{config.invoiceInfo.labels.invoiceDate}</p>
                          <p className="font-bold text-slate-900">13 Aug 2026</p>
                        </div>
                      )}
                      {config.invoiceInfo.showDueDate && (
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-bold">{config.invoiceInfo.labels.dueDate}</p>
                          <p className="font-bold text-slate-900">28 Aug 2026</p>
                        </div>
                      )}
                      {config.invoiceInfo.showPaymentTerms && (
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-bold">{config.invoiceInfo.labels.paymentTerms}</p>
                          <p className="text-slate-700">Net 15 Days</p>
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
                          config.design.borderStyle === 'light' 
                            ? 'border border-slate-200' 
                            : config.design.borderStyle === 'medium' 
                              ? 'border-2 border-slate-400' 
                              : 'border-none'
                        }`}
                      >
                        <thead>
                          <tr 
                            className="text-white text-xs font-bold"
                            style={{ backgroundColor: config.design.primaryColor }}
                          >
                            <th className="py-2.5 px-3">#</th>
                            {config.items.columns.map((col) => (
                              <th key={col} className="py-2.5 px-3 text-left">
                                {(config.items.labels as any)[col] || col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-slate-100 hover:bg-slate-50 text-xs">
                            <td className="py-3 px-3">1</td>
                            {config.items.columns.map((col) => {
                              if (col === "item") return <td key={col} className="py-3 px-3 font-bold">Dell XPS 15 Laptop</td>;
                              if (col === "description") return <td key={col} className="py-3 px-3 text-slate-500 text-[11px]">Intel i7 | 16GB RAM | 512GB SSD</td>;
                              if (col === "sku") return <td key={col} className="py-3 px-3 text-slate-600">DELL-XPS15-01</td>;
                              if (col === "hsn") return <td key={col} className="py-3 px-3">84713010</td>;
                              if (col === "quantity") return <td key={col} className="py-3 px-3">2 Pcs</td>;
                              if (col === "rate") return <td key={col} className="py-3 px-3">₹50,000.00</td>;
                              if (col === "tax") return <td key={col} className="py-3 px-3">18% GST</td>;
                              if (col === "amount") return <td key={col} className="py-3 px-3 font-bold text-slate-950">₹1,00,000.00</td>;
                              return <td key={col}>-</td>;
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                }

                if (sectionName === "tax" && config.tax.showSummary) {
                  return (
                    <div key="tax" className="mb-6 flex justify-end">
                      <div className="w-80 space-y-2 border-t border-slate-200 pt-3">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-500">Subtotal</span>
                          <span className="font-semibold">₹1,00,000.00</span>
                        </div>
                        {config.tax.showTaxableAmount && (
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">Taxable Amount</span>
                            <span>₹1,00,000.00</span>
                          </div>
                        )}
                        {config.tax.showCGST && (
                          <div className="flex justify-between items-center text-xs text-slate-650">
                            <span>CGST (9%)</span>
                            <span>₹9,000.00</span>
                          </div>
                        )}
                        {config.tax.showSGST && (
                          <div className="flex justify-between items-center text-xs text-slate-650">
                            <span>SGST (9%)</span>
                            <span>₹9,000.00</span>
                          </div>
                        )}
                        {config.tax.showTotalTax && (
                          <div className="flex justify-between items-center text-xs border-t border-slate-100 pt-1.5 font-bold">
                            <span className="text-slate-650">Total GST Tax</span>
                            <span>₹18,000.00</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center py-2 border-t border-slate-200">
                          <span className="font-extrabold text-slate-900">Grand Total</span>
                          <span className="text-base font-black" style={{ color: config.design.primaryColor }}>₹1,18,000.00</span>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (sectionName === "payment" && config.payment.showPaidAmount) {
                  return (
                    <div key="payment" className="mb-6 p-4 rounded-xl border border-slate-250 bg-slate-50/50" style={{ borderRadius: `${config.design.cornerRadius}px` }}>
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Payment Details</h4>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        {config.payment.showPaidAmount && (
                          <div>
                            <span className="text-slate-500 block">Paid Amount</span>
                            <span className="font-bold text-slate-900">₹68,000.00</span>
                          </div>
                        )}
                        {config.payment.showBalance && (
                          <div>
                            <span className="text-slate-500 block">Balance Due</span>
                            <span className="font-black text-rose-600">₹50,000.00</span>
                          </div>
                        )}
                        {config.payment.showPaymentMethod && (
                          <div>
                            <span className="text-slate-500 block">Method</span>
                            <span className="text-slate-700 capitalize">UPI Transfer</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                if (sectionName === "notes" && config.notes.show) {
                  return (
                    <div key="notes" className="mb-6">
                      <h5 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">{config.notes.label}</h5>
                      <p className="text-xs text-slate-600 whitespace-pre-line">{config.notes.defaultText}</p>
                    </div>
                  );
                }

                if (sectionName === "terms" && config.terms.show) {
                  return (
                    <div key="terms" className="mb-6">
                      <h5 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">{config.terms.label}</h5>
                      <p className="text-xs text-slate-500 whitespace-pre-line leading-relaxed">{config.terms.defaultText}</p>
                    </div>
                  );
                }

                if (sectionName === "signature" && config.signature.show) {
                  return (
                    <div key="signature" className="mb-6 flex flex-col items-end">
                      <div className="text-center w-48 mt-4">
                        {config.signature.imageUrl ? (
                          <img 
                            src={config.signature.imageUrl} 
                            alt="Signature" 
                            className="h-10 object-contain mx-auto mb-1.5" 
                          />
                        ) : (
                          <div className="h-10 w-full border border-dashed border-slate-200 rounded flex items-center justify-center text-[10px] text-slate-400 font-bold mb-1.5">
                            [ Signature Seal ]
                          </div>
                        )}
                        <div className="border-t border-slate-200 pt-1">
                          <p className="font-bold text-xs text-slate-900">{config.signature.name}</p>
                          <p className="text-[10px] text-slate-500">{config.signature.designation}</p>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (sectionName === "footer" && config.footer.show) {
                  return (
                    <div key="footer" className="mt-12 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-450">
                      <p className="leading-relaxed">{config.footer.text}</p>
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
