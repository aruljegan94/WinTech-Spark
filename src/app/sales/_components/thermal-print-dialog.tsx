'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Printer,
  Check,
  Usb,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Tag,
  Receipt,
  Settings2,
  ExternalLink,
  CheckCircle2,
  Info,
  Layers,
  Plus,
  Minus,
  Zap,
} from 'lucide-react';
import type { Sale, CompanyProfile } from '@/lib/types';
import { toast } from '@/hooks/use-toast';
import {
  PSF20_PAPER_PRESETS,
  getPaperPreset,
  renderReceiptToPngPages,
  renderLabelsToPngPages,
  renderTestPageToDataUrl,
  fetchWindowsPrinters,
  sendPagesToWindowsPrinter,
  printRenderedPagesViaIframe,
  type PaperSizeId,
  type PrintDarkness,
  type WindowsPrinterInfo,
  type LabelPrintItem,
} from '@/lib/thermal-printer';

interface ThermalPrintDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale;
  companyProfile?: CompanyProfile | null;
  initialTab?: 'receipt' | 'labels' | 'setup';
}

const RECEIPT_SIZE_OPTIONS: PaperSizeId[] = [
  '55x30',
  '58x30',
  '80x30',
  '50x30',
  '50x40',
  '50x50',
  '55mm-roll',
  '58mm-roll',
  '80mm-roll',
];

const LABEL_SIZE_OPTIONS: PaperSizeId[] = [
  '50x30',
  '55x30',
  '58x30',
  '80x30',
  '50x25',
  '50x20',
  '50x40',
  '50x50',
  '38x25',
  '38x38',
];

