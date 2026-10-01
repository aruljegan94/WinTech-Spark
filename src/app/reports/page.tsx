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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { PageHeader } from '@/components/page-header';
import {
  File, Calendar as CalendarIcon, IndianRupee, TrendingUp, TrendingDown,
  ShoppingBag, Truck, Receipt, Package, Download, Search, CheckCircle2,
  AlertTriangle, Wallet, Layers, ArrowRight, ArrowUpDown, Filter, Sparkles
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import {
  format, isWithinInterval, startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear
} from 'date-fns';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { Sale, Product, Purchase, Expense, Vendor, CompanyProfile } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRange } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { GSTReport } from './_components/gst-report';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import Link from 'next/link';

interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => jsPDF;
}

export const dynamic = "force-dynamic";

export default function ReportsPage() {
  const firestore = useFirestore();
  const [date, setDate] = useState<DateRange | undefined>();
  const [activeTab, setActiveTab] = useState('profit');
  const [searchTerm, setSearchTerm] = useState('');

  const salesQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'sales') : null),
    [firestore]
  );
  const { data: allSales, isLoading: salesLoading } = useCollection<Sale>(salesQuery);

  const productsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'products') : null),
    [firestore]
  );
  const { data: products, isLoading: productsLoading } = useCollection<Product>(productsQuery);
  
  const purchasesQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'purchases') : null),
    [firestore]
  );
  const { data: allPurchases, isLoading: purchasesLoading } = useCollection<Purchase>(purchasesQuery);

  const expensesQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'expenses') : null),
    [firestore]
  );
  const { data: allExpenses, isLoading: expensesLoading } = useCollection<Expense>(expensesQuery);

  const vendorsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'vendors') : null),
    [firestore]
  );
  const { data: vendors } = useCollection<Vendor>(vendorsQuery);

  const defaultProfileQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'companyProfiles'), where('isDefault', '==', true)) : null),
    [firestore]
  );
  const { data: defaultProfileData } = useCollection<CompanyProfile>(defaultProfileQuery);
  const companyProfile = useMemo(() => defaultProfileData?.[0], [defaultProfileData]);

  const isLoading = salesLoading || productsLoading || purchasesLoading || expensesLoading;

  // Date Presets Handler
  const applyPreset = (preset: 'today' | 'this-week' | 'this-month' | 'last-month' | 'fy' | 'all') => {
    const now = new Date();
    switch (preset) {
      case 'today':
        setDate({ from: startOfDay(now), to: endOfDay(now) });
        break;
      case 'this-week':
        setDate({ from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) });
        break;
      case 'this-month':
        setDate({ from: startOfMonth(now), to: endOfMonth(now) });
        break;
      case 'last-month': {
        const lastMonth = subMonths(now, 1);
        setDate({ from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) });
        break;
      }
      case 'fy': {
        // Indian Financial Year: April 1 to March 31
        const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        setDate({ from: new Date(year, 3, 1), to: new Date(year + 1, 2, 31, 23, 59, 59) });
        break;
      }
      case 'all':
      default:
        setDate(undefined);
        break;
    }
  };

  const filteredData = useMemo(() => {
    const filterByDate = (items: any[] | null) => {
      if (!date?.from || !items) return items;
      const to = date.to ?? date.from;
      return items.filter(item => {
        const itemDate = new Date(item.date);
        return !isNaN(itemDate.getTime()) && isWithinInterval(itemDate, { start: startOfDay(date.from!), end: endOfDay(to) });
      });
    };

    return {
      sales: filterByDate(allSales) as Sale[] | null,
      purchases: filterByDate(allPurchases) as Purchase[] | null,
      expenses: filterByDate(allExpenses) as Expense[] | null,
    };
  }, [date, allSales, allPurchases, allExpenses]);

  // Comprehensive P&L and Financial Calculations
  const financials = useMemo(() => {
    const salesList = filteredData.sales || [];
    const purchasesList = filteredData.purchases || [];
    const expensesList = filteredData.expenses || [];

    // Revenue
    const grossSales = salesList.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
    const taxCollected = salesList.reduce((sum, s) => sum + (Number(s.gstAmount) || 0), 0);
    const netSales = grossSales - taxCollected;

    // Direct Cost of Goods Sold (COGS) based on sold items
    let calculatedCOGS = 0;
    salesList.forEach((s) => {
      (s.items || []).forEach((item) => {
        const prod = (products || []).find((p) => p.id === item.productId);
        const cost = prod ? Number(prod.purchasePrice) || 0 : 0;
        calculatedCOGS += cost * (Number(item.quantity) || 1);
      });
    });

    // Fallback: If sold items purchase price not available, purchases total is an indicator
    const totalPurchases = purchasesList.reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);
    const purchasesPaid = purchasesList.reduce((sum, p) => sum + (p.amountPaid !== undefined ? Number(p.amountPaid) : (p.paymentStatus === 'Paid' ? Number(p.totalAmount) : 0)), 0);
    const purchasesDue = Math.max(0, totalPurchases - purchasesPaid);

    const cogsEffective = calculatedCOGS > 0 ? calculatedCOGS : totalPurchases;
    const grossProfit = Math.max(0, grossSales - cogsEffective);
    const grossMarginPercent = grossSales > 0 ? (grossProfit / grossSales) * 100 : 0;

    // Operating Expenses
    const totalExpenses = expensesList.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // Group expenses by category
    const expenseBreakdown = new Map<string, number>();
    expensesList.forEach((e) => {
      const cat = (e.expenseType || 'Miscellaneous').trim();
      expenseBreakdown.set(cat, (expenseBreakdown.get(cat) || 0) + (Number(e.amount) || 0));
    });

    // Net Realized Operating Profit
    const netOperatingProfit = grossProfit - totalExpenses;
    const netMarginPercent = grossSales > 0 ? (netOperatingProfit / grossSales) * 100 : 0;

    // Sales Payment Modes breakdown
    const cashSales = salesList.filter(s => s.paymentMode === 'Cash').reduce((sum, s) => sum + s.total, 0);
    const upiSales = salesList.filter(s => s.paymentMode === 'UPI').reduce((sum, s) => sum + s.total, 0);
    const bankSales = salesList.filter(s => s.paymentMode === 'Bank Transfer').reduce((sum, s) => sum + s.total, 0);
    const pendingSalesCredit = salesList.filter(s => s.paymentStatus !== 'Paid').reduce((sum, s) => sum + Math.max(0, s.total - (s.amountPaid || 0)), 0);

    // Inventory Valuation
    const totalStockQty = (products || []).reduce((acc, p) => acc + (Number(p.stockQuantity) || 0), 0);
    const stockAssetValueCost = (products || []).reduce((acc, p) => acc + ((Number(p.purchasePrice) || 0) * (Number(p.stockQuantity) || 0)), 0);
    const stockRetailPotential = (products || []).reduce((acc, p) => acc + ((Number(p.sellingPrice) || 0) * (Number(p.stockQuantity) || 0)), 0);
    const projectedStockProfit = Math.max(0, stockRetailPotential - stockAssetValueCost);

    return {
      grossSales,
      taxCollected,
      netSales,
      cogsEffective,
      grossProfit,
      grossMarginPercent,
      totalExpenses,
      expenseBreakdown: Array.from(expenseBreakdown.entries()).sort((a, b) => b[1] - a[1]),
      netOperatingProfit,
      netMarginPercent,
      totalPurchases,
      purchasesPaid,
      purchasesDue,
      cashSales,
      upiSales,
      bankSales,
      pendingSalesCredit,
      totalStockQty,
      stockAssetValueCost,
      stockRetailPotential,
      projectedStockProfit,
    };
  }, [filteredData, products]);

  const renderSkeleton = (rows: number, cells: number) => (
    Array.from({ length: rows }).map((_, i) => (
      <TableRow key={i}>
        {Array.from({ length: cells }).map((_, j) => (
          <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
        ))}
      </TableRow>
    ))
  );

  const generateCSV = (data: any[], headers: string[], filename: string) => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...data.map(e => headers.map(h => `"${String(e[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handleExportCSV = (reportType: 'sales' | 'purchases' | 'expenses' | 'stock' | 'pnl') => {
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    switch (reportType) {
      case 'sales':
        if (filteredData.sales) {
          generateCSV(
            filteredData.sales.map(s => ({
              invoiceNumber: s.invoiceNumber,
              customerName: s.customerName || 'Walk-in',
              customerMobile: s.customerMobile || '',
              date: format(new Date(s.date), 'dd-MMM-yyyy'),
              paymentMode: s.paymentMode || 'Cash',
              paymentStatus: s.paymentStatus,
              total: s.total,
            })),
            ['invoiceNumber', 'customerName', 'customerMobile', 'date', 'paymentMode', 'paymentStatus', 'total'],
            `Sales_Report_${dateStr}.csv`
          );
        }
        break;
      case 'purchases':
        if (filteredData.purchases) {
          generateCSV(
            filteredData.purchases.map(p => ({
              invoiceNo: p.invoiceNo,
              supplierName: p.supplierName,
              date: format(new Date(p.date), 'dd-MMM-yyyy'),
              paymentStatus: p.paymentStatus,
              totalAmount: p.totalAmount,
              amountPaid: p.amountPaid ?? (p.paymentStatus === 'Paid' ? p.totalAmount : 0),
            })),
            ['invoiceNo', 'supplierName', 'date', 'paymentStatus', 'totalAmount', 'amountPaid'],
            `Purchases_Report_${dateStr}.csv`
          );
        }
        break;
      case 'expenses':
        if (filteredData.expenses) {
          generateCSV(
            filteredData.expenses.map(e => ({
              date: format(new Date(e.date), 'dd-MMM-yyyy'),
              expenseType: e.expenseType,
              notes: e.notes || '',
              amount: e.amount,
            })),
            ['date', 'expenseType', 'notes', 'amount'],
            `Expenses_Report_${dateStr}.csv`
          );
        }
        break;
      case 'stock':
        if (products) {
          generateCSV(
            products.map(p => ({
              productName: p.productName,
              category: p.category,
              stockQuantity: p.stockQuantity,
              purchasePrice: p.purchasePrice,
              sellingPrice: p.sellingPrice,
              assetValue: p.purchasePrice * p.stockQuantity,
            })),
            ['productName', 'category', 'stockQuantity', 'purchasePrice', 'sellingPrice', 'assetValue'],
            `Stock_Valuation_${dateStr}.csv`
          );
        }
        break;
      case 'pnl': {
        const pnlRows = [
          { item: 'Gross Sales Revenue', amount: financials.grossSales },
          { item: 'Less: Cost of Goods Sold (COGS)', amount: -financials.cogsEffective },
          { item: 'Gross Profit', amount: financials.grossProfit },
          { item: 'Less: Total Operating Expenses', amount: -financials.totalExpenses },
          { item: 'Net Operating Profit', amount: financials.netOperatingProfit },
        ];
        generateCSV(pnlRows, ['item', 'amount'], `Profit_Loss_Report_${dateStr}.csv`);
        break;
      }
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF() as jsPDFWithAutoTable;
    const pageTitle = companyProfile?.companyName || "WinTech-Spark Business Report";
    const dateRange = date?.from
      ? `${format(date.from, 'dd-MMM-yyyy')} to ${date.to ? format(date.to, 'dd-MMM-yyyy') : format(date.from, 'dd-MMM-yyyy')}`
      : 'All Time';
    
    doc.setFontSize(14);
    doc.text(pageTitle, 14, 15);
    doc.setFontSize(9);
    doc.text(`Executive Financial & Operational Summary (${dateRange})`, 14, 21);

    // Summary Table
    doc.autoTable({
      startY: 28,
      head: [['Financial Metric', 'Value (INR)']],
      body: [
        ['Total Gross Revenue', `Rs. ${financials.grossSales.toLocaleString()}`],
        ['Cost of Goods Sold (COGS)', `Rs. ${financials.cogsEffective.toLocaleString()}`],
        ['Gross Profit Margin', `${financials.grossMarginPercent.toFixed(1)}% (Rs. ${financials.grossProfit.toLocaleString()})`],
        ['Operating Expenses', `Rs. ${financials.totalExpenses.toLocaleString()}`],
        ['Net Operating Profit', `Rs. ${financials.netOperatingProfit.toLocaleString()} (${financials.netMarginPercent.toFixed(1)}%)`],
        ['Inventory Asset Value (Cost)', `Rs. ${financials.stockAssetValueCost.toLocaleString()}`],
      ],
      theme: 'grid',
    });

    // Sales Table
    if (filteredData.sales && filteredData.sales.length > 0) {
      doc.addPage();
      doc.text("Sales Invoices Summary", 14, 15);
      doc.autoTable({
        startY: 22,
        head: [['Invoice #', 'Customer', 'Date', 'Mode', 'Status', 'Total']],
        body: filteredData.sales.slice(0, 40).map(s => [
          s.invoiceNumber,
          s.customerName || 'Walk-in',
          format(new Date(s.date), 'dd-MMM-yyyy'),
          s.paymentMode || 'Cash',
          s.paymentStatus,
          `Rs. ${s.total.toLocaleString()}`
        ]),
      });
    }

    doc.save(`Business_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <>
      <PageHeader
        title="Business Reports & Accounting"
        description="Comprehensive financial statements, sales records, purchase audits, and inventory valuations."
      >
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Date Presets */}
          <div className="hidden sm:flex items-center gap-1 border rounded-lg p-0.5 bg-background text-xs shadow-2xs">
            <Button
              size="sm"
              variant={!date ? 'default' : 'ghost'}
              className="h-6 px-2 text-[11px]"
              onClick={() => applyPreset('all')}
            >
              All Time
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={() => applyPreset('today')}
            >
              Today
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={() => applyPreset('this-month')}
            >
              This Month
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={() => applyPreset('fy')}
            >
              FY 2025-26
            </Button>
          </div>

          {/* Date Picker Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="date"
                variant={"outline"}
                className={cn(
                  "h-8 w-[240px] justify-start text-left text-xs font-normal",
                  !date && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {date?.from ? (
                  date.to ? (
                    <>
                      {format(date.from, "dd-MMM-yyyy")} - {format(date.to, "dd-MMM-yyyy")}
                    </>
                  ) : (
                    format(date.from, "dd-MMM-yyyy")
                  )
                ) : (
                  <span>Select custom dates</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={date?.from}
                selected={date}
                onSelect={setDate}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>

          {/* Export Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 border-primary/30 text-primary">
                <Download className="h-3.5 w-3.5" />
                <span>Export</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={handleExportPDF}>
                Download PDF Summary
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExportCSV('pnl')}>
                Export P&amp;L Statement (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExportCSV('sales')}>
                Export Sales Register (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExportCSV('purchases')}>
                Export Purchases Register (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExportCSV('expenses')}>
                Export Expenses Register (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleExportCSV('stock')}>
                Export Stock Valuation (CSV)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 max-w-4xl h-auto p-1 bg-muted/60 rounded-xl gap-1">
          <TabsTrigger value="profit" className="text-xs py-1.5 gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Profit &amp; Loss</span>
          </TabsTrigger>
          <TabsTrigger value="sales" className="text-xs py-1.5 gap-1.5">
            <ShoppingBag className="h-3.5 w-3.5" />
            <span>Sales</span>
          </TabsTrigger>
          <TabsTrigger value="purchases" className="text-xs py-1.5 gap-1.5">
            <Truck className="h-3.5 w-3.5" />
            <span>Purchases</span>
          </TabsTrigger>
          <TabsTrigger value="expenses" className="text-xs py-1.5 gap-1.5">
            <Receipt className="h-3.5 w-3.5" />
            <span>Expenses</span>
          </TabsTrigger>
          <TabsTrigger value="stock" className="text-xs py-1.5 gap-1.5">
            <Package className="h-3.5 w-3.5" />
            <span>Stock Valuation</span>
          </TabsTrigger>
          <TabsTrigger value="gst" className="text-xs py-1.5 gap-1.5 text-primary font-semibold">
            <File className="h-3.5 w-3.5" />
            <span>GST Reports</span>
          </TabsTrigger>
        </TabsList>

        {/* ─────────────────────────────────────────────────────────────────
            TAB 1: PROFIT & LOSS (INCOME STATEMENT)
        ───────────────────────────────────────────────────────────────── */}
        <TabsContent value="profit" className="space-y-3">
          {/* Executive P&L KPI Cards */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 via-card to-card">
              <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">Gross Sales Revenue</CardTitle>
                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
                  <IndianRupee className="h-3.5 w-3.5" />
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-2 pt-0">
                <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
                  ₹{financials.grossSales.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tax component: ₹{financials.taxCollected.toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <Card className="border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 via-card to-card">
              <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">Cost of Goods Sold (COGS)</CardTitle>
                <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-500">
                  <Truck className="h-3.5 w-3.5" />
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-2 pt-0">
                <div className="text-xl font-bold">
                  ₹{financials.cogsEffective.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Direct product procurement costs</p>
              </CardContent>
            </Card>

            <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-card to-card">
              <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">Operating Expenses</CardTitle>
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                  <Receipt className="h-3.5 w-3.5" />
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-2 pt-0">
                <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
                  ₹{financials.totalExpenses.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Rent, utility, salaries, overheads</p>
              </CardContent>
            </Card>

            <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-card to-card">
              <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">Net Operating Profit</CardTitle>
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                  <TrendingUp className="h-3.5 w-3.5" />
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-2 pt-0">
                <div className="flex items-baseline justify-between">
                  <div className={`text-xl font-bold ${financials.netOperatingProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`}>
                    ₹{financials.netOperatingProfit.toLocaleString()}
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-bold">
                    {financials.netMarginPercent.toFixed(1)}% Net
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Bottom-line realized return</p>
              </CardContent>
            </Card>
          </div>

          {/* Detailed P&L Statement Card */}
          <Card>
            <CardHeader className="p-4 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Income Statement (Profit &amp; Loss)</CardTitle>
                <CardDescription className="text-xs">
                  Standard double-entry accounting statement of revenues, direct costs, and net margin.
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleExportCSV('pnl')}>
                <Download className="h-3 w-3" /> Export P&amp;L
              </Button>
            </CardHeader>

            <CardContent className="p-0">
              <div className="divide-y text-xs">
                {/* 1. Operating Revenue */}
                <div className="p-3 bg-muted/20 flex justify-between font-semibold">
                  <span className="text-foreground uppercase tracking-wider text-[11px]">1. Operating Revenue</span>
                  <span>₹{financials.grossSales.toLocaleString()}</span>
                </div>
                <div className="px-4 py-2 flex justify-between text-muted-foreground">
                  <span>Gross Sales Invoices Billed</span>
                  <span>+ ₹{financials.grossSales.toLocaleString()}</span>
                </div>
                <div className="px-4 py-2 flex justify-between text-muted-foreground">
                  <span>Less: GST Collected (Payable to Govt)</span>
                  <span>- ₹{financials.taxCollected.toLocaleString()}</span>
                </div>
                <div className="px-4 py-2 flex justify-between font-medium border-t">
                  <span>Net Taxable Sales</span>
                  <span>₹{financials.netSales.toLocaleString()}</span>
                </div>

                {/* 2. Cost of Sales */}
                <div className="p-3 bg-muted/20 flex justify-between font-semibold">
                  <span className="text-foreground uppercase tracking-wider text-[11px]">2. Cost of Goods Sold (COGS)</span>
                  <span className="text-rose-600">- ₹{financials.cogsEffective.toLocaleString()}</span>
                </div>
                <div className="px-4 py-2 flex justify-between text-muted-foreground">
                  <span>Direct Material &amp; Spare Parts Cost</span>
                  <span>₹{financials.cogsEffective.toLocaleString()}</span>
                </div>

                {/* Gross Profit Highlight */}
                <div className="p-3 bg-emerald-500/10 flex justify-between font-bold text-emerald-700 dark:text-emerald-400">
                  <span>GROSS PROFIT (Revenue - COGS)</span>
                  <div className="text-right">
                    <span>₹{financials.grossProfit.toLocaleString()}</span>
                    <span className="text-[11px] font-normal ml-1.5 opacity-80">({financials.grossMarginPercent.toFixed(1)}% Gross Margin)</span>
                  </div>
                </div>

                {/* 3. Operating Expenses */}
                <div className="p-3 bg-muted/20 flex justify-between font-semibold">
                  <span className="text-foreground uppercase tracking-wider text-[11px]">3. Operational &amp; Overhead Expenses</span>
                  <span className="text-amber-600">- ₹{financials.totalExpenses.toLocaleString()}</span>
                </div>
                {financials.expenseBreakdown.map(([cat, amt]) => (
                  <div key={cat} className="px-4 py-1.5 flex justify-between text-muted-foreground">
                    <span>{cat}</span>
                    <span>₹{amt.toLocaleString()}</span>
                  </div>
                ))}
                {financials.expenseBreakdown.length === 0 && (
                  <div className="px-4 py-2 text-muted-foreground italic">No expenses recorded for period.</div>
                )}

                {/* Final Net Operating Income */}
                <div className="p-4 bg-primary/10 border-t-2 border-primary/40 flex justify-between items-center font-bold text-sm">
                  <div>
                    <span className="text-foreground">NET OPERATING PROFIT (EBITDA)</span>
                    <div className="text-[11px] font-normal text-muted-foreground">
                      Real bottom-line profit retained in business
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-lg font-bold ${financials.netOperatingProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                      ₹{financials.netOperatingProfit.toLocaleString()}
                    </span>
                    <div className="text-[11px] font-normal text-muted-foreground">
                      Net Profit Margin: {financials.netMarginPercent.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─────────────────────────────────────────────────────────────────
            TAB 2: SALES REGISTER REPORT
        ───────────────────────────────────────────────────────────────── */}
        <TabsContent value="sales" className="space-y-3">
          {/* Sales Breakdown Pills */}
          <div className="grid gap-2 sm:grid-cols-4">
            <div className="bg-muted/40 p-2.5 rounded-lg border text-center">
              <span className="text-[11px] text-muted-foreground">Total Invoices</span>
              <div className="text-base font-bold">{(filteredData.sales || []).length}</div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-lg text-center">
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400">Cash Collections</span>
              <div className="text-base font-bold text-emerald-600">₹{financials.cashSales.toLocaleString()}</div>
            </div>
            <div className="bg-indigo-500/10 border border-indigo-500/20 p-2.5 rounded-lg text-center">
              <span className="text-[11px] text-indigo-700 dark:text-indigo-400">Digital / UPI</span>
              <div className="text-base font-bold text-indigo-600">₹{financials.upiSales.toLocaleString()}</div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg text-center">
              <span className="text-[11px] text-amber-700 dark:text-amber-400">Customer Credit Due</span>
              <div className="text-base font-bold text-amber-600">₹{financials.pendingSalesCredit.toLocaleString()}</div>
            </div>
          </div>

          <Card>
            <CardHeader className="p-3 pb-2 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Sales Invoice Register</CardTitle>
                <CardDescription className="text-xs">
                  Detailed transaction list of all customer invoices for the selected period.
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleExportCSV('sales')}>
                <Download className="h-3 w-3" /> Export CSV
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[130px]">Invoice #</TableHead>
                    <TableHead className="min-w-[150px]">Customer</TableHead>
                    <TableHead className="w-[110px]">Date</TableHead>
                    <TableHead className="w-[90px]">Mode</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[100px] text-right">GST</TableHead>
                    <TableHead className="w-[120px] text-right font-semibold">Total Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && renderSkeleton(5, 7)}
                  {!isLoading && (filteredData.sales || []).map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="font-mono text-xs font-semibold text-primary">
                        <Link href={`/sales/${sale.id}`} className="hover:underline">
                          #{sale.invoiceNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{sale.customerName || 'Walk-in'}</div>
                        {sale.customerMobile && (
                          <div className="text-[11px] text-muted-foreground">{sale.customerMobile}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(sale.date), 'dd-MMM-yyyy')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] h-4 font-normal">
                          {sale.paymentMode || 'Cash'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] h-4 font-normal">
                          {sale.paymentStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        ₹{(Number(sale.gstAmount) || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-bold text-xs whitespace-nowrap">
                        ₹{sale.total.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!isLoading && (filteredData.sales || []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-xs text-muted-foreground">
                        No sales recorded for the selected period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-bold bg-muted/50 text-xs">
                    <TableCell colSpan={5}>Total Sales ({(filteredData.sales || []).length} Invoices)</TableCell>
                    <TableCell className="text-right">₹{financials.taxCollected.toLocaleString()}</TableCell>
                    <TableCell className="text-right">₹{financials.grossSales.toLocaleString()}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─────────────────────────────────────────────────────────────────
            TAB 3: PURCHASES & PROCUREMENT REPORT
        ───────────────────────────────────────────────────────────────── */}
        <TabsContent value="purchases" className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="bg-muted/40 p-2.5 rounded-lg border text-center">
              <span className="text-[11px] text-muted-foreground">Total Invoices</span>
              <div className="text-base font-bold">{(filteredData.purchases || []).length}</div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-lg text-center">
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400">Total Paid to Suppliers</span>
              <div className="text-base font-bold text-emerald-600">₹{financials.purchasesPaid.toLocaleString()}</div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg text-center">
              <span className="text-[11px] text-amber-700 dark:text-amber-400">Supplier Dues Pending</span>
              <div className="text-base font-bold text-amber-600">₹{financials.purchasesDue.toLocaleString()}</div>
            </div>
          </div>

          <Card>
            <CardHeader className="p-3 pb-2 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Purchases &amp; Vendor Register</CardTitle>
                <CardDescription className="text-xs">
                  All procurement entries and supplier payments.
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleExportCSV('purchases')}>
                <Download className="h-3 w-3" /> Export CSV
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[140px]">Invoice #</TableHead>
                    <TableHead className="min-w-[160px]">Supplier / Vendor</TableHead>
                    <TableHead className="w-[120px]">Date</TableHead>
                    <TableHead className="w-[110px]">Payment Status</TableHead>
                    <TableHead className="w-[120px] text-right">Amount Paid</TableHead>
                    <TableHead className="w-[130px] text-right font-semibold">Total Bill</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && renderSkeleton(5, 6)}
                  {!isLoading && (filteredData.purchases || []).map((p) => {
                    const paid = p.amountPaid !== undefined ? Number(p.amountPaid) : (p.paymentStatus === 'Paid' ? p.totalAmount : 0);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs font-semibold text-primary">
                          #{p.invoiceNo}
                        </TableCell>
                        <TableCell className="text-xs font-medium">{p.supplierName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(p.date), 'dd-MMM-yyyy')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] h-4 font-normal">
                            {p.paymentStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs text-emerald-600">
                          ₹{paid.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-bold text-xs whitespace-nowrap">
                          ₹{p.totalAmount.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!isLoading && (filteredData.purchases || []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-xs text-muted-foreground">
                        No purchases found for the selected period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-bold bg-muted/50 text-xs">
                    <TableCell colSpan={4}>Total Purchases</TableCell>
                    <TableCell className="text-right text-emerald-600">₹{financials.purchasesPaid.toLocaleString()}</TableCell>
                    <TableCell className="text-right">₹{financials.totalPurchases.toLocaleString()}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─────────────────────────────────────────────────────────────────
            TAB 4: EXPENSES REPORT
        ───────────────────────────────────────────────────────────────── */}
        <TabsContent value="expenses" className="space-y-3">
          <Card>
            <CardHeader className="p-3 pb-2 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Expense Audit Register</CardTitle>
                <CardDescription className="text-xs">
                  Itemized list of operational disbursements and overhead costs.
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleExportCSV('expenses')}>
                <Download className="h-3 w-3" /> Export CSV
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[130px]">Date</TableHead>
                    <TableHead className="w-[150px]">Category</TableHead>
                    <TableHead>Notes &amp; Description</TableHead>
                    <TableHead className="w-[130px] text-right font-semibold">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && renderSkeleton(5, 4)}
                  {!isLoading && (filteredData.expenses || []).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(e.date), 'dd-MMM-yyyy')}
                      </TableCell>
                      <TableCell className="text-xs font-semibold">{e.expenseType}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.notes || '—'}</TableCell>
                      <TableCell className="text-right font-bold text-xs whitespace-nowrap">
                        ₹{e.amount.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!isLoading && (filteredData.expenses || []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-xs text-muted-foreground">
                        No expenses found for the selected period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-bold bg-muted/50 text-xs">
                    <TableCell colSpan={3}>Total Operating Expenses</TableCell>
                    <TableCell className="text-right">₹{financials.totalExpenses.toLocaleString()}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─────────────────────────────────────────────────────────────────
            TAB 5: STOCK VALUATION & ASSET REPORT
        ───────────────────────────────────────────────────────────────── */}
        <TabsContent value="stock" className="space-y-3">
          {/* Stock Asset Valuation Ribbon */}
          <div className="grid gap-2 sm:grid-cols-4">
            <div className="bg-muted/40 p-2.5 rounded-lg border text-center">
              <span className="text-[11px] text-muted-foreground">Total In-Stock Units</span>
              <div className="text-base font-bold">{financials.totalStockQty.toLocaleString()} units</div>
            </div>
            <div className="bg-indigo-500/10 border border-indigo-500/20 p-2.5 rounded-lg text-center">
              <span className="text-[11px] text-indigo-700 dark:text-indigo-400">Total Asset Value (Cost)</span>
              <div className="text-base font-bold text-indigo-600">₹{financials.stockAssetValueCost.toLocaleString()}</div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-lg text-center">
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400">Retail Sales Potential</span>
              <div className="text-base font-bold text-emerald-600">₹{financials.stockRetailPotential.toLocaleString()}</div>
            </div>
            <div className="bg-cyan-500/10 border border-cyan-500/20 p-2.5 rounded-lg text-center">
              <span className="text-[11px] text-cyan-700 dark:text-cyan-400">Projected Retail Margin</span>
              <div className="text-base font-bold text-cyan-600">₹{financials.projectedStockProfit.toLocaleString()}</div>
            </div>
          </div>

          <Card>
            <CardHeader className="p-3 pb-2 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Inventory Valuation Register</CardTitle>
                <CardDescription className="text-xs">
                  Current physical stock valuation at purchase price and potential sales revenue.
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleExportCSV('stock')}>
                <Download className="h-3 w-3" /> Export CSV
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Product Name</TableHead>
                    <TableHead className="w-[120px]">Category</TableHead>
                    <TableHead className="w-[100px] text-center">Quantity</TableHead>
                    <TableHead className="w-[110px] text-right">Cost Price</TableHead>
                    <TableHead className="w-[110px] text-right">Selling Price</TableHead>
                    <TableHead className="w-[130px] text-right font-semibold">Asset Value (Cost)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && renderSkeleton(5, 6)}
                  {!isLoading && (products || []).map((product) => {
                    const costVal = (product.stockQuantity || 0) * (product.purchasePrice || 0);
                    return (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium text-xs">
                          {product.productName}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {product.category || 'General'}
                        </TableCell>
                        <TableCell className="text-center text-xs font-semibold">
                          {product.stockQuantity <= 3 ? (
                            <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-600 border-rose-500/30">
                              {product.stockQuantity} (Low)
                            </Badge>
                          ) : (
                            <span>{product.stockQuantity}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          ₹{product.purchasePrice.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold">
                          ₹{product.sellingPrice.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-bold text-xs whitespace-nowrap">
                          ₹{costVal.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!isLoading && (products || []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-xs text-muted-foreground">
                        No inventory records found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-bold bg-muted/50 text-xs">
                    <TableCell colSpan={5}>Total Capital in Inventory Asset</TableCell>
                    <TableCell className="text-right">₹{financials.stockAssetValueCost.toLocaleString()}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─────────────────────────────────────────────────────────────────
            TAB 6: GST REPORT (PRESERVED INTACT)
        ───────────────────────────────────────────────────────────────── */}
        <TabsContent value="gst">
          <GSTReport
            allSales={allSales || []}
            allPurchases={allPurchases || []}
            products={products || []}
            vendors={vendors || []}
            companyProfile={companyProfile}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
