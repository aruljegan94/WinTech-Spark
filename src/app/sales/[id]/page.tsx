'use client';

import { useFirestore, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { collection, doc, query, where } from 'firebase/firestore';
import { useParams, useRouter, notFound } from 'next/navigation';
import type { Sale, CompanyProfile } from '@/lib/types';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
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
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { Share, Printer } from 'lucide-react';
import { ShareInvoiceDialog } from '../_components/share-invoice-dialog';
import { ThermalPrintDialog } from '../_components/thermal-print-dialog';
import { useState, useRef, useMemo } from 'react';

export default function SaleDetailsPage() {
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const firestore = useFirestore();
  const router = useRouter();
  const params = useParams();
  const { id } = params;
  const invoiceRef = useRef<HTMLDivElement>(null);


  const saleRef = useMemoFirebase(
    () => (firestore && id ? doc(firestore, 'sales', id as string) : null),
    [firestore, id]
  );
  const { data: sale, isLoading } = useDoc<Sale>(saleRef);
  
  const defaultProfileQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'companyProfiles'), where('isDefault', '==', true)) : null),
    [firestore]
  );
  const { data: defaultProfileData, isLoading: isProfileLoading } = useCollection<CompanyProfile>(defaultProfileQuery);

  const companyProfile = useMemo(() => defaultProfileData?.[0], [defaultProfileData]);


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


  if (isLoading) {
    return (
      <>
        <PageHeader title="Invoice Details" />
        <Card className="w-full max-w-3xl mx-auto">
          <CardHeader><Skeleton className="h-8 w-48" /></CardHeader>
          <CardContent className="space-y-6">
             <Skeleton className="h-24 w-full" />
             <Skeleton className="h-48 w-full" />
             <Skeleton className="h-24 w-full" />
          </CardContent>
          <CardFooter><Skeleton className="h-10 w-24" /></CardFooter>
        </Card>
      </>
    );
  }

  if (!sale && !isLoading) {
    return (
      <>
        <PageHeader
          title="Invoice Not Found"
          description="The invoice you are looking for does not exist."
        />
        <Button onClick={() => router.push('/sales')}>
          Go to Sales
        </Button>
      </>
    );
  }

  if (!sale) {
    notFound();
  }

  return (
    <>
      <PageHeader
        title={`Invoice ${sale.invoiceNumber}`}
        description={`Issued on ${format(new Date(sale.date), 'dd-MMM-yyyy')}`}
      >
        <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsPrintOpen(true)}>
                <Printer className="mr-2 h-4 w-4" />
                Print
            </Button>
            <Button variant="outline" onClick={() => setIsShareOpen(true)}>
                <Share className="mr-2 h-4 w-4" />
                Share
            </Button>
            <Button variant="outline" onClick={() => router.back()}>
                Back to Sales
            </Button>
        </div>
      </PageHeader>
      <Card className="w-full max-w-3xl mx-auto p-2 sm:p-6" id="invoice" ref={invoiceRef}>
        <CardHeader>
            <div className="flex justify-between items-start">
                <div>
                     <div className="flex items-center gap-2 mb-2">
                        <Image src="/logo.png" width={32} height={32} alt="App Logo" className="h-8 w-8" />
                        <h1 className="text-2xl font-bold">{companyProfile?.companyName || 'WinTech-Spark'}</h1>
                    </div>
                    <p className="text-muted-foreground">{companyProfile?.address || '123 Auto Lane, Car City, 12345'}</p>
                    <p className="text-muted-foreground">GSTIN: {companyProfile?.gstNumber || '22AAAAA0000A1Z5'}</p>
                </div>
                 <div className="text-right">
                    <h2 className="text-3xl font-bold tracking-tight">INVOICE</h2>
                    <p className="text-muted-foreground">{sale.invoiceNumber}</p>
                 </div>
            </div>
             <Separator className="my-4"/>
              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <p className="font-semibold text-muted-foreground">BILL TO</p>
                    <p>{sale.customerName}</p>
                    <p className="text-sm text-muted-foreground">{sale.customerMobile}</p>
                 </div>
                 <div className="text-right">
                    <p><span className="font-semibold text-muted-foreground">Invoice Date: </span>{format(new Date(sale.date), 'dd-MMM-yyyy')}</p>
                    <p><span className="font-semibold text-muted-foreground">Due Date: </span>{format(new Date(new Date(sale.date).getTime() + 15 * 24 * 60 * 60 * 1000), 'dd-MMM-yyyy')}</p>
                 </div>
              </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-full">Product</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sale.items.map((item, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{item.productName}</TableCell>
                  <TableCell className="text-center">{item.quantity}</TableCell>
                  <TableCell className="text-right">₹{item.price.toLocaleString()}</TableCell>
                  <TableCell className="text-right">₹{item.total.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter className="flex-col items-end gap-4 border-t bg-muted/50 p-6">
            <div className="w-full max-w-xs space-y-2">
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>₹{sale.subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-muted-foreground">GST</span>
                    <span>₹{sale.gstAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
                <Separator/>
                <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span>₹{sale.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
                 <Separator/>
                 <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="outline" className={getStatusBadgeVariant(sale.paymentStatus)}>
                        {sale.paymentStatus}
                    </Badge>
                 </div>
            </div>
        </CardFooter>
      </Card>
      
      {sale && companyProfile && (
        <>
          <ShareInvoiceDialog
              isOpen={isShareOpen}
              onOpenChange={setIsShareOpen}
              sale={sale}
              companyProfile={companyProfile}
              invoiceRef={invoiceRef}
          />
          <ThermalPrintDialog
              isOpen={isPrintOpen}
              onOpenChange={setIsPrintOpen}
              sale={sale}
              companyProfile={companyProfile}
          />
        </>
      )}
    </>
  );
}
