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
        navigate("/auth");
        return;
      }
      const res = await fetch(`${API_BASE_URL}/purchase-templates`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 400) {
        localStorage.removeItem("token");
        toast.error("Session expired. Please log in again.");
        navigate("/auth");
        return;
      }
      if (res.ok) {
        const result = await res.json();
        setTemplates(result.data || []);
      } else {
        toast.error("Failed to load purchase templates.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Connection error loading purchase templates.");
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
              <h1 className="text-3xl font-black text-slate-950 flex items-center gap-2">
                <Layout className="h-7 w-7 text-amber-600" />
                Purchase Invoice Templates
              </h1>
              <p className="text-sm text-slate-600">Create, customize, and manage professional design layouts for vendor purchase bills.</p>
            </div>
          </div>
          <Button 
            onClick={() => navigate("/inventory/purchase-templates/create")}
            className="h-10 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl flex items-center gap-2"
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
              
              return (
                <Card 
                  key={template._id} 
                  className="group overflow-hidden rounded-[24px] border border-slate-200 hover:shadow-lg transition-all duration-300 bg-white flex flex-col justify-between"
                >
                  <div>
                    {/* Mock Thumbnail Preview */}
                    <div 
                      className="h-44 w-full relative flex items-center justify-center border-b border-slate-100 select-none overflow-hidden"
                      style={{ backgroundColor: `${primaryColor}15` }}
                    >
                      <div className="w-2/3 h-4/5 bg-white border border-slate-200/80 rounded-t-lg shadow-sm p-4 flex flex-col justify-between mt-4">
                        <div className="flex justify-between items-start">
                          <div className="h-3 w-8 rounded" style={{ backgroundColor: primaryColor }}></div>
                          <div className="h-2 w-12 bg-slate-200 rounded"></div>
                        </div>
                        <div className="space-y-1 my-3">
                          <div className="h-1.5 w-full bg-slate-100 rounded"></div>
                          <div className="h-1.5 w-5/6 bg-slate-100 rounded"></div>
                          <div className="h-1.5 w-4/6 bg-slate-100 rounded"></div>
                        </div>
                        <div className="border-t border-slate-100 pt-2 flex justify-between items-center">
                          <div className="h-2.5 w-6 bg-slate-200 rounded"></div>
                          <div className="h-3 w-10 rounded" style={{ backgroundColor: primaryColor }}></div>
                        </div>
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
