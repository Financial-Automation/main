import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useSubscription } from "@/contexts/SubscriptionContext";
import {
  PieChart as PieChartIcon,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Plus,
  ArrowLeft,
  DollarSign,
  Edit,
  Trash2,
  BookOpen,
  BarChart3,
  Sparkles,
  Loader2,
  Calendar,
  Layers,
  ChevronRight,
  Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

interface CategorySummary {
  category: string;
  budgetAmount: number;
  currentAmount: number;
  previousAmount: number;
  remainingBudget: number;
  usagePercentage: number;
  monthOverMonthChange: number;
  percentOfTotal: number;
  status: "on_track" | "near_limit" | "over_budget" | "no_budget";
  budgetId?: string | null;
  notes?: string;
}

interface ExpenseBudgetSummary {
  period: string;
  totalCurrentMonthExpenses: number;
  totalPrevMonthExpenses: number;
  totalExpenseChangePercent: number;
  totalBudgetSet: number;
  totalBudgetUsagePercent: number;
  largestCategory: string;
  overBudgetCount: number;
  nearLimitCount: number;
  alerts: { category: string; severity: "danger" | "warning"; message: string }[];
  categories: CategorySummary[];
  recentExpenses: any[];
}

export const ExpenseBudgeting = () => {
  const navigate = useNavigate();
  const { hasAccess } = useSubscription();

  const [summaryData, setSummaryData] = useState<ExpenseBudgetSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    category: "",
    budgetAmount: "",
    notes: ""
  });

  useEffect(() => {
    fetchSummary();
  }, [selectedMonth, selectedYear]);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const data = await apiRequest(
        `${API_BASE_URL}/api/budgets/summary?month=${selectedMonth}&year=${selectedYear}`
      );
      setSummaryData(data);
    } catch (error: any) {
      toast.error(error.message || "Failed to load expense and budget analysis.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSetBudgetModal = (categoryItem?: CategorySummary) => {
    if (categoryItem) {
      setSelectedBudgetId(categoryItem.budgetId || null);
      setFormData({
        category: categoryItem.category,
        budgetAmount: categoryItem.budgetAmount > 0 ? String(categoryItem.budgetAmount) : "",
        notes: categoryItem.notes || ""
      });
    } else {
      setSelectedBudgetId(null);
      setFormData({
        category: "",
        budgetAmount: "",
        notes: ""
      });
    }
    setIsModalOpen(true);
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.category.trim()) {
      toast.error("Category name is required.");
      return;
    }
    const amt = parseFloat(formData.budgetAmount);
    if (isNaN(amt) || amt < 0) {
      toast.error("Valid positive budget amount is required.");
      return;
    }

    try {
      setSubmitting(true);
      await apiRequest(`${API_BASE_URL}/api/budgets`, {
        method: "POST",
        body: JSON.stringify({
          category: formData.category.trim(),
          budgetAmount: amt,
          notes: formData.notes
        })
      });

      toast.success(`Budget for '${formData.category.trim()}' set to ₹${amt.toLocaleString('en-IN')}!`);
      setIsModalOpen(false);
      fetchSummary();
    } catch (error: any) {
      toast.error(error.message || "Failed to set budget.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteBudget = async (budgetId: string, categoryName: string) => {
    if (!confirm(`Remove budget target for '${categoryName}'? Bookkeeping entries will not be deleted.`)) return;
    try {
      await apiRequest(`${API_BASE_URL}/api/budgets/${budgetId}`, {
        method: "DELETE"
      });
      toast.success(`Budget for '${categoryName}' removed.`);
      fetchSummary();
    } catch (error: any) {
      toast.error(error.message || "Failed to remove budget.");
    }
  };

  const chartData = summaryData ? summaryData.categories.map(c => ({
    name: c.category,
    Actual: c.currentAmount,
    Budget: c.budgetAmount
  })) : [];

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
              <PieChartIcon className="h-7 w-7 text-indigo-600" />
              Expense Management & Budget Control
            </h1>
            <p className="text-sm text-slate-500">
              Track category spending, set monthly budgets & prevent over-budget cash drain.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Month & Year Selectors */}
          <Select value={String(selectedMonth)} onValueChange={(val) => setSelectedMonth(Number(val))}>
            <SelectTrigger className="w-36 rounded-xl border-slate-200 bg-white">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">January</SelectItem>
              <SelectItem value="2">February</SelectItem>
              <SelectItem value="3">March</SelectItem>
              <SelectItem value="4">April</SelectItem>
              <SelectItem value="5">May</SelectItem>
              <SelectItem value="6">June</SelectItem>
              <SelectItem value="7">July</SelectItem>
              <SelectItem value="8">August</SelectItem>
              <SelectItem value="9">September</SelectItem>
              <SelectItem value="10">October</SelectItem>
              <SelectItem value="11">November</SelectItem>
              <SelectItem value="12">December</SelectItem>
            </SelectContent>
          </Select>

          <Button
            onClick={() => handleOpenSetBudgetModal()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md gap-2"
          >
            <Plus className="h-4 w-4" />
            Set Category Budget
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-16 text-center text-slate-500 flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <p>Analyzing expense categories & budget limits...</p>
        </div>
      ) : summaryData ? (
        <>
          {/* Over Budget / Near Limit Warning Banner */}
          {summaryData.alerts.length > 0 && (
            <Card className="rounded-2xl border-amber-300 bg-amber-50/90 shadow-sm overflow-hidden">
              <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-amber-900">
                      Budget Alerts ({summaryData.alerts.length} Category Flagged)
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {summaryData.alerts.map((alert, idx) => (
                        <Badge
                          key={idx}
                          variant="outline"
                          className={`text-xs ${
                            alert.severity === "danger"
                              ? "bg-red-100 border-red-300 text-red-900 font-semibold"
                              : "bg-white/80 border-amber-300 text-amber-900"
                          }`}
                        >
                          {alert.message}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <Button
                  onClick={() => navigate("/bookkeeping")}
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs shrink-0"
                >
                  Audit Expenses in Bookkeeping
                </Button>
              </CardContent>
            </Card>
          )}

          {/* 4 Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Current Month Expenses */}
            <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {summaryData.period} Expenses
                  </p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">
                    ₹{summaryData.totalCurrentMonthExpenses.toLocaleString('en-IN')}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                    {summaryData.totalExpenseChangePercent > 0 ? (
                      <span className="text-red-600 font-medium flex items-center">
                        <TrendingUp className="h-3 w-3 mr-0.5" />+{summaryData.totalExpenseChangePercent}% MoM
                      </span>
                    ) : summaryData.totalExpenseChangePercent < 0 ? (
                      <span className="text-emerald-600 font-medium flex items-center">
                        <TrendingDown className="h-3 w-3 mr-0.5" />{summaryData.totalExpenseChangePercent}% MoM
                      </span>
                    ) : (
                      <span>No MoM change</span>
                    )}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-600">
                  <TrendingDown className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            {/* Total Budget Set */}
            <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Monthly Budget</p>
                  <h3 className="text-2xl font-bold text-slate-900 mt-1">
                    ₹{summaryData.totalBudgetSet.toLocaleString('en-IN')}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Across configured categories</p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <DollarSign className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            {/* Budget Utilization % */}
            <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Overall Budget Utilization</p>
                  <h3 className={`text-2xl font-bold mt-1 ${summaryData.totalBudgetUsagePercent > 100 ? 'text-red-600' : 'text-slate-900'}`}>
                    {summaryData.totalBudgetUsagePercent}%
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {summaryData.totalBudgetSet > 0 ? `₹${(summaryData.totalBudgetSet - summaryData.totalCurrentMonthExpenses).toLocaleString('en-IN')} remaining` : 'No total budget target'}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <BarChart3 className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            {/* Over Budget Categories Count */}
            <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Over-Budget Categories</p>
                  <h3 className={`text-2xl font-bold mt-1 ${summaryData.overBudgetCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {summaryData.overBudgetCount}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Largest: <span className="font-semibold text-slate-800">{summaryData.largestCategory}</span>
                  </p>
                </div>
                <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${summaryData.overBudgetCount > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  {summaryData.overBudgetCount > 0 ? <AlertTriangle className="h-6 w-6" /> : <CheckCircle className="h-6 w-6" />}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Budget vs Actual Category Breakdown Table */}
          <Card className="rounded-2xl border-slate-200 shadow-sm bg-white overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-150 px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900">
                  Category Budget vs Actual Spending ({summaryData.categories.length})
                </CardTitle>
                <CardDescription>
                  Detailed monthly expense tracking and budget compliance by category.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => navigate("/cashflow")}
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs gap-1 border-slate-200"
                >
                  Cash Flow Impact
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {summaryData.categories.length === 0 ? (
                <div className="p-12 text-center text-slate-500 space-y-3">
                  <Layers className="h-8 w-8 text-slate-400 mx-auto" />
                  <p className="font-semibold text-slate-900">No Expense Categories Recorded</p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Record expense entries in Bookkeeping or set category budgets to start tracking spending.
                  </p>
                  <Button
                    onClick={() => handleOpenSetBudgetModal()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Set First Budget Target
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600 uppercase text-xs font-semibold tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3.5">Category</th>
                        <th className="px-6 py-3.5 text-right">Budget</th>
                        <th className="px-6 py-3.5 text-right">Actual Spent</th>
                        <th className="px-6 py-3.5 text-right">Remaining</th>
                        <th className="px-6 py-3.5">Budget Usage</th>
                        <th className="px-6 py-3.5">Status</th>
                        <th className="px-6 py-3.5 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 text-slate-800">
                      {summaryData.categories.map((cat) => (
                        <tr key={cat.category} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-900">{cat.category}</div>
                            <div className="text-xs text-slate-500">{cat.percentOfTotal}% of total expenses</div>
                          </td>
                          <td className="px-6 py-4 text-right font-medium text-slate-900">
                            {cat.budgetAmount > 0 ? (
                              `₹${cat.budgetAmount.toLocaleString('en-IN')}`
                            ) : (
                              <span className="text-xs text-slate-400 italic">No budget</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right font-semibold text-red-600">
                            ₹{cat.currentAmount.toLocaleString('en-IN')}
                          </td>
                          <td className="px-6 py-4 text-right font-medium">
                            {cat.budgetAmount > 0 ? (
                              <span className={cat.remainingBudget === 0 ? "text-red-600 font-semibold" : "text-emerald-700"}>
                                ₹{cat.remainingBudget.toLocaleString('en-IN')}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 w-44">
                            {cat.budgetAmount > 0 ? (
                              <div className="space-y-1">
                                <div className="flex justify-between text-xs font-medium">
                                  <span>{cat.usagePercentage}%</span>
                                </div>
                                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      cat.status === 'over_budget'
                                        ? 'bg-red-500'
                                        : cat.status === 'near_limit'
                                        ? 'bg-amber-500'
                                        : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${Math.min(100, cat.usagePercentage)}%` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {cat.status === "over_budget" ? (
                              <Badge className="bg-red-100 text-red-900 hover:bg-red-100 border-none font-semibold">
                                Over Budget
                              </Badge>
                            ) : cat.status === "near_limit" ? (
                              <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-none font-semibold">
                                Near Limit
                              </Badge>
                            ) : cat.status === "on_track" ? (
                              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-none font-semibold">
                                On Track
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-slate-500">
                                Unbudgeted
                              </Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenSetBudgetModal(cat)}
                                title="Edit Budget Target"
                                className="h-8 w-8 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              {cat.budgetId && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteBudget(cat.budgetId!, cat.category)}
                                  title="Remove Budget Target"
                                  className="h-8 w-8 text-red-500 hover:bg-red-50 rounded-lg"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
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

          {/* Visualization Chart */}
          {chartData.length > 0 && (
            <Card className="rounded-2xl border-slate-200 shadow-sm bg-white p-6">
              <CardHeader className="px-0 pt-0 pb-4">
                <CardTitle className="text-base font-semibold text-slate-900">
                  Category Budget vs Actual Expense Comparison
                </CardTitle>
                <CardDescription>Visualizing spending limits against actual Bookkeeping expenses.</CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <div className="w-full h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                      <YAxis stroke="#64748b" fontSize={12} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="Budget" fill="#818cf8" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="Actual" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}

      {/* Set / Edit Budget Dialog Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{selectedBudgetId ? "Edit Category Budget" : "Set Category Budget"}</DialogTitle>
            <DialogDescription>
              Define a monthly spending target for this expense category.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveBudget} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="category">Category Name *</Label>
              <Input
                id="category"
                placeholder="e.g. Rent, Salaries, Utilities, Marketing, Travel, Software"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                required
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="budgetAmount">Monthly Budget Amount (₹) *</Label>
              <Input
                id="budgetAmount"
                type="number"
                placeholder="e.g. 50000"
                value={formData.budgetAmount}
                onChange={(e) => setFormData({ ...formData, budgetAmount: e.target.value })}
                required
                min="0"
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes / Target Remarks</Label>
              <Input
                id="notes"
                placeholder="Target cap for marketing campaigns, monthly office lease..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="rounded-xl"
              />
            </div>

            <DialogFooter className="gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
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
                Save Budget Target
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default ExpenseBudgeting;
