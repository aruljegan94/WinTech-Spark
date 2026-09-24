
'use client';

import { useMemo } from 'react';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import type { Sale } from '@/lib/types';

interface SalesChartProps {
  sales: Sale[] | null;
}

const getMonthName = (monthNumber: number) => {
  const date = new Date();
  date.setMonth(monthNumber);
  return date.toLocaleString('en-US', { month: 'short' });
};

export function SalesChart({ sales }: SalesChartProps) {
  
  const chartData = useMemo(() => {
    if (!sales) {
      return [];
    }

    const monthlySales = Array(12)
      .fill(0)
      .map((_, i) => ({
        name: getMonthName(i),
        total: 0,
      }));

    sales
      .filter(Boolean) // Ensure no null/undefined entries in the sales array
      .filter(sale => typeof sale.date === 'string' && sale.date) // Ensure date is a valid string
      .forEach((sale) => {
        const saleDate = new Date(sale.date);
        // Additional check to ensure the created date is valid
        if (!isNaN(saleDate.getTime())) {
            const month = saleDate.getMonth();
            if (monthlySales[month]) {
                monthlySales[month].total += sale.total;
            }
        }
    });
    
    return monthlySales;
  }, [sales]);


  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={chartData}>
        <XAxis
          dataKey="name"
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `₹${value / 1000}K`}
        />
        <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
