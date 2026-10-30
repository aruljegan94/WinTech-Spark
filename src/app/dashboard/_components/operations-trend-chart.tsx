'use client';

import { useMemo, useState } from 'react';
import {
  Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import type { Sale, Purchase, Expense } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { TrendingUp, ShoppingBag, Receipt, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface OperationsTrendChartProps {
  sales: Sale[] | null;
  purchases: Purchase[] | null;
  expenses: Expense[] | null;
  hideConfidential?: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type TrendView = 'all' | 'sales' | 'purchases' | 'expenses';

function CustomTooltip({ active, payload, label, hideConfidential }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-popover/95 backdrop-blur-md border border-border rounded-xl p-3 shadow-xl min-w-[190px] text-xs">
      <p className="font-bold text-foreground text-sm border-b border-border/60 pb-1.5 mb-2 flex items-center justify-between">
        <span>{label}</span>
        <span className="text-[10px] font-normal text-muted-foreground uppercase tracking-wide">Monthly Pulse</span>
      </p>
      <div className="space-y-1.5">
        {payload.map((entry: any) => {
          const isSales = entry.dataKey === 'sales';
          const isPurchases = entry.dataKey === 'purchases';
          const isExpenses = entry.dataKey === 'expenses';

          const labelText = isSales ? 'Sales Revenue' : isPurchases ? 'Purchases' : 'Expenses';
          const colorClass = isSales
            ? 'text-indigo-600 dark:text-indigo-400'
            : isPurchases
            ? 'text-sky-600 dark:text-sky-400'
            : 'text-amber-600 dark:text-amber-400';

          return (
            <div key={entry.dataKey} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span>{labelText}:</span>
              </span>
              <span className={`font-mono font-bold ${colorClass}`}>
                {hideConfidential && !isSales ? '••••••' : `₹${Number(entry.value || 0).toLocaleString('en-IN')}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OperationsTrendChart({
  sales,
  purchases,
  expenses,
  hideConfidential = false,
}: OperationsTrendChartProps) {
  const [activeView, setActiveView] = useState<TrendView>('all');

  const { chartData, totals } = useMemo(() => {
    const monthly = MONTHS.map(name => ({
      name,
      sales: 0,
      purchases: 0,
      expenses: 0,
    }));

    let totalSales = 0;
    let totalPurchases = 0;
    let totalExpenses = 0;

    // Process Sales
    sales?.forEach(s => {
      if (!s.date) return;
      const d = new Date(s.date);
      if (!isNaN(d.getTime())) {
        const m = d.getMonth();
        const amt = Number(s.total || 0);
        monthly[m].sales += amt;
        totalSales += amt;
      }
    });

    // Process Purchases
    purchases?.forEach(p => {
      if (!p.date) return;
      const d = new Date(p.date);
      if (!isNaN(d.getTime())) {
        const m = d.getMonth();
        const amt = Number(p.totalAmount || 0);
        monthly[m].purchases += amt;
        totalPurchases += amt;
      }
    });

    // Process Expenses
    expenses?.forEach(e => {
      if (!e.date) return;
      const d = new Date(e.date);
      if (!isNaN(d.getTime())) {
        const m = d.getMonth();
        const amt = Number(e.amount || 0);
        monthly[m].expenses += amt;
        totalExpenses += amt;
      }
    });

    return {
      chartData: monthly,
      totals: { totalSales, totalPurchases, totalExpenses },
    };
  }, [sales, purchases, expenses]);

  return (
    <div className="flex flex-col h-full">
      {/* Header with Sub-tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 dark:bg-muted/40 rounded-lg text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveView('all')}
            className={`px-2.5 py-1 rounded-md transition-all ${
              activeView === 'all'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All Trends
          </button>
          <button
            type="button"
            onClick={() => setActiveView('sales')}
            className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
              activeView === 'sales'
                ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-indigo-600 inline-block" />
            <span>Sales</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('purchases')}
            className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
              activeView === 'purchases'
                ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-sky-500 inline-block" />
            <span>Purchases</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('expenses')}
            className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
              activeView === 'expenses'
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />
            <span>Expenses</span>
          </button>
        </div>

        {/* Legend Indicators */}
        <div className="hidden sm:flex items-center gap-3 text-[11px] text-muted-foreground">
          {(activeView === 'all' || activeView === 'sales') && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-xs bg-indigo-600" />
              <span>Sales</span>
            </span>
          )}
          {(activeView === 'all' || activeView === 'purchases') && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-xs bg-sky-500" />
              <span>Purchases</span>
            </span>
          )}
          {(activeView === 'all' || activeView === 'expenses') && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-xs bg-amber-500" />
              <span>Expenses</span>
            </span>
          )}
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="flex-1 w-full min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%" minHeight={220}>
          <BarChart
            data={chartData}
            barCategoryGap={activeView === 'all' ? '20%' : '35%'}
            barGap={2}
            margin={{ top: 8, right: 8, left: -14, bottom: 0 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.6} />
            <XAxis
              dataKey="name"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              dy={6}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => {
                if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
                if (v >= 100000) return `₹${(v / 100000).toFixed(0)}L`;
                if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
                return `₹${v}`;
              }}
            />
            <Tooltip
              content={<CustomTooltip hideConfidential={hideConfidential} />}
              cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4, radius: 4 }}
            />

            {(activeView === 'all' || activeView === 'sales') && (
              <Bar
                dataKey="sales"
                name="Sales"
                fill="#6366f1"
                radius={[4, 4, 0, 0]}
                maxBarSize={activeView === 'all' ? 14 : 28}
              />
            )}

            {(activeView === 'all' || activeView === 'purchases') && (
              <Bar
                dataKey="purchases"
                name="Purchases"
                fill="#0ea5e9"
                radius={[4, 4, 0, 0]}
                maxBarSize={activeView === 'all' ? 14 : 28}
              />
            )}

            {(activeView === 'all' || activeView === 'expenses') && (
              <Bar
                dataKey="expenses"
                name="Expenses"
                fill="#f59e0b"
                radius={[4, 4, 0, 0]}
                maxBarSize={activeView === 'all' ? 14 : 28}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Footer Mini KPI Summary */}
      <div className="grid grid-cols-3 gap-2 pt-3 mt-2 border-t border-border/60 text-xs">
        <div className="flex flex-col">
          <span className="text-muted-foreground text-[10px] uppercase font-semibold">Total Sales</span>
          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
            ₹{totals.totalSales.toLocaleString('en-IN')}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-muted-foreground text-[10px] uppercase font-semibold">Total Purchases</span>
          <span className="font-mono font-bold text-sky-600 dark:text-sky-400">
            {hideConfidential ? '••••••' : `₹${totals.totalPurchases.toLocaleString('en-IN')}`}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-muted-foreground text-[10px] uppercase font-semibold">Total Expenses</span>
          <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
            {hideConfidential ? '••••••' : `₹${totals.totalExpenses.toLocaleString('en-IN')}`}
          </span>
        </div>
      </div>
    </div>
  );
}

