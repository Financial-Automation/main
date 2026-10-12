import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useSubscription } from "@/contexts/SubscriptionContext";
import {
  Users,
  Plus,
  Search,
  Filter,
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  FileText,
  DollarSign,
  TrendingUp,
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
  ChevronRight
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

interface Customer {
  _id: string;
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  shippingAddress?: string;
  gstin?: string;
  placeOfSupply?: string;
  paymentTerms?: string;
  notes?: string;
  status: "active" | "inactive";
  outstandingBalance: number;
  createdAt: string;
  updatedAt: string;
}

interface CustomerDetail {
  customer: Customer;
  financialSummary: {
    totalInvoiced: number;
    totalPaid: number;
    outstandingBalance: number;
    overdueAmount: number;
    invoiceCount: number;
    outstandingCount: number;
  };
  recentInvoices: any[];
  outstandingInvoices: any[];
  paymentHistory: any[];
}

export const Customers = () => {
  const navigate = useNavigate();
  const { hasAccess } = useSubscription();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Form State
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  const [formData, setFormData] = useState({
    name: "",
    companyName: "",
    email: "",
    phone: "",
    billingAddress: "",
    shippingAddress: "",
    gstin: "",
    placeOfSupply: "",
    paymentTerms: "Due on Receipt",
    notes: "",
    status: "active" as "active" | "inactive"
  });

  useEffect(() => {
    fetchCustomers();
  }, [searchQuery, statusFilter]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      let url = `${API_BASE_URL}/api/customers?status=${statusFilter}`;
      if (searchQuery.trim()) {
        url += `&q=${encodeURIComponent(searchQuery.trim())}`;
      }
      const data = await apiRequest(url);
      setCustomers(Array.isArray(data) ? data : data.customers || []);
    } catch (error: any) {
      toast.error(error.message || "Failed to load customers.");
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerDetail = async (id: string) => {
    try {
      setLoadingDetail(true);
      const data = await apiRequest(`${API_BASE_URL}/api/customers/${id}/detail`);
      setCustomerDetail(data);
      setIsDetailModalOpen(true);
    } catch (error: any) {
      toast.error(error.message || "Failed to load customer detail profile.");
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
      billingAddress: "",
      shippingAddress: "",
      gstin: "",
      placeOfSupply: "",
      paymentTerms: "Due on Receipt",
      notes: "",
      status: "active"
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormData({
      name: customer.name || "",
      companyName: customer.companyName || "",
      email: customer.email || "",
      phone: customer.phone || "",
      billingAddress: customer.billingAddress || "",
      shippingAddress: customer.shippingAddress || "",
      gstin: customer.gstin || "",
      placeOfSupply: customer.placeOfSupply || "",
      paymentTerms: customer.paymentTerms || "Due on Receipt",
      notes: customer.notes || "",
      status: customer.status || "active"
    });
    setIsEditModalOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Customer name is required.");
      return;
    }
    try {
      setSubmitting(true);
      if (selectedCustomer) {
        await apiRequest(`${API_BASE_URL}/api/customers/${selectedCustomer._id}`, {
          method: "PUT",
          body: JSON.stringify(formData)
        });
        toast.success("Customer updated successfully!");
        setIsEditModalOpen(false);
      } else {
        await apiRequest(`${API_BASE_URL}/api/customers`, {
          method: "POST",
          body: JSON.stringify(formData)
        });
        toast.success("Customer added successfully!");
        setIsAddModalOpen(false);
      }
      fetchCustomers();
    } catch (error: any) {
      toast.error(error.message || "Failed to save customer.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCustomer = async (customer: Customer) => {
    if (!confirm(`Are you sure you want to deactivate or remove customer '${customer.name}'?`)) return;
    try {
      const res = await apiRequest(`${API_BASE_URL}/api/customers/${customer._id}`, {
        method: "DELETE"
      });
      toast.success(res.message || "Customer removed.");
      fetchCustomers();
    } catch (error: any) {
      toast.error(error.message || "Failed to remove customer.");
    }
  };

  // KPIs
  const totalReceivables = customers.reduce((sum, c) => sum + (c.outstandingBalance || 0), 0);
  const activeCount = customers.filter((c) => c.status === "active").length;

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
              <Users className="h-7 w-7 text-indigo-600" />
              Customer Relationship Management
            </h1>
            <p className="text-sm text-slate-500">
              Manage client accounts, invoices, outstanding balances & financial history.
            </p>
          </div>
        </div>

        <Button
          onClick={handleOpenAddModal}
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Customer
        </Button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Customers</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{customers.length}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{activeCount} active accounts</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Users className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Receivables</p>
              <h3 className="text-2xl font-bold text-emerald-600 mt-1">
                ₹{totalReceivables.toLocaleString('en-IN')}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Across all open balances</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <TrendingUp className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Customers</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{activeCount}</h3>
              <p className="text-xs text-slate-500 mt-0.5">Eligible for invoicing</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
              <CheckCircle className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">High Risk Accounts</p>
              <h3 className="text-2xl font-bold text-amber-600 mt-1">
                {customers.filter(c => c.outstandingBalance > 50000).length}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Balance {'>'} ₹50,000</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
              <AlertTriangle className="h-6 w-6" />
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
              placeholder="Search by customer, company, GSTIN or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 rounded-xl border-slate-200 focus-visible:ring-indigo-500"
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

      {/* Customer List Table */}
      <Card className="rounded-2xl border-slate-200 shadow-sm bg-white overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-150 px-6 py-4">
          <CardTitle className="text-base font-semibold text-slate-900">
            Customers Directory ({customers.length})
          </CardTitle>
          <CardDescription>
            Comprehensive list of active and past business clients.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              <p>Loading customers directory...</p>
            </div>
          ) : customers.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-4">
              <div className="h-16 w-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                <Users className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">No Customers Found</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                Start building customer relationships by creating your first customer profile.
              </p>
              <Button
                onClick={handleOpenAddModal}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Your First Customer
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 uppercase text-xs font-semibold tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3.5">Customer / Company</th>
                    <th className="px-6 py-3.5">Contact Details</th>
                    <th className="px-6 py-3.5">GSTIN</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Outstanding Balance</th>
                    <th className="px-6 py-3.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-slate-800">
                  {customers.map((customer) => (
                    <tr key={customer._id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">{customer.name}</div>
                        {customer.companyName && (
                          <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <Building className="h-3 w-3 text-slate-400" />
                            {customer.companyName}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {customer.email && (
                          <div className="text-xs text-slate-600 flex items-center gap-1">
                            <Mail className="h-3 w-3 text-slate-400" />
                            {customer.email}
                          </div>
                        )}
                        {customer.phone && (
                          <div className="text-xs text-slate-600 flex items-center gap-1 mt-0.5">
                            <Phone className="h-3 w-3 text-slate-400" />
                            {customer.phone}
                          </div>
                        )}
                        {!customer.email && !customer.phone && (
                          <span className="text-xs text-slate-400 italic">No contact info</span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-700">
                        {customer.gstin ? (
                          <Badge variant="outline" className="font-mono bg-slate-50 border-slate-300">
                            {customer.gstin}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400">URP / Unregistered</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {customer.status === "active" ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-none">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                            Inactive
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-semibold">
                        {customer.outstandingBalance > 0 ? (
                          <span className="text-emerald-700">
                            ₹{customer.outstandingBalance.toLocaleString('en-IN')}
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
                            onClick={() => fetchCustomerDetail(customer._id)}
                            title="View Financial Profile"
                            className="h-8 w-8 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEditModal(customer)}
                            title="Edit Customer"
                            className="h-8 w-8 text-slate-600 hover:bg-slate-100 rounded-lg"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteCustomer(customer)}
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

      {/* Add / Edit Customer Dialog Modal */}
      <Dialog open={isAddModalOpen || isEditModalOpen} onOpenChange={(open) => {
        if (!open) {
          setIsAddModalOpen(false);
          setIsEditModalOpen(false);
        }
      }}>
        <DialogContent className="sm:max-w-xl rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedCustomer && isEditModalOpen ? "Edit Customer Profile" : "Add New Customer"}</DialogTitle>
            <DialogDescription>
              {selectedCustomer && isEditModalOpen
                ? "Update contact info, GSTIN, billing address, or payment terms."
                : "Enter customer information for invoice auto-filling and receivables tracking."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveCustomer} className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Full Name / Display Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g. Acme Enterprises / Rahul Sharma"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  placeholder="e.g. Acme Private Limited"
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
                  placeholder="client@acme.com"
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
                <Label htmlFor="gstin">GSTIN (Tax ID)</Label>
                <Input
                  id="gstin"
                  placeholder="33AAAAA0000A1Z5"
                  value={formData.gstin}
                  onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                  className="rounded-xl font-mono uppercase"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="paymentTerms">Payment Terms</Label>
                <Select
                  value={formData.paymentTerms}
                  onValueChange={(val) => setFormData({ ...formData, paymentTerms: val })}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Select terms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Due on Receipt">Due on Receipt</SelectItem>
                    <SelectItem value="Net 7">Net 7 Days</SelectItem>
                    <SelectItem value="Net 15">Net 15 Days</SelectItem>
                    <SelectItem value="Net 30">Net 30 Days</SelectItem>
                    <SelectItem value="Net 60">Net 60 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="billingAddress">Billing Address</Label>
              <Input
                id="billingAddress"
                placeholder="123 Commercial Street, Chennai, Tamil Nadu"
                value={formData.billingAddress}
                onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes / Internal Reference</Label>
              <Input
                id="notes"
                placeholder="Key contact person, special discounts, credit limits..."
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
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl gap-2"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {selectedCustomer && isEditModalOpen ? "Save Changes" : "Create Customer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Customer Detailed Financial Profile Modal */}
      <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
        <DialogContent className="sm:max-w-3xl rounded-2xl max-h-[90vh] overflow-y-auto">
          {customerDetail && (
            <div className="space-y-6">
              
              {/* Header Info */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-150 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-900">{customerDetail.customer.name}</h2>
                    {customerDetail.customer.status === "active" ? (
                      <Badge className="bg-emerald-100 text-emerald-800 border-none">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </div>
                  {customerDetail.customer.companyName && (
                    <p className="text-sm text-slate-500">{customerDetail.customer.companyName}</p>
                  )}
                </div>

                <Button
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    navigate(`/invoice?customer=${encodeURIComponent(customerDetail.customer.name)}`);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create Invoice for Customer
                </Button>
              </div>

              {/* Financial Metrics Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-xs text-slate-500 font-medium">Total Invoiced</p>
                  <p className="text-lg font-bold text-slate-900 mt-1">
                    ₹{customerDetail.financialSummary.totalInvoiced.toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                  <p className="text-xs text-emerald-700 font-medium">Total Paid</p>
                  <p className="text-lg font-bold text-emerald-800 mt-1">
                    ₹{customerDetail.financialSummary.totalPaid.toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200">
                  <p className="text-xs text-blue-700 font-medium">Outstanding</p>
                  <p className="text-lg font-bold text-blue-800 mt-1">
                    ₹{customerDetail.financialSummary.outstandingBalance.toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                  <p className="text-xs text-amber-700 font-medium">Overdue Amount</p>
                  <p className="text-lg font-bold text-amber-800 mt-1">
                    ₹{customerDetail.financialSummary.overdueAmount.toLocaleString('en-IN')}
                  </p>
                </div>
              </div>

              {/* Tabs for Invoices & Payment History */}
              <Tabs defaultValue="invoices" className="w-full">
                <TabsList className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                  <TabsTrigger value="invoices" className="rounded-lg text-xs font-semibold">
                    Invoices ({customerDetail.recentInvoices.length})
                  </TabsTrigger>
                  <TabsTrigger value="payments" className="rounded-lg text-xs font-semibold">
                    Payment History ({customerDetail.paymentHistory.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="invoices" className="pt-3 space-y-2">
                  {customerDetail.recentInvoices.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-sm">
                      No invoices created for this customer yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {customerDetail.recentInvoices.map((inv) => (
                        <div key={inv._id} className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-slate-900 text-sm">{inv.invoiceNumber}</div>
                            <div className="text-xs text-slate-500">
                              Date: {new Date(inv.invoiceDate).toLocaleDateString()} | Due: {new Date(inv.dueDate).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-slate-900 text-sm">₹{inv.grandTotal.toLocaleString('en-IN')}</div>
                            <div className="text-xs font-medium">
                              {inv.paymentStatus === 'paid' ? (
                                <span className="text-emerald-600">Paid</span>
                              ) : inv.isOverdue ? (
                                <span className="text-amber-600">Overdue (₹{inv.balanceDue.toLocaleString('en-IN')})</span>
                              ) : (
                                <span className="text-blue-600">Unpaid (₹{inv.balanceDue.toLocaleString('en-IN')})</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="payments" className="pt-3 space-y-2">
                  {customerDetail.paymentHistory.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-sm">
                      No recorded payments for this customer yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {customerDetail.paymentHistory.map((pmt, idx) => (
                        <div key={idx} className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-slate-900 text-sm">
                              Payment for Invoice {pmt.invoiceNumber}
                            </div>
                            <div className="text-xs text-slate-500">
                              Method: {pmt.paymentMethod?.toUpperCase()} | Date: {new Date(pmt.date).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="text-right font-bold text-emerald-600 text-sm">
                            + ₹{pmt.amountPaid.toLocaleString('en-IN')}
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

export default Customers;
