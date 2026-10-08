'use client';

import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useParams, useRouter } from 'next/navigation';
import type { Purchase } from '@/lib/types';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { notFound } from 'next/navigation';
import { formatCurrency } from '@/lib/utils';

export default function PurchaseDetailsPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const params = useParams();
  const { id } = params;

  const purchaseRef = useMemoFirebase(
    () => (firestore && id ? doc(firestore, 'purchases', id as string) : null),
    [firestore, id]
  );
  const { data: purchase, isLoading } = useDoc<Purchase>(purchaseRef);

  if (isLoading) {
    return (
      <>
        <PageHeader title="Purchase Details" />
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-32 w-full" />
            </CardContent>
             <CardFooter>
                <Skeleton className="h-10 w-48" />
             </CardFooter>
          </Card>
        </div>
      </>
    );
  }

  if (!purchase && !isLoading) {
    return (
      <>
        <PageHeader
          title="Purchase Not Found"
          description="The purchase you are looking for does not exist."
        />
        <Button onClick={() => router.push('/purchases')}>
          Go to Purchases
        </Button>
      </>
    );
  }

  if (!purchase) {
    notFound();
  }

  return (
    <>
      <PageHeader
        title={`Invoice #${purchase.invoiceNo}`}
        description={`Details for the purchase from ${purchase.supplierName}.`}
      >
        <Button variant="outline" onClick={() => router.back()}>
            Back to Purchases
        </Button>
      </PageHeader>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Supplier</p>
              <p className="font-semibold">{purchase.supplierName}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Invoice Number
              </p>
              <p className="font-semibold">{purchase.invoiceNo}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Purchase Date
              </p>
              <p className="font-semibold">
                {format(new Date(purchase.date), 'dd-MMM-yyyy')}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Payment Status
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-semibold">{purchase.paymentStatus}</span>
                {purchase.discount ? (
                  <span className="text-xs text-primary font-medium font-mono">
                    (₹{formatCurrency(purchase.discount)} Disc)
                  </span>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Purchase Price</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(purchase.items || []).map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>{item.productName}</TableCell>
                    <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                    <TableCell className="text-right font-mono">
                      ₹{formatCurrency(item.purchasePrice)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      ₹{formatCurrency(item.totalAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
           <CardFooter className="flex justify-end gap-4 border-t bg-muted/50 px-6 py-3">
                <div className="text-lg font-semibold">Total</div>
                <div className="text-lg font-bold font-mono">₹{formatCurrency(purchase.totalAmount)}</div>
           </CardFooter>
        </Card>
      </div>
    </>
  );
}
