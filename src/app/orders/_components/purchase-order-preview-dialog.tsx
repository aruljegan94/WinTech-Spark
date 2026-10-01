'use client';

import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Printer, Download, MessageCircle, Building2, Phone, Mail, MapPin, Calendar, Clock, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import type { PurchaseOrder, CompanyProfile } from '@/lib/types';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => jsPDF;
}

interface PurchaseOrderPreviewDialogProps {
  order: PurchaseOrder | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  companyProfile?: CompanyProfile | null;
  onShareWhatsApp: (order: PurchaseOrder) => void;
}

export function PurchaseOrderPreviewDialog({
  order,
  isOpen,
  onOpenChange,
  companyProfile,
  onShareWhatsApp,
}: PurchaseOrderPreviewDialogProps) {
  const printContentRef = useRef<HTMLDivElement>(null);

  if (!order) return null;

  const companyName = companyProfile?.companyName || 'WinTech-Spark';
  const companyAddress = companyProfile?.address || 'Main Road, Commercial Area';
  const companyContact = companyProfile?.contact || '+91 98765 43210';
  const companyGst = companyProfile?.gstNumber || '33AAAAA0000A1Z5';

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF() as jsPDFWithAutoTable;

    // Header
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text(companyName, 14, 18);

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`${companyAddress} | Ph: ${companyContact}`, 14, 24);
    doc.text(`GSTIN: ${companyGst}`, 14, 29);

    // Title & PO Details
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text('PURCHASE ORDER', 14, 38);

    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(`PO Number: ${order.orderNumber}`, 14, 44);
    doc.text(`Order Date: ${format(new Date(order.date), 'dd-MMM-yyyy')}`, 14, 49);
    if (order.expectedDeliveryDate) {
      doc.text(`Delivery Date: ${format(new Date(order.expectedDeliveryDate), 'dd-MMM-yyyy')}`, 14, 54);
    }

    // Vendor Info
    doc.text(`Vendor: ${order.vendorName}`, 120, 44);
    if (order.vendorPhone) doc.text(`Phone: ${order.vendorPhone}`, 120, 49);
    if (order.vendorGst) doc.text(`GSTIN: ${order.vendorGst}`, 120, 54);

    // Items Table
    doc.autoTable({
      startY: 60,
      head: [['#', 'Item Description', 'Unit', 'Qty', 'Est. Rate (Rs)', 'Est. Amount (Rs)']],
      body: order.items.map((item, index) => [
        index + 1,
        item.productName + (item.notes ? `\nNote: ${item.notes}` : ''),
        item.unit || 'Nos',
        item.quantity,
        item.estimatedPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        item.estimatedTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [44, 62, 80] },
      styles: { fontSize: 8.5 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `Estimated Grand Total: Rs ${order.totalEstimatedAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
      120,
      finalY
    );

    if (order.notes) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(`Instructions / Notes: ${order.notes}`, 14, finalY + 8);
    }

    // Signatory
    doc.setFontSize(8.5);
    doc.text(`For ${companyName}`, 140, finalY + 25);
    doc.text('Authorized Signatory', 140, finalY + 38);

    doc.save(`Purchase_Order_${order.orderNumber}.pdf`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6 print:p-0 print:border-0 print:shadow-none">
        <DialogHeader className="flex flex-row items-center justify-between border-b pb-3 print:hidden">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-base font-semibold">Purchase Order Preview</DialogTitle>
            <Badge variant="outline" className="font-mono text-xs">
              {order.orderNumber}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
              onClick={() => onShareWhatsApp(order)}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span>WhatsApp</span>
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={handleDownloadPDF}>
              <Download className="h-3.5 w-3.5" />
              <span>PDF</span>
            </Button>
            <Button size="sm" className="h-8 gap-1 text-xs" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5" />
              <span>Print</span>
            </Button>
          </div>
        </DialogHeader>

        {/* Printable Purchase Order Template */}
        <div ref={printContentRef} className="space-y-4 pt-2 text-foreground font-sans print:pt-0">
          {/* Company Brand Header */}
          <div className="flex items-start justify-between border-b pb-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                  {companyName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-bold leading-tight">{companyName}</h2>
                  <p className="text-xs text-muted-foreground">{companyAddress}</p>
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <Phone className="h-3 w-3" /> {companyContact}
                </div>
                <div className="font-mono text-[11px] font-medium text-foreground">
                  GSTIN: {companyGst}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="inline-block bg-primary/10 text-primary font-bold px-3 py-1 rounded text-sm uppercase tracking-wider mb-2">
                Purchase Order
              </div>
              <div className="text-xs space-y-0.5">
                <div>
                  <span className="text-muted-foreground">PO Number: </span>
                  <span className="font-mono font-bold">{order.orderNumber}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Date: </span>
                  <span className="font-medium">{format(new Date(order.date), 'dd-MMM-yyyy')}</span>
                </div>
                {order.expectedDeliveryDate && (
                  <div>
                    <span className="text-muted-foreground">Expected: </span>
                    <span className="font-medium text-amber-600 dark:text-amber-400">
                      {format(new Date(order.expectedDeliveryDate), 'dd-MMM-yyyy')}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Status: </span>
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5 py-0 font-normal">
                    {order.status}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Supplier / Vendor Info Box */}
          <div className="p-3 rounded-lg border bg-muted/20">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-1">
              Vendor / Supplier Details:
            </span>
            <div className="flex flex-col sm:flex-row justify-between gap-2">
              <div>
                <h3 className="font-bold text-sm">{order.vendorName}</h3>
                {order.vendorAddress && <p className="text-xs text-muted-foreground mt-0.5">{order.vendorAddress}</p>}
              </div>
              <div className="text-xs space-y-0.5 sm:text-right">
                {order.vendorPhone && (
                  <div>
                    <span className="text-muted-foreground">Phone: </span>
                    <span className="font-mono">{order.vendorPhone}</span>
                  </div>
                )}
                {order.vendorGst && (
                  <div>
                    <span className="text-muted-foreground">GSTIN: </span>
                    <span className="font-mono font-medium">{order.vendorGst}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b font-semibold text-muted-foreground">
                <tr>
                  <th className="p-2 w-10 text-center">#</th>
                  <th className="p-2">Item Description</th>
                  <th className="p-2 w-20 text-center">Unit / Size</th>
                  <th className="p-2 w-16 text-right">Qty</th>
                  <th className="p-2 w-28 text-right">Est. Unit Rate</th>
                  <th className="p-2 w-28 text-right">Est. Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {order.items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-muted/10">
                    <td className="p-2 text-center text-muted-foreground">{idx + 1}</td>
                    <td className="p-2">
                      <div className="font-semibold">{item.productName}</div>
                      {item.notes && <div className="text-[11px] text-muted-foreground mt-0.5">{item.notes}</div>}
                    </td>
                    <td className="p-2 text-center font-medium">
                      <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 font-normal">
                        {item.unit || 'Nos'}
                      </Badge>
                    </td>
                    <td className="p-2 text-right font-medium">{item.quantity}</td>
                    <td className="p-2 text-right text-muted-foreground">
                      ₹{item.estimatedPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-right font-semibold">
                      ₹{item.estimatedTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-muted/30 font-bold">
                <tr>
                  <td colSpan={3} className="p-2.5 text-right font-semibold">
                    Total Items: {order.items.length} ({order.totalQuantity} Units)
                  </td>
                  <td colSpan={2} className="p-2.5 text-right font-bold">
                    Estimated Grand Total:
                  </td>
                  <td className="p-2.5 text-right text-sm font-extrabold text-primary">
                    ₹{order.totalEstimatedAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Notes and Terms */}
          {order.notes && (
            <div className="p-2.5 rounded-lg border border-dashed text-xs bg-muted/10">
              <span className="font-semibold text-muted-foreground block mb-0.5">Special Instructions / Terms:</span>
              <p className="text-foreground whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}

          {/* Bottom Signatures Block */}
          <div className="pt-6 flex justify-between items-end text-xs text-muted-foreground">
            <div>
              <p>Thank you for your business!</p>
              <p className="text-[11px] mt-0.5">This is a computer-generated Purchase Order.</p>
            </div>
            <div className="text-right space-y-8">
              <p className="font-semibold text-foreground">For {companyName}</p>
              <div className="border-t pt-1 w-36 text-center text-[11px]">
                Authorized Signatory
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
