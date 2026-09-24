
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
import { File, Calendar as CalendarIcon } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Sale, Product, Purchase, Expense } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRange } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import jsPDF from 'jspdf';
import 'jspdf-autotable';


interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => jsPDF;
}

export const dynamic = "force-dynamic";

export default function ReportsPage() {
  const firestore = useFirestore();
  const [date, setDate] = useState<DateRange | undefined>();

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

  const isLoading = salesLoading || productsLoading || purchasesLoading || expensesLoading;

  const filteredData = useMemo(() => {
    const filterByDate = (items: any[] | null) => {
      if (!date?.from || !items) return items;
      const to = date.to ?? date.from;
      return items.filter(item => 
        isWithinInterval(new Date(item.date), { start: startOfDay(date.from!), end: endOfDay(to) })
      );
    };

    return {
      sales: filterByDate(allSales) as Sale[] | null,
      purchases: filterByDate(allPurchases) as Purchase[] | null,
      expenses: filterByDate(allExpenses) as Expense[] | null,
    };
  }, [date, allSales, allPurchases, allExpenses]);


  const { totalSales, totalPurchases, totalExpenses, netProfit, stockValue } = useMemo(() => {
    const totalSales = filteredData.sales?.reduce((sum, s) => sum + s.total, 0) || 0;
    const totalPurchases = filteredData.purchases?.reduce((sum, p) => sum + p.totalAmount, 0) || 0;
    const totalExpenses = filteredData.expenses?.reduce((sum, e) => sum + e.amount, 0) || 0;
    const netProfit = totalSales - totalPurchases - totalExpenses;
    const stockValue = products?.reduce((acc, p) => acc + p.purchasePrice * p.stockQuantity, 0) || 0;

    return { totalSales, totalPurchases, totalExpenses, netProfit, stockValue };
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
      + [headers.join(','), ...data.map(e => headers.map(h => e[h]).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handleExportCSV = (reportType: 'sales' | 'purchases' | 'expenses' | 'stock') => {
      switch (reportType) {
          case 'sales':
              if (filteredData.sales) {
                  generateCSV(filteredData.sales, ['invoiceNumber', 'customerName', 'date', 'total'], 'sales_report.csv');
              }
              break;
          case 'purchases':
              if (filteredData.purchases) {
                  generateCSV(filteredData.purchases, ['invoiceNo', 'supplierName', 'date', 'totalAmount'], 'purchases_report.csv');
              }
              break;
          case 'expenses':
              if (filteredData.expenses) {
                  generateCSV(filteredData.expenses, ['date', 'expenseType', 'amount', 'notes'], 'expenses_report.csv');
              }
              break;
          case 'stock':
              if (products) {
                 const stockData = products.map(p => ({ ...p, stockValue: p.purchasePrice * p.stockQuantity }));
                 generateCSV(stockData, ['productName', 'category', 'stockQuantity', 'purchasePrice', 'sellingPrice', 'stockValue'], 'stock_report.csv');
              }
              break;
      }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF() as jsPDFWithAutoTable;
    const pageTitle = "Business Report";
    const dateRange = date?.from ? `${format(date.from, 'dd-MMM-yyyy')} to ${date.to ? format(date.to, 'dd-MMM-yyyy') : format(date.from, 'dd-MMM-yyyy')}` : 'All Time';
    
    doc.text(pageTitle, 14, 16);
    doc.setFontSize(10);
    doc.text(dateRange, 14, 22);

    // Summary
    doc.autoTable({
        startY: 30,
        head: [['Metric', 'Amount']],
        body: [
            ['Total Sales', `+ Rs ${totalSales.toLocaleString()}`],
            ['Total Purchases', `- Rs ${totalPurchases.toLocaleString()}`],
            ['Total Expenses', `- Rs ${totalExpenses.toLocaleString()}`],
            ['Net Profit', `Rs ${netProfit.toLocaleString()}`],
            ['Total Stock Value', `Rs ${stockValue.toLocaleString()}`],
        ],
        theme: 'grid'
    });

    // Sales Table
    if (filteredData.sales && filteredData.sales.length > 0) {
        doc.addPage();
        doc.text("Sales Report", 14, 16);
        doc.autoTable({
            head: [['Invoice #', 'Customer', 'Date', 'Amount']],
            body: filteredData.sales.map(s => [s.invoiceNumber, s.customerName || 'N/A', format(new Date(s.date), 'dd-MMM-yyyy'), `Rs ${s.total.toLocaleString()}`]),
        });
    }

    // Stock Table
    if (products && products.length > 0) {
        doc.addPage();
        doc.text("Stock Report", 14, 16);
        doc.autoTable({
            head: [['Product', 'Category', 'Stock Qty', 'Stock Value']],
            body: products.map(p => [p.productName, p.category, p.stockQuantity, `Rs ${(p.stockQuantity * p.purchasePrice).toLocaleString()}`]),
        });
    }

    doc.save('report.pdf');
};


  return (
    <>
      <PageHeader
        title="Reports"
        description="View and download your business reports."
      >
        <div className="flex items-center gap-2">
           <Popover>
            <PopoverTrigger asChild>
              <Button
                id="date"
                variant={"outline"}
                className={cn(
                  "w-[300px] justify-start text-left font-normal",
                  !date && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date?.from ? (
                  date.to ? (
                    <>
                      {format(date.from, "dd-MMM-yyyy")} - {format(date.to, "dd-MMM-yyyy")}
                    </>
                  ) : (
                    format(date.from, "dd-MMM-yyyy")
                  )
                ) : (
                  <span>Pick a date range</span>
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
           <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1">
                    <File className="h-3.5 w-3.5" />
                    <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                        Export
                    </span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                <DropdownMenuItem onSelect={handleExportPDF}>Export as PDF</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleExportCSV('sales')}>Export Sales (CSV)</DropdownMenuItem>
                 <DropdownMenuItem onSelect={() => handleExportCSV('stock')}>Export Stock (CSV)</DropdownMenuItem>
            </DropdownMenuContent>
           </DropdownMenu>
        </div>
      </PageHeader>
      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="profit">Profit Summary</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
        </TabsList>
        <TabsContent value="sales">
          <Card>
            <CardHeader>
              <CardTitle>Sales Report</CardTitle>
              <CardDescription>
                Detailed report of all sales invoices.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && renderSkeleton(5, 4)}
                  {!isLoading && filteredData.sales?.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell>{sale.invoiceNumber}</TableCell>
                      <TableCell>{sale.customerName || 'N/A'}</TableCell>
                      <TableCell>{format(new Date(sale.date), 'dd-MMM-yyyy')}</TableCell>
                      <TableCell className="text-right">
                        ₹{sale.total.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                   {!isLoading && filteredData.sales?.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center">
                                No sales data available for the selected period.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
                 <TableFooter>
                    <TableRow className="font-bold bg-muted/50">
                        <TableCell colSpan={3}>Total Sales</TableCell>
                        <TableCell className="text-right">₹{totalSales.toLocaleString()}</TableCell>
                    </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="profit">
          <Card>
            <CardHeader>
              <CardTitle>Profit Summary</CardTitle>
              <CardDescription>
                Summary of your business profits for the selected period.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
               <div className="flex justify-between items-center p-4 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground">Total Sales</span>
                  <span className="font-bold text-lg text-green-600">+ ₹{totalSales.toLocaleString()}</span>
               </div>
                <div className="flex justify-between items-center p-4 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground">Total Purchases</span>
                  <span className="font-bold text-lg text-red-600">- ₹{totalPurchases.toLocaleString()}</span>
               </div>
                <div className="flex justify-between items-center p-4 rounded-lg bg-muted/50">
                  <span className="text-muted-foreground">Total Expenses</span>
                  <span className="font-bold text-lg text-red-600">- ₹{totalExpenses.toLocaleString()}</span>
               </div>
                <div className="flex justify-between items-center p-4 rounded-lg border-t">
                  <span className="font-semibold">Net Profit</span>
                  <span className={`font-bold text-xl ${netProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>₹{netProfit.toLocaleString()}</span>
               </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="stock">
           <Card>
            <CardHeader>
              <CardTitle>Stock Report</CardTitle>
              <CardDescription>
                Current inventory levels and value. (Not affected by date filter)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Stock Quantity</TableHead>
                    <TableHead className="text-right">Stock Value (Purchase Price)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                    {isLoading && renderSkeleton(5, 4)}
                    {!isLoading && products?.map((product) => (
                        <TableRow key={product.id}>
                        <TableCell>{product.productName}</TableCell>
                        <TableCell>{product.category}</TableCell>
                        <TableCell>{product.stockQuantity}</TableCell>
                        <TableCell className="text-right">
                            ₹{(product.stockQuantity * product.purchasePrice).toLocaleString()}
                        </TableCell>
                        </TableRow>
                    ))}
                    {!isLoading && products?.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center">
                                No products found.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
                <TableFooter>
                    <TableRow className="font-bold bg-muted/50">
                        <TableCell colSpan={3}>Total Stock Value</TableCell>
                        <TableCell className="text-right">₹{stockValue.toLocaleString()}</TableCell>
                    </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
