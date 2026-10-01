'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  MoreHorizontal, PlusCircle, Search, ArrowUpDown, RotateCcw, X,
  IndianRupee, TrendingUp, TrendingDown, Calendar, Download, Tag,
  BarChart3, Layers, Wallet, CheckCircle2, Clock
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PageHeader } from '@/components/page-header';
import { useCollection, useFirestore, useMemoFirebase, deleteDocumentNonBlocking, useUser, useDoc } from '@/firebase';
import { collection, query, orderBy, doc } from 'firebase/firestore';
import type { Expense, User } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { format, startOfDay, endOfDay, subMonths } from 'date-fns';
import { ExpenseDialog } from './_components/expense-dialog';
import { ExpenseCharts, getCategoryColor } from './_components/expense-charts';
import { Skeleton } from '@/components/ui/skeleton';

export default function ExpensesPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);

  // Filters & Sorting state
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('date-desc');

  const firestore = useFirestore();
  const { toast } = useToast();
  const { user } = useUser();

  const currentUserDocRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'users', user.uid) : null),
    [firestore, user]
  );
  const { data: currentUserDoc } = useDoc<User>(currentUserDocRef);
  const isCurrentUserAdmin = useMemo(() => currentUserDoc?.role === 'Admin', [currentUserDoc]);

  const expensesQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'expenses'), orderBy('date', 'desc')) : null),
    [firestore]
  );
  const { data: rawExpenses, isLoading } = useCollection<Expense>(expensesQuery);

  // Financial KPI Metrics
  const summaryMetrics = useMemo(() => {
    if (!rawExpenses || rawExpenses.length === 0) {
      return {
        thisMonthTotal: 0,
        lastMonthTotal: 0,
        monthDiffPercent: null as number | null,
        allTimeTotal: 0,
        totalEntries: 0,
        monthlyAverage: 0,
        topCategory: null as { name: string; amount: number; percentage: number } | null,
      };
    }

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const lastMonthDate = subMonths(now, 1);
    const lastMonth = lastMonthDate.getMonth();
    const lastMonthYear = lastMonthDate.getFullYear();

    let thisMonthTotal = 0;
    let lastMonthTotal = 0;
    let allTimeTotal = 0;
    const categoryTotals = new Map<string, number>();
    const activeMonths = new Set<string>();

    rawExpenses.forEach((e) => {
      const amt = Number(e.amount) || 0;
      allTimeTotal += amt;

      const d = new Date(e.date);
      if (!isNaN(d.getTime())) {
        const m = d.getMonth();
        const y = d.getFullYear();
        activeMonths.add(`${y}-${m}`);

        if (m === currentMonth && y === currentYear) {
          thisMonthTotal += amt;
        } else if (m === lastMonth && y === lastMonthYear) {
          lastMonthTotal += amt;
        }
      }

      const cat = (e.expenseType || 'Miscellaneous').trim();
      categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + amt);
    });

    let monthDiffPercent: number | null = null;
    if (lastMonthTotal > 0) {
      monthDiffPercent = ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100;
    }

    const monthlyAverage = activeMonths.size > 0 ? Math.round(allTimeTotal / activeMonths.size) : allTimeTotal;

    let topCategory: { name: string; amount: number; percentage: number } | null = null;
    let maxAmt = 0;
    categoryTotals.forEach((amt, name) => {
      if (amt > maxAmt) {
        maxAmt = amt;
        topCategory = {
          name,
          amount: amt,
          percentage: allTimeTotal > 0 ? (amt / allTimeTotal) * 100 : 0,
        };
      }
    });

    return {
      thisMonthTotal,
      lastMonthTotal,
      monthDiffPercent,
      allTimeTotal,
      totalEntries: rawExpenses.length,
      monthlyAverage,
      topCategory,
    };
  }, [rawExpenses]);

  // Extract unique expense types
  const expenseTypes = useMemo(() => {
    if (!rawExpenses) return [];
    const set = new Set<string>();
    rawExpenses.forEach((e) => {
      if (e.expenseType && e.expenseType.trim()) set.add(e.expenseType.trim());
    });
    return Array.from(set).sort();
  }, [rawExpenses]);

  // Filtered & Sorted expenses
  const expenses = useMemo(() => {
    if (!rawExpenses) return [];

    let list = rawExpenses.filter((e) => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        e.expenseType.toLowerCase().includes(q) ||
        (e.notes && e.notes.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (typeFilter !== 'all' && e.expenseType !== typeFilter) {
        return false;
      }

      if (startDate) {
        const start = startOfDay(new Date(startDate));
        if (new Date(e.date) < start) return false;
      }

      if (endDate) {
        const end = endOfDay(new Date(endDate));
        if (new Date(e.date) > end) return false;
      }

      return true;
    });

    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case 'date-asc':
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'amount-desc':
          return b.amount - a.amount;
        case 'amount-asc':
          return a.amount - b.amount;
        case 'type-asc':
          return a.expenseType.localeCompare(b.expenseType);
        default:
          return 0;
      }
    });

    return list;
  }, [rawExpenses, searchTerm, typeFilter, startDate, endDate, sortBy]);

  const hasActiveFilters =
    searchTerm !== '' ||
    typeFilter !== 'all' ||
    startDate !== '' ||
    endDate !== '' ||
    sortBy !== 'date-desc';

  const resetFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setStartDate('');
    setEndDate('');
    setSortBy('date-desc');
  };

  const handleOpenDialog = (expense: Expense | null = null) => {
    setExpenseToEdit(expense);
    setIsDialogOpen(true);
  };
  
  const handleDeleteExpense = () => {
    if (!firestore || !expenseToDelete) return;
    const docRef = doc(firestore, 'expenses', expenseToDelete.id);
    deleteDocumentNonBlocking(docRef);
    toast({
      title: 'Expense Deleted',
      description: `The expense has been successfully deleted.`,
    });
    setExpenseToDelete(null);
  };

  // Export filtered expenses to CSV
  const exportToCSV = () => {
    if (!expenses || expenses.length === 0) {
      toast({ title: 'No expenses to export' });
      return;
    }
    const headers = ['Date', 'Category', 'Notes', 'Amount (INR)'];
    const rows = expenses.map((e) => [
      format(new Date(e.date), 'yyyy-MM-dd'),
      `"${(e.expenseType || '').replace(/"/g, '""')}"`,
      `"${(e.notes || '').replace(/"/g, '""')}"`,
      e.amount,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Expenses_Export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: 'Expenses Exported', description: `${expenses.length} records downloaded as CSV.` });
  };

  const renderSkeleton = () => (
    Array.from({ length: 4 }).map((_, i) => (
      <TableRow key={i}>
        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
        <TableCell><Skeleton className="h-5 w-20" /></TableCell>
        <TableCell><Skeleton className="h-5 w-40" /></TableCell>
        <TableCell><Skeleton className="h-5 w-16" /></TableCell>
        <TableCell><Skeleton className="h-8 w-8" /></TableCell>
      </TableRow>
    ))
  );

  return (
    <>
      <PageHeader
        title="Expense Tracker"
        description="Monitor daily company expenses, visualize monthly trends, and manage operational overheads."
      >
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={exportToCSV}
            disabled={!expenses || expenses.length === 0}
            className="gap-1.5"
            title="Download CSV report of current expenses"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>

          {isCurrentUserAdmin && (
            <Button size="sm" className="gap-1.5" onClick={() => handleOpenDialog()}>
              <PlusCircle className="h-4 w-4" />
              <span>Add Expense</span>
            </Button>
          )}
        </div>
      </PageHeader>

      {/* 4 Financial Summary Cards */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 mb-3">
        {/* Card 1: This Month */}
        <Card className="border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">This Month's Spending</CardTitle>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
              <Calendar className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
              {isLoading ? '...' : `₹${summaryMetrics.thisMonthTotal.toLocaleString()}`}
            </div>
            <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
              {summaryMetrics.monthDiffPercent !== null ? (
                summaryMetrics.monthDiffPercent > 0 ? (
                  <span className="text-rose-500 flex items-center font-medium">
                    <TrendingUp className="h-3 w-3 mr-0.5" />
                    +{summaryMetrics.monthDiffPercent.toFixed(0)}% vs last mo.
                  </span>
                ) : (
                  <span className="text-emerald-500 flex items-center font-medium">
                    <TrendingDown className="h-3 w-3 mr-0.5" />
                    {summaryMetrics.monthDiffPercent.toFixed(0)}% vs last mo.
                  </span>
                )
              ) : (
                <span>Current calendar month</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Total All-Time Expenses */}
        <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Total All-Time Expenses</CardTitle>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
              <Wallet className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
              {isLoading ? '...' : `₹${summaryMetrics.allTimeTotal.toLocaleString()}`}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Across {summaryMetrics.totalEntries} recorded entries
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Monthly Average Run-Rate */}
        <Card className="border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Monthly Average Run-Rate</CardTitle>
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-500">
              <BarChart3 className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="text-xl font-bold">
              {isLoading ? '...' : `₹${summaryMetrics.monthlyAverage.toLocaleString()}`}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Average overhead per active month
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Top Category */}
        <Card className="border-rose-500/20 bg-gradient-to-br from-rose-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Top Spending Category</CardTitle>
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500">
              <Tag className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            {summaryMetrics.topCategory ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="text-base font-bold truncate">
                    {summaryMetrics.topCategory.name}
                  </div>
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-rose-500/30 text-rose-600 bg-rose-500/10">
                    {summaryMetrics.topCategory.percentage.toFixed(0)}% of total
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  ₹{summaryMetrics.topCategory.amount.toLocaleString()} cumulative spend
                </p>
              </>
            ) : (
              <>
                <div className="text-base font-bold text-muted-foreground">None</div>
                <p className="text-xs text-muted-foreground mt-0.5">No expense data logged</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Visual Analytics: Month-wise Trend Line Chart & Category Donut Chart */}
      <ExpenseCharts expenses={rawExpenses || []} />

      {/* Expense History Table */}
      <Card>
        <CardHeader className="p-3 pb-2.5 space-y-2 border-b">
          {/* Top Line: Title, Count Badge, Clear Button */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold tracking-tight">Expense Records</CardTitle>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                {expenses.length} {expenses.length === 1 ? 'entry' : 'entries'}
              </Badge>
              {expenses.length > 0 && (
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  (Filtered Total: <strong className="text-foreground">₹{expenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0).toLocaleString()}</strong>)
                </span>
              )}
            </div>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                title="Reset filters"
                type="button"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Clear Filters</span>
              </Button>
            )}
          </div>

          {/* Bottom Line: Full-width spacious filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search input */}
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search notes or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-7 h-8 text-xs bg-background"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                  type="button"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Date Range: cleanly encapsulated */}
            <div className="flex items-center gap-1.5 border rounded-md px-2 py-0.5 bg-background shadow-2xs">
              <span className="text-[11px] font-medium text-muted-foreground">From:</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-7 w-[125px] border-0 bg-transparent text-xs px-1 shadow-none focus-visible:ring-0"
                title="Date From"
              />
              <span className="text-muted-foreground/40 text-xs">|</span>
              <span className="text-[11px] font-medium text-muted-foreground">To:</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-7 w-[125px] border-0 bg-transparent text-xs px-1 shadow-none focus-visible:ring-0"
                title="Date To"
              />
            </div>

            {/* Type Filter */}
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 text-xs w-[140px] bg-background">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {expenseTypes.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Sorting Filter */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-8 text-xs w-[145px] bg-background">
                <div className="flex items-center gap-1.5 truncate">
                  <ArrowUpDown className="h-3 w-3 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Sort by" />
                </div>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="date-desc">Date: Newest</SelectItem>
                <SelectItem value="date-asc">Date: Oldest</SelectItem>
                <SelectItem value="amount-desc">Amount: High → Low</SelectItem>
                <SelectItem value="amount-asc">Amount: Low → High</SelectItem>
                <SelectItem value="type-asc">Category (A → Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[130px]">Date</TableHead>
                <TableHead className="w-[150px]">Category</TableHead>
                <TableHead className="min-w-[180px]">Notes & Description</TableHead>
                <TableHead className="w-[130px] text-right font-semibold">Amount</TableHead>
                {isCurrentUserAdmin && (
                  <TableHead className="w-[60px] text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && renderSkeleton()}
              {!isLoading && expenses?.map((expense) => {
                const catColor = getCategoryColor(expense.expenseType);
                return (
                  <TableRow key={expense.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(expense.date), 'dd-MMM-yyyy')}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: catColor }} />
                        <span className="font-medium text-xs text-foreground">{expense.expenseType}</span>
                      </div>
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {expense.notes || '—'}
                    </TableCell>

                    <TableCell className="text-right font-semibold text-xs whitespace-nowrap">
                      ₹{expense.amount.toLocaleString()}
                    </TableCell>

                    {isCurrentUserAdmin && (
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              aria-haspopup="true"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Toggle menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handleOpenDialog(expense)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onSelect={() => setExpenseToDelete(expense)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {!isLoading && expenses?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isCurrentUserAdmin ? 5 : 4} className="text-center py-6 text-xs text-muted-foreground">
                    No expenses match your filter criteria.
                    {hasActiveFilters ? (
                      <Button variant="link" size="sm" onClick={resetFilters} className="text-xs h-auto p-0 ml-1.5 text-primary">
                        Clear all filters
                      </Button>
                    ) : (
                      isCurrentUserAdmin && (
                        <Button variant="link" size="sm" onClick={() => handleOpenDialog()} className="text-xs h-auto p-0 ml-1.5 text-primary">
                          Add Expense
                        </Button>
                      )
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      <ExpenseDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        expense={expenseToEdit}
      />

      <AlertDialog
        open={!!expenseToDelete}
        onOpenChange={(open) => !open && setExpenseToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this expense record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteExpense}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
