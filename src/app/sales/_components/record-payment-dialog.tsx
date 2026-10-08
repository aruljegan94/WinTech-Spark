'use client';

import { useState, useEffect } from 'react';
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
import {
  IndianRupee,
  Loader2,
  CheckCircle2,
  Wallet,
  CreditCard,
  Banknote,
  Tag,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';

interface RecordPaymentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale | null;
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

  const currentPaid = sale
    ? (sale.amountPaid !== undefined
        ? sale.amountPaid
        : (sale.paymentStatus === 'Paid' ? sale.total : 0))
    : 0;
  const currentDiscount = sale?.discount || 0;
  const balanceDue = sale
    ? Math.max(0, Math.round((sale.total - currentPaid - currentDiscount) * 100) / 100)
    : 0;

  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [discountAmount, setDiscountAmount] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Bank Transfer'>('Cash');
  const [paymentDate, setPaymentDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [paymentNote, setPaymentNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Sync state whenever dialog opens or target sale changes
  useEffect(() => {
    if (isOpen && sale) {
      const paid = sale.amountPaid !== undefined
        ? sale.amountPaid
        : (sale.paymentStatus === 'Paid' ? sale.total : 0);
      const disc = sale.discount || 0;
      const due = Math.max(0, Math.round((sale.total - paid - disc) * 100) / 100);

      setPaymentAmount(due.toString());
      setDiscountAmount('');
      setPaymentMode('Cash');
      setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
      setPaymentNote('');
    }
  }, [isOpen, sale]);

  if (!sale) return null;

  const parsedAmount = parseFloat(paymentAmount) || 0;
  const parsedDiscount = parseFloat(discountAmount) || 0;
  const totalSettledNow = Math.round((parsedAmount + parsedDiscount) * 100) / 100;
  const remainingAfterPayment = Math.max(0, Math.round((balanceDue - totalSettledNow) * 100) / 100);
  const willBeFullySettled = totalSettledNow >= balanceDue - 0.01 && balanceDue > 0;

  // Potential difference between outstanding and what customer wants to pay
  const bargainDifference = Math.max(0, Math.round((balanceDue - parsedAmount) * 100) / 100);

  const handlePayFull = () => {
    setPaymentAmount(balanceDue.toString());
    setDiscountAmount('');
  };

  const handlePayHalf = () => {
    setPaymentAmount((Math.round((balanceDue / 2) * 100) / 100).toString());
    setDiscountAmount('');
  };

  const handleApplyBargainDiff = () => {
    if (bargainDifference > 0) {
      setDiscountAmount(bargainDifference.toString());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !sale) return;

    const amount = parseFloat(paymentAmount);
    const discount = parseFloat(discountAmount) || 0;

    const numAmount = isNaN(amount) ? 0 : amount;
    const numDiscount = isNaN(discount) ? 0 : discount;

    if (numAmount <= 0 && numDiscount <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid Settlement',
        description: 'Please enter a payment amount or a discount concession greater than ₹0.',
      });
      return;
    }

    if (numAmount < 0 || numDiscount < 0) {
      toast({
        variant: 'destructive',
        title: 'Negative Values Not Allowed',
        description: 'Payment and discount amounts cannot be negative.',
      });
      return;
    }

    const totalToApply = Math.round((numAmount + numDiscount) * 100) / 100;
    if (totalToApply > balanceDue + 0.01) {
      toast({
        variant: 'destructive',
        title: 'Exceeds Outstanding Due',
        description: `Total cleared (₹${totalToApply.toLocaleString()}) cannot exceed outstanding balance of ₹${balanceDue.toLocaleString()}.`,
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await runTransaction(firestore, async (transaction) => {
        // --- 1. READ PHASE (all reads MUST precede any writes) ---
        const saleRef = doc(firestore, 'sales', sale.id);
        const saleDoc = await transaction.get(saleRef);
        if (!saleDoc.exists()) {
          throw new Error('Invoice not found');
        }

        const saleData = saleDoc.data() as Sale;
        const targetCustomerId = saleData.customerId || sale.customerId;

        let customerRef = null;
        let customerDoc = null;
        if (targetCustomerId) {
          customerRef = doc(firestore, 'customers', targetCustomerId);
          customerDoc = await transaction.get(customerRef);
        }

        // --- 2. LOGIC PHASE ---
        const prevPaid = saleData.amountPaid !== undefined
          ? saleData.amountPaid
          : (saleData.paymentStatus === 'Paid' ? saleData.total : 0);
        const prevDiscount = saleData.discount || 0;

        const newTotalPaid = Math.round((prevPaid + numAmount) * 100) / 100;
        const newTotalDiscount = Math.round((prevDiscount + numDiscount) * 100) / 100;

        const totalClearedSoFar = Math.round((newTotalPaid + newTotalDiscount) * 100) / 100;
        const isFullyPaid = totalClearedSoFar >= saleData.total - 0.01;
        const newStatus: Sale['paymentStatus'] = isFullyPaid ? 'Paid' : 'Partial';

        // Build audit log entry
        let paymentLog = `\n[${paymentDate}] Received ₹${numAmount.toLocaleString()} via ${paymentMode}`;
        if (numDiscount > 0) {
          paymentLog += ` (Bargain Discount: ₹${numDiscount.toLocaleString()})`;
        }
        if (isFullyPaid) {
          paymentLog += ' [Settled in Full]';
        }
        if (paymentNote.trim()) {
          paymentLog += ` - ${paymentNote.trim()}`;
        }

        const updatedNotes = (saleData.notes || '') + paymentLog;

        // --- 3. WRITE PHASE (all writes executed here) ---
        // 1. Update Sale
        transaction.update(saleRef, {
          amountPaid: newTotalPaid,
          discount: newTotalDiscount,
          paymentStatus: newStatus,
          status: newStatus,
          paymentMode: paymentMode,
          notes: updatedNotes,
        });

        // 2. Update Customer pending balance if linked
        if (customerRef && customerDoc && customerDoc.exists()) {
          const currentDue = customerDoc.data().pendingDue || 0;
          // Deduct the entire cleared sum (amount collected + bargain discount given)
          const newDue = Math.max(0, Math.round((currentDue - totalToApply) * 100) / 100);
          transaction.update(customerRef, {
            pendingDue: newDue,
            updatedAt: new Date().toISOString(),
          });
        }
      });

      toast({
        title: willBeFullySettled ? 'Invoice Settled in Full!' : 'Payment & Discount Recorded',
        description: `₹${numAmount.toLocaleString()} received${
          numDiscount > 0 ? ` + ₹${numDiscount.toLocaleString()} bargain discount applied` : ''
        }. Invoice updated.`,
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
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <div className="p-2 rounded-full bg-emerald-100 dark:bg-emerald-950/60">
                <Wallet className="h-5 w-5" />
              </div>
              <DialogTitle className="text-lg">Record Payment & Settle Bill</DialogTitle>
            </div>
            <DialogDescription>
              Record customer payment with optional bargain discount for Invoice <strong>{sale.invoiceNumber}</strong>.
            </DialogDescription>
          </DialogHeader>

          {/* Amount Overview Card */}
          <div className="my-3 rounded-xl border bg-muted/40 p-3 space-y-1.5 text-xs">
            <div className="flex justify-between items-center text-muted-foreground">
              <span>Customer:</span>
              <span className="font-semibold text-foreground">{sale.customerName || 'Walk-in Customer'}</span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground">
              <span>Original Invoice Value:</span>
              <span className="font-mono font-medium text-foreground">₹{sale.total.toLocaleString()}</span>
            </div>
            {currentPaid > 0 && (
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Previously Received:</span>
                <span className="font-mono text-emerald-600 font-medium">₹{currentPaid.toLocaleString()}</span>
              </div>
            )}
            {currentDiscount > 0 && (
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Previous Discount / Concession:</span>
                <span className="font-mono text-indigo-600 font-medium">₹{currentDiscount.toLocaleString()}</span>
              </div>
            )}
            <div className="border-t pt-1.5 flex justify-between items-center text-sm font-bold">
              <span>Outstanding Due:</span>
              <span className="font-mono text-amber-600 dark:text-amber-400 text-base">
                ₹{balanceDue.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="space-y-3.5">
            {/* Payment Amount Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="payment-amount" className="text-xs font-semibold">
                  Amount Customer is Paying (₹) *
                </Label>
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handlePayFull}
                    className="h-6 px-2 text-[11px] text-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200"
                  >
                    Pay Full (₹{formatCurrency(balanceDue)})
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
                  step="any"
                  min="0"
                  max={balanceDue}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                  className="pl-7 font-mono font-bold text-base"
                />
              </div>
            </div>

            {/* Bargain / Settlement Discount Option */}
            <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/70 via-card to-purple-50/40 dark:from-indigo-950/30 dark:to-purple-950/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900 dark:text-indigo-300">
                  <Tag className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Bargain / Settlement Discount (₹)</span>
                </div>
                <Badge variant="outline" className="text-[10px] bg-white/70 dark:bg-slate-900 border-indigo-200 text-indigo-700 dark:text-indigo-300">
                  Bill Clearance
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-tight">
                Customer bargained or rounded off? Enter discount concession here so invoice settles cleanly without leaving a pending mismatch.
              </p>

              <div className="relative">
                <span className="absolute left-3 top-2 text-indigo-600 dark:text-indigo-400 font-semibold text-xs">₹</span>
                <Input
                  id="discount-amount"
                  type="number"
                  step="any"
                  min="0"
                  max={balanceDue}
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  placeholder="0.00 (e.g. 100 for ₹1,000 bill paid as ₹900)"
                  className="pl-7 h-8 font-mono font-semibold text-xs bg-white dark:bg-slate-900 border-indigo-300 dark:border-indigo-800 text-indigo-950 dark:text-indigo-200"
                />
              </div>

              {/* Quick One-Click Bargain Difference Matcher */}
              {bargainDifference > 0 && parsedAmount > 0 && parsedDiscount === 0 && (
                <div className="pt-0.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleApplyBargainDiff}
                    className="w-full h-7 text-[11px] gap-1.5 border-dashed border-indigo-400 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100/60 dark:hover:bg-indigo-950/60 font-semibold"
                  >
                    <Sparkles className="h-3 w-3 text-indigo-600" />
                    Customer paying ₹{formatCurrency(parsedAmount)}? Apply ₹{formatCurrency(bargainDifference)} as Bargain Discount & Settle Full
                  </Button>
                </div>
              )}
            </div>

            {/* Live Settlement Breakdown Preview */}
            <div className={`p-2.5 rounded-lg border text-xs transition-colors ${
              willBeFullySettled
                ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                : 'bg-muted/50 border-border'
            }`}>
              <div className="flex justify-between items-center font-medium">
                <span className="text-muted-foreground">Total Bill Cleared Now:</span>
                <span className="font-mono font-bold text-foreground">
                  ₹{formatCurrency(parsedAmount)} (Paid) + ₹{formatCurrency(parsedDiscount)} (Disc) = ₹{formatCurrency(totalSettledNow)}
                </span>
              </div>
              <div className="flex justify-between items-center mt-1 pt-1 border-t border-border/60">
                <span className="text-muted-foreground">Remaining Invoice Due:</span>
                <div className="flex items-center gap-1.5">
                  <span className={`font-mono font-bold ${remainingAfterPayment === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    ₹{formatCurrency(remainingAfterPayment)}
                  </span>
                  {willBeFullySettled ? (
                    <Badge className="bg-emerald-600 text-white text-[10px] h-4 px-1.5 gap-0.5 font-bold">
                      <CheckCircle2 className="h-2.5 w-2.5" /> PAID IN FULL
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-amber-700 border-amber-300">
                      PARTIAL
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Payment Mode Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Payment Mode</Label>
              <RadioGroup
                value={paymentMode}
                onValueChange={(val: 'Cash' | 'UPI' | 'Bank Transfer') => setPaymentMode(val)}
                className="grid grid-cols-3 gap-2"
              >
                <label
                  htmlFor="mode-cash"
                  className={`flex flex-col items-center justify-center p-2 rounded-lg border cursor-pointer text-xs font-medium transition-colors ${
                    paymentMode === 'Cash'
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-semibold'
                      : 'border-border/70 hover:bg-muted/50'
                  }`}
                >
                  <RadioGroupItem value="Cash" id="mode-cash" className="sr-only" />
                  <Banknote className="h-4 w-4 mb-0.5" />
                  Cash
                </label>

                <label
                  htmlFor="mode-upi"
                  className={`flex flex-col items-center justify-center p-2 rounded-lg border cursor-pointer text-xs font-medium transition-colors ${
                    paymentMode === 'UPI'
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border/70 hover:bg-muted/50'
                  }`}
                >
                  <RadioGroupItem value="UPI" id="mode-upi" className="sr-only" />
                  <CreditCard className="h-4 w-4 mb-0.5" />
                  UPI / QR
                </label>

                <label
                  htmlFor="mode-bank"
                  className={`flex flex-col items-center justify-center p-2 rounded-lg border cursor-pointer text-xs font-medium transition-colors ${
                    paymentMode === 'Bank Transfer'
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border/70 hover:bg-muted/50'
                  }`}
                >
                  <RadioGroupItem value="Bank Transfer" id="mode-bank" className="sr-only" />
                  <IndianRupee className="h-4 w-4 mb-0.5" />
                  Bank / NEFT
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
                <Label htmlFor="pay-ref" className="text-xs">Settlement Note / Bargain Reason</Label>
                <Input
                  id="pay-ref"
                  placeholder="e.g. Bargain agreed, UTR #..."
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || totalSettledNow <= 0}
              className={`gap-1.5 ${willBeFullySettled ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving Settlement...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  {willBeFullySettled
                    ? `Settle Full Bill (₹${formatCurrency(totalSettledNow)})`
                    : `Record Payment (₹${formatCurrency(totalSettledNow)})`}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
