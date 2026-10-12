import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useSubscription } from "@/contexts/SubscriptionContext";
import {
  Landmark,
  Upload,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Search,
  Filter,
  Download,
  Plus,
  RefreshCw,
  Loader2,
  FileSpreadsheet,
  Building2,
  Users,
  BookOpen,
  DollarSign,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
  FileText,
  XCircle,
  Link as LinkIcon,
  HelpCircle,
  Calendar,
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
import { DEFAULT_REPORT_COMPANY_NAME, getReportCompanyName } from "@/lib/reportBranding";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface BankReconciliationSummary {
  openingBalance: number;
  latestBankBalance: number;
  systemLedgerBalance: number;
  difference: number;
  totalTransactions: number;
  matchedCount: number;
  suggestedCount: number;
  reconciledCount: number;
  unmatchedCount: number;
  reconciliationPercentage: number;
  lastReconciliationDate: string;
  status: "balanced" | "needs_attention";
  warningMessage: string;
  totalInflow: number;
  totalOutflow: number;
}

interface BankTxItem {
  _id: string;
  date: string;
  description: string;
  referenceNumber?: string;
  type: "credit" | "debit";
  amount: number;
  status: "unmatched" | "matched" | "reconciled" | "ignored";
  matchScore: number;
  matchType: string;
  matchReasons?: string[];
  matchedCustomerName?: string;
  matchedVendorName?: string;
  matchedBookkeepingId?: {
    _id: string;
    description: string;
    amount: number;
    category: string;
    type: string;
  } | null;
  matchedInvoiceId?: {
    _id: string;
    invoiceNumber: string;
    customerName: string;
    grandTotal: number;
  } | null;
}

export const BankReconciliation = () => {
  const navigate = useNavigate();
  const { hasAccess } = useSubscription();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [summary, setSummary] = useState<BankReconciliationSummary | null>(null);
  const [transactions, setTransactions] = useState<BankTxItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [startDateFilter, setStartDateFilter] = useState<string>("");
  const [endDateFilter, setEndDateFilter] = useState<string>("");

  // Create Bookkeeping Entry Modal
  const [selectedTxForEntry, setSelectedTxForEntry] = useState<BankTxItem | null>(null);
  const [isEntryModalOpen, setIsEntryModalOpen] = useState<boolean>(false);
  const [entryCategory, setEntryCategory] = useState<string>("General");
  const [entryDescription, setEntryDescription] = useState<string>("");
  const [submittingEntry, setSubmittingEntry] = useState<boolean>(false);

  // Manual Ledger Search / Linking Modal
  const [selectedTxForSearch, setSelectedTxForSearch] = useState<BankTxItem | null>(null);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState<boolean>(false);
  const [ledgerSearchQuery, setLedgerSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<{ bookkeepingEntries: any[]; invoices: any[] }>({
    bookkeepingEntries: [],
    invoices: [],
  });
  const [loadingSearch, setLoadingSearch] = useState<boolean>(false);

  useEffect(() => {
    fetchSummaryAndTransactions();
  }, [statusFilter, typeFilter, searchQuery, startDateFilter, endDateFilter]);

  const fetchSummaryAndTransactions = async () => {
    try {
      setLoading(true);
      let queryParams = `status=${statusFilter}&type=${typeFilter}&q=${encodeURIComponent(searchQuery)}`;
      if (startDateFilter) queryParams += `&startDate=${startDateFilter}`;
      if (endDateFilter) queryParams += `&endDate=${endDateFilter}`;

      const [sumData, txRes] = await Promise.all([
        apiRequest(`${API_BASE_URL}/api/bank-reconciliation/summary?${queryParams}`),
        apiRequest(`${API_BASE_URL}/api/bank-reconciliation/transactions?${queryParams}`),
      ]);
      setSummary(sumData);
      setTransactions(Array.isArray(txRes) ? txRes : txRes.transactions || []);
    } catch (error: any) {
      toast.error(error.message || "Failed to load bank reconciliation data.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploading(true);
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/bank-reconciliation/upload-statement`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const resData = await response.json();
      if (response.ok) {
        toast.success(resData.message || "Bank statement uploaded and matched with ledger!");
        fetchSummaryAndTransactions();
      } else {
        toast.error(resData.message || "Failed to upload bank statement.");
      }
    } catch (error: any) {
      toast.error("Error uploading statement file: " + error.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleReconcileItem = async (bankTransactionId: string, bookkeepingId?: string, invoiceId?: string) => {
    try {
      await apiRequest(`${API_BASE_URL}/api/bank-reconciliation/reconcile-item`, {
        method: "POST",
        body: JSON.stringify({ bankTransactionId, bookkeepingId, invoiceId }),
      });
      toast.success("Transaction reconciled!");
      fetchSummaryAndTransactions();
    } catch (error: any) {
      toast.error(error.message || "Failed to reconcile transaction.");
    }
  };

  const handleUnmatchItem = async (bankTransactionId: string) => {
    try {
      await apiRequest(`${API_BASE_URL}/api/bank-reconciliation/unmatch-item`, {
        method: "POST",
        body: JSON.stringify({ bankTransactionId }),
      });
      toast.success("Match rejected & marked as unmatched.");
      fetchSummaryAndTransactions();
    } catch (error: any) {
      toast.error(error.message || "Failed to unmatch transaction.");
    }
  };

  const handleOpenCreateEntryModal = (tx: BankTxItem) => {
    setSelectedTxForEntry(tx);
    setEntryDescription(tx.description);
    setEntryCategory(tx.type === "credit" ? "Sales" : "Utilities");
    setIsEntryModalOpen(true);
  };

  const handleCreateBookkeepingEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTxForEntry || !entryCategory.trim()) return;

    try {
      setSubmittingEntry(true);
      await apiRequest(`${API_BASE_URL}/api/bank-reconciliation/create-bookkeeping-entry`, {
        method: "POST",
        body: JSON.stringify({
          bankTransactionId: selectedTxForEntry._id,
          category: entryCategory.trim(),
          description: entryDescription.trim(),
        }),
      });
      toast.success("Matching bookkeeping entry created & transaction reconciled!");
      setIsEntryModalOpen(false);
      fetchSummaryAndTransactions();
    } catch (error: any) {
      toast.error(error.message || "Failed to create bookkeeping entry.");
    } finally {
      setSubmittingEntry(false);
    }
  };

  const handleOpenSearchModal = async (tx: BankTxItem) => {
    setSelectedTxForSearch(tx);
    setIsSearchModalOpen(true);
    fetchLedgerSearchResults(tx.description, tx.type);
  };

  const fetchLedgerSearchResults = async (queryStr: string, type: string) => {
    try {
      setLoadingSearch(true);
      const res = await apiRequest(
        `${API_BASE_URL}/api/bank-reconciliation/search-ledger?q=${encodeURIComponent(queryStr)}&type=${type}`
      );
      setSearchResults(res || { bookkeepingEntries: [], invoices: [] });
    } catch (error: any) {
      toast.error(error.message || "Failed to search ledger.");
    } finally {
      setLoadingSearch(false);
    }
  };

  const downloadAuditReport = () => {
    if (!summary) return;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(getReportCompanyName(DEFAULT_REPORT_COMPANY_NAME), pageWidth / 2, y, { align: "center" });

    y += 8;
    doc.setFontSize(18);
    doc.text("BANK RECONCILIATION AUDIT REPORT", pageWidth / 2, y, { align: "center" });

    y += 10;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, y, { align: "center" });

    y += 15;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("RECONCILIATION SUMMARY", 15, y);

    y += 8;
    const summaryTable = [
      ["Opening Statement Balance", `Rs. ${summary.openingBalance.toLocaleString("en-IN")}`],
      ["Closing Bank Statement Balance", `Rs. ${summary.latestBankBalance.toLocaleString("en-IN")}`],
      ["System Ledger Balance", `Rs. ${summary.systemLedgerBalance.toLocaleString("en-IN")}`],
      ["Reconciliation Difference", `Rs. ${summary.difference.toLocaleString("en-IN")}`],
      ["Total Statement Items", summary.totalTransactions.toString()],
      ["Reconciled Items", summary.reconciledCount.toString()],
      ["Suggested Matches", summary.suggestedCount.toString()],
      ["Unreconciled Items", summary.unmatchedCount.toString()],
      ["Reconciliation Percentage", `${summary.reconciliationPercentage}%`],
    ];

    autoTable(doc, {
      startY: y,
      head: [["Audit Metric", "Value"]],
      body: summaryTable,
      theme: "grid",
    });

    y = (doc as any).lastAutoTable.finalY + 15;

    doc.setFontSize(12);
    doc.text("TRANSACTION AUDIT LIST", 15, y);
    y += 8;

    const txRows = transactions.slice(0, 40).map((t) => [
      new Date(t.date).toLocaleDateString(),
      t.description,
      t.type.toUpperCase(),
      `Rs. ${t.amount.toLocaleString("en-IN")}`,
      t.status.toUpperCase(),
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Date", "Description", "Type", "Amount", "Status"]],
      body: txRows.length > 0 ? txRows : [["-", "No transactions", "-", "-", "-"]],
      theme: "grid",
    });

    doc.save(`bank_reconciliation_report_${Date.now()}.pdf`);
    toast.success("Reconciliation audit PDF downloaded.");
  };

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
              <Landmark className="h-7 w-7 text-indigo-600" />
              Bank Reconciliation & Financial Control Center
            </h1>
            <p className="text-sm text-slate-500">
              Import bank statements, match against system bookkeeping & audit cash accuracy.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".csv,.xlsx,.xls"
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md gap-2"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import Bank Statement
          </Button>

          <Button
            onClick={downloadAuditReport}
            disabled={!summary}
            variant="outline"
            className="rounded-xl border-slate-200 gap-2"
          >
            <Download className="h-4 w-4" />
            Audit PDF
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-16 text-center text-slate-500 flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <p>Loading bank statement & ledger reconciliation data...</p>
        </div>
      ) : summary ? (
        <>
          {/* Attention Banner */}
          {summary.status === "needs_attention" && (
            <Card className="rounded-2xl border-amber-300 bg-amber-50/90 shadow-sm overflow-hidden">
              <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-amber-900">{summary.warningMessage}</h3>
                    <p className="text-xs text-amber-800 mt-0.5">
                      Review unmatched items below to accept suggested matches or create bookkeeping records.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    onClick={() => setStatusFilter("unmatched")}
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs"
                  >
                    Filter Unmatched Items ({summary.unmatchedCount})
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 4 Core Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Bank Statement Balance */}
            <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Bank Statement Balance
                  </p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">
                    ₹{summary.latestBankBalance.toLocaleString("en-IN")}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Closing statement balance</p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <Landmark className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            {/* System Ledger Balance */}
            <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    System Ledger Balance
                  </p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">
                    ₹{summary.systemLedgerBalance.toLocaleString("en-IN")}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Bookkeeping source of truth</p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <BookOpen className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            {/* Difference */}
            <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Difference</p>
                  <h3
                    className={`text-2xl font-bold mt-1 ${
                      summary.difference > 0 ? "text-amber-600" : "text-emerald-600"
                    }`}
                  >
                    ₹{summary.difference.toLocaleString("en-IN")}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {summary.difference === 0 ? "Perfect zero discrepancy" : "Unreconciled gap"}
                  </p>
                </div>
                <div
                  className={`h-12 w-12 rounded-2xl flex items-center justify-center ${
                    summary.difference > 0 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
                  }`}
                >
                  {summary.difference > 0 ? <AlertTriangle className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
                </div>
              </CardContent>
            </Card>

            {/* Reconciliation Progress % */}
            <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Reconciled Progress
                  </p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">
                    {summary.reconciliationPercentage}%
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {summary.reconciledCount} of {summary.totalTransactions} items reconciled
                  </p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <CheckCircle className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search & Filter Controls */}
          <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
            <CardContent className="p-4 flex flex-col lg:flex-row gap-4 items-center justify-between">
              <div className="relative w-full lg:w-72">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search description or ref #..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 rounded-xl border-slate-200 focus-visible:ring-indigo-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-40 rounded-xl border-slate-200">
                    <SelectValue placeholder="Status Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="matched">Suggested Matches ({summary.suggestedCount})</SelectItem>
                    <SelectItem value="unmatched">Unmatched Only ({summary.unmatchedCount})</SelectItem>
                    <SelectItem value="reconciled">Reconciled ({summary.reconciledCount})</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-full sm:w-36 rounded-xl border-slate-200">
                    <SelectValue placeholder="Direction" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Directions</SelectItem>
                    <SelectItem value="credit">Inflows / Credits</SelectItem>
                    <SelectItem value="debit">Outflows / Debits</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={startDateFilter}
                    onChange={(e) => setStartDateFilter(e.target.value)}
                    className="w-36 rounded-xl border-slate-200 text-xs"
                  />
                  <span className="text-slate-400 text-xs">to</span>
                  <Input
                    type="date"
                    value={endDateFilter}
                    onChange={(e) => setEndDateFilter(e.target.value)}
                    className="w-36 rounded-xl border-slate-200 text-xs"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Statement Transaction Audit Table */}
          <Card className="rounded-2xl border-slate-200 shadow-sm bg-white overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-150 px-6 py-4">
              <CardTitle className="text-base font-semibold text-slate-900">
                Bank Statement Transactions ({transactions.length})
              </CardTitle>
              <CardDescription>
                Compare uploaded bank items with system bookkeeping & invoice records.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {transactions.length === 0 ? (
                <div className="p-12 text-center text-slate-500 space-y-3">
                  <Landmark className="h-8 w-8 text-slate-400 mx-auto" />
                  <p className="font-semibold text-slate-900">No Statement Transactions Found</p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Upload your bank statement (CSV/XLSX) to start matching with your bookkeeping ledger.
                  </p>
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    Upload Statement File
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600 uppercase text-xs font-semibold tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3.5">Date & Ref #</th>
                        <th className="px-6 py-3.5">Bank Description</th>
                        <th className="px-6 py-3.5 text-right">Bank Amount</th>
                        <th className="px-6 py-3.5">Suggested Ledger / Invoice Match</th>
                        <th className="px-6 py-3.5">Confidence & Reasons</th>
                        <th className="px-6 py-3.5 text-center">Status & Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 text-slate-800">
                      {transactions.map((tx) => (
                        <tr key={tx._id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-900">
                              {new Date(tx.date).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </div>
                            {tx.referenceNumber && (
                              <div className="text-xs font-mono text-slate-500">{tx.referenceNumber}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 max-w-xs font-medium text-slate-900">
                            {tx.description}
                          </td>
                          <td
                            className={`px-6 py-4 text-right font-semibold ${
                              tx.type === "credit" ? "text-emerald-600" : "text-red-600"
                            }`}
                          >
                            {tx.type === "credit" ? "+" : "-"} ₹{tx.amount.toLocaleString("en-IN")}
                          </td>
                          <td className="px-6 py-4">
                            {tx.matchedBookkeepingId ? (
                              <div>
                                <div className="font-semibold text-slate-900 text-xs">
                                  {tx.matchedBookkeepingId.description}
                                </div>
                                <div className="text-xs text-slate-500">
                                  Category: {tx.matchedBookkeepingId.category} | ₹
                                  {tx.matchedBookkeepingId.amount.toLocaleString("en-IN")}
                                </div>
                              </div>
                            ) : tx.matchedInvoiceId ? (
                              <div>
                                <div className="font-semibold text-indigo-900 text-xs flex items-center gap-1">
                                  <FileText className="h-3 w-3 text-indigo-600" />
                                  Invoice #{tx.matchedInvoiceId.invoiceNumber}
                                </div>
                                <div className="text-xs text-slate-500">
                                  Customer: {tx.matchedInvoiceId.customerName} | ₹
                                  {tx.matchedInvoiceId.grandTotal.toLocaleString("en-IN")}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">No suggested match</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {tx.matchScore >= 80 ? (
                              <div className="space-y-1">
                                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-none font-semibold">
                                  {tx.matchScore}% ({tx.matchType})
                                </Badge>
                                {tx.matchReasons && tx.matchReasons.length > 0 && (
                                  <div className="text-[11px] text-slate-500">
                                    {tx.matchReasons.join(" • ")}
                                  </div>
                                )}
                              </div>
                            ) : tx.matchScore >= 60 ? (
                              <div className="space-y-1">
                                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-none font-semibold">
                                  {tx.matchScore}% (possible)
                                </Badge>
                                {tx.matchReasons && tx.matchReasons.length > 0 && (
                                  <div className="text-[11px] text-slate-500">
                                    {tx.matchReasons.join(" • ")}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <Badge variant="secondary" className="text-slate-500">
                                Unmatched
                              </Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {tx.status === "reconciled" ? (
                              <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 border-none font-semibold">
                                Reconciled
                              </Badge>
                            ) : (
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                {(tx.matchedBookkeepingId || tx.matchedInvoiceId) && (
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      handleReconcileItem(
                                        tx._id,
                                        tx.matchedBookkeepingId?._id,
                                        tx.matchedInvoiceId?._id
                                      )
                                    }
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs gap-1"
                                  >
                                    <CheckCircle className="h-3.5 w-3.5" />
                                    Accept Match
                                  </Button>
                                )}

                                {tx.status === "matched" && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleUnmatchItem(tx._id)}
                                    title="Reject suggested match"
                                    className="text-red-500 hover:bg-red-50 rounded-xl text-xs"
                                  >
                                    Reject
                                  </Button>
                                )}

                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenSearchModal(tx)}
                                  className="border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs gap-1"
                                >
                                  <LinkIcon className="h-3.5 w-3.5" />
                                  Link Entry
                                </Button>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenCreateEntryModal(tx)}
                                  className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-xl text-xs gap-1"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  Create Entry
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* Manual Search & Link Modal */}
      <Dialog open={isSearchModalOpen} onOpenChange={setIsSearchModalOpen}>
        <DialogContent className="sm:max-w-xl rounded-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Link Bank Transaction to Ledger / Invoice</DialogTitle>
            <DialogDescription>
              Search existing bookkeeping entries or invoices to explicitly link and reconcile.
            </DialogDescription>
          </DialogHeader>

          {selectedTxForSearch && (
            <div className="space-y-4 py-2">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500 uppercase font-semibold">Bank Item</div>
                <div className="text-sm font-bold text-slate-900">{selectedTxForSearch.description}</div>
                <div className="text-xs text-slate-600">
                  Amount: ₹{selectedTxForSearch.amount.toLocaleString("en-IN")} ({selectedTxForSearch.type.toUpperCase()})
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search ledger by description, category, or invoice #..."
                  value={ledgerSearchQuery}
                  onChange={(e) => {
                    setLedgerSearchQuery(e.target.value);
                    fetchLedgerSearchResults(e.target.value, selectedTxForSearch.type);
                  }}
                  className="pl-9 rounded-xl"
                />
              </div>

              <Tabs defaultValue="bookkeeping" className="w-full">
                <TabsList className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                  <TabsTrigger value="bookkeeping" className="rounded-lg text-xs font-semibold">
                    Bookkeeping Entries ({searchResults.bookkeepingEntries.length})
                  </TabsTrigger>
                  <TabsTrigger value="invoices" className="rounded-lg text-xs font-semibold">
                    Invoices ({searchResults.invoices.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="bookkeeping" className="pt-3 space-y-2">
                  {loadingSearch ? (
                    <div className="p-6 text-center text-slate-400">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </div>
                  ) : searchResults.bookkeepingEntries.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-xs">
                      No matching bookkeeping entries found.
                    </div>
                  ) : (
                    searchResults.bookkeepingEntries.map((bk) => (
                      <div
                        key={bk._id}
                        className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between hover:bg-slate-50 cursor-pointer"
                        onClick={() => {
                          handleReconcileItem(selectedTxForSearch._id, bk._id);
                          setIsSearchModalOpen(false);
                        }}
                      >
                        <div>
                          <div className="font-semibold text-slate-900 text-xs">{bk.description}</div>
                          <div className="text-xs text-slate-500">
                            Category: {bk.category} | Date: {new Date(bk.date).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-slate-900 text-xs">
                            ₹{bk.amount.toLocaleString("en-IN")}
                          </div>
                          <Button size="sm" variant="ghost" className="text-indigo-600 text-xs h-7 px-2">
                            Select & Link
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="invoices" className="pt-3 space-y-2">
                  {loadingSearch ? (
                    <div className="p-6 text-center text-slate-400">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </div>
                  ) : searchResults.invoices.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-xs">
                      No matching invoices found.
                    </div>
                  ) : (
                    searchResults.invoices.map((inv) => (
                      <div
                        key={inv._id}
                        className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between hover:bg-slate-50 cursor-pointer"
                        onClick={() => {
                          handleReconcileItem(selectedTxForSearch._id, undefined, inv._id);
                          setIsSearchModalOpen(false);
                        }}
                      >
                        <div>
                          <div className="font-semibold text-slate-900 text-xs">
                            Invoice #{inv.invoiceNumber}
                          </div>
                          <div className="text-xs text-slate-500">Customer: {inv.customerName}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-slate-900 text-xs">
                            ₹{inv.grandTotal.toLocaleString("en-IN")}
                          </div>
                          <Button size="sm" variant="ghost" className="text-indigo-600 text-xs h-7 px-2">
                            Select & Link
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Bookkeeping Entry Dialog Modal */}
      <Dialog open={isEntryModalOpen} onOpenChange={setIsEntryModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Create Bookkeeping Entry from Bank Item</DialogTitle>
            <DialogDescription>
              Record an explicit bookkeeping transaction for this bank statement item.
            </DialogDescription>
          </DialogHeader>

          {selectedTxForEntry && (
            <form onSubmit={handleCreateBookkeepingEntry} className="space-y-4 py-2">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="text-xs text-slate-500 uppercase font-semibold">Bank Item Details</div>
                <div className="text-sm font-bold text-slate-900">{selectedTxForEntry.description}</div>
                <div className="text-xs text-slate-600">
                  Amount:{" "}
                  <span className="font-bold">₹{selectedTxForEntry.amount.toLocaleString("en-IN")}</span> (
                  {selectedTxForEntry.type.toUpperCase()})
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="entryCategory">Category *</Label>
                <Input
                  id="entryCategory"
                  placeholder="e.g. Sales, Rent, Utilities, Salaries, Marketing, Software"
                  value={entryCategory}
                  onChange={(e) => setEntryCategory(e.target.value)}
                  required
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="entryDescription">Description *</Label>
                <Input
                  id="entryDescription"
                  value={entryDescription}
                  onChange={(e) => setEntryDescription(e.target.value)}
                  required
                  className="rounded-xl"
                />
              </div>

              <DialogFooter className="gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEntryModalOpen(false)}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submittingEntry}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl gap-2"
                >
                  {submittingEntry && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create & Reconcile
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BankReconciliation;
