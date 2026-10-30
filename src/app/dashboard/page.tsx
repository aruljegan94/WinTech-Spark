'use client';

import { useMemo, useState } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Product, Sale, Expense, Vendor, Purchase, Customer } from '@/lib/types';
import {
  isToday, isThisMonth, format, differenceInCalendarDays, parseISO,
} from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OperationsTrendChart } from './_components/operations-trend-chart';
import {
  TrendingUp, IndianRupee, ArrowUpRight, ArrowDownRight, Receipt, Clock,
  Wallet, CheckCircle2, ChevronRight, Eye, EyeOff, Scale, Plus, Building2,
  Users, Boxes, ShoppingBag, FileText, Calendar, ExternalLink,
  CreditCard, ShieldAlert, ArrowRight, Layers, Tag,
} from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const STATUS_STYLES: Record<string, string> = {
  Paid:    'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  Partial: 'bg-violet-500/15  text-violet-700  dark:text-violet-400  border-violet-500/30',
  Pending: 'bg-amber-500/15   text-amber-700   dark:text-amber-400   border-amber-500/30',
};

function getGstDeadlines(now: Date) {
  const m = now.getMonth();
  const y = now.getFullYear();
  return [
    { label: 'GSTR-1 Return',  date: new Date(y, m + 1, 11), sub: 'Outward supplies statement' },
    { label: 'GSTR-3B Return', date: new Date(y, m + 1, 20), sub: 'Monthly summary & tax settlement' },
  ].filter(g => {
    const d = differenceInCalendarDays(g.date, now);
    return d >= 0 && d <= 30;
  });
}

type PeriodFilter = 'month' | 'all' | 'today';

