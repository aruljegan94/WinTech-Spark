'use client';

import { useMemo } from 'react';
import {
  Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import type { Sale } from '@/lib/types';

interface SalesChartProps {
  sales: Sale[] | null;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2.5 shadow-lg">
      <p className="text-sm font-semibold text-foreground mb-0.5">{label}</p>
      <p className="text-sm text-muted-foreground">
        Revenue:{' '}
        <span className="font-bold text-primary">
          ₹{Number(payload[0]?.value ?? 0).toLocaleString('en-IN')}
        </span>
      </p>
    </div>
  );
}

export function SalesChart({ sales }: SalesChartProps) {
  const chartData = useMemo(() => {
    const monthly = MONTHS.map(name => ({ name, total: 0 }));
    if (!sales) return monthly;
    sales
      .filter(s => typeof s.date === 'string' && s.date)
      .forEach(sale => {
        const d = new Date(sale.date);
        if (!isNaN(d.getTime())) monthly[d.getMonth()].total += sale.total;
      });
    return monthly;
  }, [sales]);

  return (
    /* ResponsiveContainer height="100%" needs the parent to have an explicit height.
       The parent div has flex-1 + min-h-0, so we set a min-height here as fallback */
    <ResponsiveContainer width="100%" height="100%" minHeight={200}>
      <BarChart data={chartData} barCategoryGap="30%" margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="name"
          stroke="hsl(var(--muted-foreground))"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          dy={4}
        />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={v =>
            v >= 100000 ? `₹${(v / 100000).toFixed(0)}L` :
            v >= 1000   ? `₹${(v / 1000).toFixed(0)}K` : `₹${v}`
          }
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', radius: 4 }} />
        <Bar
          dataKey="total"
          fill="hsl(var(--primary))"
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
