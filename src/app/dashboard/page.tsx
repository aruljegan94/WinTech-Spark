'use client';

import { useMemo } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { SalesChart } from './_components/sales-chart';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { Product, Sale, Expense } from '@/lib/types';
import { isToday, isThisMonth } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

import { TrendingUp, IndianRupee, ShoppingBag, Package2 } from 'lucide-react';

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const firestore = useFirestore();

  const salesQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'sales') : null),
    [firestore]
  );
  const { data: sales, isLoading: salesLoading } = useCollection<Sale>(salesQuery);

  const productsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'products') : null),
    [firestore]
  );
  const { data: products, isLoading: productsLoading } = useCollection<Product>(productsQuery);
  
  const expensesQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'expenses') : null),
    [firestore]
  );
  const { data: expenses, isLoading: expensesLoading } = useCollection<Expense>(expensesQuery);

  const isLoading = salesLoading || productsLoading || expensesLoading;

  const { totalSalesToday, monthlySales, totalExpenses, stockValue, recentSales } = useMemo(() => {
    const now = new Date();

    const totalSalesToday =
      sales
        ?.filter((s) => isToday(new Date(s.date)))
        .reduce((sum, s) => sum + s.total, 0) || 0;

    const monthlySales =
      sales
        ?.filter((s) => isThisMonth(new Date(s.date)))
        .reduce((sum, s) => sum + s.total, 0) || 0;

    const totalExpenses =
      expenses
        ?.filter((e) => isThisMonth(new Date(e.date)))
        .reduce((sum, e) => sum + e.amount, 0) || 0;
        
    const stockValue =
      products?.reduce((acc, p) => acc + p.purchasePrice * p.stockQuantity, 0) || 0;

    const recentSales = sales ? [...sales].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5) : [];

    return { totalSalesToday, monthlySales, totalExpenses, stockValue, recentSales };
  }, [sales, products, expenses]);
  
   const getStatusBadgeVariant = (status: Sale['paymentStatus']) => {
    switch (status) {
      case 'Paid':
        return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 font-semibold';
      case 'Partial':
        return 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30 font-semibold';
      case 'Pending':
        return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 font-semibold';
      default:
        return 'secondary';
    }
  };

  return (
    <div className="grid auto-rows-max items-start gap-4 md:gap-8 lg:col-span-2">
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-gradient-to-br from-emerald-500/10 via-card to-emerald-500/5 border-emerald-500/30 shadow-md shadow-emerald-500/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              Today's Sales
            </CardTitle>
            <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-2/3" /> : <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">₹{totalSalesToday.toLocaleString()}</div>}
            {isLoading ? <Skeleton className="h-4 w-1/2 mt-1" /> : <p className="text-xs text-muted-foreground mt-1">Today's total revenue</p>}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-indigo-500/10 via-card to-sky-500/5 border-indigo-500/30 shadow-md shadow-indigo-500/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              This Month's Sales
            </CardTitle>
            <div className="p-2 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
              <IndianRupee className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-2/3" /> : <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">₹{monthlySales.toLocaleString()}</div>}
            {isLoading ? <Skeleton className="h-4 w-1/2 mt-1" /> : <p className="text-xs text-muted-foreground mt-1">Current month total</p>}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500/10 via-card to-orange-500/5 border-amber-500/30 shadow-md shadow-amber-500/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Monthly Expenses</CardTitle>
            <div className="p-2 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <ShoppingBag className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-2/3" /> : <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">₹{totalExpenses.toLocaleString()}</div>}
            {isLoading ? <Skeleton className="h-4 w-1/2 mt-1" /> : <p className="text-xs text-muted-foreground mt-1">Current month expenses</p>}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-[#F62440]/10 via-card to-rose-500/5 border-[#F62440]/30 shadow-md shadow-[#F62440]/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              Current Stock Value
            </CardTitle>
            <div className="p-2 rounded-lg bg-[#F62440]/15 text-[#F62440]">
              <Package2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
             {isLoading ? <Skeleton className="h-8 w-2/3" /> : <div className="text-2xl font-bold text-[#F62440]">₹{stockValue.toLocaleString()}</div>}
             {isLoading ? <Skeleton className="h-4 w-1/2 mt-1" /> : <p className="text-xs text-muted-foreground mt-1">Based on purchase price</p>}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Sales Overview</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            {isLoading ? <Skeleton className="h-[350px] w-full" /> : <SalesChart sales={sales} />}
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Recent Sales</CardTitle>
            <CardDescription>
              Your 5 most recent sales.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && Array.from({length: 5}).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-12 ml-auto" /></TableCell>
                  </TableRow>
                ))}
                {!isLoading && recentSales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>
                      <div className="font-medium">
                        {sale.customerName || 'N/A'}
                      </div>
                      <div className="hidden text-sm text-muted-foreground md:inline">
                        {sale.customerMobile || ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={getStatusBadgeVariant(sale.paymentStatus)}
                      >
                        {sale.paymentStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      ₹{sale.total.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
