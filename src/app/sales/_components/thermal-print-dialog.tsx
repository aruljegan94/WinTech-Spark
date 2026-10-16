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
import { Printer, Check, Usb, AlertCircle, RefreshCw, Sparkles, Tag } from 'lucide-react';
import type { Sale, CompanyProfile } from '@/lib/types';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import {
  isWebSerialSupported,
  getConnectedSerialPort,
  requestSerialPort,
  disconnectSerialPort,
  directPrintViaWebSerial,
  directTestPrintViaWebSerial,
  printReceiptViaIframe,
  printTestReceiptViaIframe,
  printLabelViaIframe,
} from '@/lib/thermal-printer';

interface ThermalPrintDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale;
  companyProfile: CompanyProfile;
}

export function ThermalPrintDialog({
  isOpen,
  onOpenChange,
  sale,
  companyProfile,
}: ThermalPrintDialogProps) {
  const [paperWidth, setPaperWidth] = useState<'55mm'>('55mm');
  const [hasSerialPort, setHasSerialPort] = useState(false);
  const [isDirectPrinting, setIsDirectPrinting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [selectedLabelSize, setSelectedLabelSize] = useState<'50x30' | '50x25'>('50x30');

  // Load saved paper width on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('spark_preferred_paper_size', '55mm');
    }
  }, []);

  // Check for connected serial ports
  useEffect(() => {
    if (isOpen) {
      checkSerialPort();
    }
  }, [isOpen]);

  const checkSerialPort = async () => {
    try {
      const port = await getConnectedSerialPort();
      setHasSerialPort(!!port);
    } catch (_) {
      setHasSerialPort(false);
    }
  };

  const handleConnectPort = async () => {
    try {
      setStatusMessage(null);
      await requestSerialPort();
      setHasSerialPort(true);
      setStatusMessage('POSIFLOW thermal printer connected successfully via USB/Serial!');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      if (err.name !== 'NotFoundError') {
        setStatusMessage('Could not connect to USB printer. Check cable or driver.');
      }
    }
  };

  // 1. Direct Thermal Print (via Web Serial / ESC-POS at 55mm)
  const handleDirectPrint = async () => {
    setIsDirectPrinting(true);
    setStatusMessage(null);
    try {
      await directPrintViaWebSerial(sale, companyProfile, false);
      setHasSerialPort(true);
      setStatusMessage('Receipt sent directly to POSIFLOW printer (55mm)!');
      setTimeout(() => {
        setIsDirectPrinting(false);
        onOpenChange(false);
      }, 1000);
    } catch (err: any) {
      setIsDirectPrinting(false);
      console.warn('Direct print failed, falling back to system print:', err);
      // Fallback to system spooler with exact 55mm roll format
      handleSystemPrint();
    }
  };

  // 2. System Print (via isolated iframe with exact 55mm POSIFLOW roll format, Never A4)
  const handleSystemPrint = () => {
    printReceiptViaIframe(sale, companyProfile, false);
  };

  // 3. Test Print
  const handleTestPrint = async () => {
    setIsTesting(true);
    setStatusMessage(null);
    try {
      if (hasSerialPort) {
        await directTestPrintViaWebSerial(false);
        setStatusMessage('Test receipt printed directly (55mm)!');
      } else {
        printTestReceiptViaIframe(false);
        setStatusMessage('Test receipt sent to 55mm system print!');
      }
    } catch (err) {
      printTestReceiptViaIframe(false);
    } finally {
      setIsTesting(false);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  // 4. Print Item Labels for this single order / invoice
  const handlePrintItemLabels = (size: '50x30' | '50x25') => {
    const widthMm = 50;
    const heightMm = size === '50x30' ? 30 : 25;
    const items = sale.items || [];
    const labels: string[] = [];

    const compName = companyProfile?.companyName || 'WIN AUTOMOBILES';

    for (const item of items) {
      const qty = Math.max(1, Math.min(item.quantity || 1, 50));
      const productName = item.productName || 'Item';
      const price = Number(item.price || 0).toFixed(2);
      const barcodeVal = (item as any).barcode || item.productId || 'SKU-ITEM';

      for (let i = 0; i < qty; i++) {
        labels.push(`
          <div style="font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 0.5px solid #ccc; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-bottom: 1px;">
            ${compName}
          </div>
          <div style="font-size: 9px; font-weight: 700; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 1px 0;">
            ${productName}
          </div>
          <div style="font-family: monospace; font-size: 11px; font-weight: 900; letter-spacing: 1.5px; padding: 2px 4px; background: #f0f0f0; border-radius: 2px;">
            *${barcodeVal}*
          </div>
          <div style="font-size: 8px; font-weight: 700; width: 100%; display: flex; justify-content: space-between; border-top: 0.5px solid #eee; padding-top: 1px;">
            <span>MRP: ₹${price}</span>
            <span>#${sale.invoiceNumber || ''}</span>
          </div>
        `);
      }
    }

    if (labels.length === 0) {
      toast({ title: 'No Items', description: 'This invoice has no items to generate labels for.' });
      return;
    }

    printLabelViaIframe(labels, widthMm, heightMm);
    setStatusMessage(`Sent ${labels.length} label(s) [${size}] to POSIFLOW label printer!`);
    setTimeout(() => setStatusMessage(null), 3500);
  };

  const formattedDate = sale.date ? format(new Date(sale.date), 'dd-MMM-yyyy hh:mm a') : '';
  const total = Number(sale.total) || 0;
  const paidAmount = Number(sale.amountPaid) || 0;
  const discountAmount = Number(sale.discount) || 0;
  const balance = Math.max(0, total - paidAmount - discountAmount);
  const isWebSerialAvail = isWebSerialSupported();

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[92vh] flex flex-col p-5">
        <DialogHeader className="no-print pb-2 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Printer className="h-5 w-5 text-primary" />
              POSIFLOW 2" (55mm) Thermal Receipt
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Direct 55mm thermal printing for POSIFLOW 2-inch printer — calibrated to prevent text truncation.
          </DialogDescription>
        </DialogHeader>

        {/* Status Message Alert */}
        {statusMessage && (
          <div className="py-2 px-3 text-xs rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Paper Size & Connection Status Controls */}
        <div className="flex flex-col gap-2 py-2 border-b no-print">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Printer Size:</span>
              <div className="flex items-center gap-1.5">
                <div className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1 shadow-xs">
                  <Check className="h-3.5 w-3.5 mr-0.5" />
                  55mm (POSIFLOW 2" Default)
                </div>
              </div>
            </div>

            {/* Test Print Link & Label Shortcut */}
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handlePrintItemLabels(selectedLabelSize)}
                className="h-8 text-xs font-medium text-primary border-primary/30 hover:bg-primary/5"
                title="Print 50x30 or 50x25 barcode sticker labels for items in this order"
              >
                <Tag className="h-3.5 w-3.5 mr-1" />
                Labels ({selectedLabelSize})
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isTesting}
                onClick={handleTestPrint}
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                {isTesting ? (
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 mr-1 text-primary" />
                )}
                Test Strip
              </Button>
            </div>
          </div>

          {/* Quick Label Size Switcher if printing labels for this order */}
          <div className="flex items-center justify-between text-xs px-2.5 py-1 rounded bg-muted/40 border">
            <span className="text-muted-foreground font-medium flex items-center gap-1">
              <Tag className="h-3 w-3" />
              Direct Label Roll Size:
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setSelectedLabelSize('50x30')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                  selectedLabelSize === '50x30'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'bg-background hover:bg-muted text-muted-foreground'
                }`}
              >
                50x30mm (Standard)
              </button>
              <button
                type="button"
                onClick={() => setSelectedLabelSize('50x25')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                  selectedLabelSize === '50x25'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'bg-background hover:bg-muted text-muted-foreground'
                }`}
              >
                50x25mm (Compact)
              </button>
            </div>
          </div>

          {/* USB Direct Thermal Printer Status Bar */}
          {isWebSerialAvail && (
            <div
              className={`flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs ${
                hasSerialPort
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300'
                  : 'bg-amber-50/70 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Usb className="h-4 w-4 shrink-0" />
                <span className="font-medium">
                  {hasSerialPort
                    ? 'POSIFLOW USB Printer: Paired & Ready'
                    : 'POSIFLOW USB Printer: Port not selected'}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-[11px] px-2"
                onClick={handleConnectPort}
              >
                {hasSerialPort ? 'Change Port' : 'Pair USB Port'}
              </Button>
            </div>
          )}
        </div>

        {/* Thermal Print Preview Container */}
        <div className="flex-1 overflow-y-auto p-4 bg-muted/30 rounded-md flex justify-center no-print min-h-[300px]">
          <div
            id="thermal-receipt-preview"
            style={{
              width: '225px',
              fontFamily: "'Courier New', Courier, monospace",
            }}
            className="bg-white text-black p-3 border border-black shadow-sm text-xs leading-snug select-none rounded-none"
          >
            {/* Receipt Header */}
            <div className="text-center space-y-0.5 mb-2">
              <h2 className="font-bold text-sm uppercase tracking-wide">
                {companyProfile?.companyName || 'Win Automobiles'}
              </h2>
              {companyProfile?.address && (
                <p className="whitespace-pre-line text-[11px]">{companyProfile.address}</p>
              )}
              {companyProfile?.contact && <p className="text-[11px]">Ph: {companyProfile.contact}</p>}
              {companyProfile?.gstNumber && (
                <p className="text-[11px]">GSTIN: {companyProfile.gstNumber}</p>
              )}
            </div>

            <div className="border-t border-b border-black py-1 my-2 text-center font-bold uppercase">
              TAX INVOICE
            </div>

            {/* Invoice Meta */}
            <div className="space-y-0.5 mb-2 text-[11px]">
              <div className="flex justify-between">
                <span>Invoice #:</span>
                <span className="font-bold">{sale.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Date:</span>
                <span>{formattedDate}</span>
              </div>
              {sale.customerName && (
                <div className="flex justify-between">
                  <span>Customer:</span>
                  <span className="font-semibold">{sale.customerName}</span>
                </div>
              )}
              {sale.customerMobile && (
                <div className="flex justify-between">
                  <span>Phone:</span>
                  <span>{sale.customerMobile}</span>
                </div>
              )}
            </div>

            <div className="border-t border-dashed border-black my-2" />

            {/* Items Table Header */}
            <div className="font-bold border-b border-black pb-1 mb-1 grid grid-cols-12 gap-1 text-[11px]">
              <span className="col-span-5">Item</span>
              <span className="col-span-2 text-center">Qty</span>
              <span className="col-span-2 text-right">Price</span>
              <span className="col-span-3 text-right">Amt</span>
            </div>

            {/* Items List */}
            <div className="space-y-1 text-[11px]">
              {(sale.items || []).map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1 align-top">
                  <span className="col-span-5 truncate">{item.productName}</span>
                  <span className="col-span-2 text-center">{item.quantity}</span>
                  <span className="col-span-2 text-right">₹{item.price}</span>
                  <span className="col-span-3 text-right font-semibold">
                    ₹{item.total.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-dashed border-black my-2" />

            {/* Totals */}
            <div className="space-y-1 text-[11px] text-right">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>₹{(sale.subtotal || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>GST:</span>
                <span>₹{(sale.gstAmount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between">
                  <span>Discount:</span>
                  <span>-₹{discountAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex justify-between font-bold border-t border-b border-black py-1 my-1 text-xs">
                <span>TOTAL:</span>
                <span>₹{(sale.total || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span>Payment Mode:</span>
                <span>{sale.paymentMode || 'Cash'}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span>Payment Status:</span>
                <span className="font-bold uppercase">{sale.paymentStatus || 'Paid'}</span>
              </div>
              {paidAmount > 0 && balance > 0.01 && (
                <>
                  <div className="flex justify-between text-[11px]">
                    <span>Amount Paid:</span>
                    <span>₹{paidAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-bold">
                    <span>Balance Due:</span>
                    <span>₹{balance.toLocaleString()}</span>
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-dashed border-black my-2" />

            {/* Footer */}
            <div className="text-center space-y-0.5 mt-2 text-[10px]">
              <p className="font-bold">Thank You for Your Business!</p>
              <p>Please Visit Again</p>
            </div>
          </div>
        </div>

        {/* Dialog Actions */}
        <DialogFooter className="flex flex-row items-center justify-between sm:justify-between border-t pt-3 no-print gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>

          <div className="flex items-center gap-2">
            {/* System Print Dialog (Preview with exact 80mm roll, Never A4) */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSystemPrint}
              className="gap-1.5"
            >
              <Printer className="h-4 w-4" />
              System Print ({paperWidth})
            </Button>

            {/* Direct Thermal Print (Instant USB / ESC-POS) */}
            <Button
              type="button"
              onClick={handleDirectPrint}
              disabled={isDirectPrinting}
              className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              size="sm"
            >
              {isDirectPrinting ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Usb className="h-4 w-4" />
              )}
              {isDirectPrinting ? 'Printing…' : 'Direct Print'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
