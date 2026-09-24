'use client';

import { useState } from 'react';
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
import { MoreHorizontal, PlusCircle, Sparkles, CreditCard, Calendar as CalendarIcon, Loader2, Wallet } from 'lucide-react';
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
import type { Purchase, Product } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { PurchaseOcrModal } from './_components/purchase-ocr-modal';

export default function PurchasesPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();
  const [purchaseToDelete, setPurchaseToDelete] = useState<Purchase | null>(null);
  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);

  // Update Payment modal state
  const [editingPaymentPurchase, setEditingPaymentPurchase] = useState<Purchase | null>(null);
  const [payStatus, setPayStatus] = useState<'Paid' | 'Partial' | 'Pending'>('Paid');
  const [payAmount, setPayAmount] = useState('');
  const [payDueDate, setPayDueDate] = useState('');
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);

  const purchasesQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'purchases'), orderBy('date', 'desc')) : null),
    [firestore]
  );
  const { data: purchases, isLoading } = useCollection<Purchase>(purchasesQuery);

  const productsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'products') : null),
    [firestore]
  );
  const { data: products } = useCollection<Product>(productsQuery);

  const openPaymentModal = (purchase: Purchase) => {
    setEditingPaymentPurchase(purchase);
    setPayStatus(purchase.paymentStatus || (purchase.amountPaid && purchase.amountPaid >= purchase.totalAmount ? 'Paid' : 'Pending'));
    setPayAmount(String(purchase.amountPaid ?? (purchase.paymentStatus === 'Paid' ? purchase.totalAmount : 0)));
    setPayDueDate(purchase.dueDate ? purchase.dueDate.split('T')[0] : '');
  };

  const handleUpdatePayment = async () => {
    if (!firestore || !editingPaymentPurchase) return;
    setIsUpdatingPayment(true);
    try {
      const numericPaid = payStatus === 'Paid' ? editingPaymentPurchase.totalAmount : Number(payAmount) || 0;
      const oldPending = Math.max(0, editingPaymentPurchase.totalAmount - (editingPaymentPurchase.amountPaid || 0));
      const newPending = Math.max(0, editingPaymentPurchase.totalAmount - numericPaid);
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
        paymentStatus: payStatus,
        amountPaid: numericPaid,
        dueDate: isoDueDate,
      });

      if (editingPaymentPurchase.vendorId) {
        try {
          const vendorRef = doc(firestore, 'vendors', editingPaymentPurchase.vendorId);
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
        title: 'Payment Updated',
        description: `Invoice #${editingPaymentPurchase.invoiceNo} payment marked as ${payStatus}.`,
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

        const productRefs = (purchaseData.items || []).map(item => doc(firestore, 'products', item.productId));
        const productDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));

        productDocs.forEach((productDoc, index) => {
          if (productDoc.exists()) {
            const currentStock = productDoc.data().stockQuantity;
            const purchasedQuantity = (purchaseData.items || [])[index].quantity;
            const newStock = currentStock - purchasedQuantity;
            transaction.update(productRefs[index], { stockQuantity: newStock < 0 ? 0 : newStock });
          }
        });
        
        transaction.delete(purchaseRef);
      });

      toast({
        title: 'Purchase Deleted',
        description: `Invoice #${purchaseToDelete.invoiceNo} has been deleted and stock updated.`,
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
      return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">Paid</Badge>;
    }
    if (status === 'Partial') {
      return <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/30">Partial</Badge>;
    }
    return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">Pending</Badge>;
  };

  return (
    <>
      <PageHeader
        title="Purchases"
        description="Record and manage your purchase entries & vendor payments."
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

      <Card>
        <CardHeader>
          <CardTitle>Purchase History</CardTitle>
          <CardDescription>A list of all purchase entries and supplier payment statuses.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice No</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Payment Status</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
              {!isLoading && (purchases || []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No purchase invoices recorded yet.
                  </TableCell>
                </TableRow>
              )}
              {!isLoading &&
                purchases?.map((purchase) => {
                  const paid = purchase.amountPaid ?? (purchase.paymentStatus === 'Paid' ? purchase.totalAmount : 0);
                  const total = purchase.totalAmount;
                  return (
                    <TableRow key={purchase.id}>
                      <TableCell className="font-semibold">{purchase.invoiceNo}</TableCell>
                      <TableCell>{purchase.supplierName}</TableCell>
                      <TableCell>{format(new Date(purchase.date), 'dd-MMM-yyyy')}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{(purchase.items || []).length} item(s)</Badge>
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col gap-1 items-start">
                          {getStatusBadge(purchase.paymentStatus, paid, total)}
                          {paid < total && (
                            <span className="text-[11px] text-muted-foreground">
                              Paid: ₹{paid.toLocaleString()} / ₹{total.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-xs">
                        {purchase.dueDate ? (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <CalendarIcon className="h-3 w-3 text-amber-500" />
                            {format(new Date(purchase.dueDate), 'dd-MMM-yyyy')}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell className="text-right font-bold">
                        ₹{total.toLocaleString()}
                      </TableCell>

                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Toggle menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => openPaymentModal(purchase)}>
                              <CreditCard className="mr-2 h-4 w-4 text-primary" /> Update Payment
                            </DropdownMenuItem>
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
            <div className="space-y-1">
              <Label>Payment Status</Label>
              <Select
                value={payStatus}
                onValueChange={(val: any) => {
                  setPayStatus(val);
                  if (val === 'Paid' && editingPaymentPurchase) {
                    setPayAmount(String(editingPaymentPurchase.totalAmount));
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Paid">Fully Paid</SelectItem>
                  <SelectItem value="Partial">Partial Payment</SelectItem>
                  <SelectItem value="Pending">Pending / Unpaid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {payStatus === 'Partial' && (
              <div className="space-y-1">
                <Label>Amount Paid (₹)</Label>
                <Input
                  type="number"
                  placeholder="Enter paid amount"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </div>
            )}

            {payStatus !== 'Paid' && (
              <div className="space-y-1">
                <Label>Payment Due Date (Alert Reminder)</Label>
                <Input
                  type="date"
                  value={payDueDate}
                  onChange={(e) => setPayDueDate(e.target.value)}
                />
              </div>
            )}
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
              This action will permanently delete invoice "{purchaseToDelete?.invoiceNo}" and revert stock quantities for all items in this purchase.
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
