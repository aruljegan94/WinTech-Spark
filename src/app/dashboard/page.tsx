'use client';

import { useMemo } from 'react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Product, Sale, Expense, Vendor, Purchase } from '@/lib/types';
import {
  isToday, isThisMonth, format, differenceInCalendarDays, parseISO,
} from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { SalesChart } from './_components/sales-chart';
import {
  TrendingUp, IndianRupee, ShoppingBag, Package2,
  ArrowUpRight, Receipt, Clock, CircleDollarSign,
  Boxes, BadgePercent, BellRing, AlertTriangle,
  CalendarClock, FileText, Building2, Wallet, CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const STATUS_STYLES: Record<string, string> = {
  Paid:    'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25',
  Partial: 'bg-violet-500/15  text-violet-700  dark:text-violet-400  border-violet-500/25',
  Pending: 'bg-amber-500/15   text-amber-700   dark:text-amber-400   border-amber-500/25',
};

function getGstAlerts(now: Date) {
  const m = now.getMonth();
  const y = now.getFullYear();
  return [
    { label: 'GSTR-1 Deadline',  date: new Date(y, m + 1, 11) },
    { label: 'GSTR-3B Deadline', date: new Date(y, m + 1, 20) },
  ].filter(g => {
    const d = differenceInCalendarDays(g.date, now);
    return d >= 0 && d <= 30;
  });
}

export default function DashboardPage() {
  const firestore = useFirestore();

  const salesQ     = useMemoFirebase(() => firestore ? collection(firestore, 'sales')     : null, [firestore]);
  const productsQ  = useMemoFirebase(() => firestore ? collection(firestore, 'products')  : null, [firestore]);
  const expensesQ  = useMemoFirebase(() => firestore ? collection(firestore, 'expenses')  : null, [firestore]);
  const vendorsQ   = useMemoFirebase(() => firestore ? collection(firestore, 'vendors')   : null, [firestore]);
  const purchasesQ = useMemoFirebase(() => firestore ? collection(firestore, 'purchases') : null, [firestore]);

  const { data: sales,     isLoading: l1 } = useCollection<Sale>(salesQ);
  const { data: products,  isLoading: l2 } = useCollection<Product>(productsQ);
  const { data: expenses,  isLoading: l3 } = useCollection<Expense>(expensesQ);
  const { data: vendors,   isLoading: l4 } = useCollection<Vendor>(vendorsQ);
  const { data: purchases, isLoading: l5 } = useCollection<Purchase>(purchasesQ);

  const isLoading = l1 || l2 || l3 || l4 || l5;

  const stats = useMemo(() => {
    const totalSalesToday = sales?.filter(s => isToday(new Date(s.date))).reduce((a, s) => a + s.total, 0) ?? 0;
    const monthlySales    = sales?.filter(s => isThisMonth(new Date(s.date))).reduce((a, s) => a + s.total, 0) ?? 0;
    const totalExpenses   = expenses?.filter(e => isThisMonth(new Date(e.date))).reduce((a, e) => a + e.amount, 0) ?? 0;
    const stockValue      = products?.reduce((a, p) => a + p.purchasePrice * p.stockQuantity, 0) ?? 0;
    const mthList         = sales?.filter(s => isThisMonth(new Date(s.date))) ?? [];
    const paidCount       = mthList.filter(s => s.paymentStatus === 'Paid').length;
    const pendingCount    = mthList.filter(s => s.paymentStatus !== 'Paid').length;
    const pendingValue    = mthList.filter(s => s.paymentStatus !== 'Paid')
                              .reduce((a, s) => a + Math.max(0, s.total - (s.amountPaid ?? 0)), 0);
    const recentSales     = sales
      ? [...sales].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10)
      : [];
    const lowStock   = products?.filter(p => p.stockQuantity > 0 && p.stockQuantity <= 5) ?? [];
    const outOfStock = products?.filter(p => p.stockQuantity === 0).length ?? 0;
    const netMargin  = Math.max(0, monthlySales - totalExpenses);

    return {
      totalSalesToday, monthlySales, totalExpenses, stockValue,
      paidCount, pendingCount, pendingValue, recentSales,
      lowStock, outOfStock, netMargin, mthCount: mthList.length,
    };
  }, [sales, products, expenses]);

  const alerts = useMemo(() => {
    const now  = new Date();
    const list: {
      id: string; label: string; sub: string; date: Date;
      days: number; href: string; urgency: 'critical' | 'warning' | 'info'; Icon: any;
    }[] = [];

    const push = (id: string, label: string, sub: string, date: Date, href: string, Icon: any) => {
      const days    = differenceInCalendarDays(date, now);
      if (days < -7 || days > 30) return;
      const urgency = days < 0 ? 'critical' : days <= 3 ? 'critical' : days <= 7 ? 'warning' : 'info';
      list.push({ id, label, sub, date, days, href, urgency, Icon });
    };

    vendors?.filter(v => v.pendingAmount > 0).forEach(v =>
      push(`v-${v.id}`, v.name, `₹${v.pendingAmount.toLocaleString('en-IN')} vendor balance`, now, '/vendors', Building2)
    );
    purchases?.filter(p => p.paymentStatus !== 'Paid' && p.dueDate).forEach(p =>
      push(`p-${p.id}`, p.supplierName, `₹${(p.totalAmount - p.amountPaid).toLocaleString('en-IN')} purchase due`, parseISO(p.dueDate!), '/purchases', Wallet)
    );
    sales?.filter(s => s.paymentStatus !== 'Paid' && s.dueDate).forEach(s =>
      push(`s-${s.id}`, s.customerName || 'Customer', `₹${Math.max(0, s.total - (s.amountPaid ?? s.total)).toLocaleString('en-IN')} to collect`, parseISO(s.dueDate!), `/sales/${s.id}`, Receipt)
    );
    getGstAlerts(now).forEach((g, i) =>
      push(`gst-${i}`, g.label, 'GST Compliance', g.date, '/reports', FileText)
    );

    return list.sort((a, b) => a.days - b.days).slice(0, 7);
  }, [vendors, purchases, sales]);

  const urgencyGrad = {
    critical: 'from-rose-600 to-red-700',
    warning:  'from-amber-500 to-orange-600',
    info:     'from-blue-600 to-indigo-700',
  };
  const urgencyLabel = {
    critical: (d: number) => d < 0 ? 'Overdue!' : d === 0 ? 'Today!' : `${d}d left`,
    warning:  (d: number) => `${d}d left`,
    info:     (d: number) => `${d}d`,
  };

  return (
    /* Full-height flex column — fills the scrollable main pane */
    <div className="flex flex-col gap-3 min-h-full">

      {/* ══════════════════════════════════════════════
          ROW 1 — 4 Cohesive Matte KPI cards
         ══════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">

        {/* Today's Sales */}
        <div className="rounded-xl bg-card border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-4 flex flex-col gap-3 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between relative">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Today's Sales</span>
            <div className="h-8 w-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          {isLoading
            ? <Skeleton className="h-9 w-36" />
            : <div className="text-3xl font-extrabold text-foreground leading-none tracking-tight font-mono relative">
                ₹{stats.totalSalesToday.toLocaleString('en-IN')}
              </div>
          }
          <p className="text-xs text-muted-foreground relative">Revenue collected today</p>
        </div>

        {/* Monthly Sales */}
        <div className="rounded-xl bg-card border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-card to-card p-4 flex flex-col gap-3 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between relative">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">This Month</span>
            <div className="h-8 w-8 rounded-lg bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 flex items-center justify-center">
              <IndianRupee className="h-4 w-4" />
            </div>
          </div>
          {isLoading
            ? <Skeleton className="h-9 w-36" />
            : <div className="text-3xl font-extrabold text-foreground leading-none tracking-tight font-mono relative">
                ₹{stats.monthlySales.toLocaleString('en-IN')}
              </div>
          }
          <p className="text-xs text-muted-foreground relative">{stats.paidCount} paid · {stats.pendingCount} pending</p>
        </div>

        {/* Expenses */}
        <div className="rounded-xl bg-card border border-rose-500/25 bg-gradient-to-br from-rose-500/10 via-card to-card p-4 flex flex-col gap-3 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between relative">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Expenses</span>
            <div className="h-8 w-8 rounded-lg bg-rose-500/15 text-rose-500 dark:text-rose-400 flex items-center justify-center">
              <Wallet className="h-4 w-4" />
            </div>
          </div>
          {isLoading
            ? <Skeleton className="h-9 w-36" />
            : <div className="text-3xl font-extrabold text-foreground leading-none tracking-tight font-mono relative">
                ₹{stats.totalExpenses.toLocaleString('en-IN')}
              </div>
          }
          <p className="text-xs text-muted-foreground relative">Month-to-date spend</p>
        </div>

        {/* Stock Value */}
        <div className="rounded-xl bg-card border border-cyan-500/25 bg-gradient-to-br from-cyan-500/10 via-card to-card p-4 flex flex-col gap-3 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between relative">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Stock Value</span>
            <div className="h-8 w-8 rounded-lg bg-cyan-500/15 text-cyan-500 dark:text-cyan-400 flex items-center justify-center">
              <Boxes className="h-4 w-4" />
            </div>
          </div>
          {isLoading
            ? <Skeleton className="h-9 w-36" />
            : <div className="text-3xl font-extrabold text-foreground leading-none tracking-tight font-mono relative">
                ₹{stats.stockValue.toLocaleString('en-IN')}
              </div>
          }
          <p className="text-xs text-muted-foreground relative">{stats.outOfStock} out of stock</p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          ROW 2 — 4 mini stat chips
         ══════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">

        <div className="rounded-xl bg-card border border-border/70 px-4 py-3 flex items-center gap-3 shadow-sm hover:border-rose-500/30 transition-colors">
          <div className="h-9 w-9 rounded-lg bg-rose-500/15 text-rose-500 dark:text-rose-400 flex items-center justify-center shrink-0">
            <CircleDollarSign className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Pending Collection</p>
            {isLoading ? <Skeleton className="h-5 w-24 mt-1" /> :
              <p className="text-base font-bold text-foreground tabular-nums font-mono">₹{stats.pendingValue.toLocaleString('en-IN')}</p>}
          </div>
        </div>

        <div className="rounded-xl bg-card border border-border/70 px-4 py-3 flex items-center gap-3 shadow-sm hover:border-amber-500/30 transition-colors">
          <div className="h-9 w-9 rounded-lg bg-amber-500/15 text-amber-500 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Boxes className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Low Stock Items</p>
            {isLoading ? <Skeleton className="h-5 w-16 mt-1" /> :
              <p className="text-base font-bold text-foreground font-mono">{stats.lowStock.length} products</p>}
          </div>
        </div>

        <div className="rounded-xl bg-card border border-border/70 px-4 py-3 flex items-center gap-3 shadow-sm hover:border-primary/30 transition-colors">
          <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <BadgePercent className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Net Profit (MTD)</p>
            {isLoading ? <Skeleton className="h-5 w-24 mt-1" /> :
              <p className="text-base font-bold text-foreground tabular-nums font-mono">₹{stats.netMargin.toLocaleString('en-IN')}</p>}
          </div>
        </div>

        <div className="rounded-xl bg-card border border-border/70 px-4 py-3 flex items-center gap-3 shadow-sm hover:border-cyan-500/30 transition-colors">
          <div className="h-9 w-9 rounded-lg bg-cyan-500/15 text-cyan-500 dark:text-cyan-400 flex items-center justify-center shrink-0">
            <Receipt className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Invoices This Month</p>
            {isLoading ? <Skeleton className="h-5 w-16 mt-1" /> :
              <p className="text-base font-bold text-foreground font-mono">{stats.mthCount} bills</p>}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          ROW 3 — Chart | Recent Sales | Alerts  (fills remaining height)
         ══════════════════════════════════════════════ */}
      <div className="grid gap-3 lg:grid-cols-3 flex-1 min-h-0">

        {/* Sales Chart */}
        <div className="bg-card rounded-xl border border-border/80 flex flex-col overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/70 bg-muted/25 shrink-0">
            <div>
              <p className="text-sm font-semibold text-foreground">Sales Overview</p>
              <p className="text-xs text-muted-foreground">Monthly revenue this year</p>
            </div>
            <Link href="/reports" className="text-xs text-primary flex items-center gap-0.5 hover:underline font-medium">
              Full Report <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="flex-1 p-3 min-h-0">
            {isLoading
              ? <Skeleton className="h-full w-full min-h-[200px]" />
              : <SalesChart sales={sales} />
            }
          </div>
        </div>

        {/* Recent Sales */}
        <div className="bg-card rounded-xl border border-border/80 flex flex-col overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/70 bg-muted/25 shrink-0">
            <div>
              <p className="text-sm font-semibold text-foreground">Recent Sales</p>
              <p className="text-xs text-muted-foreground">Latest 10 invoices</p>
            </div>
            <Link href="/sales" className="text-xs text-primary flex items-center gap-0.5 hover:underline font-medium">
              All Sales <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading && Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-border/40 last:border-0">
                <div className="space-y-1.5"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-20" /></div>
                <div className="flex items-center gap-2"><Skeleton className="h-5 w-16 rounded-full" /><Skeleton className="h-4 w-14" /></div>
              </div>
            ))}

            {!isLoading && stats.recentSales.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
                <Receipt className="h-10 w-10 mb-3 opacity-20" />
                <p className="text-sm">No sales recorded yet</p>
              </div>
            )}

            {!isLoading && stats.recentSales.map((sale) => (
              <Link
                key={sale.id}
                href={`/sales/${sale.id}`}
                className="flex items-center justify-between px-4 py-3 border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0 flex-1 mr-3">
                  <div className="text-sm font-semibold text-foreground truncate">
                    {sale.customerName || 'Walk-in Customer'}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3 shrink-0" />
                    {format(new Date(sale.date), 'dd MMM yyyy, h:mm a')}
                    {sale.invoiceNumber && (
                      <span className="text-muted-foreground/60">· #{sale.invoiceNumber}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    variant="outline"
                    className={`text-xs px-2 py-0.5 font-semibold border ${STATUS_STYLES[sale.paymentStatus] ?? ''}`}
                  >
                    {sale.paymentStatus}
                  </Badge>
                  <span className="text-sm font-bold text-foreground tabular-nums w-20 text-right font-mono">
                    ₹{sale.total.toLocaleString('en-IN')}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Alerts & Deadlines */}
        <div className="bg-card rounded-xl border border-border/80 flex flex-col overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/70 bg-muted/25 shrink-0">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-rose-500/15 text-rose-500 dark:text-rose-400 flex items-center justify-center shadow-sm">
                <BellRing className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Alerts & Deadlines</p>
                <p className="text-xs text-muted-foreground">Due dates · GST · Payments</p>
              </div>
            </div>
            {alerts.length > 0 && (
              <span className="text-xs font-bold bg-rose-500/15 text-rose-500 border border-rose-500/25 rounded-full px-2 py-0.5 leading-none">
                {alerts.length}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border/40">
            {isLoading && Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-4 py-3 space-y-1.5">
                <Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-48" />
              </div>
            ))}

            {!isLoading && alerts.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center px-4">
                <CheckCircle2 className="h-10 w-10 mb-3 text-emerald-500/40" />
                <p className="text-sm font-medium">All Clear!</p>
                <p className="text-xs text-muted-foreground mt-1">No pending deadlines in the next 30 days.</p>
              </div>
            )}

            {!isLoading && alerts.map(alert => {
              const grad  = urgencyGrad[alert.urgency];
              const label = urgencyLabel[alert.urgency](alert.days);
              const Icon  = alert.Icon;
              return (
                <Link
                  key={alert.id}
                  href={alert.href}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors group"
                >
                  <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${grad} flex items-center justify-center text-white shrink-0 shadow-sm`}>
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{alert.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{alert.sub}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <CalendarClock className="h-3 w-3 shrink-0" />
                      {format(alert.date, 'dd MMM yyyy')}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`text-xs font-bold rounded-full px-2 py-0.5 bg-gradient-to-r ${grad} text-white leading-none shadow-sm whitespace-nowrap`}>
                      {label}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                  </div>
                </Link>
              );
            })}
          </div>

          {/* GST Calendar footer */}
          <div className="border-t border-border bg-muted/20 px-4 py-3 shrink-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">GST Filing Calendar</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'GSTR-1',  day: '11th / month', color: 'violet' },
                { label: 'GSTR-3B', day: '20th / month', color: 'indigo' },
                { label: 'GSTR-9',  day: '31 Dec / yr',  color: 'blue' },
                { label: 'TDS',     day: '7th / month',  color: 'rose' },
              ].map(g => (
                <div key={g.label} className="flex items-center gap-2 rounded-lg bg-card border border-border px-2.5 py-1.5">
                  <div className={`h-2 w-2 rounded-full shrink-0 ${
                    g.color === 'violet' ? 'bg-violet-500' :
                    g.color === 'indigo' ? 'bg-indigo-500' :
                    g.color === 'blue'   ? 'bg-blue-500' : 'bg-rose-500'
                  }`} />
                  <span className="text-xs font-semibold text-foreground">{g.label}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{g.day}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          LOW STOCK ALERT (conditional)
         ══════════════════════════════════════════════ */}
      {!isLoading && stats.lowStock.length > 0 && (
        <div className="rounded-xl border border-amber-400/30 dark:border-amber-700/30 overflow-hidden">
          <div className="bg-gradient-to-r from-amber-500/12 to-orange-500/8 flex items-center justify-between px-4 py-2.5 border-b border-amber-400/20">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Low Stock Alert — {stats.lowStock.length} item{stats.lowStock.length > 1 ? 's' : ''} running low
            </p>
            <Link href="/products" className="text-xs text-primary flex items-center gap-0.5 hover:underline font-medium">
              Manage Products <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="flex flex-wrap gap-2 p-3 bg-amber-500/4">
            {stats.lowStock.map(p => (
              <div key={p.id} className="flex items-center gap-2 bg-card border border-amber-400/25 rounded-lg px-3 py-1.5">
                <span className="text-sm font-medium text-foreground truncate max-w-[150px]">{p.productName}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-md leading-none ${
                  p.stockQuantity <= 2
                    ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                }`}>{p.stockQuantity} left</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
