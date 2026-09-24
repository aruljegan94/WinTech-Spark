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
import { Printer, Check } from 'lucide-react';
import type { Sale, CompanyProfile } from '@/lib/types';
import { format } from 'date-fns';

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

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = sale.date ? format(new Date(sale.date), 'dd-MMM-yyyy hh:mm a') : '';
  const formattedDueDate = sale.date
    ? format(new Date(new Date(sale.date).getTime() + 15 * 24 * 60 * 60 * 1000), 'dd-MMM-yyyy')
    : '';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="no-print">
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Thermal Receipt Print Preview
          </DialogTitle>
          <DialogDescription>
            Preview and confirm black & white thermal print layout before printing.
          </DialogDescription>
        </DialogHeader>

        {/* Paper Size Selector */}
        <div className="flex items-center gap-3 py-2 border-b no-print">
          <span className="text-sm font-medium text-muted-foreground">Paper Size:</span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={paperWidth === '58mm' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPaperWidth('58mm')}
            >
              58mm (2 Inch)
            </Button>
            <Button
              type="button"
              variant={paperWidth === '80mm' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPaperWidth('80mm')}
            >
              80mm (3 Inch)
            </Button>
          </div>
        </div>

        {/* Thermal Print Preview Container */}
        <div className="flex-1 overflow-y-auto p-4 bg-muted/40 rounded-md flex justify-center no-print">
          <div
            id="thermal-receipt-preview"
            style={{
              width: paperWidth === '58mm' ? '240px' : '320px',
              fontFamily: "'Courier New', Courier, monospace",
            }}
            className="bg-white text-black p-4 border border-black shadow-sm text-xs leading-snug select-none"
          >
            {/* Receipt Header */}
            <div className="text-center space-y-1 mb-2">
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
              {sale.items.map((item, idx) => (
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
                <span>₹{sale.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>GST:</span>
                <span>₹{sale.gstAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between font-bold border-t border-b border-black py-1 my-1 text-xs">
                <span>TOTAL:</span>
                <span>₹{sale.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span>Payment Mode:</span>
                <span>{sale.paymentMode || 'Cash'}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span>Payment Status:</span>
                <span className="font-bold uppercase">{sale.paymentStatus}</span>
              </div>
            </div>

            <div className="border-t border-dashed border-black my-2" />

            {/* Footer */}
            <div className="text-center space-y-1 mt-2 text-[10px]">
              <p className="font-bold">Thank You for Your Business!</p>
              <p>Please Visit Again</p>
            </div>
          </div>
        </div>

        {/* Printable Only Section (Hidden during normal screen view) */}
        <div id="thermal-receipt-print-area" className="hidden print:block">
          <div
            style={{
              width: paperWidth === '58mm' ? '58mm' : '80mm',
              margin: '0 auto',
              padding: '4px',
              fontFamily: "'Courier New', Courier, monospace",
              color: '#000',
              backgroundColor: '#fff',
              fontSize: '11px',
              lineHeight: '1.2',
            }}
          >
            {/* Receipt Header */}
            <div style={{ textAlign: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                {companyProfile?.companyName || 'Win Automobiles'}
              </div>
              {companyProfile?.address && (
                <div style={{ fontSize: '10px', whiteSpace: 'pre-line' }}>{companyProfile.address}</div>
              )}
              {companyProfile?.contact && <div style={{ fontSize: '10px' }}>Ph: {companyProfile.contact}</div>}
              {companyProfile?.gstNumber && (
                <div style={{ fontSize: '10px' }}>GSTIN: {companyProfile.gstNumber}</div>
              )}
            </div>

            <div
              style={{
                borderTop: '1px solid #000',
                borderBottom: '1px solid #000',
                padding: '3px 0',
                margin: '4px 0',
                textAlign: 'center',
                fontWeight: 'bold',
              }}
            >
              TAX INVOICE
            </div>

            <div style={{ fontSize: '10px', marginBottom: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Invoice #:</span>
                <span style={{ fontWeight: 'bold' }}>{sale.invoiceNumber}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Date:</span>
                <span>{formattedDate}</span>
              </div>
              {sale.customerName && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Customer:</span>
                  <span style={{ fontWeight: 'bold' }}>{sale.customerName}</span>
                </div>
              )}
              {sale.customerMobile && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Phone:</span>
                  <span>{sale.customerMobile}</span>
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

            <div
              style={{
                fontWeight: 'bold',
                borderBottom: '1px solid #000',
                paddingBottom: '2px',
                marginBottom: '4px',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '10px',
              }}
            >
              <span style={{ width: '40%' }}>Item</span>
              <span style={{ width: '15%', textAlign: 'center' }}>Qty</span>
              <span style={{ width: '20%', textAlign: 'right' }}>Price</span>
              <span style={{ width: '25%', textAlign: 'right' }}>Amt</span>
            </div>

            <div style={{ fontSize: '10px' }}>
              {sale.items.map((item, idx) => (
                <div
                  key={idx}
                  style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}
                >
                  <span style={{ width: '40%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.productName}
                  </span>
                  <span style={{ width: '15%', textAlign: 'center' }}>{item.quantity}</span>
                  <span style={{ width: '20%', textAlign: 'right' }}>₹{item.price}</span>
                  <span style={{ width: '25%', textAlign: 'right', fontWeight: 'bold' }}>
                    ₹{item.total.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

            <div style={{ fontSize: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal:</span>
                <span>₹{sale.subtotal.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>GST:</span>
                <span>₹{sale.gstAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  borderTop: '1px solid #000',
                  borderBottom: '1px solid #000',
                  padding: '3px 0',
                  margin: '4px 0',
                }}
              >
                <span>TOTAL:</span>
                <span>₹{sale.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Mode:</span>
                <span>{sale.paymentMode || 'Cash'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Status:</span>
                <span style={{ fontWeight: 'bold' }}>{sale.paymentStatus}</span>
              </div>
            </div>

            <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

            <div style={{ textAlign: 'center', fontSize: '9px', marginTop: '6px' }}>
              <div style={{ fontWeight: 'bold' }}>Thank You for Your Business!</div>
              <div>Please Visit Again</div>
            </div>
          </div>
        </div>

        {/* Global Print Stylesheet for Thermal Printer */}
        <style jsx global>{`
          @media print {
            body * {
              visibility: hidden !important;
            }
            #thermal-receipt-print-area,
            #thermal-receipt-print-area * {
              visibility: visible !important;
            }
            #thermal-receipt-print-area {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
            }
            @page {
              size: ${paperWidth === '58mm' ? '58mm auto' : '80mm auto'};
              margin: 0mm;
            }
          }
        `}</style>

        <DialogFooter className="sm:justify-between border-t pt-3 no-print">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" />
            Confirm & Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
