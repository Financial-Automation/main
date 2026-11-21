import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Plus, 
  Search, 
  ArrowLeft, 
  Copy, 
  Trash2, 
  Edit3, 
  Star,
  Loader2,
  Layout,
  Sliders,
  Calendar
} from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api";

interface TemplateConfig {
  design: {
    primaryColor: string;
    fontFamily: string;
  };
}

interface PurchaseTemplate {
  _id: string;
  name: string;
  description: string;
  status: "active" | "inactive";
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  config: TemplateConfig;
}

// All 10 Standard Purchase Invoice Templates
export const STANDARD_PURCHASE_TEMPLATES: PurchaseTemplate[] = [
  {
    _id: "tpl-amber-gold",
    name: "Amber Gold Purchase Bill (Default)",
    description: "Standard warm gold purchase invoice layout for retail & supermarket inventory.",
    status: "active",
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      design: {
        primaryColor: "#d97706",
        fontFamily: "Inter"
      }
    }
  },
  {
    _id: "tpl-emerald-corporate",
    name: "Emerald Wholesale Vendor",
    description: "Corporate emerald green design tailored for wholesale & B2B vendor receipts.",
    status: "active",
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      design: {
        primaryColor: "#059669",
        fontFamily: "Poppins"
      }
    }
  },
  {
    _id: "tpl-compact-business",
    name: "Slate Goods Received Note",
    description: "Minimalist slate layout focused on inventory receipt and stock intake.",
    status: "active",
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      design: {
        primaryColor: "#475569",
        fontFamily: "Roboto"
      }
    }
  },
  {
    _id: "tpl-swiss-minimal",
    name: "Swiss Minimal Vendor Receipt",
    description: "Clean stark black typography, hairline dividers, and objective alignment for precision intake.",
    status: "active",
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      design: {
        primaryColor: "#000000",
        fontFamily: "Inter"
      }
    }
  },
  {
    _id: "tpl-midnight-executive",
    name: "Midnight Executive Procurement",
    description: "Deep navy header banner with refined gold accents for corporate procurement & capital assets.",
    status: "active",
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      design: {
        primaryColor: "#0f172a",
        fontFamily: "Georgia, serif"
      }
    }
  },
  {
    _id: "tpl-modern-gradient",
    name: "Modern Gradient Intake",
    description: "Contemporary blue-to-violet accent styling with rounded elements for tech supply chains.",
    status: "active",
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      design: {
        primaryColor: "#2563eb",
        fontFamily: "Poppins, Inter, sans-serif"
      }
    }
  },
  {
    _id: "tpl-editorial-luxury",
    name: "Editorial / Luxury Consignment",
    description: "Serif masthead and stone rules for boutique consignments and luxury vendor orders.",
    status: "active",
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      design: {
        primaryColor: "#1c1917",
        fontFamily: "Georgia, serif"
      }
    }
  },
  {
    _id: "tpl-bold-creative",
    name: "Bold Creative Studio Intake",
    description: "Asymmetric orange side accent and bold typography for creative supplier and freelance deliverables.",
    status: "active",
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      design: {
        primaryColor: "#ea580c",
        fontFamily: "Inter"
      }
    }
  },
  {
    _id: "tpl-eco-natural",
    name: "Eco / Natural Produce Bill",
    description: "Muted forest green and organic cream canvas for sustainable, farm, and eco supplies.",
    status: "active",
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      design: {
        primaryColor: "#2d5a43",
        fontFamily: "Open Sans, Inter, sans-serif"
      }
    }
  },
  {
    _id: "tpl-modern-indigo",
    name: "Modern Indigo Procurement",
    description: "Clean modern layout with indigo header banner for corporate accounts and vendor invoices.",
    status: "active",
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      design: {
        primaryColor: "#4f46e5",
        fontFamily: "Inter"
      }
    }
  }
];

