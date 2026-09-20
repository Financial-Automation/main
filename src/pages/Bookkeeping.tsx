import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { VoiceButton } from "@/components/ui/VoiceButton";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, subDays, startOfMonth, endOfMonth, subMonths, isSameDay, isToday, isYesterday, startOfDay, endOfDay } from "date-fns";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { CalendarIcon, ArrowLeft, Plus, Trash2, Download, TrendingUp, TrendingDown, IndianRupee, Filter, BarChart3, FileText, Loader2, Lock, CheckCircle2, Info } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import { DEFAULT_REPORT_COMPANY_NAME, REPORT_FOOTER_COMPANY, getReportCompanyName } from "@/lib/reportBranding";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface BookkeepingEntry {
    id: string;
    date: Date;
    description: string;
    type: 'Income' | 'Expenses';
    amount: number;
    category: string;
    createdAt: Date;
}

interface FinancialSummary {
    totalIncome: number;
    totalExpenses: number;
    netBalance: number;
    entryCount: number;
}

const Bookkeeping = () => {
    const navigate = useNavigate();
    const { hasAccess } = useSubscription();
    const [activeTab, setActiveTab] = useState("entries");
    const [companyName, setCompanyName] = useState(DEFAULT_REPORT_COMPANY_NAME);
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
        from: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // Start of month
        to: new Date()
    });

    // Form State
    const [formData, setFormData] = useState({
        description: "",
        type: "Expenses" as 'Income' | 'Expenses',
        amount: "",
        category: "General"
    });

    // Entries State
    const [entries, setEntries] = useState<BookkeepingEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Categories State
    const [customCategories, setCustomCategories] = useState<any[]>([]);
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");

    // Deletion State
    const [entryToDelete, setEntryToDelete] = useState<string | null>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    const DEFAULT_CATEGORIES = [
        "General", "Transportation", "Furniture", "Utilities", "Travel",
        "Office Supplies", "Food & Entertainment", "Sales", "Services", "Equipment"
    ];

    // Fetch entries and categories from API
    useEffect(() => {
        fetchEntries();
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        try {
            const token = localStorage.getItem("token");
            const response = await fetch(`${API_BASE_URL}/bookkeeping/categories`, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            if (response.ok) {
                const data = await response.json();
                setCustomCategories(data.categories);
            }
        } catch (error) {
            console.error("Error fetching categories:", error);
        }
    };

    const addCategory = async () => {
        if (!newCategoryName.trim()) return;

        try {
            const token = localStorage.getItem("token");
            const response = await fetch(`${API_BASE_URL}/bookkeeping/categories`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ name: newCategoryName })
            });

            if (response.ok) {
                const data = await response.json();
                setCustomCategories(prev => [...prev, data.category]);
                setFormData(prev => ({ ...prev, category: data.category.name }));
                setNewCategoryName("");
                setIsAddingCategory(false);
                toast.success("Category added successfully");
            } else {
                const errorData = await response.json();
                toast.error(errorData.message || "Failed to add category");
            }
        } catch (error) {
            console.error("Error adding category:", error);
            toast.error("Error adding category");
        }
    };

    const fetchEntries = async () => {
        setIsLoading(true);
        try {
            const token = localStorage.getItem("token");
            const response = await fetch(`${API_BASE_URL}/bookkeeping/all`, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            if (response.ok) {
                const data = await response.json();
                setEntries(data.entries.map((entry: any) => ({
                    ...entry,
                    id: entry._id, // Map MongoDB _id to id
                    date: new Date(entry.date),
                    createdAt: new Date(entry.createdAt),
                    type: (entry.type === 'income' || entry.type === 'Income') ? 'Income' : 'Expenses'
                })));
            } else {
                console.error("Failed to fetch bookkeeping entries");
            }
        } catch (error) {
            console.error("Error fetching entries:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // Filter State
    const [filterType, setFilterType] = useState<string>("all");
    const [filterCategory, setFilterCategory] = useState<string>("all");
    // Financial Summary
    const [financialSummary, setFinancialSummary] = useState<FinancialSummary>({
        totalIncome: 0,
        totalExpenses: 0,
        netBalance: 0,
        entryCount: 0
    });

    const [filteredEntries, setFilteredEntries] = useState<BookkeepingEntry[]>([]);

    // Filter entries
    useEffect(() => {
        let filtered = entries;

        // Date Range Filter with startOfDay / endOfDay boundaries
        if (dateRange.from && dateRange.to) {
            filtered = filtered.filter(entry => {
                const entryDate = new Date(entry.date);
                return entryDate >= startOfDay(dateRange.from!) && entryDate <= endOfDay(dateRange.to!);
            });
        }

        if (filterType !== "all") {
            filtered = filtered.filter(entry => entry.type === filterType);
        }

        if (filterCategory !== "all") {
            filtered = filtered.filter(entry => entry.category === filterCategory);
        }

        setFilteredEntries(filtered);
    }, [entries, filterType, filterCategory, dateRange]);

    // Financial Summary (based on filtered entries)
    useEffect(() => {
        const totalIncome = filteredEntries
            .filter(entry => entry.type === 'Income' || entry.type === 'income')
            .reduce((sum, entry) => sum + entry.amount, 0);

        const totalExpenses = filteredEntries
            .filter(entry => entry.type === 'Expenses' || entry.type === 'expense' || entry.type === 'Expense')
            .reduce((sum, entry) => sum + entry.amount, 0);

        const netBalance = totalIncome - totalExpenses;

        setFinancialSummary({
            totalIncome,
            totalExpenses,
            netBalance,
            entryCount: filteredEntries.length
        });
    }, [filteredEntries]);

    // Handle Date Presets
    const handlePreset = (preset: 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth') => {
        const today = new Date();
        let from = today;
        let to = today;

        switch (preset) {
            case 'today':
                from = startOfDay(today);
                to = endOfDay(today);
                break;
            case 'yesterday':
                const yesterday = subDays(today, 1);
                from = startOfDay(yesterday);
                to = endOfDay(yesterday);
                break;
            case 'week':
                from = startOfDay(subDays(today, 6));
                to = endOfDay(today);
                break;
            case 'month':
                from = startOfMonth(today);
                to = endOfMonth(today);
                break;
            case 'lastMonth':
                const lastMonth = subMonths(today, 1);
                from = startOfMonth(lastMonth);
                to = endOfMonth(lastMonth);
                break;
        }
        setDateRange({ from, to });
    };

    // Group entries for display
    const getGroupedEntries = () => {
        const groups: Record<string, BookkeepingEntry[]> = {};
        filteredEntries.forEach(entry => {
            const dateKey = format(new Date(entry.date), 'yyyy-MM-dd');
            if (!groups[dateKey]) {
                groups[dateKey] = [];
            }
            groups[dateKey].push(entry);
        });
        return groups;
    };

    const groupedEntries = getGroupedEntries();
    const sortedGroupKeys = Object.keys(groupedEntries).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    const uniqueCategories = Array.from(new Set(entries.map(e => e.category).filter(Boolean)));
    const allCategories = Array.from(new Set([...DEFAULT_CATEGORIES, ...customCategories.map(c => c.name), ...uniqueCategories]));

    const INCOME_COLORS = ['#10b981', '#06b6d4', '#3b82f6', '#0284c7', '#14b8a6', '#22c55e', '#8b5cf6', '#6366f1', '#4ade80', '#059669'];
    const EXPENSE_COLORS = ['#ef4444', '#f97316', '#ec4899', '#f59e0b', '#e11d48', '#be185d', '#d97706', '#991b1b', '#c2410c', '#ff8a65'];
    const CHART_COLORS = [...INCOME_COLORS, ...EXPENSE_COLORS];

    const isExpenseType = (type: string) => type === 'Expenses' || type === 'expense' || type === 'Expense' || type === 'expenses';
    const isIncomeType = (type: string) => type === 'Income' || type === 'income';

    const incomeDistributionData = allCategories.map(cat => ({
        name: cat,
        value: filteredEntries
            .filter(e => e.category === cat && isIncomeType(e.type))
            .reduce((sum, e) => sum + e.amount, 0)
    })).filter(d => d.value > 0);

    const expenseDistributionData = allCategories.map(cat => ({
        name: cat,
        value: filteredEntries
            .filter(e => e.category === cat && isExpenseType(e.type))
            .reduce((sum, e) => sum + e.amount, 0)
    })).filter(d => d.value > 0);

    // Get unique categories

    // Handle form input changes
    const handleInputChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    // Add new entry
    const addEntry = async () => {
        if (!formData.description || !formData.amount) {
            toast.error("Please fill in all required fields");
            return;
        }

        try {
            const token = localStorage.getItem("token");
            const response = await fetch(`${API_BASE_URL}/bookkeeping/add`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    date: selectedDate,
                    description: formData.description,
                    type: formData.type.toLowerCase() === 'income' ? 'income' : 'expense', // Backend expects lowercase
                    amount: parseFloat(formData.amount),
                    category: formData.category
                })
            });

            if (response.ok) {
                const data = await response.json();
                const newEntry = {
                    ...data.entry,
                    id: data.entry._id, // Map MongoDB _id to id
                    date: new Date(data.entry.date),
                    createdAt: new Date(data.entry.createdAt),
                    // Map backend type back to frontend expected capitalization if needed or update frontend to handle lowercase
                    type: data.entry.type === 'income' ? 'Income' : 'Expenses'
                };

                setEntries(prev => [newEntry, ...prev]);

                // Reset form
                setFormData({
                    description: "",
                    type: "Expenses",
                    amount: "",
                    category: "General"
                });
                setSelectedDate(new Date());

                toast.success("Entry added successfully!");
                setActiveTab("entries");
            } else {
                const errorData = await response.json();
                toast.error(`Error adding entry: ${errorData.message}`);
            }
        } catch (error) {
            console.error("Error adding entry:", error);
            toast.error("Failed to add entry. Please try again.");
        }
    };

    // Delete entry
    const handleDeleteClick = (id: string) => {
        setEntryToDelete(id);
        setIsDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!entryToDelete) return;

        try {
            const token = localStorage.getItem("token");
            const response = await fetch(`${API_BASE_URL}/bookkeeping/${entryToDelete}`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            if (response.ok) {
                setEntries(prev => prev.filter(entry => entry.id !== entryToDelete));
                toast.success("Entry deleted successfully");
            } else {
                toast.error("Failed to delete entry");
            }
        } catch (error) {
            console.error("Error deleting entry:", error);
            toast.error("Error deleting entry");
        } finally {
            setIsDeleteDialogOpen(false);
            setEntryToDelete(null);
        }
    };

    // Export data to PDF
    const exportToPDF = () => {
        if (!hasAccess("export")) {
            toast.error("Exporting reports is only available in Professional and Enterprise plans.");
            return;
        }
        if (filteredEntries.length === 0) {
            toast.error("No entries to export. Please add entries first.");
            return;
        }

        const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const margin = 18;
        const contentW = pageW - margin * 2;
        let y = 18;

        // 1. Blue Header Banner
        doc.setFillColor(30, 64, 175);
        doc.rect(0, 0, pageW, 28, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text(getReportCompanyName(companyName), pageW / 2, 10, { align: "center" });
        doc.setFontSize(16);
        doc.text("BOOKKEEPING TRANSACTION REPORT", pageW / 2, 20, { align: "center" });
        y = 36;

        const periodLabel = dateRange.from && dateRange.to
            ? `${format(dateRange.from, 'dd MMM yyyy')} to ${format(dateRange.to, 'dd MMM yyyy')}`
            : 'All dates';

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(100, 116, 139);
        doc.text(`Period: ${periodLabel}  |  Generated: ${new Date().toLocaleString()}`, pageW / 2, y, { align: "center" });
        y += 10;

        const reportRows = filteredEntries.map((entry, index) => [
            (index + 1).toString(),
            format(new Date(entry.date), 'yyyy-MM-dd'),
            entry.description,
            entry.type === 'Income' ? 'Income' : 'Expense',
            entry.category,
            `Rs. ${entry.amount.toFixed(2)}`
        ]);

        autoTable(doc, {
            startY: y,
            head: [["S.No", "Date", "Description", "Type", "Category", "Amount"]],
            body: reportRows,
            theme: "grid",
            headStyles: { fillColor: [30, 64, 175] },
            styles: { fontSize: 8.5 },
            margin: { left: margin, right: margin, bottom: 24 },
            pageBreak: "auto",
            rowPageBreak: "avoid"
        });

        y = (doc as any).lastAutoTable.finalY + 10;

        // Summary details
        const totalIncome = filteredEntries
            .filter(entry => entry.type === 'Income')
            .reduce((sum, entry) => sum + entry.amount, 0);

        const totalExpenses = filteredEntries
            .filter(entry => entry.type === 'Expenses')
            .reduce((sum, entry) => sum + entry.amount, 0);

        const netBalance = totalIncome - totalExpenses;

        if (y > pageH - 45) {
            doc.addPage();
            y = 22;
        }

        // Summary box
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(margin, y, contentW, 25, 2, 2, "FD");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        doc.text(`Total Income: Rs. ${totalIncome.toFixed(2)}`, margin + 6, y + 8);
        doc.text(`Total Expenses: Rs. ${totalExpenses.toFixed(2)}`, margin + 6, y + 17);
        
        doc.setTextColor(netBalance >= 0 ? 22 : 220, netBalance >= 0 ? 163 : 38, netBalance >= 0 ? 74 : 38);
        doc.text(`Net Balance: Rs. ${netBalance.toFixed(2)}`, margin + contentW - 6, y + 13, { align: "right" });

        // Fixed footer
        const footerY = pageH - 12;
        doc.setDrawColor(220, 220, 220);
        doc.line(margin, footerY - 3, margin + contentW, footerY - 3);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(156, 163, 175);
        doc.text(`Powered by ${REPORT_FOOTER_COMPANY}`, pageW / 2, footerY, { align: "center" });

        doc.save(`bookkeeping_report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
        toast.success("Bookkeeping report PDF downloaded successfully!");
    };

    const handleBackToDashboard = () => {
        navigate("/dashboard");
    };

    return (
        <div className="liquid-page min-h-screen overflow-hidden text-slate-950">
            <div className="liquid-backdrop fixed inset-0 pointer-events-none" />

            <header className="sticky top-0 z-20 border-b border-white/40 bg-white/24 backdrop-blur-2xl">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <Button
                        variant="ghost"
                        onClick={handleBackToDashboard}
                        className="mb-4 rounded-full border border-white/60 bg-white/45 text-slate-700 hover:bg-white/70 hover:text-slate-950"
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Dashboard
                    </Button>
                    <div className="flex items-center gap-4">
                        <div className="liquid-icon flex h-16 w-16 items-center justify-center rounded-[22px]">
                            <IndianRupee className="h-8 w-8 text-slate-900" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
                                Bookkeeping Automation
                            </h1>
                            <p className="mt-1 text-slate-600">Track income and expenses with financial insights</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative z-10">
                <Card className="liquid-panel mb-8 rounded-[28px] border-white/55 bg-white/40">
                    <CardContent className="p-5">
                        <div className="space-y-2">
                            <Label htmlFor="companyName" className="font-semibold text-slate-700">Enter Your Company Name</Label>
                            <Input
                                id="companyName"
                                placeholder="Enter your company name"
                                value={companyName}
                                onChange={(e) => setCompanyName(e.target.value)}
                                className="h-12 rounded-[18px] border-slate-200 bg-white/80 text-slate-900 focus:ring-0"
                            />
                        </div>
                    </CardContent>
                </Card>

                {activeTab === 'analytics' && (
                    <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6 rounded-[24px] border border-white/55 bg-white/42 p-6 shadow-xl backdrop-blur-2xl">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 mb-2">Financial Period</h2>
                            <div className="flex flex-wrap gap-2 mb-2">
                                {[
                                    { preset: 'today', label: 'Today' },
                                    { preset: 'yesterday', label: 'Yesterday' },
                                    { preset: 'week', label: 'Last 7 Days' },
                                    { preset: 'month', label: 'This Month' },
                                    { preset: 'lastMonth', label: 'Last Month' }
                                ].map((item) => (
                                    <Button
                                        key={item.preset}
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handlePreset(item.preset as any)}
                                        className="rounded-full border border-white/60 bg-white/45 text-slate-700 hover:bg-white/70 hover:text-slate-950"
                                    >
                                        {item.label}
                                    </Button>
                                ))}
                            </div>
                            <p className="text-slate-600 text-sm">Select a date range to filter transactions</p>
                        </div>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="w-full md:w-[300px] justify-start text-left font-normal h-12 rounded-[18px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-300 transition-all duration-300"
                                >
                                    <CalendarIcon className="mr-2 h-5 w-5 text-slate-600" />
                                    {dateRange?.from ? (
                                        dateRange.to ? (
                                            <span className="font-semibold text-lg">
                                                {format(dateRange.from, "MMM dd")} - {format(dateRange.to, "MMM dd, yyyy")}
                                            </span>
                                        ) : (
                                            <span className="font-semibold text-lg">{format(dateRange.from, "MMM dd, yyyy")}</span>
                                        )
                                    ) : (
                                        <span className="text-lg">Pick a date range</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-white border border-slate-200" align="end">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={dateRange?.from}
                                    selected={{ from: dateRange.from, to: dateRange.to }}
                                    onSelect={(range: any) => setDateRange(range || { from: undefined, to: undefined })}
                                    numberOfMonths={1}
                                    className="bg-white text-slate-900"
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                )}

                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
                    <TabsList className="grid w-full grid-cols-3 rounded-[24px] border border-white/55 bg-white/42 p-1 shadow-[0_16px_42px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
                        <TabsTrigger
                            value="entries"
                            className="flex items-center gap-2 rounded-[18px] text-slate-600 data-[state=active]:bg-slate-950 data-[state=active]:text-white transition-all duration-300"
                        >
                            <FileText className="h-4 w-4" />
                            Entries
                        </TabsTrigger>
                        <TabsTrigger
                            value="add"
                            className="flex items-center gap-2 rounded-[18px] text-slate-600 data-[state=active]:bg-slate-950 data-[state=active]:text-white transition-all duration-300"
                        >
                            <Plus className="h-4 w-4" />
                            Add Entry
                        </TabsTrigger>
                        <TabsTrigger
                            value="analytics"
                            className="flex items-center gap-2 rounded-[18px] text-slate-600 data-[state=active]:bg-slate-950 data-[state=active]:text-white transition-all duration-300"
                        >
                            <BarChart3 className="h-4 w-4" />
                            Analytics
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="entries">
                        <Card
                            className="liquid-panel overflow-hidden rounded-[36px] border-white/55 transition-all duration-500"
                        >
                            <CardHeader>
                                <div className="mb-2 p-3 bg-emerald-50/90 border border-emerald-200/90 rounded-2xl flex items-center gap-3">
                                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                                    <p className="text-xs sm:text-sm font-medium text-emerald-900">
                                        <strong>Automated Financial Engine Active:</strong> Bookkeeping processes records exclusively generated from <strong>Inventory</strong> and <strong>Invoice</strong> modules.
                                    </p>
                                </div>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div>
                                        <CardTitle className="text-2xl font-semibold tracking-tight text-slate-950 flex items-center gap-2">
                                            <FileText className="h-5 w-5 text-slate-800" />
                                            Bookkeeping Entries
                                        </CardTitle>
                                        <CardDescription className="text-slate-600">
                                            {entries.length} total entries • {financialSummary.netBalance >= 0 ? 'Positive' : 'Negative'} balance
                                        </CardDescription>
                                    </div>

                                    <div className="flex flex-wrap gap-3">
                                        <Select value={filterType} onValueChange={setFilterType}>
                                            <SelectTrigger className="w-[140px] h-11 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-300">
                                                <Filter className="h-4 w-4 mr-2" />
                                                <SelectValue placeholder="Filter by type" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Types</SelectItem>
                                                <SelectItem value="Income">Income</SelectItem>
                                                <SelectItem value="Expenses">Expenses</SelectItem>
                                            </SelectContent>
                                        </Select>

                                        <Select value={filterCategory} onValueChange={setFilterCategory}>
                                            <SelectTrigger className="w-[140px] h-11 rounded-[14px] border-slate-200 bg-white/80 text-slate-900 focus:border-slate-300">
                                                <SelectValue placeholder="Filter by category" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Categories</SelectItem>
                                                {DEFAULT_CATEGORIES.map(category => (
                                                    <SelectItem key={category} value={category}>{category}</SelectItem>
                                                ))}
                                                {customCategories.map(cat => (
                                                    <SelectItem key={cat._id} value={cat.name}>{cat.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>

                                        <Button
                                            onClick={exportToPDF}
                                            className="rounded-full bg-slate-950 font-semibold text-white transition-all duration-300 hover:bg-slate-800"
                                        >
                                            <Download className="h-4 w-4 mr-2" />
                                            Download PDF
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>

                            <CardContent>
                                {isLoading ? (
                                    <div className="flex flex-col items-center justify-center py-20">
                                        <Loader2 className="h-10 w-10 text-slate-800 animate-spin mb-4" />
                                        <p className="text-slate-600">Loading your entries...</p>
                                    </div>
                                ) : filteredEntries.length > 0 ? (
                                    <div className="space-y-6">
                                        {sortedGroupKeys.map(dateKey => {
                                            const dateObj = new Date(dateKey);
                                            let dateLabel = format(dateObj, 'EEEE, MMMM do, yyyy');
                                            if (isToday(dateObj)) dateLabel = "Today";
                                            if (isYesterday(dateObj)) dateLabel = "Yesterday";

                                            return (
                                                <div key={dateKey} className="space-y-3">
                                                    <div className="sticky top-0 z-10 bg-white/60 backdrop-blur-md py-2 px-3 rounded-lg border-l-4 border-slate-800 inline-block shadow-sm">
                                                        <h4 className="text-slate-900 font-bold text-sm tracking-wide uppercase flex items-center gap-2">
                                                            <CalendarIcon className="h-4 w-4 text-slate-800" />
                                                            {dateLabel}
                                                        </h4>
                                                    </div>

                                                    {groupedEntries[dateKey].map((entry) => (
                                                        <div
                                                            key={entry.id}
                                                            className="ml-2 p-4 bg-white/40 border border-white/50 rounded-2xl hover:border-slate-300 transition-all duration-300 hover:bg-white/80 hover:-translate-y-0.5 group"
                                                        >
                                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-3 mb-2">
                                                                        <Badge
                                                                            className={`px-3 py-1 rounded-full ${entry.type === 'Income'
                                                                                ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white border-0'
                                                                                : 'bg-gradient-to-r from-rose-600 to-red-600 text-white border-0'
                                                                                }`}
                                                                        >
                                                                            {entry.type === 'Income' ? '💰 Income' : '💸 Expense'}
                                                                        </Badge>
                                                                        <Badge
                                                                            variant="outline"
                                                                            className="border-slate-200 text-slate-800"
                                                                        >
                                                                            {entry.category}
                                                                        </Badge>
                                                                        <span className="text-slate-500 text-xs hidden sm:inline-block">
                                                                            {format(new Date(entry.createdAt), 'h:mm a')}
                                                                        </span>
                                                                    </div>

                                                                    <h3 className="text-lg font-semibold text-slate-900 mb-1 group-hover:text-slate-950 transition-colors">
                                                                        {entry.description}
                                                                    </h3>
                                                                </div>

                                                                <div className="flex flex-col items-end gap-2">
                                                                    <div className={`text-2xl font-bold ${entry.type === 'Income' ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                                        {entry.type === 'Income' ? '+' : '-'}₹{entry.amount.toLocaleString()}
                                                                    </div>

                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => handleDeleteClick(entry.id)}
                                                                        className="text-slate-400 hover:text-red-600 hover:bg-red-50/50 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <div className="p-6 rounded-full bg-white/60 border border-white/80 inline-block mb-4">
                                            <FileText className="h-12 w-12 text-slate-700" />
                                        </div>
                                        <p className="text-slate-800 text-lg font-medium">No entries found</p>
                                        <p className="text-slate-600 text-sm">Try adjusting your filters or add a new entry</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="add">
                        <Card className="liquid-panel overflow-hidden rounded-[36px] border-white/55 transition-all duration-500">
                            <CardHeader className="text-center">
                                <CardTitle className="text-2xl font-semibold tracking-tight text-slate-950 flex items-center justify-center gap-2">
                                    <Lock className="h-6 w-6 text-amber-600" />
                                    Direct Manual Input Disabled
                                </CardTitle>
                                <CardDescription className="text-slate-600">
                                    Bookkeeping receives financial entries exclusively from Inventory and Invoice modules
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="py-8 text-center space-y-6">
                                <div className="p-4 rounded-full bg-amber-500/10 border border-amber-500/20 inline-block">
                                    <Info className="h-10 w-10 text-amber-600" />
                                </div>
                                <div className="max-w-md mx-auto space-y-2">
                                    <h4 className="text-lg font-bold text-slate-900">Automated Data Flow Architecture</h4>
                                    <p className="text-slate-600 text-sm">
                                        To maintain financial audit compliance, direct manual transaction entries are blocked in Bookkeeping. Create business transactions via <strong>Inventory</strong> (stock additions/sales) or <strong>Invoice</strong> (sales/purchase invoices), and Bookkeeping will automatically record them.
                                    </p>
                                </div>
                                <div className="flex flex-wrap justify-center gap-4 pt-2">
                                    <Button onClick={() => navigate("/inventory")} className="rounded-full bg-slate-950 text-white font-semibold px-6 hover:bg-slate-800">
                                        Go to Inventory
                                    </Button>
                                    <Button onClick={() => navigate("/invoice")} variant="outline" className="rounded-full font-semibold px-6">
                                        Go to Invoices
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="analytics">
                        <Card
                            className="liquid-panel overflow-hidden rounded-[36px] border-white/55 transition-all duration-500"
                        >
                            <CardHeader>
                                <CardTitle className="text-2xl font-semibold tracking-tight text-slate-950 flex items-center gap-2">
                                    <BarChart3 className="h-5 w-5 text-slate-800" />
                                    Financial Analytics
                                </CardTitle>
                                <CardDescription className="text-slate-600">
                                    Insights and summary of your bookkeeping data
                                </CardDescription>
                            </CardHeader>

                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                    <Card className="rounded-[24px] border border-white/50 bg-emerald-500/10 shadow-sm">
                                        <CardContent className="pt-6">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="p-2 bg-emerald-500/20 rounded-lg">
                                                    <TrendingUp className="h-5 w-5 text-emerald-700" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-emerald-800 text-sm font-semibold">Total Income</span>
                                                    <span className="text-emerald-700 text-xs font-semibold">
                                                        {financialSummary.totalIncome + financialSummary.totalExpenses > 0
                                                            ? Math.round((financialSummary.totalIncome / (financialSummary.totalIncome + financialSummary.totalExpenses)) * 100)
                                                            : 0}% of turnover
                                                    </span>
                                                </div>
                                            </div>
                                            <p className="text-3xl font-black text-slate-900">₹{financialSummary.totalIncome.toLocaleString()}</p>
                                            <p className="text-slate-600 text-sm mt-1">From {filteredEntries.filter(e => e.type === 'Income').length} income entries</p>
                                        </CardContent>
                                    </Card>

                                    <Card className="rounded-[24px] border border-white/50 bg-rose-500/10 shadow-sm">
                                        <CardContent className="pt-6">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="p-2 bg-rose-500/20 rounded-lg">
                                                    <TrendingDown className="h-5 w-5 text-rose-700" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-rose-800 text-sm font-semibold">Total Expenses</span>
                                                    <span className="text-rose-700 text-xs font-semibold">
                                                        {financialSummary.totalIncome + financialSummary.totalExpenses > 0
                                                            ? Math.round((financialSummary.totalExpenses / (financialSummary.totalIncome + financialSummary.totalExpenses)) * 100)
                                                            : 0}% of turnover
                                                    </span>
                                                </div>
                                            </div>
                                            <p className="text-3xl font-black text-slate-900">₹{financialSummary.totalExpenses.toLocaleString()}</p>
                                            <p className="text-slate-600 text-sm mt-1">From {filteredEntries.filter(e => e.type === 'Expenses').length} expense entries</p>
                                        </CardContent>
                                    </Card>

                                    <Card className={`rounded-[24px] border border-white/50 shadow-sm ${financialSummary.netBalance >= 0
                                        ? 'bg-sky-500/10'
                                        : 'bg-amber-500/10'
                                        }`}>
                                        <CardContent className="pt-6">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="p-2 bg-white/50 rounded-lg">
                                                    <IndianRupee className="h-5 w-5 text-slate-800" />
                                                </div>
                                                <span className="text-slate-800 text-sm font-semibold">
                                                    Net Balance
                                                </span>
                                            </div>
                                            <p className="text-3xl font-black text-slate-900">
                                                {financialSummary.netBalance >= 0 ? '+' : ''}₹{financialSummary.netBalance.toLocaleString()}
                                            </p>
                                            <p className="text-slate-600 text-sm mt-1">
                                                {financialSummary.netBalance >= 0 ? 'Profit Margin' : 'Loss Margin'}: {
                                                    financialSummary.totalIncome > 0
                                                        ? Math.round((financialSummary.netBalance / financialSummary.totalIncome) * 100)
                                                        : 0
                                                }%
                                            </p>
                                        </CardContent>
                                    </Card>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="text-xl font-bold text-slate-900">Category Breakdown</h3>
                                    <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
                                        <div className="xl:col-span-1 rounded-[24px] border border-white/55 bg-white/42 p-6 flex flex-col items-center justify-center relative min-h-[400px] shadow-sm">
                                            <h4 className="absolute top-6 left-6 text-lg font-bold text-slate-900">Income Distribution</h4>

                                            {incomeDistributionData.length > 0 ? (
                                                <div className="w-full h-[300px] mt-8">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <PieChart>
                                                            <Pie
                                                                data={incomeDistributionData}
                                                                cx="50%"
                                                                cy="50%"
                                                                innerRadius={60}
                                                                outerRadius={100}
                                                                paddingAngle={5}
                                                                dataKey="value"
                                                            >
                                                                {incomeDistributionData.map((entry, index) => (
                                                                    <Cell key={`income-cell-${entry.name}`} fill={INCOME_COLORS[index % INCOME_COLORS.length]} stroke="rgba(255,255,255,0.8)" />
                                                                ))}
                                                            </Pie>
                                                            <Tooltip
                                                                formatter={(value: number) => `₹${value.toLocaleString()}`}
                                                                contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '12px', color: '#0f172a' }}
                                                                itemStyle={{ color: '#0f172a' }}
                                                            />
                                                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                                        </PieChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center text-slate-400">
                                                    <div className="p-4 rounded-full bg-white/50 mb-4">
                                                        <TrendingUp className="h-8 w-8" />
                                                    </div>
                                                    <p>No income data to display</p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="xl:col-span-1 rounded-[24px] border border-white/55 bg-white/42 p-6 flex flex-col items-center justify-center relative min-h-[400px] shadow-sm">
                                            <h4 className="absolute top-6 left-6 text-lg font-bold text-slate-900">Expense Categorisation</h4>

                                            {expenseDistributionData.length > 0 ? (
                                                <div className="w-full h-[300px] mt-8">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <PieChart>
                                                            <Pie
                                                                data={expenseDistributionData}
                                                                cx="50%"
                                                                cy="50%"
                                                                innerRadius={60}
                                                                outerRadius={100}
                                                                paddingAngle={5}
                                                                dataKey="value"
                                                            >
                                                                {expenseDistributionData.map((entry, index) => (
                                                                    <Cell key={`expense-cell-${entry.name}`} fill={EXPENSE_COLORS[index % EXPENSE_COLORS.length]} stroke="rgba(255,255,255,0.8)" />
                                                                ))}
                                                            </Pie>
                                                            <Tooltip
                                                                formatter={(value: number, name: string) => {
                                                                    const total = expenseDistributionData.reduce((sum, e) => sum + e.value, 0);
                                                                    const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                                                                    return [`₹${value.toLocaleString()} (${pct}%)`, name];
                                                                }}
                                                                contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '12px', color: '#0f172a' }}
                                                                itemStyle={{ color: '#0f172a' }}
                                                            />
                                                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                                        </PieChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center text-slate-400">
                                                    <div className="p-4 rounded-full bg-white/50 mb-4">
                                                        <BarChart3 className="h-8 w-8 text-slate-400" />
                                                    </div>
                                                    <p className="font-medium text-slate-600">No expense data available</p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="xl:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {allCategories.map((category, index) => {
                                                const categoryEntries = filteredEntries.filter(e => e.category === category);
                                                const categoryIncome = categoryEntries
                                                    .filter(e => e.type === 'Income')
                                                    .reduce((sum, e) => sum + e.amount, 0);
                                                const categoryExpenses = categoryEntries
                                                    .filter(e => e.type === 'Expenses')
                                                    .reduce((sum, e) => sum + e.amount, 0);

                                                if (categoryEntries.length === 0) return null;

                                                const cardColor = CHART_COLORS[index % CHART_COLORS.length];

                                                return (
                                                    <div key={category} className="group relative overflow-hidden rounded-[24px] border border-white/55 bg-white/42 hover:border-slate-300 transition-all duration-300 hover:-translate-y-0.5 shadow-sm">
                                                        <div className="absolute left-0 top-0 bottom-0 w-1 opacity-60 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: cardColor }} />

                                                        <div className="p-5">
                                                            <div className="flex justify-between items-start mb-4">
                                                                <div>
                                                                    <h4 className="font-bold text-lg text-slate-900 group-hover:text-slate-950 transition-colors">{category}</h4>
                                                                    <p className="text-xs text-slate-500">{categoryEntries.length} transactions</p>
                                                                </div>
                                                                <div className="p-2 rounded-lg bg-white/60 text-slate-700">
                                                                    <FileText className="h-4 w-4" style={{ color: cardColor }} />
                                                                </div>
                                                            </div>

                                                            <div className="flex items-end justify-between">
                                                                <div>
                                                                    <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Total Flow</p>
                                                                    <p className="text-xl font-bold text-slate-900">₹{(categoryIncome + categoryExpenses).toLocaleString()}</p>
                                                                </div>
                                                                <div className="text-right">
                                                                    {categoryExpenses > 0 && (
                                                                        <p className="text-sm font-medium text-rose-700">
                                                                            -₹{categoryExpenses.toLocaleString()}
                                                                        </p>
                                                                    )}
                                                                    {categoryIncome > 0 && (
                                                                        <p className="text-sm font-medium text-emerald-700">
                                                                            +₹{categoryIncome.toLocaleString()}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

                <div className="mt-8 text-center">
                    <p className="text-slate-500 text-sm backdrop-blur-md inline-block px-6 py-2 rounded-full border border-white/40">
                        Powered by SHREE ANDAL AI SOFTWARE SOLUTIONS (OPC) PRIVATE LIMITED ✨
                    </p>
                </div>
            </main>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent className="bg-white/95 backdrop-blur-xl border border-slate-200 text-slate-900 max-w-md rounded-[24px]">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-2xl font-bold flex items-center gap-2">
                            <Trash2 className="h-6 w-6 text-rose-650" />
                            Delete Entry?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-600 text-base">
                            This action cannot be undone. This will permanently delete the bookkeeping entry from our servers.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-3 mt-6">
                        <AlertDialogCancel className="bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200 rounded-[14px] h-12 px-6">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            className="bg-slate-950 hover:bg-slate-900 text-white border-0 rounded-[14px] h-12 px-6 font-bold"
                        >
                            Delete Permanently
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default Bookkeeping;
