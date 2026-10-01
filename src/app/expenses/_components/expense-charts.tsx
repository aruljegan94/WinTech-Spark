'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import type { Expense } from '@/lib/types';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { TrendingUp, PieChart as PieChartIcon, Calendar, IndianRupee } from 'lucide-react';

interface ExpenseChartsProps {
  expenses: Expense[];
}

export const CATEGORY_COLORS: Record<string, string> = {
  Rent: '#6366f1', // Indigo
  Electricity: '#f59e0b', // Amber
  Transport: '#06b6d4', // Cyan
  Supplies: '#10b981', // Emerald
  Salaries: '#ec4899', // Pink
  Miscellaneous: '#8b5cf6', // Purple
  Fuel: '#f97316', // Orange
  Maintenance: '#14b8a6', // Teal
  Marketing: '#3b82f6', // Blue
  Office: '#64748b', // Slate
  Food: '#eab308', // Yellow
};

const PALETTE = [
  '#6366f1', '#f59e0b', '#10b981', '#06b6d4', '#ec4899',
  '#8b5cf6', '#f97316', '#14b8a6', '#3b82f6', '#eab308', '#64748b'
];

export function getCategoryColor(category: string, index: number = 0): string {
  if (CATEGORY_COLORS[category]) return CATEGORY_COLORS[category];
  return PALETTE[index % PALETTE.length];
}

type Period = 'this-month' | 'last-3-months' | 'this-year' | 'all';