export default function DashboardPage() {
  const firestore = useFirestore();

  const salesQ     = useMemoFirebase(() => firestore ? collection(firestore, 'sales')     : null, [firestore]);
  const productsQ  = useMemoFirebase(() => firestore ? collection(firestore, 'products')  : null, [firestore]);
  const expensesQ  = useMemoFirebase(() => firestore ? collection(firestore, 'expenses')  : null, [firestore]);
  const vendorsQ   = useMemoFirebase(() => firestore ? collection(firestore, 'vendors')   : null, [firestore]);
  const purchasesQ = useMemoFirebase(() => firestore ? collection(firestore, 'purchases') : null, [firestore]);
  const customersQ = useMemoFirebase(() => firestore ? collection(firestore, 'customers') : null, [firestore]);

  const { data: sales,     isLoading: l1 } = useCollection<Sale>(salesQ);
  const { data: products,  isLoading: l2 } = useCollection<Product>(productsQ);
  const { data: expenses,  isLoading: l3 } = useCollection<Expense>(expensesQ);
  const { data: vendors,   isLoading: l4 } = useCollection<Vendor>(vendorsQ);
  const { data: purchases, isLoading: l5 } = useCollection<Purchase>(purchasesQ);
  const { data: customers, isLoading: l6 } = useCollection<Customer>(customersQ);

  const isLoading = l1 || l2 || l3 || l4 || l5 || l6;

  const [period, setPeriod] = useState<PeriodFilter>('month');
  const [hideConfidential, setHideConfidential] = useState(false);
  const [activityTab, setActivityTab] = useState<'sales' | 'purchases' | 'expenses'>('sales');

  // Comprehensive Operational Statistics
  const stats = useMemo(() => {
    // Helper filter function
    const isWithinPeriod = (dateStr?: string) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      if (period === 'today') return isToday(d);
      if (period === 'month') return isThisMonth(d);
      return true; // 'all'
    };

    // ── 1. Sales & Invoices ──
    const allSales = sales || [];
    const periodSales = allSales.filter(s => isWithinPeriod(s.date));
    const todaySales = allSales.filter(s => isToday(new Date(s.date)));
    const monthSales = allSales.filter(s => isThisMonth(new Date(s.date)));

    const totalSalesAmount = allSales.reduce((acc, s) => acc + (s.total || 0), 0);
    const periodSalesAmount = periodSales.reduce((acc, s) => acc + (s.total || 0), 0);
    const todaySalesAmount = todaySales.reduce((acc, s) => acc + (s.total || 0), 0);
    const monthSalesAmount = monthSales.reduce((acc, s) => acc + (s.total || 0), 0);

    const pendingInvoicesList = allSales.filter(s => s.paymentStatus !== 'Paid');
    const pendingInvoicesCount = pendingInvoicesList.length;
    const pendingInvoicesAmount = pendingInvoicesList.reduce(
      (acc, s) => acc + Math.max(0, (s.total || 0) - (s.amountPaid || 0)),
      0
    );

    const avgInvoiceValue = periodSales.length > 0 ? periodSalesAmount / periodSales.length : 0;

    // ── 2. Purchases & Procurement ──
    const allPurchases = purchases || [];
    const periodPurchases = allPurchases.filter(p => isWithinPeriod(p.date));
    const monthPurchases = allPurchases.filter(p => isThisMonth(new Date(p.date)));

    const totalPurchasesAmount = allPurchases.reduce((acc, p) => acc + (p.totalAmount || 0), 0);
    const periodPurchasesAmount = periodPurchases.reduce((acc, p) => acc + (p.totalAmount || 0), 0);
    const monthPurchasesAmount = monthPurchases.reduce((acc, p) => acc + (p.totalAmount || 0), 0);

    const pendingPurchasesList = allPurchases.filter(p => p.paymentStatus !== 'Paid');
    const pendingPurchasesCount = pendingPurchasesList.length;
    const pendingPurchasesAmount = pendingPurchasesList.reduce(
      (acc, p) => acc + Math.max(0, (p.totalAmount || 0) - (p.amountPaid || 0)),
      0
    );

    // ── 3. Operating Expenses ──
    const allExpenses = expenses || [];
    const periodExpenses = allExpenses.filter(e => isWithinPeriod(e.date));
    const monthExpenses = allExpenses.filter(e => isThisMonth(new Date(e.date)));

    const totalExpensesAmount = allExpenses.reduce((acc, e) => acc + (e.amount || 0), 0);
    const periodExpensesAmount = periodExpenses.reduce((acc, e) => acc + (e.amount || 0), 0);
    const monthExpensesAmount = monthExpenses.reduce((acc, e) => acc + (e.amount || 0), 0);

    // ── 4. Products & Inventory ──
    const allProducts = products || [];
    const totalProductCount = allProducts.length;
    const totalStockUnits = allProducts.reduce((acc, p) => acc + (p.stockQuantity || 0), 0);
    const totalStockValuation = allProducts.reduce(
      (acc, p) => acc + ((p.purchasePrice || 0) * (p.stockQuantity || 0)),
      0
    );
    const categoriesSet = new Set(allProducts.map(p => p.category?.trim()).filter(Boolean));
    const categoryCount = categoriesSet.size;

    // ── 5. Customers ──
    const allCustomers = customers || [];
    const totalCustomersCount = allCustomers.length;
    const customersWithDue = allCustomers.filter(c => (c.pendingDue || 0) > 0);
    const totalCustomerDue = customersWithDue.reduce((acc, c) => acc + (c.pendingDue || 0), 0);

    // ── 6. Vendors ──
    const allVendors = vendors || [];
    const totalVendorsCount = allVendors.length;
    const vendorsWithDue = allVendors.filter(v => (v.pendingAmount || 0) > 0);
    const totalVendorPayables = vendorsWithDue.reduce((acc, v) => acc + (v.pendingAmount || 0), 0);

    // ── 7. Profit & Loss (COGS) ──
    const productCostMap = new Map<string, number>();
    allProducts.forEach(p => {
      productCostMap.set(p.id, p.purchasePrice || 0);
      if (p.productName) {
        productCostMap.set(p.productName.toLowerCase().trim(), p.purchasePrice || 0);
      }
    });

    let periodCogs = 0;
    let periodOutputGst = 0;
    periodSales.forEach(s => {
      periodOutputGst += s.gstAmount || 0;
      s.items?.forEach(item => {
        const cost =
          productCostMap.get(item.productId) ??
          productCostMap.get(item.productName?.toLowerCase().trim()) ??
          ((item.price || 0) * 0.7);
        periodCogs += cost * (item.quantity || 1);
      });
    });

    const grossProfit = periodSalesAmount - periodCogs;
    const grossMarginPct = periodSalesAmount > 0 ? (grossProfit / periodSalesAmount) * 100 : 0;
    const netProfit = grossProfit - periodExpensesAmount;
    const netMarginPct = periodSalesAmount > 0 ? (netProfit / periodSalesAmount) * 100 : 0;

    // GST estimation (approximate ITC at 18% standard)
    const periodInputGst = periodPurchases.reduce((acc, p) => acc + ((p.totalAmount || 0) * 0.18 / 1.18), 0);
    const estGstPayable = Math.max(0, periodOutputGst - periodInputGst);

    // Net Cashflow Flow
    const netCashFlow = periodSalesAmount - periodPurchasesAmount - periodExpensesAmount;

    // Activity feeds sorted by date desc
    const recentSales = [...allSales]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 6);

    const recentPurchases = [...allPurchases]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 6);

    const recentExpenses = [...allExpenses]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 6);

    return {
      // Sales
      allSalesCount: allSales.length,
      periodSalesCount: periodSales.length,
      todaySalesCount: todaySales.length,
      monthSalesCount: monthSales.length,
      totalSalesAmount,
      periodSalesAmount,
      todaySalesAmount,
      monthSalesAmount,
      pendingInvoicesCount,
      pendingInvoicesAmount,
      avgInvoiceValue,

      // Purchases
      allPurchasesCount: allPurchases.length,
      periodPurchasesCount: periodPurchases.length,
      monthPurchasesCount: monthPurchases.length,
      totalPurchasesAmount,
      periodPurchasesAmount,
      monthPurchasesAmount,
      pendingPurchasesCount,
      pendingPurchasesAmount,

      // Expenses
      allExpensesCount: allExpenses.length,
      periodExpensesCount: periodExpenses.length,
      monthExpensesCount: monthExpenses.length,
      totalExpensesAmount,
      periodExpensesAmount,
      monthExpensesAmount,

      // Products
      totalProductCount,
      totalStockUnits,
      totalStockValuation,
      categoryCount,

      // Customers & Vendors
      totalCustomersCount,
      customersWithDueCount: customersWithDue.length,
      totalCustomerDue: totalCustomerDue > 0 ? totalCustomerDue : pendingInvoicesAmount,
      totalVendorsCount,
      vendorsWithDueCount: vendorsWithDue.length,
      totalVendorPayables: totalVendorPayables > 0 ? totalVendorPayables : pendingPurchasesAmount,

      // P&L & Cashflow
      periodCogs,
      grossProfit,
      grossMarginPct,
      netProfit,
      netMarginPct,
      periodOutputGst,
      periodInputGst,
      estGstPayable,
      netCashFlow,

      // Activity
      recentSales,
      recentPurchases,
      recentExpenses,
    };
  }, [sales, purchases, expenses, products, customers, vendors, period]);

  // Operational Action Alerts & Deadlines (NO low stock alerts)
  const alerts = useMemo(() => {
    const now = new Date();
    const list: {
      id: string;
      title: string;
      subtitle: string;
      badgeText: string;
      dueDate?: Date;
      days: number;
      href: string;
      urgency: 'critical' | 'warning' | 'info';
      type: 'purchase' | 'customer' | 'gst' | 'vendor';
    }[] = [];

    // 1. Pending Purchases with Due Dates or Pending Status
    purchases
      ?.filter(p => p.paymentStatus !== 'Paid')
      .slice(0, 10)
      .forEach(p => {
        const remaining = Math.max(0, (p.totalAmount || 0) - (p.amountPaid || 0));
        if (remaining <= 0) return;

        let days = 0;
        let badgeText = 'Pending Bill';
        let urgency: 'critical' | 'warning' | 'info' = 'warning';

        if (p.dueDate) {
          const due = parseISO(p.dueDate);
          days = differenceInCalendarDays(due, now);
          if (days < 0) {
            badgeText = `${Math.abs(days)}d Overdue`;
            urgency = 'critical';
          } else if (days === 0) {
            badgeText = 'Due Today';
            urgency = 'critical';
          } else {
            badgeText = `Due in ${days}d`;
            urgency = days <= 3 ? 'critical' : 'warning';
          }
        }

        list.push({
          id: `purch-${p.id}`,
          title: p.supplierName || 'Vendor Purchase',
          subtitle: `₹${remaining.toLocaleString('en-IN')} pending bill #${p.invoiceNo || p.id.slice(0, 6)}`,
          badgeText,
          days,
          href: `/purchases`,
          urgency,
          type: 'purchase',
        });
      });

    // 2. Pending Customer Invoices with Credit / Due
    sales
      ?.filter(s => s.paymentStatus !== 'Paid')
      .slice(0, 10)
      .forEach(s => {
        const remaining = Math.max(0, (s.total || 0) - (s.amountPaid || 0));
        if (remaining <= 0) return;

        let days = 0;
        let badgeText = 'To Collect';
        let urgency: 'critical' | 'warning' | 'info' = 'warning';

        if (s.dueDate) {
          const due = parseISO(s.dueDate);
          days = differenceInCalendarDays(due, now);
          if (days < 0) {
            badgeText = `${Math.abs(days)}d Overdue`;
            urgency = 'critical';
          } else if (days === 0) {
            badgeText = 'Due Today';
            urgency = 'critical';
          } else {
            badgeText = `In ${days}d`;
            urgency = days <= 3 ? 'critical' : 'warning';
          }
        }

        list.push({
          id: `sale-${s.id}`,
          title: s.customerName || 'Customer Invoice',
          subtitle: `₹${remaining.toLocaleString('en-IN')} receivable #${s.invoiceNumber || s.id.slice(0, 6)}`,
          badgeText,
          days,
          href: `/sales`,
          urgency,
          type: 'customer',
        });
      });

    // 3. GST Deadlines
    getGstDeadlines(now).forEach((g, i) => {
      const days = differenceInCalendarDays(g.date, now);
      list.push({
        id: `gst-${i}`,
        title: g.label,
        subtitle: g.sub,
        badgeText: days === 0 ? 'Due Today' : `In ${days} days`,
        days,
        href: '/reports',
        urgency: days <= 3 ? 'critical' : days <= 7 ? 'warning' : 'info',
        type: 'gst',
      });
    });

    return list.sort((a, b) => a.days - b.days).slice(0, 7);
  }, [purchases, sales]);

  return (
    <div className="space-y-5 pb-10">

      {/* ══════════════════════════════════════════════
          PAGE HEADER & COMMAND BAR
         ══════════════════════════════════════════════ */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-1 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Operations Dashboard
            </h1>
            <Badge variant="outline" className="text-[11px] font-mono px-2 py-0.5 bg-primary/5 text-primary border-primary/20">
              Live Operations
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Holistic summary of billing, procurements, expenses, directory masters & cashflow.
          </p>
        </div>

        {/* Toolbar: Filters & Quick Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Period Toggle Pills */}
          <div className="flex items-center bg-muted/60 dark:bg-muted/40 p-1 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => setPeriod('today')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                period === 'today'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setPeriod('month')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                period === 'month'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => setPeriod('all')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                period === 'all'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All Time
            </button>
          </div>

          {/* Privacy Toggle Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setHideConfidential(!hideConfidential)}
            className="h-8.5 gap-1.5 text-xs rounded-lg border-border/80 hover:bg-muted"
            title="Mask profit and internal costs when customers are facing the counter"
          >
            {hideConfidential ? (
              <>
                <EyeOff className="h-3.5 w-3.5 text-amber-500" />
                <span>Masked: ON</span>
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Counter Privacy</span>
              </>
            )}
          </Button>

          {/* Quick Action: New Invoice */}
          <Button
            asChild
            size="sm"
            className="h-8.5 gap-1.5 text-xs font-semibold rounded-lg shadow-sm"
          >
            <Link href="/sales/new">
              <Plus className="h-3.5 w-3.5" />
              <span>+ New Invoice</span>
            </Link>
          </Button>

          {/* Quick Action: New Purchase */}
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-8.5 gap-1.5 text-xs rounded-lg border-border/80 hover:bg-muted"
          >
            <Link href="/purchases/new">
              <ShoppingBag className="h-3.5 w-3.5 text-sky-600" />
              <span>+ Purchase</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          PRIMARY OPERATIONAL SCORECARDS (6 CORE METRICS)
         ══════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">

        {/* 1. SALES & INVOICES */}
        <Link
          href="/sales"
          className="group rounded-xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 via-card to-card p-4 flex flex-col justify-between hover:border-indigo-500/40 hover:shadow-xs transition-all relative"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Sales Revenue
            </span>
            <div className="h-7 w-7 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <TrendingUp className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="my-2">
            {isLoading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              <div className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight font-mono">
                ₹{stats.periodSalesAmount.toLocaleString('en-IN')}
              </div>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1 border-t border-border/40">
            <span className="font-medium text-foreground">
              {stats.periodSalesCount} Invoices
            </span>
            <span className="text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform flex items-center">
              Sales <ChevronRight className="h-3 w-3 inline" />
            </span>
          </div>
        </Link>

        {/* 2. PURCHASES (PROCUREMENT) */}
        <Link
          href="/purchases"
          className="group rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/5 via-card to-card p-4 flex flex-col justify-between hover:border-sky-500/40 hover:shadow-xs transition-all relative"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Purchases
            </span>
            <div className="h-7 w-7 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <ShoppingBag className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="my-2">
            {isLoading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              <div className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight font-mono">
                {hideConfidential ? '••••••' : `₹${stats.periodPurchasesAmount.toLocaleString('en-IN')}`}
              </div>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1 border-t border-border/40">
            <span className="font-medium text-foreground">
              {stats.periodPurchasesCount} Bills
            </span>
            <span className="text-sky-600 dark:text-sky-400 group-hover:translate-x-0.5 transition-transform flex items-center">
              Purchases <ChevronRight className="h-3 w-3 inline" />
            </span>
          </div>
        </Link>

        {/* 3. OPERATING EXPENSES */}
        <Link
          href="/expenses"
          className="group rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-card to-card p-4 flex flex-col justify-between hover:border-amber-500/40 hover:shadow-xs transition-all relative"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Expenses
            </span>
            <div className="h-7 w-7 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Receipt className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="my-2">
            {isLoading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              <div className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight font-mono">
                {hideConfidential ? '••••••' : `₹${stats.periodExpensesAmount.toLocaleString('en-IN')}`}
              </div>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1 border-t border-border/40">
            <span className="font-medium text-foreground">
              {stats.periodExpensesCount} Entries
            </span>
            <span className="text-amber-600 dark:text-amber-400 group-hover:translate-x-0.5 transition-transform flex items-center">
              Expenses <ChevronRight className="h-3 w-3 inline" />
            </span>
          </div>
        </Link>

        {/* 4. NET PROFIT / MARGIN */}
        <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-card to-card p-4 flex flex-col justify-between hover:border-emerald-500/40 hover:shadow-xs transition-all relative">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Net Profit (P&L)
            </span>
            <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${
              stats.netProfit >= 0
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
            }`}>
              <Scale className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="my-2">
            {isLoading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              <div className={`text-xl sm:text-2xl font-extrabold tracking-tight font-mono ${
                stats.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}>
                {hideConfidential ? '••••••' : `₹${stats.netProfit.toLocaleString('en-IN')}`}
              </div>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1 border-t border-border/40">
            <span>Margin:</span>
            <span className={`font-mono font-bold ${
              stats.netMarginPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}>
              {hideConfidential ? '••••••' : `${stats.netMarginPct.toFixed(1)}%`}
            </span>
          </div>
        </div>

        {/* 5. PENDING INVOICES (CUSTOMER RECEIVABLES) */}
        <Link
          href="/customers"
          className="group rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/5 via-card to-card p-4 flex flex-col justify-between hover:border-violet-500/40 hover:shadow-xs transition-all relative"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Pending Invoices
            </span>
            <div className="h-7 w-7 rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400 flex items-center justify-center">
              <Users className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="my-2">
            {isLoading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              <div className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight font-mono text-violet-600 dark:text-violet-400">
                ₹{stats.pendingInvoicesAmount.toLocaleString('en-IN')}
              </div>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1 border-t border-border/40">
            <span className="font-medium text-foreground">
              {stats.pendingInvoicesCount} Unpaid
            </span>
            <span className="text-violet-600 dark:text-violet-400 group-hover:translate-x-0.5 transition-transform flex items-center">
              Collect <ChevronRight className="h-3 w-3 inline" />
            </span>
          </div>
        </Link>

        {/* 6. PENDING PURCHASES (VENDOR PAYABLES) */}
        <Link
          href="/vendors"
          className="group rounded-xl border border-rose-500/20 bg-gradient-to-br from-rose-500/5 via-card to-card p-4 flex flex-col justify-between hover:border-rose-500/40 hover:shadow-xs transition-all relative"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Pending Purchases
            </span>
            <div className="h-7 w-7 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <Building2 className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="my-2">
            {isLoading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              <div className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight font-mono text-rose-600 dark:text-rose-400">
                ₹{stats.pendingPurchasesAmount.toLocaleString('en-IN')}
              </div>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1 border-t border-border/40">
            <span className="font-medium text-foreground">
              {stats.pendingPurchasesCount} Unsettled
            </span>
            <span className="text-rose-600 dark:text-rose-400 group-hover:translate-x-0.5 transition-transform flex items-center">
              Payables <ChevronRight className="h-3 w-3 inline" />
            </span>
          </div>
        </Link>

      </div>

      {/* ══════════════════════════════════════════════
          MASTER DIRECTORY SUMMARY BAR
          (Products, Customers, Vendors, Inventory Assets & GST)
         ══════════════════════════════════════════════ */}
      <div className="rounded-xl border border-border/80 bg-card p-3 shadow-xs">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 divide-y sm:divide-y-0 sm:divide-x divide-border/60">

          {/* Directory: Products & Stock */}
          <Link
            href="/products"
            className="group px-2 pt-2 sm:pt-0 flex items-center gap-3 hover:bg-muted/30 rounded-lg p-1.5 transition-colors"
          >
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Boxes className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                <span>Products Catalog</span>
                <ChevronRight className="h-3 w-3 text-muted-foreground/60 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <div className="font-bold text-sm text-foreground flex items-baseline gap-1.5 font-mono">
                <span>{stats.totalProductCount}</span>
                <span className="text-[11px] font-normal text-muted-foreground">items</span>
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                {stats.totalStockUnits.toLocaleString('en-IN')} units in stock
              </div>
            </div>
          </Link>

          {/* Directory: Customers */}
          <Link
            href="/customers"
            className="group px-2 pt-2 sm:pt-0 flex items-center gap-3 hover:bg-muted/30 rounded-lg p-1.5 transition-colors"
          >
            <div className="h-9 w-9 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
              <Users className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                <span>Total Customers</span>
                <ChevronRight className="h-3 w-3 text-muted-foreground/60 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <div className="font-bold text-sm text-foreground flex items-baseline gap-1.5 font-mono">
                <span>{stats.totalCustomersCount}</span>
                <span className="text-[11px] font-normal text-muted-foreground">registered</span>
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                {stats.customersWithDueCount > 0 ? (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    {stats.customersWithDueCount} with credit balance
                  </span>
                ) : (
                  <span>All balances clear</span>
                )}
              </div>
            </div>
          </Link>

          {/* Directory: Vendors */}
          <Link
            href="/vendors"
            className="group px-2 pt-2 sm:pt-0 flex items-center gap-3 hover:bg-muted/30 rounded-lg p-1.5 transition-colors"
          >
            <div className="h-9 w-9 rounded-lg bg-sky-500/10 text-sky-600 flex items-center justify-center shrink-0">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                <span>Active Vendors</span>
                <ChevronRight className="h-3 w-3 text-muted-foreground/60 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <div className="font-bold text-sm text-foreground flex items-baseline gap-1.5 font-mono">
                <span>{stats.totalVendorsCount}</span>
                <span className="text-[11px] font-normal text-muted-foreground">suppliers</span>
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                {stats.vendorsWithDueCount > 0 ? (
                  <span className="text-rose-600 dark:text-rose-400 font-medium">
                    {stats.vendorsWithDueCount} active payables
                  </span>
                ) : (
                  <span>0 vendor dues</span>
                )}
              </div>
            </div>
          </Link>

          {/* Financial: Inventory Valuation */}
          <div className="px-2 pt-2 sm:pt-0 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
              <Wallet className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-muted-foreground font-medium">
                Stock Valuation (Cost)
              </div>
              <div className="font-bold text-sm text-foreground font-mono">
                {hideConfidential ? '••••••' : `₹${stats.totalStockValuation.toLocaleString('en-IN')}`}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                {stats.categoryCount} active categories
              </div>
            </div>
          </div>

          {/* Compliance: GST Position */}
          <Link
            href="/reports"
            className="group px-2 pt-2 sm:pt-0 flex items-center gap-3 hover:bg-muted/30 rounded-lg p-1.5 transition-colors"
          >
            <div className="h-9 w-9 rounded-lg bg-violet-500/10 text-violet-600 flex items-center justify-center shrink-0">
              <Scale className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                <span>Est. Net GST Due</span>
                <ChevronRight className="h-3 w-3 text-muted-foreground/60 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <div className="font-bold text-sm text-foreground font-mono">
                ₹{stats.estGstPayable.toLocaleString('en-IN')}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                Output vs Input ITC
              </div>
            </div>
          </Link>

        </div>
      </div>

      {/* ══════════════════════════════════════════════
          TRENDS & OPERATIONAL PULSE (2-COLUMN GRID)
         ══════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* LEFT: MULTI-SERIES OPERATIONS TREND (7 COLS) */}
        <div className="lg:col-span-7 rounded-xl border border-border/80 bg-card p-4.5 flex flex-col shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span>Operations & Cashflow Trend</span>
                <Badge variant="secondary" className="text-[10px] font-normal py-0">
                  Sales vs Purchases vs Expenses
                </Badge>
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Month-by-month financial movement across the year
              </p>
            </div>
            <Link
              href="/analysis"
              className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
            >
              <span>Full Analytics</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          {/* Embedded Operations Trend Chart */}
          <div className="flex-1 mt-1">
            <OperationsTrendChart
              sales={sales}
              purchases={purchases}
              expenses={expenses}
              hideConfidential={hideConfidential}
            />
          </div>
        </div>

        {/* RIGHT: ACTION DEADLINES & REMINDERS (5 COLS) */}
        <div className="lg:col-span-5 rounded-xl border border-border/80 bg-card p-4.5 flex flex-col shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-primary" />
                <span>Action Alerts & Deadlines</span>
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Pending bills, customer collections & compliance dates
              </p>
            </div>
            <Badge variant="outline" className="text-[11px] font-mono px-2">
              {alerts.length} Active
            </Badge>
          </div>

          {/* Alerts List */}
          <div className="flex-1 space-y-2 overflow-y-auto max-h-[360px] pr-0.5">
            {alerts.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-center p-4">
                <CheckCircle2 className="h-8 w-8 text-emerald-500/80 mb-2" />
                <p className="text-xs font-semibold text-foreground">All Clear & Up-to-date</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 max-w-[200px]">
                  No overdue bills, customer dues, or immediate statutory deadlines.
                </p>
              </div>
            ) : (
              alerts.map(item => {
                const isCritical = item.urgency === 'critical';
                const isWarning = item.urgency === 'warning';

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border/60 hover:border-primary/40 hover:bg-muted/40 transition-all text-xs group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${
                        item.type === 'gst'
                          ? 'bg-violet-500/10 text-violet-600'
                          : item.type === 'purchase'
                          ? 'bg-rose-500/10 text-rose-600'
                          : 'bg-indigo-500/10 text-indigo-600'
                      }`}>
                        {item.type === 'gst' ? (
                          <FileText className="h-3.5 w-3.5" />
                        ) : item.type === 'purchase' ? (
                          <Building2 className="h-3.5 w-3.5" />
                        ) : (
                          <Receipt className="h-3.5 w-3.5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {item.subtitle}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        isCritical
                          ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30'
                          : isWarning
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
                          : 'bg-muted text-muted-foreground border-border'
                      }`}>
                        {item.badgeText}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          {/* Quick link to reports */}
          <div className="mt-3 pt-2.5 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
            <span>Filing & Tax Schedule</span>
            <Link href="/reports" className="text-primary hover:underline font-medium inline-flex items-center gap-1">
              <span>GST Reports</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

      </div>

      {/* ══════════════════════════════════════════════
          RECENT OPERATIONAL ACTIVITY FEED (TABBED)
         ══════════════════════════════════════════════ */}
      <div className="rounded-xl border border-border/80 bg-card p-4.5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Recent Operational Transactions
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Real-time audit log of latest sales invoices, purchases, and expenses
            </p>
          </div>

          {/* Filter Tab Buttons */}
          <div className="flex items-center gap-1.5 p-1 bg-muted/60 dark:bg-muted/40 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => setActivityTab('sales')}
              className={`px-3 py-1 rounded-md transition-all ${
                activityTab === 'sales'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Recent Invoices ({stats.allSalesCount})
            </button>
            <button
              type="button"
              onClick={() => setActivityTab('purchases')}
              className={`px-3 py-1 rounded-md transition-all ${
                activityTab === 'purchases'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Recent Purchases ({stats.allPurchasesCount})
            </button>
            <button
              type="button"
              onClick={() => setActivityTab('expenses')}
              className={`px-3 py-1 rounded-md transition-all ${
                activityTab === 'expenses'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Recent Expenses ({stats.allExpensesCount})
            </button>
          </div>
        </div>

        {/* Tab 1: Recent Invoices */}
        {activityTab === 'sales' && (
          <div className="pt-3">
            {stats.recentSales.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                No invoices generated yet.
              </p>
            ) : (
              <div className="divide-y divide-border/40">
                {stats.recentSales.map(sale => (
                  <Link
                    key={sale.id}
                    href={`/sales/${sale.id}`}
                    className="py-2.5 flex items-center justify-between hover:bg-muted/30 px-2 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center shrink-0">
                        <Receipt className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                          {sale.customerName || 'Walk-in Customer'}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                          <span>#{sale.invoiceNumber || sale.id.slice(0, 8)}</span>
                          <span>•</span>
                          <span>{sale.date ? format(new Date(sale.date), 'dd MMM, hh:mm a') : '—'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        STATUS_STYLES[sale.paymentStatus] || STATUS_STYLES.Pending
                      }`}>
                        {sale.paymentStatus || 'Paid'}
                      </span>
                      <span className="text-xs font-bold text-foreground font-mono">
                        ₹{(sale.total || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            <div className="pt-3 text-right">
              <Link href="/sales" className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1">
                <span>View all invoices</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        )}

        {/* Tab 2: Recent Purchases */}
        {activityTab === 'purchases' && (
          <div className="pt-3">
            {stats.recentPurchases.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                No purchase bills recorded yet.
              </p>
            ) : (
              <div className="divide-y divide-border/40">
                {stats.recentPurchases.map(purch => (
                  <Link
                    key={purch.id}
                    href={`/purchases`}
                    className="py-2.5 flex items-center justify-between hover:bg-muted/30 px-2 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-sky-500/10 text-sky-600 flex items-center justify-center shrink-0">
                        <ShoppingBag className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                          {purch.supplierName || 'Vendor Bill'}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                          <span>Inv #{purch.invoiceNo || purch.id.slice(0, 8)}</span>
                          <span>•</span>
                          <span>{purch.date ? format(new Date(purch.date), 'dd MMM yyyy') : '—'}</span>
                          <span>•</span>
                          <span>{purch.items?.length || 0} items</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        STATUS_STYLES[purch.paymentStatus] || STATUS_STYLES.Pending
                      }`}>
                        {purch.paymentStatus || 'Pending'}
                      </span>
                      <span className="text-xs font-bold text-foreground font-mono">
                        {hideConfidential ? '••••••' : `₹${(purch.totalAmount || 0).toLocaleString('en-IN')}`}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            <div className="pt-3 text-right">
              <Link href="/purchases" className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1">
                <span>View all purchase bills</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        )}

        {/* Tab 3: Recent Expenses */}
        {activityTab === 'expenses' && (
          <div className="pt-3">
            {stats.recentExpenses.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                No expense entries recorded yet.
              </p>
            ) : (
              <div className="divide-y divide-border/40">
                {stats.recentExpenses.map(exp => (
                  <Link
                    key={exp.id}
                    href={`/expenses`}
                    className="py-2.5 flex items-center justify-between hover:bg-muted/30 px-2 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                        <Receipt className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                          {exp.expenseType || 'General Expense'}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                          <span>{exp.notes || 'Store Operating Expense'}</span>
                          <span>•</span>
                          <span>{exp.date ? format(new Date(exp.date), 'dd MMM yyyy') : '—'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-foreground font-mono">
                        {hideConfidential ? '••••••' : `₹${(exp.amount || 0).toLocaleString('en-IN')}`}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            <div className="pt-3 text-right">
              <Link href="/expenses" className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1">
                <span>Manage all expenses</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
