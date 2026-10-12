import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useSubscription } from "@/contexts/SubscriptionContext";
import {
  Building2,
  Plus,
  Search,
  Filter,
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  FileText,
  DollarSign,
  TrendingDown,
  AlertTriangle,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Building,
  Loader2,
  Calendar,
  CreditCard,
  ShoppingBag
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { API_BASE_URL, apiRequest } from "@/lib/api";

interface Vendor {
  _id: string;
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  gstin?: string;
  placeOfSupply?: string;
  paymentTerms?: string;
  notes?: string;
  status: "active" | "inactive";
  outstandingPayable: number;
  createdAt: string;
  updatedAt: string;
}

interface VendorDetail {
  vendor: Vendor;
  financialSummary: {
    totalPurchases: number;
    totalPaid: number;
    outstandingPayable: number;
    overduePayable: number;
    billCount: number;
    outstandingCount: number;
    bookkeepingExpenseCount: number;
  };
  recentBills: any[];
  outstandingPayables: any[];
  paymentHistory: any[];
  expenseEntries: any[];
}

export const Vendors = () => {
  const navigate = useNavigate();
  const { hasAccess } = useSubscription();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Selected State
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [vendorDetail, setVendorDetail] = useState<VendorDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  const [formData, setFormData] = useState({
    name: "",
    companyName: "",
    email: "",
    phone: "",
    address: "",
    gstin: "",
    placeOfSupply: "",
    paymentTerms: "Net 30",
    notes: "",
    status: "active" as "active" | "inactive"
  });

  useEffect(() => {
    fetchVendors();
  }, [searchQuery, statusFilter]);

  const fetchVendors = async () => {
    try {
      setLoading(true);
      let url = `${API_BASE_URL}/api/vendors?status=${statusFilter}`;
      if (searchQuery.trim()) {
        url += `&q=${encodeURIComponent(searchQuery.trim())}`;
      }
      const data = await apiRequest(url);
      setVendors(Array.isArray(data) ? data : data.vendors || []);
    } catch (error: any) {
      toast.error(error.message || "Failed to load vendors.");
    } finally {
      setLoading(false);
    }
  };

  const fetchVendorDetail = async (id: string) => {
    try {
      setLoadingDetail(true);
      const data = await apiRequest(`${API_BASE_URL}/api/vendors/${id}/detail`);
      setVendorDetail(data);
      setIsDetailModalOpen(true);
    } catch (error: any) {
      toast.error(error.message || "Failed to load vendor detail profile.");
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleOpenAddModal = () => {
    setFormData({
      name: "",
      companyName: "",
      email: "",
      phone: "",
      address: "",
      gstin: "",
      placeOfSupply: "",
      paymentTerms: "Net 30",
      notes: "",
      status: "active"
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setFormData({
      name: vendor.name || "",
      companyName: vendor.companyName || "",
      email: vendor.email || "",
      phone: vendor.phone || "",
      address: vendor.address || "",
      gstin: vendor.gstin || "",
      placeOfSupply: vendor.placeOfSupply || "",
      paymentTerms: vendor.paymentTerms || "Net 30",
      notes: vendor.notes || "",
      status: vendor.status || "active"
    });
    setIsEditModalOpen(true);
  };

  const handleSaveVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Vendor name is required.");
      return;
    }
    try {
      setSubmitting(true);
      if (selectedVendor) {
        await apiRequest(`${API_BASE_URL}/api/vendors/${selectedVendor._id}`, {
          method: "PUT",
          body: JSON.stringify(formData)
        });
        toast.success("Vendor updated successfully!");
        setIsEditModalOpen(false);
      } else {
        await apiRequest(`${API_BASE_URL}/api/vendors`, {
          method: "POST",
          body: JSON.stringify(formData)
        });
        toast.success("Vendor added successfully!");
        setIsAddModalOpen(false);
      }
      fetchVendors();
    } catch (error: any) {
      toast.error(error.message || "Failed to save vendor.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteVendor = async (vendor: Vendor) => {
    if (!confirm(`Are you sure you want to deactivate or remove vendor '${vendor.name}'?`)) return;
    try {
      const res = await apiRequest(`${API_BASE_URL}/api/vendors/${vendor._id}`, {
        method: "DELETE"
      });
      toast.success(res.message || "Vendor removed.");
      fetchVendors();
    } catch (error: any) {
      toast.error(error.message || "Failed to remove vendor.");
    }
  };

  // KPIs
  const totalPayables = vendors.reduce((sum, v) => sum + (v.outstandingPayable || 0), 0);
  const activeCount = vendors.filter(v => v.status === "active").length;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate("/dashboard")}
            className="rounded-xl border-slate-200"
          >
            <ArrowLeft className="h-4 w-4 text-slate-600" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Building2 className="h-7 w-7 text-amber-600" />
              Vendor & Supplier Management
            </h1>
            <p className="text-sm text-slate-500">
              Track suppliers, raw material bills, payables & payment schedules.
            </p>
          </div>
        </div>

        <Button
          onClick={handleOpenAddModal}
          className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-md gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Vendor
        </Button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Vendors</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{vendors.length}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{activeCount} active suppliers</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Building2 className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Payables</p>
              <h3 className="text-2xl font-bold text-red-600 mt-1">
                ₹{totalPayables.toLocaleString('en-IN')}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Across all unpaid supplier bills</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-600">
              <TrendingDown className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Suppliers</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{activeCount}</h3>
              <p className="text-xs text-slate-500 mt-0.5">Ready for purchase orders</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
              <CheckCircle className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Major Suppliers</p>
              <h3 className="text-2xl font-bold text-indigo-600 mt-1">
                {vendors.filter(v => v.outstandingPayable > 25000).length}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Payable {'>'} ₹25,000</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <ShoppingBag className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search vendor name, company, GSTIN or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 rounded-xl border-slate-200 focus-visible:ring-amber-500"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Filter className="h-4 w-4 text-slate-500 hidden sm:inline" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-44 rounded-xl border-slate-200">
                <SelectValue placeholder="Status Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="inactive">Inactive Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Vendor List Table */}
      <Card className="rounded-2xl border-slate-200 shadow-sm bg-white overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-150 px-6 py-4">
          <CardTitle className="text-base font-semibold text-slate-900">
            Vendors & Suppliers Directory ({vendors.length})
          </CardTitle>
          <CardDescription>
            Comprehensive list of active and past trade vendors.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
              <p>Loading vendors directory...</p>
            </div>
          ) : vendors.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-4">
              <div className="h-16 w-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                <Building2 className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">No Vendors Found</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                Manage trade relationships by adding your supplier & vendor profiles.
              </p>
              <Button
                onClick={handleOpenAddModal}
                className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Your First Vendor
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 uppercase text-xs font-semibold tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3.5">Vendor / Company</th>
                    <th className="px-6 py-3.5">Contact Details</th>
                    <th className="px-6 py-3.5">GSTIN</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Outstanding Payable</th>
                    <th className="px-6 py-3.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-slate-800">
                  {vendors.map((vendor) => (
                    <tr key={vendor._id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">{vendor.name}</div>
                        {vendor.companyName && (
                          <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <Building className="h-3 w-3 text-slate-400" />
                            {vendor.companyName}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {vendor.email && (
                          <div className="text-xs text-slate-600 flex items-center gap-1">
                            <Mail className="h-3 w-3 text-slate-400" />
                            {vendor.email}
                          </div>
                        )}
                        {vendor.phone && (
                          <div className="text-xs text-slate-600 flex items-center gap-1 mt-0.5">
                            <Phone className="h-3 w-3 text-slate-400" />
                            {vendor.phone}
                          </div>
                        )}
                        {!vendor.email && !vendor.phone && (
                          <span className="text-xs text-slate-400 italic">No contact info</span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-700">
                        {vendor.gstin ? (
                          <Badge variant="outline" className="font-mono bg-slate-50 border-slate-300">
                            {vendor.gstin}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400">Unregistered Vendor</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {vendor.status === "active" ? (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-none">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                            Inactive
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-semibold">
                        {vendor.outstandingPayable > 0 ? (
                          <span className="text-red-600">
                            ₹{vendor.outstandingPayable.toLocaleString('en-IN')}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">₹0</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => fetchVendorDetail(vendor._id)}
                            title="View Financial Profile"
                            className="h-8 w-8 text-amber-600 hover:bg-amber-50 rounded-lg"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEditModal(vendor)}
                            title="Edit Vendor"
                            className="h-8 w-8 text-slate-600 hover:bg-slate-100 rounded-lg"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteVendor(vendor)}
                            title="Deactivate or Remove"
                            className="h-8 w-8 text-red-500 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Vendor Dialog Modal */}
      <Dialog open={isAddModalOpen || isEditModalOpen} onOpenChange={(open) => {
        if (!open) {
          setIsAddModalOpen(false);
          setIsEditModalOpen(false);
        }
      }}>
        <DialogContent className="sm:max-w-xl rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedVendor && isEditModalOpen ? "Edit Vendor Profile" : "Add New Vendor"}</DialogTitle>
            <DialogDescription>
              {selectedVendor && isEditModalOpen
                ? "Update contact info, GSTIN, payment terms, or notes."
                : "Enter supplier details for purchase invoice tracking and payables management."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveVendor} className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="vendorName">Vendor Name *</Label>
                <Input
                  id="vendorName"
                  placeholder="e.g. Sri Lakshmi Mills / Zenith Tech"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="companyName">Company / Firm Name</Label>
                <Input
                  id="companyName"
                  placeholder="e.g. Zenith Tech Private Limited"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="orders@supplier.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  placeholder="+91 9876543210"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="gstin">GSTIN (Supplier Tax ID)</Label>
                <Input
                  id="gstin"
                  placeholder="33BBBBB0000B1Z8"
                  value={formData.gstin}
                  onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                  className="rounded-xl font-mono uppercase"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="paymentTerms">Credit / Payment Terms</Label>
                <Select
                  value={formData.paymentTerms}
                  onValueChange={(val) => setFormData({ ...formData, paymentTerms: val })}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Select terms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Immediate">Immediate Cash</SelectItem>
                    <SelectItem value="Net 7">Net 7 Days</SelectItem>
                    <SelectItem value="Net 15">Net 15 Days</SelectItem>
                    <SelectItem value="Net 30">Net 30 Days</SelectItem>
                    <SelectItem value="Net 45">Net 45 Days</SelectItem>
                    <SelectItem value="Net 60">Net 60 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="address">Vendor Address</Label>
              <Input
                id="address"
                placeholder="45 Industrial Estate, Coimbatore, Tamil Nadu"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes / Vendor Remarks</Label>
              <Input
                id="notes"
                placeholder="Raw material quality, primary supply representative..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="rounded-xl"
              />
            </div>

            <DialogFooter className="gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsAddModalOpen(false);
                  setIsEditModalOpen(false);
                }}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl gap-2"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {selectedVendor && isEditModalOpen ? "Save Changes" : "Create Vendor"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Vendor Detailed Financial Profile Modal */}
      <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
        <DialogContent className="sm:max-w-3xl rounded-2xl max-h-[90vh] overflow-y-auto">
          {vendorDetail && (
            <div className="space-y-6">
              
              {/* Header Info */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-150 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-900">{vendorDetail.vendor.name}</h2>
                    {vendorDetail.vendor.status === "active" ? (
                      <Badge className="bg-amber-100 text-amber-800 border-none">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </div>
                  {vendorDetail.vendor.companyName && (
                    <p className="text-sm text-slate-500">{vendorDetail.vendor.companyName}</p>
                  )}
                </div>

                <Button
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    navigate("/inventory");
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Record Purchase Bill
                </Button>
              </div>

              {/* Financial Metrics Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-xs text-slate-500 font-medium">Total Purchases</p>
                  <p className="text-lg font-bold text-slate-900 mt-1">
                    ₹{vendorDetail.financialSummary.totalPurchases.toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                  <p className="text-xs text-emerald-700 font-medium">Total Paid</p>
                  <p className="text-lg font-bold text-emerald-800 mt-1">
                    ₹{vendorDetail.financialSummary.totalPaid.toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200">
                  <p className="text-xs text-red-700 font-medium">Outstanding Payable</p>
                  <p className="text-lg font-bold text-red-800 mt-1">
                    ₹{vendorDetail.financialSummary.outstandingPayable.toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200">
                  <p className="text-xs text-purple-700 font-medium">Recorded Bills</p>
                  <p className="text-lg font-bold text-purple-800 mt-1">
                    {vendorDetail.financialSummary.billCount} Bills
                  </p>
                </div>
              </div>

              {/* Tabs for Purchase Bills & Bookkeeping Entries */}
              <Tabs defaultValue="bills" className="w-full">
                <TabsList className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                  <TabsTrigger value="bills" className="rounded-lg text-xs font-semibold">
                    Purchase Bills ({vendorDetail.recentBills.length})
                  </TabsTrigger>
                  <TabsTrigger value="expenses" className="rounded-lg text-xs font-semibold">
                    Bookkeeping Expenses ({vendorDetail.expenseEntries.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="bills" className="pt-3 space-y-2">
                  {vendorDetail.recentBills.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-sm">
                      No purchase bills recorded for this vendor yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {vendorDetail.recentBills.map((bill) => (
                        <div key={bill._id} className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-slate-900 text-sm">Bill #{bill.billNo}</div>
                            <div className="text-xs text-slate-500">
                              Date: {new Date(bill.billDate).toLocaleDateString()} | Method: {bill.paymentMethod}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-slate-900 text-sm">₹{bill.total.toLocaleString('en-IN')}</div>
                            <div className="text-xs font-medium">
                              {bill.balance <= 0 ? (
                                <span className="text-emerald-600">Fully Paid</span>
                              ) : (
                                <span className="text-red-600">Balance: ₹{bill.balance.toLocaleString('en-IN')}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="expenses" className="pt-3 space-y-2">
                  {vendorDetail.expenseEntries.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-sm">
                      No bookkeeping expenses tagged to this vendor yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {vendorDetail.expenseEntries.map((exp) => (
                        <div key={exp._id} className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-slate-900 text-sm">{exp.description}</div>
                            <div className="text-xs text-slate-500">
                              Category: {exp.category} | Date: {new Date(exp.date).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="text-right font-bold text-red-600 text-sm">
                            - ₹{exp.amount.toLocaleString('en-IN')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Vendors;
