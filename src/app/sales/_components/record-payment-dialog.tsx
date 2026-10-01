'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useFirestore } from '@/firebase';
import { doc, runTransaction } from 'firebase/firestore';
import type { Sale } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { IndianRupee, Loader2, CheckCircle2, Wallet, CreditCard, Banknote } from 'lucide-react';
import { format } from 'date-fns';

interface RecordPaymentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale;
  onSuccess?: () => void;
}

export function RecordPaymentDialog({
  isOpen,
  onOpenChange,
  sale,
  onSuccess,
}: RecordPaymentDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();

  const currentPaid = sale.amountPaid !== undefined
    ? sale.amountPaid
    : (sale.paymentStatus === 'Paid' ? sale.total : 0);
  const balanceDue = Math.max(0, Math.round((sale.total - currentPaid) * 100) / 100);

  const [paymentAmount, setPaymentAmount] = useState<string>(balanceDue.toString());
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Bank Transfer'>('UPI');
  const [paymentDate, setPaymentDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [paymentNote, setPaymentNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handlePayFull = () => {
    setPaymentAmount(balanceDue.toString());
  };

  const handlePayHalf = () => {
    setPaymentAmount((Math.round((balanceDue / 2) * 100) / 100).toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid Amount',
        description: 'Please enter a valid payment amount greater than 0.',
      });
      return;
    }

    if (amount > balanceDue + 0.01) {
      toast({
        variant: 'destructive',
        title: 'Amount Exceeds Due',
        description: `Payment amount cannot exceed outstanding balance of ₹${balanceDue.toLocaleString()}.`,
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await runTransaction(firestore, async (transaction) => {
        const saleRef = doc(firestore, 'sales', sale.id);
        const saleDoc = await transaction.get(saleRef);
        if (!saleDoc.exists()) {
          throw new Error('Invoice not found');
        }

        const saleData = saleDoc.data() as Sale;
        const prevPaid = saleData.amountPaid !== undefined
          ? saleData.amountPaid
          : (saleData.paymentStatus === 'Paid' ? saleData.total : 0);
        const newTotalPaid = Math.round((prevPaid + amount) * 100) / 100;
        const isFullyPaid = newTotalPaid >= saleData.total - 0.01;
        const newStatus: Sale['paymentStatus'] = isFullyPaid ? 'Paid' : 'Partial';

        const paymentLog = `\n[${paymentDate}] Paid ₹${amount.toLocaleString()} via ${paymentMode}${
          paymentNote ? ` (${paymentNote})` : ''
        }`;
        const updatedNotes = (saleData.notes || '') + paymentLog;

        // 1. Update Sale
        transaction.update(saleRef, {
          amountPaid: newTotalPaid,
          paymentStatus: newStatus,
          status: newStatus,
          paymentMode: paymentMode,
          notes: updatedNotes,
        });

        // 2. Update Customer pending balance if linked
        if (saleData.customerId) {
          const customerRef = doc(firestore, 'customers', saleData.customerId);
          const customerDoc = await transaction.get(customerRef);
          if (customerDoc.exists()) {
            const currentDue = customerDoc.data().pendingDue || 0;
            const newDue = Math.max(0, Math.round((currentDue - amount) * 100) / 100);
            transaction.update(customerRef, {
              pendingDue: newDue,
              updatedAt: new Date().toISOString(),
            });
          }
        }
      });

      toast({
        title: 'Payment Recorded Successfully',
        description: `₹${amount.toLocaleString()} recorded via ${paymentMode}. Invoice updated.`,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error('Error recording payment:', error);
      toast({
        variant: 'destructive',
        title: 'Payment Error',
        description: error.message || 'Failed to record payment. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <div className="p-2 rounded-full bg-emerald-100 dark:bg-emerald-950/60">
                <Wallet className="h-5 w-5" />
              </div>
              <DialogTitle className="text-lg">Record Invoice Payment</DialogTitle>
            </div>
            <DialogDescription>
              Record an incoming payment for Invoice <strong>{sale.invoiceNumber}</strong>.
            </DialogDescription>
          </DialogHeader>

          {/* Amount Overview Card */}
          <div className="my-4 rounded-xl border bg-muted/40 p-3.5 space-y-2">
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>Customer:</span>
              <span className="font-semibold text-foreground">{sale.customerName || 'Walk-in Customer'}</span>
            </div>
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>Total Invoice Amount:</span>
              <span className="font-mono font-medium text-foreground">₹{sale.total.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>Already Received:</span>
              <span className="font-mono text-emerald-600 font-medium">₹{currentPaid.toLocaleString()}</span>
            </div>
            <div className="border-t pt-2 flex justify-between items-center text-sm font-bold">
              <span>Outstanding Due:</span>
              <span className="font-mono text-amber-600 dark:text-amber-400 text-base">
                ₹{balanceDue.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {/* Payment Amount Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="payment-amount" className="text-xs font-semibold">
                  Amount Received (₹) *
                </Label>
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handlePayFull}
                    className="h-6 px-2 text-[11px] text-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200"
                  >
                    Pay Full (₹{balanceDue.toLocaleString()})
                  </Button>
                  {balanceDue > 100 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handlePayHalf}
                      className="h-6 px-2 text-[11px]"
                    >
                      50%
                    </Button>
                  )}
                </div>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground font-semibold">₹</span>
                <Input
                  id="payment-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={balanceDue}
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="pl-7 font-mono font-bold text-base"
                />
              </div>
            </div>

            {/* Payment Mode Selector */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Payment Mode</Label>
              <RadioGroup
                value={paymentMode}
                onValueChange={(val: 'Cash' | 'UPI' | 'Bank Transfer') => setPaymentMode(val)}
                className="grid grid-cols-3 gap-2"
              >
                <label
                  htmlFor="mode-upi"
                  className={`flex flex-col items-center justify-center p-2.5 rounded-lg border cursor-pointer text-xs font-medium transition-colors ${
                    paymentMode === 'UPI'
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border/70 hover:bg-muted/50'
                  }`}
                >
                  <RadioGroupItem value="UPI" id="mode-upi" className="sr-only" />
                  <CreditCard className="h-4 w-4 mb-1" />
                  UPI / QR
                </label>

                <label
                  htmlFor="mode-cash"
                  className={`flex flex-col items-center justify-center p-2.5 rounded-lg border cursor-pointer text-xs font-medium transition-colors ${
                    paymentMode === 'Cash'
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border/70 hover:bg-muted/50'
                  }`}
                >
                  <RadioGroupItem value="Cash" id="mode-cash" className="sr-only" />
                  <Banknote className="h-4 w-4 mb-1" />
                  Cash
                </label>

                <label
                  htmlFor="mode-bank"
                  className={`flex flex-col items-center justify-center p-2.5 rounded-lg border cursor-pointer text-xs font-medium transition-colors ${
                    paymentMode === 'Bank Transfer'
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border/70 hover:bg-muted/50'
                  }`}
                >
                  <RadioGroupItem value="Bank Transfer" id="mode-bank" className="sr-only" />
                  <IndianRupee className="h-4 w-4 mb-1" />
                  Net Banking
                </label>
              </RadioGroup>
            </div>

            {/* Payment Date & Reference */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="pay-date" className="text-xs">Payment Date</Label>
                <Input
                  id="pay-date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="pay-ref" className="text-xs">Ref / Note (Optional)</Label>
                <Input
                  id="pay-ref"
                  placeholder="e.g. UTR #12345"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-5 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gap-1.5">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Confirm Payment (₹{paymentAmount ? parseFloat(paymentAmount).toLocaleString() : '0'})
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