export function ExpenseCharts({ expenses }: ExpenseChartsProps) {
  const [mounted, setMounted] = useState(false);
  const [period, setPeriod] = useState<Period>('this-year');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter expenses according to selected period for the donut chart
  const periodFilteredExpenses = useMemo(() => {
    const now = new Date();
    switch (period) {
      case 'this-month': {
        const start = startOfMonth(now);
        const end = endOfMonth(now);
        return expenses.filter((e) => {
          const d = new Date(e.date);
          return !isNaN(d.getTime()) && isWithinInterval(d, { start, end });
        });
      }
      case 'last-3-months': {
        const start = startOfMonth(subMonths(now, 2));
        const end = endOfMonth(now);
        return expenses.filter((e) => {
          const d = new Date(e.date);
          return !isNaN(d.getTime()) && isWithinInterval(d, { start, end });
        });
      }
      case 'this-year': {
        const currentYear = now.getFullYear();
        return expenses.filter((e) => {
          const d = new Date(e.date);
          return !isNaN(d.getTime()) && d.getFullYear() === currentYear;
        });
      }
      case 'all':
      default:
        return expenses;
    }
  }, [expenses, period]);

  // Donut Chart Data: Category Breakdown
  const donutData = useMemo(() => {
    const map = new Map<string, number>();
    let total = 0;

    periodFilteredExpenses.forEach((e) => {
      const cat = (e.expenseType || 'Miscellaneous').trim();
      const amt = Number(e.amount) || 0;
      map.set(cat, (map.get(cat) || 0) + amt);
      total += amt;
    });

    const list = Array.from(map.entries())
      .map(([name, value], idx) => ({
        name,
        value,
        percentage: total > 0 ? (value / total) * 100 : 0,
        color: getCategoryColor(name, idx),
      }))
      .sort((a, b) => b.value - a.value);

    return { list, total };
  }, [periodFilteredExpenses]);

  // Line Chart Data: Month-wise trend (12 months or chronological)
  const lineChartData = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();

    // Generate all 12 months for the current year
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    const monthlyMap = months.map((monthName, idx) => ({
      month: monthName,
      monthIndex: idx,
      amount: 0,
      count: 0,
    }));

    expenses.forEach((e) => {
      const d = new Date(e.date);
      if (!isNaN(d.getTime()) && d.getFullYear() === currentYear) {
        const m = d.getMonth();
        if (m >= 0 && m < 12) {
          monthlyMap[m].amount += Number(e.amount) || 0;
          monthlyMap[m].count += 1;
        }
      }
    });

    return monthlyMap;
  }, [expenses]);

  if (!mounted) {
    return (
      <div className="grid gap-4 md:grid-cols-2 mb-4">
        <div className="h-[300px] rounded-xl border bg-card animate-pulse" />
        <div className="h-[300px] rounded-xl border bg-card animate-pulse" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-12 mb-4">
      {/* 1. Line Chart: Month-Wise Trend */}
      <Card className="lg:col-span-7 flex flex-col justify-between border-primary/10 shadow-xs">
        <CardHeader className="p-4 pb-2 border-b flex flex-row items-center justify-between">
          <div className="space-y-0.5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Monthly Expense Trend ({new Date().getFullYear()})
            </CardTitle>
            <CardDescription className="text-xs">
              Month-by-month spending expenditure curve
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-[11px] font-normal font-mono bg-primary/5 text-primary border-primary/20">
            {lineChartData.reduce((acc, curr) => acc + curr.count, 0)} expenses logged
          </Badge>
        </CardHeader>

        <CardContent className="p-4 pt-3 flex-1">
          <div className="h-[250px] w-full min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={lineChartData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="expenseTrendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.6} />
                <XAxis
                  dataKey="month"
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
                  tickFormatter={(val) => (val >= 1000 ? `₹${(val / 1000).toFixed(0)}k` : `₹${val}`)}
                />
                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-md text-xs">
                        <div className="font-semibold text-foreground mb-1">{label} {new Date().getFullYear()}</div>
                        <div className="text-primary font-bold text-sm">
                          ₹{Number(data.amount).toLocaleString('en-IN')}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {data.count} transaction{data.count === 1 ? '' : 's'}
                        </div>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#expenseTrendGradient)"
                  activeDot={{ r: 6, fill: '#6366f1', stroke: '#ffffff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 2. Donut Chart: Category Breakdown */}
      <Card className="lg:col-span-5 flex flex-col justify-between border-primary/10 shadow-xs">
        <CardHeader className="p-4 pb-2 border-b space-y-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-primary" />
              Expenses by Category
            </CardTitle>

            <span className="text-xs font-semibold text-foreground">
              Total: ₹{donutData.total.toLocaleString()}
            </span>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={period === 'this-month' ? 'default' : 'ghost'}
              className="h-6 px-2 text-[10px]"
              onClick={() => setPeriod('this-month')}
            >
              This Month
            </Button>
            <Button
              size="sm"
              variant={period === 'last-3-months' ? 'default' : 'ghost'}
              className="h-6 px-2 text-[10px]"
              onClick={() => setPeriod('last-3-months')}
            >
              3 Months
            </Button>
            <Button
              size="sm"
              variant={period === 'this-year' ? 'default' : 'ghost'}
              className="h-6 px-2 text-[10px]"
              onClick={() => setPeriod('this-year')}
            >
              This Year
            </Button>
            <Button
              size="sm"
              variant={period === 'all' ? 'default' : 'ghost'}
              className="h-6 px-2 text-[10px]"
              onClick={() => setPeriod('all')}
            >
              All Time
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-4 pt-2 flex-1 flex flex-col justify-center">
          {donutData.list.length === 0 ? (
            <div className="h-[230px] flex flex-col items-center justify-center text-xs text-muted-foreground">
              <Calendar className="h-8 w-8 mb-2 opacity-30" />
              No expenses recorded for this period.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-2">
              {/* Donut graphic */}
              <div className="h-[210px] relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData.list}
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={78}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {donutData.list.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="bg-popover border border-border rounded-lg px-2.5 py-1.5 shadow-md text-xs">
                            <div className="font-semibold text-foreground flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: data.color }} />
                              {data.name}
                            </div>
                            <div className="font-bold text-foreground mt-0.5">
                              ₹{Number(data.value).toLocaleString('en-IN')}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {data.percentage.toFixed(1)}% of total
                            </div>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Donut Center Label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Spent</span>
                  <span className="text-xs font-bold text-foreground">
                    {donutData.total >= 100000
                      ? `₹${(donutData.total / 100000).toFixed(1)}L`
                      : `₹${donutData.total >= 1000 ? (donutData.total / 1000).toFixed(1) + 'k' : donutData.total}`}
                  </span>
                </div>
              </div>

              {/* Category Legend list */}
              <div className="space-y-1.5 max-h-[210px] overflow-y-auto pr-1">
                {donutData.list.slice(0, 6).map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-xs py-0.5">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="truncate font-medium text-foreground">{item.name}</span>
                    </div>
                    <div className="text-right shrink-0 pl-2">
                      <span className="font-semibold">₹{item.value.toLocaleString()}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">({item.percentage.toFixed(0)}%)</span>
                    </div>
                  </div>
                ))}

                {donutData.list.length > 6 && (
                  <div className="text-[10px] text-muted-foreground text-center pt-1">
                    +{donutData.list.length - 6} other categories
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
