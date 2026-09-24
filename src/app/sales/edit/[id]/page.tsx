
'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import {
  doc,
  updateDoc,
} from 'firebase/firestore';
import type { Sale } from '@/lib/types';
import { PageHeader } from '@/components/page-header';
import { useToast } from '@/hooks/use-toast';
import { useRouter, useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

export default function EditInvoicePage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const { id } = params;

  const saleRef = useMemoFirebase(
    () => (firestore && id ? doc(firestore, 'sales', id as string) : null),
    [firestore, id]
  );
  const { data: sale, isLoading: isSaleLoading } = useDoc<Sale>(saleRef);

  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Partial' | 'Pending'>('Pending');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Bank Transfer'>('Cash');
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const initialized = useRef(false);

  // Single initialization effect — only runs once when sale data first loads.
  // Using a ref guard prevents the Firestore real-time listener from
  // re-triggering state updates on every server snapshot (which caused freeze).
  useEffect(() => {
    if (sale && !initialized.current) {
      setCustomerName(sale.customerName || '');
      setCustomerMobile(sale.customerMobile || '');
      setPaymentStatus(sale.paymentStatus);
      setPaymentMode(sale.paymentMode);
      setAmountPaid(sale.amountPaid || (sale.paymentStatus === 'Paid' ? sale.total : 0));
      initialized.current = true;
    }
  }, [sale]);

  const handleSaveChanges = async () => {
      if (!sale) return;
      
      setIsSubmitting(true);
      if (!firestore) {
          toast({ variant: 'destructive', title: 'Error', description: 'Database connection not found.'});
          setIsSubmitting(false);
          return;
      }

      try {
        const saleRef = doc(firestore, 'sales', sale.id);
        await updateDoc(saleRef, {
            customerName: customerName || 'N/A',
            customerMobile: customerMobile || '',
            paymentStatus,
            paymentMode,
            amountPaid: paymentStatus === 'Partial' ? amountPaid : (paymentStatus === 'Paid' ? sale.total : 0),
        });

        toast({
            title: 'Invoice Updated',
            description: 'The invoice has been updated successfully.',
        });
        router.push('/sales');

      } catch (error: any) {
          console.error("Failed to update invoice: ", error);
          toast({
              variant: 'destructive',
              title: 'Error Updating Invoice',
              description: error.message || 'An unexpected error occurred.',
          });
      } finally {
          setIsSubmitting(false);
      }
  }

  if (isSaleLoading) {
    return (
        <>
            <PageHeader title="Edit Invoice" />
            <Skeleton className="h-[500px] w-full" />
        </>
    )
  }

  if (!sale) {
    return (
        <PageHeader title="Invoice not found" />
    )
  }

  return (
    <>
      <PageHeader
        title={`Edit Invoice ${sale.invoiceNumber}`}
        description="Update customer details and payment status."
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="grid auto-rows-max items-start gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Invoice Items</CardTitle>
              <CardDescription>Items on this invoice cannot be changed.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-[100px]">Qty</TableHead>
                    <TableHead className="w-[120px] text-right">
                      Price
                    </TableHead>
                    <TableHead className="w-[120px] text-right">
                      Total
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sale.items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{item.productName}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell className="text-right">
                        ₹{item.price.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{item.total.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
             <CardFooter className="justify-end gap-4 border-t bg-muted/50 px-6 py-3">
                <div className="text-lg font-semibold">Total</div>
                <div className="text-lg font-bold">₹{sale.total.toLocaleString()}</div>
             </CardFooter>
          </Card>
        </div>
        <div className="grid auto-rows-max items-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Customer Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="customer-name">Name</Label>
                <Input
                  id="customer-name"
                  placeholder="Enter customer name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="customer-mobile">Mobile</Label>
                <Input
                  id="customer-mobile"
                  placeholder="Enter mobile number"
                  value={customerMobile}
                  onChange={(e) => setCustomerMobile(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
           <Card>
            <CardHeader>
              <CardTitle>Payment Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label>Payment Status</Label>
                <RadioGroup 
                    value={paymentStatus} 
                    onValueChange={(value: 'Paid' | 'Partial' | 'Pending') => setPaymentStatus(value)}
                    className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Paid" id="status-paid" />
                    <Label htmlFor="status-paid">Paid</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Partial" id="status-partial" />
                    <Label htmlFor="status-partial">Partial</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Pending" id="status-pending" />
                    <Label htmlFor="status-pending">Pending</Label>
                  </div>
                </RadioGroup>
              </div>
              {paymentStatus === 'Partial' && (
                <div className="grid gap-2">
                  <Label htmlFor="amount-paid">Amount Paid</Label>
                  <Input
                    id="amount-paid"
                    type="number"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(Number(e.target.value))}
                    max={sale.total}
                  />
                </div>
              )}
               <div className="grid gap-2">
                <Label>Payment Mode</Label>
                <Select value={paymentMode} onValueChange={(value: 'Cash' | 'UPI' | 'Bank Transfer') => setPaymentMode(value)}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select payment mode" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="UPI">UPI</SelectItem>
                        <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    </SelectContent>
                </Select>
               </div>
            </CardContent>
             <CardFooter className="flex-col gap-2">
                 <Button className="w-full" onClick={handleSaveChanges} disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                </Button>
                <Button className="w-full" variant="outline" onClick={() => router.back()}>
                    Cancel
                </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </>
  );
}
