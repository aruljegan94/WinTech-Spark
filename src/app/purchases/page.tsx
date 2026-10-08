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
  MoreHorizontal, PlusCircle, Sparkles, CreditCard, Calendar as CalendarIcon,
  Loader2, Wallet, Search, ArrowUpDown, RotateCcw, X, Building2, ExternalLink,
  CheckCircle2, IndianRupee, AlertTriangle, ArrowRight
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Link from 'next/link';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, runTransaction, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import type { Purchase, Product, Vendor } from '@/lib/types';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { PurchaseOcrModal } from './_components/purchase-ocr-modal';
import { formatCurrency } from '@/lib/utils';

export default function PurchasesPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [purchaseToDelete, setPurchaseToDelete] = useState<Purchase | null>(null);
  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);

  // Filters & Sorting state
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('date-desc');

  // Update Payment modal state
  const [editingPaymentPurchase, setEditingPaymentPurchase] = useState<Purchase | null>(null);
  const [payStatus, setPayStatus] = useState<'Paid' | 'Partial' | 'Pending'>('Paid');
  const [payAmount, setPayAmount] = useState('');
  const [payDiscount, setPayDiscount] = useState('');
  const [payDueDate, setPayDueDate] = useState('');
  const [payNote, setPayNote] = useState('');
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);

  // Fetch Purchases
  const purchasesQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'purchases'), orderBy('date', 'desc')) : null),
    [firestore]
  );
  const { data: rawPurchases, isLoading: purchasesLoading } = useCollection<Purchase>(purchasesQuery);

  // Fetch Vendors to keep names, dues, and links synced
  const vendorsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'vendors') : null),
    [firestore]
  );
  const { data: vendors, isLoading: vendorsLoading } = useCollection<Vendor>(vendorsQuery);

  const productsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'products') : null),
    [firestore]
  );
  const { data: products } = useCollection<Product>(productsQuery);

  const isLoading = purchasesLoading || vendorsLoading;

  // Vendors map for quick lookup
  const vendorMap = useMemo(() => {
    const map = new Map<string, Vendor>();
    (vendors || []).forEach((v) => {
      map.set(v.id, v);
      if (v.companyName) map.set(v.companyName.toLowerCase().trim(), v);
    });
    return map;
  }, [vendors]);

  const purchases = useMemo(() => {
    if (!rawPurchases) return [];

    let list = rawPurchases.filter((p) => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        p.invoiceNo.toLowerCase().includes(q) ||
        p.supplierName.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (statusFilter !== 'all' && p.paymentStatus !== statusFilter) {
        return false;
      }

      if (startDate) {
        const start = startOfDay(new Date(startDate));
        if (new Date(p.date) < start) return false;
      }

      if (endDate) {
        const end = endOfDay(new Date(endDate));
        if (new Date(p.date) > end) return false;
      }

      return true;
    });

    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case 'date-asc':
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'invoice-asc':
          return a.invoiceNo.localeCompare(b.invoiceNo, undefined, { numeric: true });
        case 'invoice-desc':
          return b.invoiceNo.localeCompare(a.invoiceNo, undefined, { numeric: true });
        case 'amount-desc':
          return b.totalAmount - a.totalAmount;
        case 'amount-asc':
          return a.totalAmount - b.totalAmount;
        case 'supplier-asc':
          return a.supplierName.localeCompare(b.supplierName);
        case 'supplier-desc':
          return b.supplierName.localeCompare(a.supplierName);
        default:
          return 0;
      }
    });

    return list;
  }, [rawPurchases, searchTerm, statusFilter, startDate, endDate, sortBy]);

  // Overall financial summary for purchases
  const summaryMetrics = useMemo(() => {
    let totalBilled = 0;
    let totalPaid = 0;
    let totalDue = 0;
    let pendingBillsCount = 0;

    (rawPurchases || []).forEach((p) => {
      const tot = Number(p.totalAmount) || 0;
      const pd = p.amountPaid !== undefined
        ? Number(p.amountPaid)
        : (p.paymentStatus === 'Paid' ? tot : 0);
      const due = Math.max(0, tot - pd);

      totalBilled += tot;
      totalPaid += pd;
      totalDue += due;
      if (due > 0) pendingBillsCount++;
    });

    return { totalBilled, totalPaid, totalDue, pendingBillsCount };
  }, [rawPurchases]);

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

  const openPaymentModal = (purchase: Purchase) => {
    setEditingPaymentPurchase(purchase);
    const paid = purchase.amountPaid ?? (purchase.paymentStatus === 'Paid' ? purchase.totalAmount : 0);
    const disc = purchase.discount ?? 0;
    setPayStatus(purchase.paymentStatus || (paid + disc >= purchase.totalAmount ? 'Paid' : 'Pending'));
    setPayAmount(String(paid));
    setPayDiscount(disc > 0 ? String(disc) : '');
    setPayDueDate(purchase.dueDate ? purchase.dueDate.split('T')[0] : '');
    setPayNote(purchase.paymentNotes || '');
  };

  const handleUpdatePayment = async () => {
    if (!firestore || !editingPaymentPurchase) return;
    setIsUpdatingPayment(true);
    try {
      const numericPaid = Number(payAmount) || 0;
      const numericDiscount = Number(payDiscount) || 0;
      const totalCleared = Math.round((numericPaid + numericDiscount) * 100) / 100;
      const isFullyPaid = payStatus === 'Paid' || totalCleared >= editingPaymentPurchase.totalAmount - 0.01;
      const finalStatus: Purchase['paymentStatus'] = isFullyPaid ? 'Paid' : (totalCleared > 0 ? 'Partial' : 'Pending');

      const actualPaid = payStatus === 'Paid' && numericPaid === 0
        ? Math.max(0, editingPaymentPurchase.totalAmount - numericDiscount)
        : numericPaid;

      const oldPaid = editingPaymentPurchase.amountPaid ?? (editingPaymentPurchase.paymentStatus === 'Paid' ? editingPaymentPurchase.totalAmount : 0);
      const oldDiscount = editingPaymentPurchase.discount || 0;
      const oldCleared = oldPaid + oldDiscount;
      const oldPending = Math.max(0, editingPaymentPurchase.totalAmount - oldCleared);
      const newPending = Math.max(0, editingPaymentPurchase.totalAmount - (actualPaid + numericDiscount));
      const pendingDiff = newPending - oldPending;

      let isoDueDate: string | null = null;
      if (payDueDate && payDueDate.trim()) {
        const parsed = new Date(payDueDate);
        if (!isNaN(parsed.getTime())) {
          isoDueDate = parsed.toISOString();
        }
      }

      const purchaseRef = doc(firestore, 'purchases', editingPaymentPurchase.id);
      await updateDoc(purchaseRef, {
        paymentStatus: finalStatus,
        amountPaid: actualPaid,
        discount: numericDiscount,
        dueDate: isoDueDate,
        paymentNotes: payNote || '',
      });

      // Synchronize with linked vendor
      const linkedVendorId = editingPaymentPurchase.vendorId ||
        vendors?.find((v) =>
          editingPaymentPurchase.supplierName?.toLowerCase().includes(v.companyName.toLowerCase()) ||
          editingPaymentPurchase.supplierName?.toLowerCase().includes(v.name.toLowerCase())
        )?.id;

      if (linkedVendorId) {
        try {
          const vendorRef = doc(firestore, 'vendors', linkedVendorId);
          const vendorSnap = await getDoc(vendorRef);
          if (vendorSnap.exists()) {
            const currentVendorPending = vendorSnap.data().pendingAmount || 0;
            await updateDoc(vendorRef, {
              pendingAmount: Math.max(0, currentVendorPending + pendingDiff),
            });
          }
        } catch (vErr) {
          console.error("Vendor pending update skipped:", vErr);
        }
      }

      toast({
        title: 'Payment & Discount Updated',
        description: `Invoice #${editingPaymentPurchase.invoiceNo} marked as ${finalStatus}${
          numericDiscount > 0 ? ` with ₹${numericDiscount.toLocaleString()} discount` : ''
        }. Vendor balance synced.`,
      });
      setEditingPaymentPurchase(null);
    } catch (e: any) {
      console.error("Payment Update Failed:", e);
      toast({ variant: 'destructive', title: 'Payment Update Failed', description: e.message || 'Error updating payment.' });
    } finally {
      setIsUpdatingPayment(false);
    }
  };

  const handleDeletePurchase = async () => {
    if (!firestore || !purchaseToDelete) return;

    try {
      await runTransaction(firestore, async (transaction) => {
        const purchaseRef = doc(firestore, 'purchases', purchaseToDelete.id);
        const purchaseDoc = await transaction.get(purchaseRef);
        if (!purchaseDoc.exists()) {
          throw new Error("Purchase document not found!");
        }
        const purchaseData = purchaseDoc.data() as Purchase;

        // Revert inventory stock
        const productRefs = (purchaseData.items || []).map(item => doc(firestore, 'products', item.productId));
        const productDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));

        // Read vendor doc before any writes
        const vId = purchaseData.vendorId ||
          vendors?.find((v) =>
            purchaseData.supplierName?.toLowerCase().includes(v.companyName.toLowerCase()) ||
            purchaseData.supplierName?.toLowerCase().includes(v.name.toLowerCase())
          )?.id;

        let vRef = null;
        let vSnap = null;
        if (vId) {
          vRef = doc(firestore, 'vendors', vId);
          vSnap = await transaction.get(vRef);
        }

        // --- WRITE PHASE (after all reads are finished) ---
        productDocs.forEach((productDoc, index) => {
          if (productDoc.exists()) {
            const currentStock = productDoc.data().stockQuantity;
            const purchasedQuantity = (purchaseData.items || [])[index].quantity;
            const newStock = currentStock - purchasedQuantity;
            transaction.update(productRefs[index], { stockQuantity: newStock < 0 ? 0 : newStock });
          }
        });

        // Synchronize with Vendor: deduct unpaid portion of this deleted bill from vendor pending amount
        const unpaidOnThis = Math.max(0, purchaseData.totalAmount - (purchaseData.amountPaid || (purchaseData.paymentStatus === 'Paid' ? purchaseData.totalAmount : 0)));

        if (vRef && vSnap && vSnap.exists()) {
          const currentPending = vSnap.data().pendingAmount || 0;
          transaction.update(vRef, {
            pendingAmount: Math.max(0, currentPending - unpaidOnThis),
          });
        }

        transaction.delete(purchaseRef);
      });

      toast({
        title: 'Purchase Deleted & Synced',
        description: `Invoice #${purchaseToDelete.invoiceNo} deleted, stock reversed, and vendor balance synced.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error Deleting Purchase',
        description: error.message || 'There was a problem deleting the purchase.',
      });
    } finally {
      setPurchaseToDelete(null);
    }
  };

  const getStatusBadge = (status?: string, paid?: number, total?: number) => {
    const isFullyPaid = status === 'Paid' || (paid !== undefined && total !== undefined && paid >= total);
    if (isFullyPaid) {
      return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px]">Paid</Badge>;
    }
    if (status === 'Partial') {
      return <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/30 text-[10px]">Partial</Badge>;
    }
    return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px]">Pending</Badge>;
  };

  return (
    <>
      <PageHeader
        title="Purchases"
        description="Record and manage your purchase entries & supplier payments."
      >
        <Button
          size="sm"
          variant="outline"
          className="gap-1 border-primary/30 text-primary hover:bg-primary/10"
          onClick={() => setIsOcrModalOpen(true)}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
            AI Scan Invoice
          </span>
        </Button>
        <Button size="sm" className="gap-1" asChild>
          <Link href="/purchases/new">
            <PlusCircle className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
              Record Purchase
            </span>
          </Link>
        </Button>
      </PageHeader>

      {/* Synchronized Financial Overview Cards */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 mb-2">
        <Card className="border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Total Invoices</CardTitle>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
              <Building2 className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="text-xl font-bold">{isLoading ? '...' : (rawPurchases || []).length}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Recorded purchase entries</p>
          </CardContent>
        </Card>

        <Card className="border-slate-500/20 bg-gradient-to-br from-slate-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Total Purchases Billed</CardTitle>
            <div className="p-1.5 rounded-lg bg-slate-500/10 text-slate-500">
              <IndianRupee className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="text-xl font-bold">
              {isLoading ? '...' : `₹${summaryMetrics.totalBilled.toLocaleString()}`}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Total procurement cost</p>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Total Paid</CardTitle>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {isLoading ? '...' : `₹${summaryMetrics.totalPaid.toLocaleString()}`}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Disbursed to suppliers</p>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Total Unpaid Dues</CardTitle>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
              <AlertTriangle className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="flex items-baseline justify-between">
              <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
                {isLoading ? '...' : `₹${summaryMetrics.totalDue.toLocaleString()}`}
              </div>
              <Link
                href="/vendors?balance=pending"
                className="text-[11px] text-primary hover:underline flex items-center gap-0.5 font-medium"
              >
                View by Vendors <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {summaryMetrics.pendingBillsCount} invoice(s) pending payment
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Helpful banner linking directly to Vendors for consolidated dues */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg px-3.5 py-2 mb-2 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary shrink-0" />
          <span>
            <strong>Supplier Dues Notice:</strong> To see all bills and dues consolidated by supplier in one place, open the{' '}
            <Link href="/vendors" className="text-primary font-semibold underline underline-offset-2">
              Vendors Management Page
            </Link>
            .
          </span>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" asChild>
          <Link href="/vendors">Go to Vendors</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="p-3 pb-2.5 space-y-2 border-b">
          {/* Top Line: Title, Count Badge, Clear Button */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold tracking-tight">Purchase History</CardTitle>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                {purchases.length} {purchases.length === 1 ? 'order' : 'orders'}
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

          {/* Bottom Line: Full-width filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search input */}
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search invoice # or supplier..."
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

            {/* Date Range */}
            <div className="flex items-center gap-1.5 border rounded-md px-2 py-0.5 bg-background shadow-2xs">
              <span className="text-[11px] font-medium text-muted-foreground">From:</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-7 w-[125px] border-0 bg-transparent text-xs px-1 shadow-none focus-visible:ring-0"
                title="Date From"
              />
              <span className="text-muted-foreground/40 text-xs">|</span>
              <span className="text-[11px] font-medium text-muted-foreground">To:</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-7 w-[125px] border-0 bg-transparent text-xs px-1 shadow-none focus-visible:ring-0"
                title="Date To"
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs w-[120px] bg-background">
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
              <SelectTrigger className="h-8 text-xs w-[145px] bg-background">
                <div className="flex items-center gap-1.5 truncate">
                  <ArrowUpDown className="h-3 w-3 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Sort by" />
                </div>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="date-desc">Date: Newest</SelectItem>
                <SelectItem value="date-asc">Date: Oldest</SelectItem>
                <SelectItem value="invoice-asc">Invoice #: 1,2,3..</SelectItem>
                <SelectItem value="invoice-desc">Invoice #: 3,2,1..</SelectItem>
                <SelectItem value="amount-desc">Total: High → Low</SelectItem>
                <SelectItem value="amount-asc">Total: Low → High</SelectItem>
                <SelectItem value="supplier-asc">Supplier: A → Z</SelectItem>
                <SelectItem value="supplier-desc">Supplier: Z → A</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[130px]">Invoice No</TableHead>
                <TableHead className="min-w-[170px]">Supplier / Vendor</TableHead>
                <TableHead className="w-[110px]">Date</TableHead>
                <TableHead className="w-[90px]">Items</TableHead>
                <TableHead className="w-[140px]">Payment Status</TableHead>
                <TableHead className="w-[110px]">Due Date</TableHead>
                <TableHead className="w-[120px] text-right">Total Amount</TableHead>
                <TableHead className="w-[60px] text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Loading purchases...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && purchases.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-xs text-muted-foreground">
                    No purchase invoices match your filter criteria.
                    {hasActiveFilters && (
                      <Button variant="link" size="sm" onClick={resetFilters} className="text-xs h-auto p-0 ml-1.5 text-primary">
                        Clear all filters
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )}
              {!isLoading &&
                purchases.map((purchase) => {
                  const paid = purchase.amountPaid ?? (purchase.paymentStatus === 'Paid' ? purchase.totalAmount : 0);
                  const disc = purchase.discount || 0;
                  const total = purchase.totalAmount;
                  const billDue = Math.max(0, total - paid - disc);

                  // Check linked vendor
                  const linkedVendor = purchase.vendorId
                    ? vendorMap.get(purchase.vendorId)
                    : vendors?.find((v) =>
                        purchase.supplierName?.toLowerCase().includes(v.companyName.toLowerCase()) ||
                        purchase.supplierName?.toLowerCase().includes(v.name.toLowerCase())
                      );

                  return (
                    <TableRow key={purchase.id}>
                      <TableCell className="font-semibold text-xs whitespace-nowrap">
                        <Link
                          href={`/purchases/${purchase.id}`}
                          className="hover:underline text-primary flex items-center gap-1 font-mono"
                        >
                          {purchase.invoiceNo}
                        </Link>
                      </TableCell>

                      <TableCell className="text-xs">
                        <div className="font-medium text-foreground">{purchase.supplierName}</div>
                        {linkedVendor ? (
                          <Link
                            href={`/vendors?search=${encodeURIComponent(linkedVendor.companyName)}`}
                            className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 mt-0.5"
                            title="View vendor statement & total dues"
                          >
                            <Building2 className="h-2.5 w-2.5" />
                            <span>Vendor Directory</span>
                            {linkedVendor.pendingAmount > 0 && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 bg-amber-500/10 text-amber-600 border-amber-500/30">
                                ₹{linkedVendor.pendingAmount.toLocaleString()} total due
                              </Badge>
                            )}
                          </Link>
                        ) : null}
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(purchase.date), 'dd-MMM-yyyy')}
                      </TableCell>

                      <TableCell>
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal">
                          {(purchase.items || []).length} item(s)
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col gap-0.5 items-start">
                          {getStatusBadge(purchase.paymentStatus, paid + disc, total)}
                          {disc > 0 && (
                            <span className="text-[10px] text-primary font-medium font-mono">
                              Disc: ₹{formatCurrency(disc)}
                            </span>
                          )}
                          {billDue > 0 && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium font-mono">
                              Due: ₹{formatCurrency(billDue)}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-xs whitespace-nowrap">
                        {purchase.dueDate ? (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <CalendarIcon className="h-3 w-3 text-amber-500" />
                            {format(new Date(purchase.dueDate), 'dd-MMM-yyyy')}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell className="text-right font-semibold text-xs whitespace-nowrap font-mono">
                        ₹{formatCurrency(total)}
                      </TableCell>

                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Toggle menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => openPaymentModal(purchase)}>
                              <CreditCard className="mr-2 h-4 w-4 text-primary" /> Update Payment
                            </DropdownMenuItem>
                            {linkedVendor && (
                              <DropdownMenuItem asChild>
                                <Link href={`/vendors?search=${encodeURIComponent(linkedVendor.companyName)}`}>
                                  <Building2 className="mr-2 h-4 w-4 text-muted-foreground" /> View Vendor Dues
                                </Link>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-red-600"
                              onSelect={() => setPurchaseToDelete(purchase)}
                            >
                              Delete Purchase
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Update Payment Modal */}
      <Dialog open={!!editingPaymentPurchase} onOpenChange={(open) => !open && setEditingPaymentPurchase(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Payment & Due Date</DialogTitle>
            <DialogDescription>
              Invoice: <strong>#{editingPaymentPurchase?.invoiceNo}</strong> ({editingPaymentPurchase?.supplierName})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {editingPaymentPurchase && (() => {
              const totalBill = editingPaymentPurchase.totalAmount || 0;
              const numericPaid = Number(payAmount) || 0;
              const numericDiscount = Number(payDiscount) || 0;
              const totalSettledNow = Math.round((numericPaid + numericDiscount) * 100) / 100;
              const remainingDue = Math.max(0, Math.round((totalBill - totalSettledNow) * 100) / 100);
              const diffFromPaid = Math.max(0, Math.round((totalBill - numericPaid) * 100) / 100);

              return (
                <div className="space-y-3">
                  <div className="bg-muted/40 border rounded-lg p-2.5 text-xs flex justify-between items-center">
                    <div>
                      <span className="text-muted-foreground">Total Bill: </span>
                      <strong className="text-foreground font-bold font-mono">₹{formatCurrency(totalBill)}</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Remaining: </span>
                      <strong className={remainingDue > 0 ? "text-amber-600 dark:text-amber-400 font-bold font-mono" : "text-emerald-600 font-bold font-mono"}>
                        ₹{formatCurrency(remainingDue)}
                      </strong>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Payment Status</Label>
                    <Select
                      value={payStatus}
                      onValueChange={(val: any) => {
                        setPayStatus(val);
                        if (val === 'Paid') {
                          const disc = Number(payDiscount) || 0;
                          setPayAmount(String(Math.max(0, Math.round((totalBill - disc) * 100) / 100)));
                        }
                      }}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Paid">Fully Paid / Settled</SelectItem>
                        <SelectItem value="Partial">Partial Payment</SelectItem>
                        <SelectItem value="Pending">Pending / Unpaid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <Label className="text-xs">Amount Paid (₹)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0.00"
                        className="h-9 text-xs font-mono"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Discount / Concession (₹)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0.00"
                        className="h-9 text-xs font-mono"
                        value={payDiscount}
                        onChange={(e) => setPayDiscount(e.target.value)}
                      />
                    </div>
                  </div>

                  {diffFromPaid > 0 && numericPaid > 0 && Number(payDiscount || 0) === 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-[11px] h-7 w-full border-dashed text-primary"
                      onClick={() => setPayDiscount(String(diffFromPaid))}
                    >
                      Supplier offered ₹{diffFromPaid.toLocaleString()} discount? Settle full bill
                    </Button>
                  )}

                  {/* Live settlement breakdown preview */}
                  <div className="p-2 rounded-lg bg-primary/5 border border-primary/20 text-[11px] space-y-1">
                    <div className="flex justify-between font-medium">
                      <span>Total Cleared Now:</span>
                      <span className="font-bold text-foreground">
                        ₹{numericPaid.toLocaleString()} (Paid) + ₹{numericDiscount.toLocaleString()} (Disc) = ₹{totalSettledNow.toLocaleString()}
                      </span>
                    </div>
                    {totalSettledNow >= totalBill - 0.01 && (
                      <div className="text-emerald-600 dark:text-emerald-400 font-semibold text-[10px]">
                        ✓ Invoice will be marked as Fully Settled (Paid)
                      </div>
                    )}
                  </div>

                  {remainingDue > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs">Payment Due Date (Reminder)</Label>
                      <Input
                        type="date"
                        className="h-9 text-xs"
                        value={payDueDate}
                        onChange={(e) => setPayDueDate(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label className="text-xs">Settlement Note (Optional)</Label>
                    <Input
                      placeholder="e.g. Cleared via Cheque #1029 or Cash discount"
                      className="h-9 text-xs"
                      value={payNote}
                      onChange={(e) => setPayNote(e.target.value)}
                    />
                  </div>
                </div>
              );
            })()}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPaymentPurchase(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdatePayment} disabled={isUpdatingPayment} className="gap-2">
              {isUpdatingPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              Save Payment Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Purchase Dialog */}
      <AlertDialog
        open={!!purchaseToDelete}
        onOpenChange={(open: boolean) => !open && setPurchaseToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase Entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will permanently delete invoice "{purchaseToDelete?.invoiceNo}", revert inventory stock quantities, and automatically sync the supplier's pending balance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePurchase}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PurchaseOcrModal
        isOpen={isOcrModalOpen}
        onOpenChange={setIsOcrModalOpen}
        products={products || []}
        onPurchaseRecorded={() => {
          toast({
            title: 'Inventory Updated',
            description: 'Stock quantities have been updated from the scanned purchase invoice.',
          });
        }}
      />
    </>
  );
}
