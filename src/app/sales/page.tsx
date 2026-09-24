
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
import { MoreHorizontal, PlusCircle, IndianRupee, FileText, FileClock, Files, Printer } from 'lucide-react';
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
import {
  useCollection,
  useFirestore,
  useMemoFirebase,
} from '@/firebase';
import { collection, query, orderBy, doc, runTransaction, where } from 'firebase/firestore';
import type { Sale, CompanyProfile } from '@/lib/types';
import { format, isThisMonth } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

export default function SalesPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null);
  const [saleToPrint, setSaleToPrint] = useState<Sale | null>(null);

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
  const { data: sales, isLoading } = useCollection<Sale>(salesQuery);
  
  const { totalSalesMonth, pendingAmountMonth, invoiceCountMonth, totalInvoiceCount } = useMemo(() => {
    if (!sales) {
      return {
        totalSalesMonth: 0,
        pendingAmountMonth: 0,
        invoiceCountMonth: 0,
        totalInvoiceCount: 0,
      };
    }

    const monthlySales = sales.filter(s => isThisMonth(new Date(s.date)));
    
    const totalSalesMonth = monthlySales.reduce((sum, s) => sum + s.total, 0);

    const pendingAmountMonth = monthlySales
      .filter(s => s.paymentStatus === 'Pending' || s.paymentStatus === 'Partial')
      .reduce((sum, s) => {
        if (s.paymentStatus === 'Pending') {
          return sum + s.total;
        }
        // For partial, it's the remaining amount
        return sum + (s.total - (s.amountPaid || 0));
      }, 0);

    return {
      totalSalesMonth,
      pendingAmountMonth,
      invoiceCountMonth: monthlySales.length,
      totalInvoiceCount: sales.length,
    };
  }, [sales]);


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

        productDocs.forEach((productDoc, index) => {
          if (productDoc.exists()) {
            const currentStock = productDoc.data().stockQuantity;
            const soldQuantity = (saleData.items || [])[index].quantity;
            const newStock = currentStock + soldQuantity;
            transaction.update(productRefs[index], { stockQuantity: newStock });
          }
        });
        
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4">
        <Card className="bg-gradient-to-br from-emerald-500/10 via-card to-emerald-500/5 border-emerald-500/30 shadow-md shadow-emerald-500/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Total Sales (Month)</CardTitle>
                <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <IndianRupee className="h-4 w-4" />
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? <Skeleton className="h-8 w-2/3" /> : <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">₹{totalSalesMonth.toLocaleString()}</div>}
            </CardContent>
        </Card>

         <Card className="bg-gradient-to-br from-amber-500/10 via-card to-orange-500/5 border-amber-500/30 shadow-md shadow-amber-500/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Pending (Month)</CardTitle>
                <div className="p-2 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <FileClock className="h-4 w-4" />
                </div>
            </CardHeader>
            <CardContent>
                 {isLoading ? <Skeleton className="h-8 w-2/3" /> : <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">₹{pendingAmountMonth.toLocaleString()}</div>}
            </CardContent>
        </Card>

         <Card className="bg-gradient-to-br from-indigo-500/10 via-card to-sky-500/5 border-indigo-500/30 shadow-md shadow-indigo-500/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Invoices (Month)</CardTitle>
                <div className="p-2 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                  <FileText className="h-4 w-4" />
                </div>
            </CardHeader>
            <CardContent>
                 {isLoading ? <Skeleton className="h-8 w-1/3" /> : <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{invoiceCountMonth}</div>}
            </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-[#F62440]/10 via-card to-rose-500/5 border-[#F62440]/30 shadow-md shadow-[#F62440]/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Total Invoices</CardTitle>
                <div className="p-2 rounded-lg bg-[#F62440]/15 text-[#F62440]">
                  <Files className="h-4 w-4" />
                </div>
            </CardHeader>
            <CardContent>
                 {isLoading ? <Skeleton className="h-8 w-1/3" /> : <div className="text-2xl font-bold text-[#F62440]">{totalInvoiceCount}</div>}
            </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Invoice History</CardTitle>
          <CardDescription>
            A list of all your sales invoices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && renderSkeleton()}
              {!isLoading && sales?.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="font-medium">
                    {sale.invoiceNumber}
                  </TableCell>
                  <TableCell>{sale.customerName || 'N/A'}</TableCell>
                  <TableCell>{format(new Date(sale.date), 'dd-MMM-yyyy')}</TableCell>
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
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-haspopup="true"
                          size="icon"
                          variant="ghost"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Toggle menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => router.push(`/sales/${sale.id}`)}>
                          View Invoice
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSaleToPrint(sale)}>
                          <Printer className="mr-2 h-4 w-4" />
                          Print Thermal Receipt
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push(`/sales/edit/${sale.id}`)}>
                          Edit / Update Payment
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <InvoiceFollowUpButton sale={sale} />
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600" onSelect={() => setSaleToDelete(sale)}>
                            Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
               {!isLoading && sales?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center p-8 text-muted-foreground">
                    No sales invoices have been created yet.
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
    </>
  );
}
