
'use client';
import { useState, useMemo } from 'react';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { MoreHorizontal, PlusCircle, IndianRupee, FileText, FileClock, Files, Printer, Search, ArrowUpDown, RotateCcw, X, Calendar, Wallet } from 'lucide-react';
import { Input } from '@/components/ui/input';
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
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { PageHeader } from '@/components/page-header';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { InvoiceFollowUpButton } from './_components/invoice-follow-up-button';
import { ThermalPrintDialog } from './_components/thermal-print-dialog';
import { RecordPaymentDialog } from './_components/record-payment-dialog';
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
} from '@/firebase';
import { collection, query, orderBy, doc, runTransaction, where } from 'firebase/firestore';
import type { Sale, CompanyProfile } from '@/lib/types';
import { format, isThisMonth, startOfDay, endOfDay, isWithinInterval, parseISO } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

export default function SalesPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);
  const [saleToPrint, setSaleToPrint] = useState<Sale | null>(null);
  const [saleToRecordPayment, setSaleToRecordPayment] = useState<Sale | null>(null);

  // Filters & Sorting state
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('date-desc');

  const defaultProfileQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'companyProfiles'), where('isDefault', '==', true)) : null),
    [firestore]
  );
  const { data: defaultProfileData } = useCollection<CompanyProfile>(defaultProfileQuery);
  const companyProfile = useMemo(() => defaultProfileData?.[0], [defaultProfileData]);

  const salesQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'sales'), orderBy('date', 'desc')) : null),
    [firestore]
  );
  const { data: rawSales, isLoading } = useCollection<Sale>(salesQuery);
  
  const { totalSalesMonth, pendingAmountMonth, invoiceCountMonth, totalInvoiceCount } = useMemo(() => {
    if (!rawSales) {
      return {
        totalSalesMonth: 0,
        pendingAmountMonth: 0,
        invoiceCountMonth: 0,
        totalInvoiceCount: 0,
      };
    }

    const monthlySales = rawSales.filter(s => isThisMonth(new Date(s.date)));
    
    const totalSalesMonth = monthlySales.reduce((sum, s) => sum + s.total, 0);

    const pendingAmountMonth = monthlySales
      .filter(s => s.paymentStatus === 'Pending' || s.paymentStatus === 'Partial')
      .reduce((sum, s) => {
        if (s.paymentStatus === 'Pending') {
          return sum + s.total;
        }
        // For partial, deduct already paid and discount given
        return sum + Math.max(0, s.total - (s.amountPaid || 0) - (s.discount || 0));
      }, 0);

    return {
      totalSalesMonth,
      pendingAmountMonth,
      invoiceCountMonth: monthlySales.length,
      totalInvoiceCount: rawSales.length,
    };
  }, [rawSales]);

  // Filtered & Sorted Sales
  const sales = useMemo(() => {
    if (!rawSales) return [];

    let list = rawSales.filter((sale) => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        sale.invoiceNumber.toLowerCase().includes(q) ||
        (sale.customerName && sale.customerName.toLowerCase().includes(q)) ||
        (sale.customerMobile && sale.customerMobile.includes(q));

      if (!matchesSearch) return false;

      // Status filter
      if (statusFilter !== 'all' && sale.paymentStatus !== statusFilter) {
        return false;
      }

      // Date range filter
      if (startDate) {
        const start = startOfDay(new Date(startDate));
        const saleDate = new Date(sale.date);
        if (saleDate < start) return false;
      }

      if (endDate) {
        const end = endOfDay(new Date(endDate));
        const saleDate = new Date(sale.date);
        if (saleDate > end) return false;
      }

      return true;
    });

    // Sorting
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case 'date-asc':
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'invoice-asc':
          return a.invoiceNumber.localeCompare(b.invoiceNumber, undefined, { numeric: true });
        case 'invoice-desc':
          return b.invoiceNumber.localeCompare(a.invoiceNumber, undefined, { numeric: true });
        case 'amount-desc':
          return b.total - a.total;
        case 'amount-asc':
          return a.total - b.total;
        case 'customer-asc':
          return (a.customerName || '').localeCompare(b.customerName || '');
        case 'customer-desc':
          return (b.customerName || '').localeCompare(a.customerName || '');
        default:
          return 0;
      }
    });

    return list;
  }, [rawSales, searchTerm, statusFilter, startDate, endDate, sortBy]);

  const hasActiveFilters =
    searchTerm !== '' ||
    statusFilter !== 'all' ||
    startDate !== '' ||
    endDate !== '' ||
    sortBy !== 'date-desc';

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setStartDate('');
    setEndDate('');
    setSortBy('date-desc');
  };

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
  
  const handleDeleteSale = async () => {
    if (!firestore || !saleToDelete) return;

    try {
      await runTransaction(firestore, async (transaction) => {
        const saleRef = doc(firestore, 'sales', saleToDelete.id);
        
        const saleDoc = await transaction.get(saleRef);
        if (!saleDoc.exists()) {
          throw new Error("Sale document not found!");
        }
        const saleData = saleDoc.data() as Sale;

        const productRefs = (saleData.items || []).map(item => doc(firestore, 'products', item.productId));
        const productDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));

        const targetCustomerId = saleData.customerId || saleToDelete.customerId;
        const customerRef = targetCustomerId ? doc(firestore, 'customers', targetCustomerId) : null;
        const customerDoc = customerRef ? await transaction.get(customerRef) : null;

        // --- WRITE PHASE ---
        productDocs.forEach((productDoc, index) => {
          if (productDoc.exists()) {
            const currentStock = productDoc.data().stockQuantity;
            const soldQuantity = (saleData.items || [])[index].quantity;
            const newStock = currentStock + soldQuantity;
            transaction.update(productRefs[index], { stockQuantity: newStock });
          }
        });

        if (customerRef && customerDoc && customerDoc.exists()) {
          const cData = customerDoc.data();
          const unpaidOnSale = Math.max(0, saleData.total - (saleData.amountPaid ?? (saleData.paymentStatus === 'Paid' ? saleData.total : 0)));
          transaction.update(customerRef, {
            totalSpent: Math.max(0, (cData.totalSpent || 0) - saleData.total),
            totalInvoices: Math.max(0, (cData.totalInvoices || 0) - 1),
            pendingDue: Math.max(0, (cData.pendingDue || 0) - unpaidOnSale),
            updatedAt: new Date().toISOString(),
          });
        }
        
        transaction.delete(saleRef);
      });

      toast({
        title: 'Sale Deleted',
        description: `Invoice #${saleToDelete.invoiceNumber} has been deleted and stock updated.`,
      });
    } catch (error: any) {
       toast({
        variant: 'destructive',
        title: 'Error Deleting Sale',
        description: error.message || 'There was a problem deleting the sale.',
      });
    } finally {
        setSaleToDelete(null);
    }
  };


  const renderSkeleton = () => (
    Array.from({ length: 5 }).map((_, i) => (
      <TableRow key={i}>
        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
        <TableCell><Skeleton className="h-5 w-32" /></TableCell>
        <TableCell><Skeleton className="h-5 w-20" /></TableCell>
        <TableCell><Skeleton className="h-5 w-14" /></TableCell>
        <TableCell><Skeleton className="h-5 w-16" /></TableCell>
        <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
        <TableCell><Skeleton className="h-5 w-16" /></TableCell>
        <TableCell><Skeleton className="h-8 w-8" /></TableCell>
      </TableRow>
    ))
  );
  
  return (
    <>
      <PageHeader
        title="Sales"
        description="Create and manage your sales invoices."
      >
        <Button size="sm" className="gap-1" asChild>
          <Link href="/sales/new">
            <PlusCircle className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
              Create Invoice
            </span>
          </Link>
        </Button>
      </PageHeader>
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4 mb-2">
        <Card className="bg-gradient-to-br from-emerald-500/10 via-card to-emerald-500/5 border-emerald-500/30 shadow-md shadow-emerald-500/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 py-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">Total Sales (Month)</CardTitle>
                <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <IndianRupee className="h-3.5 w-3.5" />
                </div>
            </CardHeader>
            <CardContent className="px-3 pb-2 pt-0">
                {isLoading ? <Skeleton className="h-7 w-2/3" /> : <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">₹{totalSalesMonth.toLocaleString()}</div>}
            </CardContent>
        </Card>

         <Card className="bg-gradient-to-br from-amber-500/10 via-card to-orange-500/5 border-amber-500/30 shadow-md shadow-amber-500/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 py-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">Pending (Month)</CardTitle>
                <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <FileClock className="h-3.5 w-3.5" />
                </div>
            </CardHeader>
            <CardContent className="px-3 pb-2 pt-0">
                 {isLoading ? <Skeleton className="h-7 w-2/3" /> : <div className="text-xl font-bold text-amber-600 dark:text-amber-400">₹{pendingAmountMonth.toLocaleString()}</div>}
            </CardContent>
        </Card>

         <Card className="bg-gradient-to-br from-indigo-500/10 via-card to-sky-500/5 border-indigo-500/30 shadow-md shadow-indigo-500/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 py-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">Invoices (Month)</CardTitle>
                <div className="p-1.5 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                  <FileText className="h-3.5 w-3.5" />
                </div>
            </CardHeader>
            <CardContent className="px-3 pb-2 pt-0">
                 {isLoading ? <Skeleton className="h-7 w-1/3" /> : <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{invoiceCountMonth}</div>}
            </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-[#F62440]/10 via-card to-rose-500/5 border-[#F62440]/30 shadow-md shadow-[#F62440]/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 px-3 py-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">Total Invoices</CardTitle>
                <div className="p-1.5 rounded-lg bg-[#F62440]/15 text-[#F62440]">
                  <Files className="h-3.5 w-3.5" />
                </div>
            </CardHeader>
            <CardContent className="px-3 pb-2 pt-0">
                 {isLoading ? <Skeleton className="h-7 w-1/3" /> : <div className="text-xl font-bold text-[#F62440]">{totalInvoiceCount}</div>}
            </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="p-3 pb-2.5 space-y-2 border-b">
          {/* Top Line: Title, Count Badge, Clear Button */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold tracking-tight">Invoice History</CardTitle>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                {sales.length} {sales.length === 1 ? 'invoice' : 'invoices'}
              </Badge>
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
                placeholder="Search invoice # or customer..."
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
              />
              <span className="text-muted-foreground/40 text-xs">|</span>
              <span className="text-[11px] font-medium text-muted-foreground">To:</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-7 w-[125px] border-0 bg-transparent text-xs px-1 shadow-none focus-visible:ring-0"
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs w-[115px] bg-background">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Paid">Paid</SelectItem>
                <SelectItem value="Partial">Partial</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
              </SelectContent>
            </Select>

            {/* Sorting Filter */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-8 text-xs w-[140px] bg-background">
                <div className="flex items-center gap-1.5 truncate">
                  <ArrowUpDown className="h-3 w-3 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Sort by" />
                </div>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="date-desc">Date: Newest</SelectItem>
                <SelectItem value="date-asc">Date: Oldest</SelectItem>
                <SelectItem value="invoice-asc">Invoice #: 1, 2, 3..</SelectItem>
                <SelectItem value="invoice-desc">Invoice #: 3, 2, 1..</SelectItem>
                <SelectItem value="amount-desc">Total: High → Low</SelectItem>
                <SelectItem value="amount-asc">Total: Low → High</SelectItem>
                <SelectItem value="customer-asc">Customer: A → Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[16%] min-w-[130px]">Invoice #</TableHead>
                <TableHead className="w-[26%] min-w-[180px]">Customer</TableHead>
                <TableHead className="w-[14%] min-w-[110px]">Date</TableHead>
                <TableHead className="w-[10%] min-w-[80px]">Items</TableHead>
                <TableHead className="w-[10%] min-w-[80px]">Mode</TableHead>
                <TableHead className="w-[12%] min-w-[100px]">Payment Status</TableHead>
                <TableHead className="w-[12%] min-w-[100px] text-right">Total</TableHead>
                <TableHead className="w-[50px] text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && renderSkeleton()}
              {!isLoading && sales?.map((sale) => {
                const paid = sale.amountPaid ?? (sale.paymentStatus === 'Paid' ? sale.total : 0);
                const disc = sale.discount || 0;
                const due = Math.max(0, Math.round((sale.total - paid - disc) * 100) / 100);
                return (
                  <TableRow key={sale.id} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="font-semibold text-xs whitespace-nowrap">
                      <Link
                        href={`/sales/${sale.id}`}
                        className="font-mono text-primary hover:underline font-bold"
                      >
                        #{sale.invoiceNumber}
                      </Link>
                    </TableCell>

                    <TableCell>
                      <div className="font-medium text-xs text-foreground leading-tight">
                        {sale.customerName || 'Walk-in Customer'}
                      </div>
                      {sale.customerMobile && (
                        <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                          {sale.customerMobile}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(sale.date), 'dd-MMM-yyyy')}
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal">
                        {(sale.items || []).length} item{(sale.items || []).length === 1 ? '' : 's'}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-normal">
                        {sale.paymentMode || 'Cash'}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col gap-0.5 items-start">
                        <Badge
                          variant="outline"
                          className={`text-[10px] h-5 px-1.5 font-medium ${getStatusBadgeVariant(sale.paymentStatus)}`}
                        >
                          {sale.paymentStatus}
                        </Badge>
                        {disc > 0 && (
                          <Badge variant="outline" className="text-[9px] h-4 px-1 text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200">
                            Disc: ₹{disc.toLocaleString()}
                          </Badge>
                        )}
                        {sale.paymentStatus !== 'Paid' && due > 0 && (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                            Due: ₹{due.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-right font-bold font-mono text-xs whitespace-nowrap">
                      ₹{sale.total.toLocaleString()}
                    </TableCell>

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
                          <DropdownMenuLabel>Invoice Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => router.push(`/sales/${sale.id}`)}>
                            <FileText className="mr-2 h-4 w-4 text-primary" />
                            View Tax Invoice
                          </DropdownMenuItem>
                          {sale.paymentStatus !== 'Paid' && (
                            <DropdownMenuItem
                              onClick={() => setSaleToRecordPayment(sale)}
                              className="text-emerald-600 dark:text-emerald-400 font-semibold"
                            >
                              <Wallet className="mr-2 h-4 w-4" />
                              Record Payment
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => setSaleToPrint(sale)}>
                            <Printer className="mr-2 h-4 w-4" />
                            Print Thermal Receipt
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/sales/edit/${sale.id}`)}>
                            Edit Invoice
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <InvoiceFollowUpButton sale={sale} />
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600" onSelect={() => setSaleToDelete(sale)}>
                            Delete Invoice
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!isLoading && sales?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-xs text-muted-foreground">
                    No sales invoices match your filter criteria.
                    {hasActiveFilters && (
                      <Button variant="link" size="sm" onClick={resetFilters} className="text-xs h-auto p-0 ml-1.5 text-primary">
                        Clear all filters
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
       <AlertDialog
        open={!!saleToDelete}
        onOpenChange={(open) => !open && setSaleToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete invoice "{saleToDelete?.invoiceNumber}" and restock the items sold.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSale}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {saleToPrint && (
        <ThermalPrintDialog
          isOpen={!!saleToPrint}
          onOpenChange={(open) => !open && setSaleToPrint(null)}
          sale={saleToPrint}
          companyProfile={companyProfile || { id: '1', companyName: 'Win Automobiles', ownedBy: '', address: '', contact: '', gstNumber: '' }}
        />
      )}
      {saleToRecordPayment && (
        <RecordPaymentDialog
          isOpen={!!saleToRecordPayment}
          onOpenChange={(open) => !open && setSaleToRecordPayment(null)}
          sale={saleToRecordPayment}
        />
      )}
    </>
  );
}