export const getPurchaseLayoutKey = (template: any): string => {
  if (!template) return "amber-gold";
  const name = (template.name || "").toLowerCase();
  const format = (template.config?.design?.invoiceFormat || "").toLowerCase();
  const id = (template._id || template.id || "").toLowerCase();

  if (name.includes("swiss") || id.includes("swiss") || format.includes("swiss")) return "swiss-minimal";
  if (name.includes("midnight") || id.includes("midnight") || format.includes("midnight")) return "midnight-executive";
  if (name.includes("gradient") || id.includes("gradient") || format.includes("gradient")) return "modern-gradient";
  if (name.includes("editorial") || name.includes("luxury") || id.includes("editorial") || id.includes("luxury")) return "editorial-luxury";
  if (name.includes("bold") || name.includes("creative") || id.includes("bold") || id.includes("creative")) return "bold-creative";
  if (name.includes("eco") || name.includes("natural") || id.includes("eco") || id.includes("natural")) return "eco-natural";
  if (name.includes("slate") || name.includes("compact") || format.includes("stationery") || id.includes("compact") || id.includes("slate")) return "compact-business";
  if (name.includes("emerald") || name.includes("wholesale") || id.includes("emerald")) return "emerald-corporate";
  if (name.includes("indigo") || id.includes("indigo")) return "modern-indigo";
  if (name.includes("amber") || name.includes("gold") || id.includes("amber")) return "amber-gold";

  return "amber-gold";
};

