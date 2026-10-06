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
import { Printer, Check, Usb, AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
import type { Sale, CompanyProfile } from '@/lib/types';
import { format } from 'date-fns';
import {
  isWebSerialSupported,
  getConnectedSerialPort,
  requestSerialPort,
  disconnectSerialPort,
  directPrintViaWebSerial,
  directTestPrintViaWebSerial,
  printReceiptViaIframe,
  printTestReceiptViaIframe,
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
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('80mm');
  const [hasSerialPort, setHasSerialPort] = useState(false);
  const [isDirectPrinting, setIsDirectPrinting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Load saved paper width on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('spark_preferred_paper_size');
      if (saved === '58mm' || saved === '80mm') {
        setPaperWidth(saved);
      }
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

  const handleSetPaperWidth = (width: '58mm' | '80mm') => {
    setPaperWidth(width);
    if (typeof window !== 'undefined') {
      localStorage.setItem('spark_preferred_paper_size', width);
    }
  };

  const handleConnectPort = async () => {
    try {
      setStatusMessage(null);
      await requestSerialPort();
      setHasSerialPort(true);
      setStatusMessage('Thermal printer connected successfully via USB/Serial!');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      if (err.name !== 'NotFoundError') {
        setStatusMessage('Could not connect to USB printer. Check cable or driver.');
      }
    }
  };

  // 1. Direct Thermal Print (via Web Serial / ESC-POS)
  const handleDirectPrint = async () => {
    setIsDirectPrinting(true);
    setStatusMessage(null);
    try {
      const is3Inch = paperWidth === '80mm';
      await directPrintViaWebSerial(sale, companyProfile, is3Inch);
      setHasSerialPort(true);
      setStatusMessage('Receipt sent directly to thermal printer!');
      setTimeout(() => {
        setIsDirectPrinting(false);
        onOpenChange(false);
      }, 1000);
    } catch (err: any) {
      setIsDirectPrinting(false);
      console.warn('Direct print failed, falling back to system print:', err);
      // Fallback to system spooler with exact roll format
      handleSystemPrint();
    }
  };

  // 2. System Print (via isolated iframe with exact 80mm / 58mm roll format, Never A4)
  const handleSystemPrint = () => {
    const is3Inch = paperWidth === '80mm';
    printReceiptViaIframe(sale, companyProfile, is3Inch);
  };

  // 3. Test Print
  const handleTestPrint = async () => {
    setIsTesting(true);
    setStatusMessage(null);
    const is3Inch = paperWidth === '80mm';
    try {
      if (hasSerialPort) {
        await directTestPrintViaWebSerial(is3Inch);
        setStatusMessage('Test receipt printed directly!');
      } else {
        printTestReceiptViaIframe(is3Inch);
        setStatusMessage('Test receipt sent to system print!');
      }
    } catch (err) {
      printTestReceiptViaIframe(is3Inch);
    } finally {
      setIsTesting(false);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const formattedDate = sale.date ? format(new Date(sale.date), 'dd-MMM-yyyy hh:mm a') : '';
  const total = Number(sale.total) || 0;
  const paidAmount = Number(sale.amountPaid) || 0;
  const balance = Math.max(0, total - paidAmount);
  const isWebSerialAvail = isWebSerialSupported();

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[92vh] flex flex-col p-5">
        <DialogHeader className="no-print pb-2 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Printer className="h-5 w-5 text-primary" />
              Thermal Receipt Print (3" 80mm & 2" 58mm)
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Direct 1-Click thermal printing for Windows POS printers & continuous roll preview.
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
              <span className="text-xs font-semibold text-muted-foreground">Roll Size:</span>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  variant={paperWidth === '80mm' ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-xs font-medium"
                  onClick={() => handleSetPaperWidth('80mm')}
                >
                  {paperWidth === '80mm' && <Check className="h-3.5 w-3.5 mr-1" />}
                  80mm (3 Inch Standard)
                </Button>
                <Button
                  type="button"
                  variant={paperWidth === '58mm' ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-xs font-medium"
                  onClick={() => handleSetPaperWidth('58mm')}
                >
                  {paperWidth === '58mm' && <Check className="h-3.5 w-3.5 mr-1" />}
                  58mm (2 Inch Compact)
                </Button>
              </div>
            </div>

            {/* Test Print Link */}
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
                    ? 'Direct USB/Serial Printer: Paired & Ready'
                    : 'Direct USB Thermal Print: Port not selected'}
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
              width: paperWidth === '58mm' ? '240px' : '320px',
              fontFamily: "'Courier New', Courier, monospace",
            }}
            className="bg-white text-black p-4 border border-black shadow-sm text-xs leading-snug select-none rounded-none"
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
