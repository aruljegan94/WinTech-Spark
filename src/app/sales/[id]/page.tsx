'use client';

import { useState, useRef, useMemo } from 'react';
import { useFirestore, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { collection, doc, query, where } from 'firebase/firestore';
import { useParams, useRouter, notFound } from 'next/navigation';
import type { Sale, CompanyProfile } from '@/lib/types';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
import Image from 'next/image';
import {
  Printer,
  Receipt,
  Download,
  Share2,
  MessageSquare,
  ArrowLeft,
  Wallet,
  Building2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
  ExternalLink,
  QrCode,
  FileText,
  FileCheck,
  Check,
  BellRing,
} from 'lucide-react';
import { ShareInvoiceDialog } from '../_components/share-invoice-dialog';
import { ThermalPrintDialog } from '../_components/thermal-print-dialog';
import { RecordPaymentDialog } from '../_components/record-payment-dialog';
import { numberToIndianWords } from '@/lib/number-to-words';
import { useToast } from '@/hooks/use-toast';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

type InvoiceCopyType = 'ORIGINAL FOR RECIPIENT' | 'DUPLICATE FOR TRANSPORTER' | 'TRIPLICATE FOR SUPPLIER';

export default function SaleDetailsPage() {
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [invoiceCopy, setInvoiceCopy] = useState<InvoiceCopyType>('ORIGINAL FOR RECIPIENT');

  const firestore = useFirestore();
  const router = useRouter();
  const params = useParams();
  const { id } = params;
  const invoiceRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const saleRef = useMemoFirebase(
    () => (firestore && id ? doc(firestore, 'sales', id as string) : null),
    [firestore, id]
  );
  const { data: sale, isLoading } = useDoc<Sale>(saleRef);

  const defaultProfileQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'companyProfiles'), where('isDefault', '==', true)) : null),
    [firestore]
  );
  const { data: defaultProfileData } = useCollection<CompanyProfile>(defaultProfileQuery);
  const companyProfile = useMemo(() => defaultProfileData?.[0], [defaultProfileData]);

  const currentPaid = useMemo(() => {
    if (!sale) return 0;
    if (sale.amountPaid !== undefined) return sale.amountPaid;
    return sale.paymentStatus === 'Paid' ? sale.total : 0;
  }, [sale]);

  const balanceDue = useMemo(() => {
    if (!sale) return 0;
    return Math.max(0, Math.round((sale.total - currentPaid) * 100) / 100);
  }, [sale, currentPaid]);

  const getStatusBadge = (status: Sale['paymentStatus']) => {
    switch (status) {
      case 'Paid':
        return (
          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 px-2.5 py-0.5 font-semibold">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Paid in Full
          </Badge>
        );
      case 'Partial':
        return (
          <Badge className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1 px-2.5 py-0.5 font-semibold">
            <Clock className="h-3.5 w-3.5" />
            Partially Paid (Due: ₹{balanceDue.toLocaleString()})
          </Badge>
        );
      case 'Pending':
        return (
          <Badge className="bg-amber-600 hover:bg-amber-700 text-white gap-1 px-2.5 py-0.5 font-semibold">
            <AlertCircle className="h-3.5 w-3.5" />
            Payment Pending
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Standard A4 Print
  const handlePrintA4 = () => {
    window.print();
  };

  // Download high-res PDF
  const handleDownloadPdf = async () => {
    if (!invoiceRef.current || !sale) return;
    setIsDownloadingPdf(true);
    try {
      const canvas = await html2canvas(invoiceRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210; // A4 width mm
      const pageHeight = 297; // A4 height mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, Math.min(imgHeight, pageHeight));
      pdf.save(`Tax_Invoice_${sale.invoiceNumber}.pdf`);

      toast({
        title: 'PDF Downloaded',
        description: `Invoice #${sale.invoiceNumber} has been saved as PDF.`,
      });
    } catch (error) {
      console.error('PDF error:', error);
      toast({
        variant: 'destructive',
        title: 'Download Failed',
        description: 'Failed to generate PDF. You can also use the Print button to Save as PDF.',
      });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // Direct WhatsApp Share
  const handleDirectWhatsApp = () => {
    if (!sale) return;
    const compName = companyProfile?.companyName || 'WinTech-Spark';
    let text = `*TAX INVOICE - ${compName}*\n`;
    text += `Invoice No: *#${sale.invoiceNumber}*\n`;
    text += `Date: ${format(new Date(sale.date), 'dd-MMM-yyyy')}\n`;
    text += `Customer: ${sale.customerName || 'Customer'}\n`;
    text += `Total Amount: *₹${sale.total.toLocaleString()}*\n`;
    text += `Status: *${sale.paymentStatus}*\n`;
    if (balanceDue > 0) {
      text += `Outstanding Balance: *₹${balanceDue.toLocaleString()}*\n`;
    }
    text += `\nThank you for choosing ${compName}!`;

    let phone = sale.customerMobile ? sale.customerMobile.replace(/\D/g, '') : '';
    if (phone && phone.length === 10) {
      phone = '91' + phone;
    }

    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // WhatsApp Payment Reminder with UPI details
  const handleWhatsAppReminder = () => {
    if (!sale) return;
    const compName = companyProfile?.companyName || 'WinTech-Spark';
    let text = `🔔 *PAYMENT REMINDER - ${compName}*\n\n`;
    text += `Dear *${sale.customerName || 'Valued Customer'}*,\n`;
    text += `This is a gentle reminder regarding pending payment for:\n`;
    text += `📄 *Invoice #:* ${sale.invoiceNumber}\n`;
    text += `📅 *Bill Date:* ${format(new Date(sale.date), 'dd-MMM-yyyy')}\n`;
    text += `💵 *Bill Amount:* ₹${sale.total.toLocaleString('en-IN')}\n`;
    const paid = sale.amountPaid ?? 0;
    if (paid > 0) {
      text += `✅ *Paid So Far:* ₹${paid.toLocaleString('en-IN')}\n`;
    }
    text += `⚠️ *Outstanding Due: ₹${balanceDue.toLocaleString('en-IN')}*\n\n`;

    if (companyProfile?.upiId) {
      text += `📲 *Pay Directly via UPI:*\n`;
      text += `UPI ID: \`${companyProfile.upiId}\`\n`;
      text += `Pay Link: ${upiUri}\n\n`;
    }

    if (companyProfile?.bankName && companyProfile?.bankAccountNumber) {
      text += `🏦 *Bank Transfer:*\n`;
      text += `Bank: ${companyProfile.bankName}\n`;
      text += `A/C No: ${companyProfile.bankAccountNumber}\n`;
      if (companyProfile.bankIfsc) text += `IFSC: ${companyProfile.bankIfsc}\n`;
      text += `\n`;
    }

    text += `Please let us know once paid. If already completed, kindly disregard this message.\n`;
    text += `Thank you!\n— *${compName}*`;

    let phone = sale.customerMobile ? sale.customerMobile.replace(/\D/g, '') : '';
    if (phone && phone.length === 10) {
      phone = '91' + phone;
    }

    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      toast({ title: 'Link Copied', description: 'Invoice URL copied to clipboard.' });
    }
  };

  // Dynamic UPI URL for QR code
  const upiId = companyProfile?.upiId || 'winautomobiles@upi';
  const upiPayAmount = balanceDue > 0 ? balanceDue : sale?.total || 0;
  const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
    companyProfile?.companyName || 'WinTech'
  )}&am=${upiPayAmount}&cu=INR&tn=${encodeURIComponent('Invoice ' + (sale?.invoiceNumber || ''))}`;
  const upiQrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=2&data=${encodeURIComponent(
    upiUri
  )}`;

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto py-6">
        <PageHeader title="Invoice Loading..." />
        <div className="p-8 border rounded-xl bg-card space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-20 w-1/2 ml-auto" />
        </div>
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="py-12 text-center max-w-md mx-auto space-y-4">
        <PageHeader
          title="Invoice Not Found"
          description="The invoice you are looking for does not exist or may have been deleted."
        />
        <Button onClick={() => router.push('/sales')} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Sales List
        </Button>
      </div>
    );
  }

  // Pre-calculate tax breakdown
  const subtotal = sale.subtotal || 0;
  const gstAmount = sale.gstAmount || 0;
  const cgstAmount = Math.round((gstAmount / 2) * 100) / 100;
  const sgstAmount = Math.round((gstAmount - cgstAmount) * 100) / 100;

  return (
    <>
      {/* ─── Screen-Only Actions Toolbar ────────────────────────────────────────── */}
      <div className="print:hidden space-y-4 max-w-4xl mx-auto mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/sales')}
              className="gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Invoices
            </Button>
            <span className="text-muted-foreground">/</span>
            <span className="font-semibold text-foreground text-sm">
              #{sale.invoiceNumber}
            </span>
            <div className="ml-2">{getStatusBadge(sale.paymentStatus)}</div>
          </div>

          {/* Quick Copy Selector */}
          <div className="flex items-center gap-1 bg-muted p-1 rounded-lg text-xs self-start sm:self-auto">
            {(
              [
                'ORIGINAL FOR RECIPIENT',
                'DUPLICATE FOR TRANSPORTER',
                'TRIPLICATE FOR SUPPLIER',
              ] as InvoiceCopyType[]
            ).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setInvoiceCopy(type)}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  invoiceCopy === type
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {type.replace(' FOR ', ' - ')}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {/* Record Payment Button if Outstanding Due exists */}
            {sale.paymentStatus !== 'Paid' && (
              <Button
                variant="default"
                size="sm"
                onClick={() => setIsRecordPaymentOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-sm"
              >
                <Wallet className="h-4 w-4" />
                Record Payment (₹{balanceDue.toLocaleString()})
              </Button>
            )}

            {/* Standard A4 Print */}
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrintA4}
              className="gap-1.5 font-medium border-border/80 shadow-sm"
            >
              <Printer className="h-4 w-4 text-primary" />
              Print A4 Invoice
            </Button>

            {/* Thermal POS Print */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPrintOpen(true)}
              className="gap-1.5 font-medium border-border/80 shadow-sm"
            >
              <Receipt className="h-4 w-4 text-amber-600" />
              Thermal Receipt
            </Button>

            {/* Download PDF */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              className="gap-1.5 font-medium border-border/80 shadow-sm"
            >
              <Download className="h-4 w-4 text-indigo-600" />
              {isDownloadingPdf ? 'Generating PDF...' : 'Download PDF'}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {/* WhatsApp Reminder if payment pending */}
            {balanceDue > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleWhatsAppReminder}
                className="gap-1.5 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 font-semibold"
              >
                <BellRing className="h-4 w-4 text-amber-600" />
                WhatsApp Reminder
              </Button>
            )}

            {/* WhatsApp Share */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleDirectWhatsApp}
              className="gap-1.5 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
            >
              <MessageSquare className="h-4 w-4 fill-emerald-600" />
              WhatsApp
            </Button>

            {/* Share Modal */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsShareOpen(true)}
              className="gap-1.5"
            >
              <Share2 className="h-4 w-4" />
              Share
            </Button>

            {/* Copy Link */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyLink}
              title="Copy invoice link"
              className="h-8 w-8 p-0"
            >
              {copiedLink ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Printable Tax Invoice (A4 Standard) ─────────────────────────────────── */}
      <div className="max-w-4xl mx-auto">
        <div
          ref={invoiceRef}
          id="printable-invoice"
          className="bg-white text-slate-900 border border-slate-300 rounded-lg shadow-md p-6 sm:p-8 font-sans print:p-0 print:border-none print:shadow-none print:m-0 print:w-full print:rounded-none"
        >
          {/* Top Banner: TAX INVOICE & Copy Indicator */}
          <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3 mb-4">
            <div className="flex items-center gap-3">
              <Image
                src="/logo.png"
                width={40}
                height={40}
                alt="App Logo"
                className="h-10 w-10 object-contain rounded"
              />
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900">
                  {companyProfile?.companyName || 'WinTech-Spark'}
                </h1>
                <p className="text-xs text-slate-600 font-medium">
                  {companyProfile?.address || '123 Auto Lane, Car City, 12345'}
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="inline-block bg-slate-900 text-white font-bold text-xs uppercase px-2.5 py-0.5 rounded tracking-wider">
                {invoiceCopy}
              </span>
              <h2 className="text-xl font-extrabold tracking-tight text-slate-800 mt-1">
                TAX INVOICE
              </h2>
            </div>
          </div>

          {/* Seller & Invoice Meta Info Grid */}
          <div className="grid grid-cols-2 gap-4 border border-slate-300 rounded-md p-3.5 mb-4 text-xs bg-slate-50/70 print:bg-transparent">
            {/* Left: Supplier Details */}
            <div className="space-y-1 border-r border-slate-200 pr-3">
              <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                Supplier / Seller Details:
              </div>
              <div>
                <span className="text-slate-600">GSTIN:</span>{' '}
                <strong className="font-mono text-slate-900">
                  {companyProfile?.gstNumber || '33AAAAA0000A1Z5'}
                </strong>
              </div>
              <div>
                <span className="text-slate-600">Phone:</span>{' '}
                <span className="font-medium text-slate-900">
                  {companyProfile?.contact || '+91 98765 43210'}
                </span>
              </div>
              <div>
                <span className="text-slate-600">State:</span>{' '}
                <span className="font-medium text-slate-900">
                  {companyProfile?.state || 'Tamil Nadu'} (Code:{' '}
                  {companyProfile?.stateCode || '33'})
                </span>
              </div>
            </div>

            {/* Right: Invoice Meta */}
            <div className="space-y-1 pl-2">
              <div className="flex justify-between">
                <span className="text-slate-600">Invoice No:</span>
                <strong className="font-mono text-slate-900 text-sm">
                  #{sale.invoiceNumber}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Invoice Date:</span>
                <span className="font-medium text-slate-900">
                  {format(new Date(sale.date), 'dd-MMM-yyyy')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Due Date:</span>
                <span className="font-medium text-slate-900">
                  {sale.dueDate
                    ? format(new Date(sale.dueDate), 'dd-MMM-yyyy')
                    : format(
                        new Date(new Date(sale.date).getTime() + 15 * 86400000),
                        'dd-MMM-yyyy'
                      )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Place of Supply:</span>
                <span className="font-medium text-slate-900">
                  {sale.placeOfSupply || companyProfile?.state || '33 - Tamil Nadu'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Payment Mode:</span>
                <span className="font-semibold text-slate-900">
                  {sale.paymentMode || 'Cash'}
                </span>
              </div>
            </div>
          </div>

          {/* Bill To (Buyer / Customer Details) */}
          <div className="border border-slate-300 rounded-md p-3 mb-4 text-xs bg-slate-50/40 print:bg-transparent">
            <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-1">
              Billed To (Customer Details):
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="font-bold text-slate-900 text-sm">
                  {sale.customerName || 'Walk-in Customer'}
                </div>
                {sale.customerMobile && (
                  <div className="text-slate-600">
                    Mobile: <span className="font-medium text-slate-900">{sale.customerMobile}</span>
                  </div>
                )}
                {sale.customerAddress && (
                  <div className="text-slate-600">
                    Address: <span className="text-slate-800">{sale.customerAddress}</span>
                  </div>
                )}
              </div>
              <div className="text-right space-y-0.5">
                <div>
                  <span className="text-slate-600">Customer GSTIN:</span>{' '}
                  <span className="font-mono text-slate-900 font-medium">
                    {sale.customerGstNo || 'Unregistered / Consumer'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-600">Payment Status:</span>{' '}
                  <strong className="text-slate-900 uppercase font-semibold">
                    {sale.paymentStatus}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Product Items Table */}
          <div className="border border-slate-300 rounded-md overflow-hidden mb-4">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-800 border-b border-slate-300 font-bold">
                  <th className="py-2 px-2 text-center w-8 border-r border-slate-300">#</th>
                  <th className="py-2 px-3 border-r border-slate-300">Product / Item Description</th>
                  <th className="py-2 px-2 text-center w-14 border-r border-slate-300">Qty</th>
                  <th className="py-2 px-2.5 text-right w-20 border-r border-slate-300">Rate (₹)</th>
                  <th className="py-2 px-2.5 text-right w-24 border-r border-slate-300">Taxable (₹)</th>
                  <th className="py-2 px-2 text-center w-14 border-r border-slate-300">GST %</th>
                  <th className="py-2 px-2.5 text-right w-20 border-r border-slate-300">Tax (₹)</th>
                  <th className="py-2 px-3 text-right w-24">Total (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sale.items.map((item, index) => {
                  const qty = item.quantity || 1;
                  const itemTotal = item.total || 0;
                  const itemGstPct = item.gstPercentage || 0;
                  // If price is stored as excl tax, calculate taxable
                  const taxable = item.price * qty;
                  const itemTax = Math.round((itemTotal - taxable) * 100) / 100;

                  return (
                    <tr key={index} className="hover:bg-slate-50/50">
                      <td className="py-2 px-2 text-center text-slate-500 border-r border-slate-200 font-mono">
                        {index + 1}
                      </td>
                      <td className="py-2 px-3 border-r border-slate-200">
                        <div className="font-semibold text-slate-900">{item.productName}</div>
                      </td>
                      <td className="py-2 px-2 text-center font-mono font-medium border-r border-slate-200">
                        {qty}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono border-r border-slate-200">
                        ₹{item.price.toFixed(2)}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono border-r border-slate-200">
                        ₹{taxable.toFixed(2)}
                      </td>
                      <td className="py-2 px-2 text-center font-mono border-r border-slate-200">
                        {itemGstPct}%
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono border-r border-slate-200 text-slate-600">
                        ₹{(itemTotal - taxable > 0 ? itemTotal - taxable : 0).toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                        ₹{itemTotal.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom Financial Totals & Tax Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Left: Amount in Words, Bank Details & UPI QR */}
            <div className="space-y-3">
              {/* Amount Chargeable in Words */}
              <div className="border border-slate-300 rounded-md p-2.5 bg-slate-50/70 text-xs">
                <div className="font-semibold text-slate-700 uppercase tracking-wider text-[10px]">
                  Amount Chargeable (in words):
                </div>
                <div className="font-bold text-slate-900 mt-0.5 leading-snug">
                  INR {numberToIndianWords(sale.total)}
                </div>
              </div>

              {/* Bank Details & UPI QR Code for instant payment */}
              <div className="border border-slate-300 rounded-md p-3 text-xs flex gap-3 items-center bg-slate-50/40">
                <div className="flex-1 space-y-1">
                  <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5 text-slate-700" />
                    Bank & UPI Payment Info:
                  </div>
                  <div className="text-[11px] text-slate-700">
                    <div>Bank: <strong>{companyProfile?.bankName || 'State Bank of India'}</strong></div>
                    <div>A/C No: <strong className="font-mono">{companyProfile?.bankAccountNumber || '389201948291'}</strong></div>
                    <div>IFSC: <strong className="font-mono">{companyProfile?.bankIfsc || 'SBIN0001234'}</strong></div>
                    <div>UPI ID: <strong className="font-mono text-emerald-700">{upiId}</strong></div>
                  </div>
                </div>

                {/* Dynamic QR Code */}
                <div className="text-center shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={upiQrCodeUrl}
                    alt="UPI QR Code"
                    width={88}
                    height={88}
                    className="border border-slate-300 rounded bg-white p-1"
                  />
                  <span className="text-[9px] text-slate-500 font-medium block mt-0.5">
                    Scan & Pay (GPay/UPI)
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Calculations & Balance */}
            <div className="border border-slate-300 rounded-md p-3.5 bg-slate-50/70 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Total Taxable Amount:</span>
                <span className="font-mono font-medium text-slate-900">
                  ₹{subtotal.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Central Tax (CGST):</span>
                <span className="font-mono font-medium text-slate-900">
                  ₹{cgstAmount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>State Tax (SGST):</span>
                <span className="font-mono font-medium text-slate-900">
                  ₹{sgstAmount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600 border-t border-slate-200 pt-1.5 font-medium">
                <span>Total Tax Amount (GST):</span>
                <span className="font-mono text-slate-900">
                  ₹{gstAmount.toFixed(2)}
                </span>
              </div>

              <div className="border-t-2 border-slate-900 pt-2 flex justify-between items-center text-sm font-extrabold text-slate-900">
                <span>GRAND TOTAL:</span>
                <span className="text-base font-mono">
                  ₹{sale.total.toFixed(2)}
                </span>
              </div>

              {/* Payment Status Breakdown */}
              <div className="border-t border-slate-200 pt-2 space-y-1 text-[11px]">
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>Amount Received / Paid:</span>
                  <span className="font-mono">₹{currentPaid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-amber-700 font-bold text-xs">
                  <span>Balance Due / Outstanding:</span>
                  <span className="font-mono">₹{balanceDue.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Terms & Authorized Signatory Footer */}
          <div className="grid grid-cols-2 gap-4 border-t border-slate-300 pt-3 text-[10px] text-slate-600 mt-3">
            <div>
              <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-1">
                Terms & Conditions:
              </div>
              <ol className="list-decimal pl-3 space-y-0.5 text-slate-600">
                <li>Goods once sold will not be taken back or exchanged.</li>
                <li>Interest @ 18% p.a. will be charged if bill is not paid on due date.</li>
                <li>All disputes are subject to local jurisdiction only.</li>
                <li>This is a computer generated tax invoice and requires no physical signature.</li>
              </ol>
            </div>

            <div className="flex flex-col justify-between items-end text-right">
              <div>
                <div className="font-bold text-slate-900 text-xs">
                  For {companyProfile?.companyName || 'WinTech-Spark'}
                </div>
              </div>
              <div className="pt-8">
                <div className="border-t border-slate-400 w-36 pt-1 text-center font-medium text-slate-800 text-[11px]">
                  Authorized Signatory
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Modals ────────────────────────────────────────────────────────────── */}
      {/* 1. Record Payment Dialog */}
      {sale && (
        <RecordPaymentDialog
          isOpen={isRecordPaymentOpen}
          onOpenChange={setIsRecordPaymentOpen}
          sale={sale}
          onSuccess={() => {
            // Document listener will automatically refresh the view
          }}
        />
      )}

      {/* 2. Share Dialog */}
      {sale && companyProfile && (
        <ShareInvoiceDialog
          isOpen={isShareOpen}
          onOpenChange={setIsShareOpen}
          sale={sale}
          companyProfile={companyProfile}
          invoiceRef={invoiceRef}
        />
      )}

      {/* 3. Thermal Print Dialog */}
      {sale && companyProfile && (
        <ThermalPrintDialog
          isOpen={isPrintOpen}
          onOpenChange={setIsPrintOpen}
          sale={sale}
          companyProfile={companyProfile}
        />
      )}
    </>
  );
}