export function ThermalPrintDialog({
  isOpen,
  onOpenChange,
  sale,
  companyProfile,
  initialTab = 'receipt',
}: ThermalPrintDialogProps) {
  const [activeTab, setActiveTab] = useState<'receipt' | 'labels' | 'setup'>(initialTab);

  // Printer discovery state
  const [printers, setPrinters] = useState<WindowsPrinterInfo[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('SR20');
  const [isLoadingPrinters, setIsLoadingPrinters] = useState<boolean>(false);
  const [isPsf20Detected, setIsPsf20Detected] = useState<boolean>(false);

  // Receipt settings
  const [receiptSizeId, setReceiptSizeId] = useState<PaperSizeId>('55x30');
  const [darkness, setDarkness] = useState<PrintDarkness>('dark');
  const [receiptCopies, setReceiptCopies] = useState<number>(1);
  const [renderedReceiptPages, setRenderedReceiptPages] = useState<string[]>([]);

  // Label settings
  const [labelSizeId, setLabelSizeId] = useState<PaperSizeId>('50x30');
  const [showCompany, setShowCompany] = useState<boolean>(true);
  const [showProduct, setShowProduct] = useState<boolean>(true);
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showBarcodeText, setShowBarcodeText] = useState<boolean>(true);
  const [showInvoiceRef, setShowInvoiceRef] = useState<boolean>(true);
  const [itemLabelQuantities, setItemLabelQuantities] = useState<Record<number, number>>({});
  const [renderedLabelPages, setRenderedLabelPages] = useState<string[]>([]);

  // Action states
  const [isDirectPrinting, setIsDirectPrinting] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  // Load saved preferences from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedReceiptSize = localStorage.getItem('spark_psf20_receipt_size') as PaperSizeId | null;
      const savedLabelSize = localStorage.getItem('spark_psf20_label_size') as PaperSizeId | null;
      const savedDarkness = localStorage.getItem('spark_psf20_darkness') as PrintDarkness | null;
      const savedPrinter = localStorage.getItem('spark_psf20_printer_name');

      if (savedReceiptSize && RECEIPT_SIZE_OPTIONS.includes(savedReceiptSize)) {
        setReceiptSizeId(savedReceiptSize);
      }
      if (savedLabelSize && LABEL_SIZE_OPTIONS.includes(savedLabelSize)) {
        setLabelSizeId(savedLabelSize);
      }
      if (savedDarkness && ['normal', 'dark', 'extra-dark'].includes(savedDarkness)) {
        setDarkness(savedDarkness);
      }
      if (savedPrinter) {
        setSelectedPrinter(savedPrinter);
      }
    }
  }, []);

  // Initialize per-item label quantities from sale items
  useEffect(() => {
    if (sale?.items) {
      const initialMap: Record<number, number> = {};
      sale.items.forEach((item, idx) => {
        initialMap[idx] = Math.max(1, Math.min(Number(item.quantity) || 1, 50));
      });
      setItemLabelQuantities(initialMap);
    }
  }, [sale]);

  // Detect Windows printers when dialog opens
  const refreshPrinters = useCallback(async () => {
    setIsLoadingPrinters(true);
    try {
      const res = await fetchWindowsPrinters();
      if (res.printers && res.printers.length > 0) {
        setPrinters(res.printers);
        setIsPsf20Detected(res.hasPsf20);
        if (res.recommendedPrinter) {
          setSelectedPrinter((prev) => {
            const stillExists = res.printers.some((p) => p.Name === prev);
            return stillExists ? prev : res.recommendedPrinter!;
          });
        }
      }
    } catch (err) {
      console.warn('Could not query Windows printers:', err);
    } finally {
      setIsLoadingPrinters(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      refreshPrinters();
      setStatusMessage(null);
    }
  }, [isOpen, refreshPrinters]);

  // Persist user selections
  const handleSelectReceiptSize = (id: PaperSizeId) => {
    setReceiptSizeId(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('spark_psf20_receipt_size', id);
    }
  };

  const handleSelectLabelSize = (id: PaperSizeId) => {
    setLabelSizeId(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('spark_psf20_label_size', id);
    }
  };

  const handleSelectDarkness = (d: PrintDarkness) => {
    setDarkness(d);
    if (typeof window !== 'undefined') {
      localStorage.setItem('spark_psf20_darkness', d);
    }
  };

  const handleSelectPrinter = (name: string) => {
    setSelectedPrinter(name);
    if (typeof window !== 'undefined') {
      localStorage.setItem('spark_psf20_printer_name', name);
    }
  };

  const activeReceiptPreset = useMemo(() => getPaperPreset(receiptSizeId), [receiptSizeId]);
  const activeLabelPreset = useMemo(() => getPaperPreset(labelSizeId), [labelSizeId]);

  // Generate 203-DPI Receipt Preview pages whenever sale, size, or darkness changes
  useEffect(() => {
    if (!isOpen || !sale) return;
    const pages = renderReceiptToPngPages(sale, companyProfile, receiptSizeId, darkness);
    setRenderedReceiptPages(pages);
  }, [isOpen, sale, companyProfile, receiptSizeId, darkness]);

  // Build LabelPrintItem list for the current invoice
  const orderLabelItems = useMemo<LabelPrintItem[]>(() => {
    if (!sale?.items) return [];
    const compName = companyProfile?.companyName || 'WIN AUTOMOBILES';
    const items: LabelPrintItem[] = [];

    sale.items.forEach((item, idx) => {
      const qty = itemLabelQuantities[idx] ?? Math.max(1, Number(item.quantity) || 1);
      if (qty <= 0) return;
      const barcodeVal =
        (item as any).barcode ||
        (item.productId ? `SKU-${String(item.productId).slice(0, 8).toUpperCase()}` : `INV-${sale.invoiceNumber || idx + 1}`);

      items.push({
        companyName: compName,
        productName: item.productName || 'Item',
        barcodeValue: barcodeVal,
        priceFormatted: Number(item.price || 0).toFixed(2),
        subtitle: sale.invoiceNumber ? `#${sale.invoiceNumber}` : '',
        copies: qty,
        showCompany,
        showProduct,
        showPrice,
        showBarcodeText,
        showSubtitle: showInvoiceRef,
      });
    });

    return items;
  }, [
    sale,
    companyProfile,
    itemLabelQuantities,
    showCompany,
    showProduct,
    showPrice,
    showBarcodeText,
    showInvoiceRef,
  ]);

  // Generate 203-DPI Label Preview pages whenever label settings change
  useEffect(() => {
    if (!isOpen) return;
    const pages = renderLabelsToPngPages(
      orderLabelItems,
      activeLabelPreset.widthMm,
      activeLabelPreset.heightMm,
      darkness
    );
    setRenderedLabelPages(pages);
  }, [isOpen, orderLabelItems, activeLabelPreset, darkness]);

  // Direct Print Receipt via Windows Spooler API (with Browser fallback)
  const handleDirectPrintReceipt = async () => {
    if (renderedReceiptPages.length === 0) return;
    setIsDirectPrinting(true);
    setStatusMessage(null);

    try {
      const effectiveHeightMm =
        activeReceiptPreset.heightMm > 0 ? activeReceiptPreset.heightMm : 50;

      const res = await sendPagesToWindowsPrinter({
        printerName: selectedPrinter || 'SR20',
        pages: renderedReceiptPages,
        widthMm: activeReceiptPreset.widthMm,
        heightMm: effectiveHeightMm,
        copies: receiptCopies,
        jobTitle: `Receipt_${sale.invoiceNumber || 'POS'}_${activeReceiptPreset.id}`,
      });

      if (res.ok) {
        setStatusMessage({
          type: 'success',
          text: `Printed ${renderedReceiptPages.length} page(s) [${activeReceiptPreset.shortLabel}] directly to ${res.printerName} (${res.paperName})!`,
        });
        toast({
          title: 'POSIFLOW Direct Print Sent',
          description: `Invoice #${sale.invoiceNumber} (${activeReceiptPreset.shortLabel}) sent directly to ${res.printerName}.`,
        });
      } else {
        throw new Error(res.error || 'Spooler returned an error');
      }
    } catch (err: any) {
      console.warn('Direct spooler print failed, falling back to calibrated browser print:', err);
      const effectiveHeightMm =
        activeReceiptPreset.heightMm > 0 ? activeReceiptPreset.heightMm : 50;
      printRenderedPagesViaIframe(
        renderedReceiptPages,
        activeReceiptPreset.widthMm,
        effectiveHeightMm,
        `Receipt #${sale.invoiceNumber}`
      );
      setStatusMessage({
        type: 'warning',
        text: `Opened calibrated ${activeReceiptPreset.shortLabel} system print dialog.`,
      });
    } finally {
      setIsDirectPrinting(false);
    }
  };

  // Direct Print Order Item Labels via Windows Spooler API
  const handleDirectPrintLabels = async () => {
    if (renderedLabelPages.length === 0) {
      toast({
        title: 'No Labels Selected',
        description: 'Set at least 1 label quantity for an item to print.',
      });
      return;
    }

    setIsDirectPrinting(true);
    setStatusMessage(null);

    try {
      const res = await sendPagesToWindowsPrinter({
        printerName: selectedPrinter || 'SR20',
        pages: renderedLabelPages,
        widthMm: activeLabelPreset.widthMm,
        heightMm: activeLabelPreset.heightMm,
        copies: 1,
        jobTitle: `Labels_${sale.invoiceNumber || 'POS'}_${activeLabelPreset.id}`,
      });

      if (res.ok) {
        setStatusMessage({
          type: 'success',
          text: `Printed ${renderedLabelPages.length} barcode sticker(s) [${activeLabelPreset.shortLabel}] directly to ${res.printerName}!`,
        });
        toast({
          title: 'POSIFLOW Direct Label Print',
          description: `Sent ${renderedLabelPages.length} label(s) (${activeLabelPreset.shortLabel}) to ${res.printerName}.`,
        });
      } else {
        throw new Error(res.error || 'Spooler error');
      }
    } catch (err: any) {
      console.warn('Direct label print failed, falling back to calibrated browser print:', err);
      printRenderedPagesViaIframe(
        renderedLabelPages,
        activeLabelPreset.widthMm,
        activeLabelPreset.heightMm,
        `Labels #${sale.invoiceNumber}`
      );
      setStatusMessage({
        type: 'warning',
        text: `Opened calibrated ${activeLabelPreset.shortLabel} browser print dialog.`,
      });
    } finally {
      setIsDirectPrinting(false);
    }
  };

  // Browser System Print Dialog (explicit button)
  const handleBrowserPrint = () => {
    if (activeTab === 'labels') {
      if (renderedLabelPages.length === 0) return;
      printRenderedPagesViaIframe(
        renderedLabelPages,
        activeLabelPreset.widthMm,
        activeLabelPreset.heightMm,
        `Labels #${sale.invoiceNumber}`
      );
    } else {
      if (renderedReceiptPages.length === 0) return;
      const effectiveHeightMm =
        activeReceiptPreset.heightMm > 0 ? activeReceiptPreset.heightMm : 50;
      printRenderedPagesViaIframe(
        renderedReceiptPages,
        activeReceiptPreset.widthMm,
        effectiveHeightMm,
        `Receipt #${sale.invoiceNumber}`
      );
    }
  };

  // 1-Click Hardware Calibration Test Page
  const handleTestPrint = async () => {
    setIsTesting(true);
    setStatusMessage(null);
    const activePreset = activeTab === 'labels' ? activeLabelPreset : activeReceiptPreset;
    const testW = activePreset.widthMm;
    const testH = activePreset.heightMm > 0 ? activePreset.heightMm : 30;
    const testPageUrl = renderTestPageToDataUrl(testW, testH, darkness);

    try {
      const res = await sendPagesToWindowsPrinter({
        printerName: selectedPrinter || 'SR20',
        pages: [testPageUrl],
        widthMm: testW,
        heightMm: testH,
        copies: 1,
        jobTitle: `PSF20_Test_${testW}x${testH}mm`,
      });

      if (res.ok) {
        setStatusMessage({
          type: 'success',
          text: `Test sticker (${testW}×${testH}mm → ${res.paperName}) printed directly on ${res.printerName}!`,
        });
      } else {
        throw new Error(res.error || 'Test print failed');
      }
    } catch (_) {
      printRenderedPagesViaIframe([testPageUrl], testW, testH, 'POSIFLOW PSF-20 Test Print');
      setStatusMessage({
        type: 'warning',
        text: `Test print (${testW}×${testH}mm) opened in browser print dialog.`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const currentPrinterInfo = useMemo(
    () => printers.find((p) => p.Name === selectedPrinter),
    [printers, selectedPrinter]
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[94vh] flex flex-col p-0 overflow-hidden gap-0">
        {/* ─── Top Header ─────────────────────────────────────────────────────── */}
        <DialogHeader className="px-5 pt-4 pb-3 border-b bg-muted/20 no-print">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <Printer className="h-5 w-5 text-primary" />
                POSIFLOW PSF-20 (SR20) Thermal Receipt &amp; Label Printer
                {isPsf20Detected && (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] px-2 py-0 h-5">
                    SR20 Ready (USB001)
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Direct 203-DPI thermal printing for Receipts &amp; Barcode Stickers — auto-calibrated for 80×30, 58×30, 55×30 &amp; 50×30mm rolls.
              </DialogDescription>
            </div>

            {/* Test Strip Button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isTesting}
              onClick={handleTestPrint}
              className="h-8 text-xs font-semibold gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
            >
              {isTesting ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Print Test Sticker
            </Button>
          </div>

          {/* Printer Selection & Status Bar */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg border bg-background text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Usb className={`h-4 w-4 shrink-0 ${isPsf20Detected ? 'text-emerald-600' : 'text-amber-600'}`} />
              <span className="font-semibold text-muted-foreground shrink-0">Target Printer:</span>
              <select
                value={selectedPrinter}
                onChange={(e) => handleSelectPrinter(e.target.value)}
                className="h-7 rounded border bg-muted/40 px-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {printers.length === 0 ? (
                  <option value="SR20">SR20 (POSIFLOW PSF-20 Default)</option>
                ) : (
                  printers.map((p) => (
                    <option key={p.Name} value={p.Name}>
                      {p.Name} ({p.PortName}){p.IsDefault ? ' ★ Default' : ''}
                    </option>
                  ))
                )}
              </select>
              {currentPrinterInfo && (
                <span className="text-[11px] text-muted-foreground hidden md:inline truncate">
                  • Port: <strong>{currentPrinterInfo.PortName}</strong> • Driver: <strong>{currentPrinterInfo.DriverName}</strong>
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={refreshPrinters}
                disabled={isLoadingPrinters}
                className="h-6 px-2 text-[11px]"
                title="Refresh installed Windows printers"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isLoadingPrinters ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Mode Tabs */}
          <div className="flex items-center gap-1.5 pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('receipt')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 border ${
                activeTab === 'receipt'
                  ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                  : 'bg-background text-muted-foreground hover:text-foreground border-border'
              }`}
            >
              <Receipt className="h-3.5 w-3.5" />
              Receipt Print ({activeReceiptPreset.shortLabel})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('labels')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 border ${
                activeTab === 'labels'
                  ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                  : 'bg-background text-muted-foreground hover:text-foreground border-border'
              }`}
            >
              <Tag className="h-3.5 w-3.5" />
              Order Item Labels ({renderedLabelPages.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('setup')}
              className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 border ${
                activeTab === 'setup'
                  ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                  : 'bg-background text-muted-foreground hover:text-foreground border-border'
              }`}
            >
              <Settings2 className="h-3.5 w-3.5" />
              PSF-20 Setup Guide
            </button>
          </div>
        </DialogHeader>

        {/* Status Banner */}
        {statusMessage && (
          <div
            className={`mx-5 mt-3 py-2 px-3 text-xs rounded-md border flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200'
                : statusMessage.type === 'warning'
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-rose-200'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* ─── Body Content ───────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* ==================== TAB 1: RECEIPT PRINT ==================== */}
          {activeTab === 'receipt' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
              {/* Left Column: Size & Print Controls */}
              <div className="md:col-span-6 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      1. Select Receipt / Roll Size
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      Driver: {activeReceiptPreset.sr20DriverPaperName}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    {RECEIPT_SIZE_OPTIONS.map((sizeId) => {
                      const preset = PSF20_PAPER_PRESETS[sizeId];
                      const isSelected = receiptSizeId === sizeId;
                      return (
                        <button
                          key={sizeId}
                          type="button"
                          onClick={() => handleSelectReceiptSize(sizeId)}
                          className={`p-2 rounded-lg border text-left transition-all ${
                            isSelected
                              ? 'bg-primary/10 border-primary text-foreground ring-1 ring-primary shadow-2xs'
                              : 'bg-background hover:bg-muted/50 border-border text-muted-foreground'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-foreground">
                              {preset.shortLabel}
                            </span>
                            {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                            {preset.heightMm > 0 ? `${preset.heightMm}mm Sticker` : 'Continuous Roll'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground bg-muted/40 p-2 rounded border">
                    <Info className="h-3.5 w-3.5 inline mr-1 text-primary" />
                    {activeReceiptPreset.description}
                  </p>
                </div>

                {/* Darkness / Density & Copies */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      2. Thermal Darkness
                    </span>
                    <div className="flex gap-1">
                      {(['normal', 'dark', 'extra-dark'] as PrintDarkness[]).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => handleSelectDarkness(d)}
                          className={`flex-1 py-1.5 px-2 rounded border text-[11px] font-semibold capitalize transition ${
                            darkness === d
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {d.replace('-', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      3. Print Copies
                    </span>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setReceiptCopies(num)}
                          className={`flex-1 py-1.5 px-2 rounded border text-xs font-bold transition ${
                            receiptCopies === num
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {num}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* SR20 Hardware Calibration Info Box */}
                <div className="rounded-lg border bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 p-3 text-xs space-y-1">
                  <div className="font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-amber-600" />
                    Why 80×30 / 58×30 / 55×30mm works automatically now:
                  </div>
                  <p className="text-[11px] text-amber-800 dark:text-amber-200/90 leading-relaxed">
                    The POSIFLOW PSF-20 (<strong>SR20</strong>) printhead has a maximum hardware width of{' '}
                    <strong>49mm (392 dots @ 203 DPI)</strong>. Selecting <strong>80×30mm</strong>,{' '}
                    <strong>58×30mm</strong>, or <strong>55×30mm</strong> automatically formats and scales the bitmap to{' '}
                    <strong>{activeReceiptPreset.sr20DriverPaperName}</strong> so the Windows driver prints immediately without rejecting the page size.
                  </p>
                </div>
              </div>

              {/* Right Column: Live 203-DPI Rendered Bitmap Preview */}
              <div className="md:col-span-6 flex flex-col items-center bg-muted/30 border rounded-xl p-3 min-h-[320px]">
                <div className="w-full flex items-center justify-between text-xs mb-2 pb-1.5 border-b">
                  <span className="font-semibold text-foreground">
                    Live 203-DPI Thermal Preview ({activeReceiptPreset.shortLabel})
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {renderedReceiptPages.length}{' '}
                    {renderedReceiptPages.length === 1 ? 'Page / Sticker' : 'Pages / Stickers'}
                  </Badge>
                </div>

                <div className="flex-1 w-full overflow-y-auto max-h-[340px] flex flex-col items-center gap-3 py-2">
                  {renderedReceiptPages.map((dataUrl, idx) => (
                    <div
                      key={idx}
                      className="bg-white p-1.5 rounded shadow-sm border border-slate-300 flex flex-col items-center"
                    >
                      <img
                        src={dataUrl}
                        alt={`Receipt page ${idx + 1}`}
                        className="w-[240px] h-auto object-contain"
                      />
                      {renderedReceiptPages.length > 1 && (
                        <span className="text-[10px] text-muted-foreground font-mono mt-1">
                          Sticker {idx + 1} of {renderedReceiptPages.length}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ==================== TAB 2: ORDER ITEM LABELS ==================== */}
          {activeTab === 'labels' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
              {/* Left Column: Label Size, Toggles & Item Quantities */}
              <div className="md:col-span-6 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      1. Select Sticker Label Size
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      Driver: {activeLabelPreset.sr20DriverPaperName}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {LABEL_SIZE_OPTIONS.map((sizeId) => {
                      const preset = PSF20_PAPER_PRESETS[sizeId];
                      const isSelected = labelSizeId === sizeId;
                      return (
                        <button
                          key={sizeId}
                          type="button"
                          onClick={() => handleSelectLabelSize(sizeId)}
                          className={`p-2 rounded-lg border text-left transition-all ${
                            isSelected
                              ? 'bg-primary/10 border-primary text-foreground ring-1 ring-primary shadow-2xs'
                              : 'bg-background hover:bg-muted/50 border-border text-muted-foreground'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-foreground">
                              {preset.shortLabel}
                            </span>
                            {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {preset.widthMm}×{preset.heightMm}mm
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Label Elements to Display */}
                <div className="space-y-2 border-t pt-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    2. Label Content Fields
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Switch checked={showCompany} onCheckedChange={setShowCompany} />
                      <span>Company Header</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Switch checked={showProduct} onCheckedChange={setShowProduct} />
                      <span>Product Name</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Switch checked={showPrice} onCheckedChange={setShowPrice} />
                      <span>Price (MRP ₹)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Switch checked={showBarcodeText} onCheckedChange={setShowBarcodeText} />
                      <span>SKU / Code Text</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer col-span-2">
                      <Switch checked={showInvoiceRef} onCheckedChange={setShowInvoiceRef} />
                      <span>Invoice Number (#{sale.invoiceNumber})</span>
                    </label>
                  </div>
                </div>

                {/* Per-Item Sticker Quantity */}
                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      3. Items in Order ({renderedLabelPages.length} total stickers)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const oneEach: Record<number, number> = {};
                        (sale.items || []).forEach((_, i) => {
                          oneEach[i] = 1;
                        });
                        setItemLabelQuantities(oneEach);
                      }}
                      className="text-[11px] text-primary hover:underline font-medium"
                    >
                      Set All = 1
                    </button>
                  </div>

                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                    {(sale.items || []).map((item, idx) => {
                      const qty = itemLabelQuantities[idx] ?? 0;
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded border bg-background text-xs"
                        >
                          <div className="truncate pr-2">
                            <div className="font-semibold truncate">{item.productName}</div>
                            <div className="text-[10px] text-muted-foreground">
                              MRP: ₹{item.price} • Order Qty: {item.quantity}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() =>
                                setItemLabelQuantities((prev) => ({
                                  ...prev,
                                  [idx]: Math.max(0, (prev[idx] ?? 1) - 1),
                                }))
                              }
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-6 text-center font-mono font-bold">{qty}</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() =>
                                setItemLabelQuantities((prev) => ({
                                  ...prev,
                                  [idx]: Math.min(100, (prev[idx] ?? 1) + 1),
                                }))
                              }
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Live 203-DPI Barcode Label Preview */}
              <div className="md:col-span-6 flex flex-col items-center bg-muted/30 border rounded-xl p-3 min-h-[320px]">
                <div className="w-full flex items-center justify-between text-xs mb-2 pb-1.5 border-b">
                  <span className="font-semibold text-foreground">
                    Live Scannable Code-128 Preview ({activeLabelPreset.shortLabel})
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {renderedLabelPages.length} Sticker(s)
                  </Badge>
                </div>

                <div className="flex-1 w-full overflow-y-auto max-h-[340px] flex flex-col items-center gap-2.5 py-2">
                  {renderedLabelPages.length === 0 ? (
                    <div className="text-center py-12 text-xs text-muted-foreground">
                      No stickers selected. Increase item label count on the left.
                    </div>
                  ) : (
                    renderedLabelPages.slice(0, 20).map((dataUrl, idx) => (
                      <div
                        key={idx}
                        className="bg-white p-1.5 rounded shadow-sm border border-slate-300 flex flex-col items-center"
                      >
                        <img
                          src={dataUrl}
                          alt={`Label ${idx + 1}`}
                          className="w-[230px] h-auto object-contain"
                        />
                        <span className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          Sticker #{idx + 1} ({activeLabelPreset.widthMm}×{activeLabelPreset.heightMm}mm)
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== TAB 3: PSF-20 SETUP & GUIDE ==================== */}
          {activeTab === 'setup' && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Step 1: Roll Loading */}
                <div className="p-3.5 rounded-xl border bg-card space-y-1.5">
                  <div className="font-bold text-sm text-foreground flex items-center gap-1.5">
                    <span className="h-5 w-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-extrabold">
                      1
                    </span>
                    Paper Roll Loading &amp; Direction
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    Open the top cover of your <strong>POSIFLOW PSF-20</strong>. Place the thermal sticker or receipt roll with the{' '}
                    <strong>printable thermal side facing UP</strong> (towards the print head). Adjust the paper guide sliders snugly against the roll edges so it feeds straight without skewing.
                  </p>
                </div>

                {/* Step 2: Gap Sensor Calibration */}
                <div className="p-3.5 rounded-xl border bg-card space-y-1.5">
                  <div className="font-bold text-sm text-foreground flex items-center gap-1.5">
                    <span className="h-5 w-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-extrabold">
                      2
                    </span>
                    Gap Sensor Calibration (Fix Skipping)
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    Whenever you switch between <strong>50×30mm</strong>, <strong>55×30mm</strong>, or continuous rolls: turn the printer ON, then{' '}
                    <strong>press and hold the Power/Feed button for 2–3 seconds</strong> until it feeds one blank label and stops cleanly at the tear gap.
                  </p>
                </div>

                {/* Step 3: Windows Driver SR20 Size Mapping */}
                <div className="p-3.5 rounded-xl border bg-card space-y-1.5">
                  <div className="font-bold text-sm text-foreground flex items-center gap-1.5">
                    <span className="h-5 w-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-extrabold">
                      3
                    </span>
                    Automatic Size Calibration (SR20 USB001)
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    The official POSIFLOW PSF-20 Windows driver (<code>SR20</code>) supports <code>50 x 20</code>, <code>50 x 30</code>, <code>50 x 40</code>, and <code>50 x 50</code> at 203 DPI (49mm effective printhead width). When you choose <strong>80×30mm</strong>, <strong>58×30mm</strong>, or <strong>55×30mm</strong> in our app, we automatically scale the bitmap to fit the 49mm × 30mm driver canvas so it never fails or clips.
                  </p>
                </div>

                {/* Step 4: Troubleshooting Light or Blank Prints */}
                <div className="p-3.5 rounded-xl border bg-card space-y-1.5">
                  <div className="font-bold text-sm text-foreground flex items-center gap-1.5">
                    <span className="h-5 w-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-extrabold">
                      4
                    </span>
                    Fixing Light Print or Blank Feed
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    If prints look light, switch <strong>Thermal Darkness</strong> to <strong>Dark</strong> or <strong>Extra Dark</strong> in the Receipt tab. If the printer feeds blank paper, scratch the paper surface with your fingernail — the scratch must turn black on the side facing up.
                  </p>
                </div>
              </div>

              {/* Official Shreyans POS / POSIFLOW PSF-20 Resources */}
              <div className="p-3.5 rounded-xl border bg-muted/30 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-foreground">
                    Official POSIFLOW PSF-20 Support &amp; Downloads (Shreyans POS)
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Reference: https://www.shreyanspos.com/pages/psf20
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href="https://www.shreyanspos.com/pages/psf20"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border bg-background hover:bg-muted text-xs font-semibold text-primary"
                  >
                    PSF-20 Official Page <ExternalLink className="h-3 w-3" />
                  </a>
                  <a
                    href="https://youtu.be/KbfbR6-399s"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border bg-background hover:bg-muted text-xs font-semibold text-foreground"
                  >
                    Setup Video Guide <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── Footer Actions ─────────────────────────────────────────────────── */}
        <DialogFooter className="px-5 py-3 border-t bg-muted/20 flex flex-row items-center justify-between sm:justify-between gap-2 no-print">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleBrowserPrint}
              className="gap-1.5 text-xs"
            >
              <Printer className="h-3.5 w-3.5" />
              Browser Print Dialog
            </Button>

            {activeTab === 'labels' ? (
              <Button
                type="button"
                size="sm"
                disabled={isDirectPrinting || renderedLabelPages.length === 0}
                onClick={handleDirectPrintLabels}
                className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs px-4"
              >
                {isDirectPrinting ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                {isDirectPrinting
                  ? 'Printing Labels…'
                  : `Direct Print ${renderedLabelPages.length} Label(s) [${activeLabelPreset.shortLabel}]`}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={isDirectPrinting || renderedReceiptPages.length === 0}
                onClick={handleDirectPrintReceipt}
                className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs px-4"
              >
                {isDirectPrinting ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                {isDirectPrinting
                  ? 'Printing Receipt…'
                  : `Direct Print Receipt [${activeReceiptPreset.shortLabel}]`}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