export default function PurchaseInvoiceTemplates() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<PurchaseTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const fetchTemplates = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setTemplates(STANDARD_PURCHASE_TEMPLATES);
        setIsLoading(false);
        return;
      }
      const res = await fetch(`${API_BASE_URL}/purchase-templates`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 400) {
        localStorage.removeItem("token");
        setTemplates(STANDARD_PURCHASE_TEMPLATES);
        setIsLoading(false);
        return;
      }
      if (res.ok) {
        const result = await res.json();
        const list: PurchaseTemplate[] = result.data || [];
        // Ensure all 10 templates are available by merging any missing
        const loadedNames = new Set(list.map(t => (t.name || "").toLowerCase()));
        const missing = STANDARD_PURCHASE_TEMPLATES.filter(st => !loadedNames.has(st.name.toLowerCase()));
        setTemplates([...list, ...missing]);
      } else {
        setTemplates(STANDARD_PURCHASE_TEMPLATES);
      }
    } catch (err) {
      console.error(err);
      setTemplates(STANDARD_PURCHASE_TEMPLATES);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleSetDefault = async (id: string) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setTemplates(prev => prev.map(t => ({ ...t, isDefault: t._id === id })));
        toast.success("Default purchase template updated!");
        return;
      }
      const res = await fetch(`${API_BASE_URL}/purchase-templates/${id}/set-default`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success("Default purchase template updated!");
        fetchTemplates();
      } else {
        toast.error("Failed to update default template.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Connection error setting default template.");
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        toast.error("Please login to duplicate templates.");
        return;
      }
      const res = await fetch(`${API_BASE_URL}/purchase-templates/${id}/duplicate`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success("Purchase template duplicated successfully!");
        fetchTemplates();
      } else {
        const errData = await res.json();
        toast.error(errData.error?.message || "Failed to duplicate template.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Connection error duplicating template.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this purchase template?")) return;
    
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setTemplates(prev => prev.filter(t => t._id !== id));
        toast.success("Purchase template removed.");
        return;
      }
      const res = await fetch(`${API_BASE_URL}/purchase-templates/${id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success("Purchase template deleted successfully!");
        fetchTemplates();
      } else {
        const errData = await res.json();
        toast.error(errData.error?.message || "Failed to delete template.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Connection error deleting template.");
    }
  };

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (t.description || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-slate-50/50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-5">
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              onClick={() => navigate("/inventory")}
              className="rounded-full h-10 w-10 p-0 border-slate-200 bg-white"
            >
              <ArrowLeft className="h-5 w-5 text-slate-700" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-black text-slate-950 flex items-center gap-2">
                  <Layout className="h-7 w-7 text-amber-600" />
                  Purchase Invoice Templates
                </h1>
                <span className="bg-amber-100 text-amber-800 text-xs font-black px-2.5 py-0.5 rounded-full">
                  10 Designs
                </span>
              </div>
              <p className="text-sm text-slate-600">Create, customize, and manage professional design layouts for vendor purchase bills.</p>
            </div>
          </div>
          <Button 
            onClick={() => navigate("/inventory/purchase-templates/create")}
            className="h-10 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Create Purchase Template
          </Button>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search purchase templates..."
              className="pl-10 h-10 rounded-xl border-slate-200 bg-white text-slate-900 focus:border-amber-500"
            />
          </div>
          <div className="flex gap-2.5">
            {(["all", "active", "inactive"] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-all ${
                  statusFilter === filter
                    ? "bg-amber-600 text-white shadow-sm"
                    : "bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {/* Templates Grid */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200">
            <Loader2 className="h-10 w-10 animate-spin text-amber-600 mb-3" />
            <p className="text-slate-600 font-medium">Loading purchase templates...</p>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white rounded-3xl border border-slate-200">
            <Sliders className="h-14 w-14 text-slate-400 mb-4" />
            <h3 className="text-lg font-bold text-slate-900">No Purchase Templates Found</h3>
            <p className="text-sm text-slate-600 max-w-sm mt-1">
              {searchTerm 
                ? "No templates match your search criteria. Try using different keywords." 
                : "Get started by creating a customized purchase bill layout for your vendor invoices."}
            </p>
            {!searchTerm && (
              <Button 
                onClick={() => navigate("/inventory/purchase-templates/create")}
                className="mt-5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl"
              >
                Create First Template
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTemplates.map((template) => {
              const primaryColor = template.config?.design?.primaryColor || "#d97706";
              const fontFamily = template.config?.design?.fontFamily || "Inter";
              const layoutKey = getPurchaseLayoutKey(template);
              
              return (
                <Card 
                  key={template._id} 
                  className="group overflow-hidden rounded-[24px] border border-slate-200 hover:shadow-lg transition-all duration-300 bg-white flex flex-col justify-between"
                >
                  <div>
                    {/* Unique Template Thumbnail Preview */}
                    <div 
                      className="h-48 w-full relative flex items-center justify-center border-b border-slate-100 select-none overflow-hidden"
                      style={{ backgroundColor: `${primaryColor}12` }}
                    >
                      {/* Visual Mini Mockup matching Template Layout */}
                      <div className="w-3/4 h-[85%] bg-white border border-slate-200/90 rounded-t-lg shadow-sm p-3.5 flex flex-col justify-between mt-4 overflow-hidden relative">
                        
                        {/* 1. Swiss Minimal Vendor Receipt */}
                        {layoutKey === 'swiss-minimal' && (
                          <>
                            <div className="pb-1.5 border-b border-black flex justify-between items-baseline">
                              <span className="text-[9px] font-black tracking-tight text-black">INWARD BILL</span>
                              <div className="h-1.5 w-10 bg-slate-400 rounded-none"></div>
                            </div>
                            <div className="space-y-1 my-2">
                              <div className="h-1 w-full bg-slate-200"></div>
                              <div className="h-1 w-5/6 bg-slate-200"></div>
                              <div className="h-1 w-4/6 bg-slate-200"></div>
                            </div>
                            <div className="border-t border-black pt-1.5 flex justify-between items-center">
                              <span className="text-[7px] font-mono font-bold text-black">TOTAL DUE</span>
                              <span className="text-[8px] font-mono font-black text-black">₹1,18,000</span>
                            </div>
                          </>
                        )}

                        {/* 2. Midnight Executive Procurement */}
                        {layoutKey === 'midnight-executive' && (
                          <>
                            <div className="-mx-3.5 -mt-3.5 p-2 bg-slate-950 border-b border-amber-500 flex justify-between items-center text-white">
                              <span className="text-[7px] font-black text-amber-400">PROCUREMENT</span>
                              <div className="h-1.5 w-8 bg-amber-400 rounded-sm"></div>
                            </div>
                            <div className="space-y-1 my-2">
                              <div className="h-1 w-full bg-slate-100 rounded"></div>
                              <div className="h-1 w-5/6 bg-slate-100 rounded"></div>
                            </div>
                            <div className="bg-slate-950 p-1.5 rounded border border-amber-400 flex justify-between items-center text-white">
                              <span className="text-[6px] font-bold text-amber-400 uppercase">Vendor Total</span>
                              <span className="text-[7.5px] font-mono font-black text-white">₹1,18,000</span>
                            </div>
                          </>
                        )}

                        {/* 3. Modern Gradient Intake */}
                        {layoutKey === 'modern-gradient' && (
                          <>
                            <div className="-mx-3.5 -mt-3.5 p-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white rounded-b-md flex justify-between items-center">
                              <span className="text-[7px] font-black">✦ SMART INTAKE</span>
                              <div className="h-1.5 w-10 bg-white/40 rounded-full"></div>
                            </div>
                            <div className="space-y-1 my-2">
                              <div className="h-1 w-full bg-indigo-50 rounded"></div>
                              <div className="h-1 w-4/6 bg-indigo-50 rounded"></div>
                            </div>
                            <div className="p-1 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white flex justify-between items-center px-2">
                              <span className="text-[6px] font-bold">TOTAL</span>
                              <span className="text-[7.5px] font-black">₹1,18,000</span>
                            </div>
                          </>
                        )}

                        {/* 4. Editorial / Luxury Consignment */}
                        {layoutKey === 'editorial-luxury' && (
                          <div className="bg-[#fcfbf9] -m-3.5 p-3.5 h-full flex flex-col justify-between">
                            <div className="border-t border-stone-800 pt-0.5 border-b border-stone-300 pb-1 flex justify-between items-baseline">
                              <span className="text-[8px] font-serif italic font-bold text-stone-900">Manifest № 001</span>
                              <span className="text-[6px] font-serif text-stone-500">Consignment</span>
                            </div>
                            <div className="space-y-1 my-2">
                              <div className="h-1 w-full bg-stone-200"></div>
                              <div className="h-1 w-3/4 bg-stone-200"></div>
                            </div>
                            <div className="border-t border-stone-800 pt-1 border-b border-stone-800 pb-0.5 flex justify-between items-baseline">
                              <span className="text-[7px] font-serif italic text-stone-700">Settlement</span>
                              <span className="text-[8px] font-serif font-black text-stone-950">₹1,18,000</span>
                            </div>
                          </div>
                        )}

                        {/* 5. Bold Creative Studio Intake */}
                        {layoutKey === 'bold-creative' && (
                          <div className="relative pl-2.5 h-full flex flex-col justify-between">
                            <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-orange-600 rounded-l"></div>
                            <div className="border-b-2 border-zinc-950 pb-1 flex justify-between items-center">
                              <span className="text-[8px] font-black tracking-tight text-zinc-950">DELIVERABLES</span>
                              <span className="text-[7px] font-bold text-orange-600 font-mono">#001</span>
                            </div>
                            <div className="space-y-1 my-1.5">
                              <div className="h-1.5 w-full bg-zinc-100"></div>
                              <div className="h-1.5 w-4/5 bg-zinc-100"></div>
                            </div>
                            <div className="bg-zinc-950 text-white p-1 border border-orange-500 flex justify-between items-center">
                              <span className="text-[6px] font-black text-orange-400">NET</span>
                              <span className="text-[7.5px] font-black font-mono">₹1,18,000</span>
                            </div>
                          </div>
                        )}

                        {/* 6. Eco / Natural Produce Bill */}
                        {layoutKey === 'eco-natural' && (
                          <div className="bg-[#fbf9f4] -m-3.5 p-3 h-full flex flex-col justify-between">
                            <div className="border-b-2 border-[#2d5a43] pb-1 flex justify-between items-center">
                              <span className="text-[7.5px] font-black text-[#2d5a43]">🌿 ORGANIC INWARD</span>
                              <div className="h-1.5 w-6 bg-[#2d5a43] rounded-full opacity-60"></div>
                            </div>
                            <div className="space-y-1 my-2">
                              <div className="h-1 w-full bg-[#eee9dc] rounded"></div>
                              <div className="h-1 w-3/4 bg-[#eee9dc] rounded"></div>
                            </div>
                            <div className="bg-[#2d5a43] text-white p-1 rounded-md flex justify-between items-center px-1.5">
                              <span className="text-[6px] font-bold">TOTAL</span>
                              <span className="text-[7px] font-mono font-black">₹1,18,000</span>
                            </div>
                          </div>
                        )}

                        {/* 7. Slate Goods Received Note (Compact Business) */}
                        {layoutKey === 'compact-business' && (
                          <div className="h-full flex flex-col justify-between text-[6.5px]">
                            <div className="border border-slate-300 grid grid-cols-2 divide-x divide-slate-300 bg-slate-50 p-1">
                              <div className="h-1.5 w-8 bg-slate-700 rounded-none mb-0.5"></div>
                              <div className="text-right text-[5.5px] text-slate-500 font-mono">GRN-001</div>
                            </div>
                            <div className="border border-slate-300 my-1 divide-y divide-slate-200">
                              <div className="h-1 w-full bg-slate-100"></div>
                              <div className="h-1 w-full bg-white"></div>
                              <div className="h-1 w-full bg-slate-100"></div>
                            </div>
                            <div className="border-t-2 border-slate-900 pt-0.5 flex justify-between items-center font-bold">
                              <span>STOCK VALUE:</span>
                              <span className="font-mono">₹1,18,000</span>
                            </div>
                          </div>
                        )}

                        {/* 8, 9, 10. Amber Gold, Emerald Corporate, Modern Indigo */}
                        {['amber-gold', 'emerald-corporate', 'modern-indigo'].includes(layoutKey) && (
                          <>
                            <div className="flex justify-between items-start pb-1.5 border-b" style={{ borderColor: `${primaryColor}40` }}>
                              <div className="h-2.5 w-10 rounded" style={{ backgroundColor: primaryColor }}></div>
                              <div className="h-2 w-8 bg-slate-200 rounded"></div>
                            </div>
                            <div className="space-y-1 my-2">
                              <div className="h-1.5 w-full bg-slate-100 rounded"></div>
                              <div className="h-1.5 w-5/6 bg-slate-100 rounded"></div>
                              <div className="h-1.5 w-4/6 bg-slate-100 rounded"></div>
                            </div>
                            <div className="border-t border-slate-100 pt-1.5 flex justify-between items-center">
                              <div className="h-2 w-6 bg-slate-200 rounded"></div>
                              <div className="h-2.5 w-10 rounded" style={{ backgroundColor: primaryColor }}></div>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Status Badges */}
                      <div className="absolute top-3.5 left-3.5 flex gap-2">
                        {template.isDefault && (
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                            <Star className="h-3 w-3 fill-amber-500 stroke-amber-500" />
                            DEFAULT
                          </span>
                        )}
                        <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full shadow-sm ${
                          template.status === "active" 
                            ? "bg-emerald-100 text-emerald-800" 
                            : "bg-slate-200 text-slate-700"
                        }`}>
                          {template.status.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {/* Template Meta */}
                    <div className="p-5 space-y-2">
                      <h3 className="text-lg font-bold text-slate-950 group-hover:text-amber-600 transition-colors">
                        {template.name}
                      </h3>
                      <p className="text-xs text-slate-500 line-clamp-2 h-8">
                        {template.description || "Customizable template for purchase invoices and supplier receipts."}
                      </p>
                      
                      <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-2">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(template.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                        <span className="flex items-center gap-1">
                          Font: <span className="font-semibold text-slate-700">{fontFamily}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Panel */}
                  <div className="p-4 border-t border-slate-100 bg-slate-50/70 grid grid-cols-4 gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/inventory/purchase-templates/create?id=${template._id}`)}
                      className="rounded-lg h-9 bg-white text-slate-700 hover:bg-slate-100 font-semibold border-slate-200"
                      title="Edit template config"
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDuplicate(template._id)}
                      className="rounded-lg h-9 bg-white text-slate-700 hover:bg-slate-100 font-semibold border-slate-200"
                      title="Duplicate Template"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={template.isDefault}
                      onClick={() => handleSetDefault(template._id)}
                      className={`rounded-lg h-9 font-semibold border-slate-200 ${
                        template.isDefault 
                          ? "bg-amber-50 border-amber-200 text-amber-800" 
                          : "bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                      title={template.isDefault ? "Already default" : "Set as Default template"}
                    >
                      <Star className={`h-4 w-4 ${template.isDefault ? "fill-amber-500 stroke-amber-500" : ""}`} />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={template.isDefault}
                      onClick={() => handleDelete(template._id)}
                      className="rounded-lg h-9 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700 border-slate-200"
                      title="Delete Template"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
