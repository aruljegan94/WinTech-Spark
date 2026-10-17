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
import {
  Printer,
  Check,
  Usb,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Tag,
  Settings2,
  ExternalLink,
  CheckCircle2,
  Info,
  Zap,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  PSF20_PAPER_PRESETS,
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

interface Psf20LabelModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  labelItems: LabelPrintItem[];
  initialWidthMm: number;
  initialHeightMm: number;
}

const PSF20_LABEL_PRESET_IDS: PaperSizeId[] = [
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

export function Psf20LabelModal({
  isOpen,
  onOpenChange,
  labelItems,
  initialWidthMm,
  initialHeightMm,
}: Psf20LabelModalProps) {
  const [activeTab, setActiveTab] = useState<'print' | 'setup'>('print');
  const [printers, setPrinters] = useState<WindowsPrinterInfo[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('SR20');
  const [isLoadingPrinters, setIsLoadingPrinters] = useState<boolean>(false);
  const [isPsf20Detected, setIsPsf20Detected] = useState<boolean>(false);

  const [widthMm, setWidthMm] = useState<number>(initialWidthMm || 50);
  const [heightMm, setHeightMm] = useState<number>(initialHeightMm || 30);
  const [darkness, setDarkness] = useState<PrintDarkness>('dark');
  const [renderedPages, setRenderedPages] = useState<string[]>([]);

  const [isDirectPrinting, setIsDirectPrinting] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  // Sync dimensions when modal opens
  useEffect(() => {
    if (isOpen) {
      setWidthMm(initialWidthMm || 50);
      setHeightMm(initialHeightMm || 30);
      setStatusMessage(null);
    }
  }, [isOpen, initialWidthMm, initialHeightMm]);

  const refreshPrinters = useCallback(async () => {
    setIsLoadingPrinters(true);
    try {
      const res = await fetchWindowsPrinters();
      if (res.printers && res.printers.length > 0) {
        setPrinters(res.printers);
        setIsPsf20Detected(res.hasPsf20);
        if (res.recommendedPrinter) {
          setSelectedPrinter((prev) => {
            const exists = res.printers.some((p) => p.Name === prev);
            return exists ? prev : res.recommendedPrinter!;
          });
        }
      }
    } catch (err) {
      console.warn('Error fetching printers:', err);
    } finally {
      setIsLoadingPrinters(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      refreshPrinters();
    }
  }, [isOpen, refreshPrinters]);

  // Render 203-DPI label bitmaps
  useEffect(() => {
    if (!isOpen) return;
    const pages = renderLabelsToPngPages(labelItems, widthMm, heightMm, darkness);
    setRenderedPages(pages);
  }, [isOpen, labelItems, widthMm, heightMm, darkness]);

  const handleSelectPreset = (id: PaperSizeId) => {
    const preset = PSF20_PAPER_PRESETS[id];
    if (preset) {
      setWidthMm(preset.widthMm);
      setHeightMm(preset.heightMm > 0 ? preset.heightMm : 30);
    }
  };

  const handleDirectPrint = async () => {
    if (renderedPages.length === 0) {
      toast({ title: 'No Labels', description: 'Please add at least 1 label to print.' });
      return;
    }

    setIsDirectPrinting(true);
    setStatusMessage(null);

    try {
      const res = await sendPagesToWindowsPrinter({
        printerName: selectedPrinter || 'SR20',
        pages: renderedPages,
        widthMm,
        heightMm,
        copies: 1,
        jobTitle: `BarcodeLabels_${widthMm}x${heightMm}mm`,
      });

      if (res.ok) {
        setStatusMessage({
          type: 'success',
          text: `Printed ${renderedPages.length} barcode label(s) [${widthMm}×${heightMm}mm → ${res.paperName}] directly to ${res.printerName}!`,
        });
        toast({
          title: 'POSIFLOW Direct Label Print',
          description: `Sent ${renderedPages.length} label(s) (${widthMm}×${heightMm}mm) to ${res.printerName}.`,
        });
      } else {
        throw new Error(res.error || 'Spooler error');
      }
    } catch (err) {
      console.warn('Direct spooler label print failed, falling back to browser print:', err);
      printRenderedPagesViaIframe(
        renderedPages,
        widthMm,
        heightMm,
        `Barcode Labels (${widthMm}x${heightMm}mm)`
      );
      setStatusMessage({
        type: 'warning',
        text: `Opened calibrated ${widthMm}×${heightMm}mm browser print dialog.`,
      });
    } finally {
      setIsDirectPrinting(false);
    }
  };

  const handleBrowserPrint = () => {
    if (renderedPages.length === 0) return;
    printRenderedPagesViaIframe(
      renderedPages,
      widthMm,
      heightMm,
      `Barcode Labels (${widthMm}x${heightMm}mm)`
    );
  };

  const handleTestPrint = async () => {
    setIsTesting(true);
    setStatusMessage(null);
    const testUrl = renderTestPageToDataUrl(widthMm, heightMm, darkness);

    try {
      const res = await sendPagesToWindowsPrinter({
        printerName: selectedPrinter || 'SR20',
        pages: [testUrl],
        widthMm,
        heightMm,
        copies: 1,
        jobTitle: `PSF20_Label_Test_${widthMm}x${heightMm}`,
      });
      if (res.ok) {
        setStatusMessage({
          type: 'success',
          text: `Test sticker (${widthMm}×${heightMm}mm → ${res.paperName}) printed directly on ${res.printerName}!`,
        });
      } else {
        throw new Error(res.error || 'Test print failed');
      }
    } catch (_) {
      printRenderedPagesViaIframe([testUrl], widthMm, heightMm, 'POSIFLOW PSF-20 Test Label');
      setStatusMessage({
        type: 'warning',
        text: `Test label (${widthMm}×${heightMm}mm) opened in browser print dialog.`,
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
        {/* Header */}
        <DialogHeader className="px-5 pt-4 pb-3 border-b bg-muted/20 no-print">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <Tag className="h-5 w-5 text-primary" />
                POSIFLOW PSF-20 Direct Barcode Label Printer
                {isPsf20Detected && (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] px-2 py-0 h-5">
                    SR20 Ready (USB001)
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                Direct 203-DPI Code-128 barcode sticker printing calibrated for POSIFLOW PSF-20 (SR20).
              </DialogDescription>
            </div>

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

          {/* Printer Bar */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg border bg-background text-xs">
            <div className="flex items-center gap-2">
              <Usb className={`h-4 w-4 shrink-0 ${isPsf20Detected ? 'text-emerald-600' : 'text-amber-600'}`} />
              <span className="font-semibold text-muted-foreground">Target Printer:</span>
              <select
                value={selectedPrinter}
                onChange={(e) => setSelectedPrinter(e.target.value)}
                className="h-7 rounded border bg-muted/40 px-2 text-xs font-semibold text-foreground"
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
                <span className="text-[11px] text-muted-foreground hidden md:inline">
                  • Port: <strong>{currentPrinterInfo.PortName}</strong> • Driver: <strong>{currentPrinterInfo.DriverName}</strong>
                </span>
              )}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={refreshPrinters}
              disabled={isLoadingPrinters}
              className="h-6 px-2 text-[11px]"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${isLoadingPrinters ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1.5 pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('print')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 border ${
                activeTab === 'print'
                  ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                  : 'bg-background text-muted-foreground hover:text-foreground border-border'
              }`}
            >
              <Tag className="h-3.5 w-3.5" />
              Direct Label Print ({widthMm}×{heightMm}mm • {renderedPages.length} Stickers)
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
              PSF-20 Setup &amp; Calibration Guide
            </button>
          </div>
        </DialogHeader>

        {/* Status Banner */}
        {statusMessage && (
          <div
            className={`mx-5 mt-3 py-2 px-3 text-xs rounded-md border flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200'
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'print' ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
              {/* Left: Size & Darkness */}
              <div className="md:col-span-6 space-y-4">
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    1. Select Sticker Roll Size
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {PSF20_LABEL_PRESET_IDS.map((id) => {
                      const preset = PSF20_PAPER_PRESETS[id];
                      const isSelected =
                        widthMm === preset.widthMm && heightMm === preset.heightMm;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => handleSelectPreset(id)}
                          className={`p-2 rounded-lg border text-left transition-all ${
                            isSelected
                              ? 'bg-primary/10 border-primary text-foreground ring-1 ring-primary'
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
                            Driver: {preset.sr20DriverPaperName}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Darkness */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    2. Barcode Print Darkness / Density
                  </span>
                  <div className="flex gap-1.5">
                    {(['normal', 'dark', 'extra-dark'] as PrintDarkness[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDarkness(d)}
                        className={`flex-1 py-1.5 px-2.5 rounded border text-xs font-semibold capitalize transition ${
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

                <div className="rounded-lg border bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 p-3 text-xs space-y-1">
                  <div className="font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5 text-amber-600" />
                    SR20 203-DPI Hardware Calibration
                  </div>
                  <p className="text-[11px] text-amber-800 dark:text-amber-200/90 leading-relaxed">
                    Barcodes are rendered using integer-aligned Code-128 bars at 203 DPI and clamped to the{' '}
                    <strong>SR20</strong> printhead envelope (max 49mm × 75mm) so scanner guns read them on the first pass.
                  </p>
                </div>
              </div>

              {/* Right: Live Preview */}
              <div className="md:col-span-6 flex flex-col items-center bg-muted/30 border rounded-xl p-3 min-h-[300px]">
                <div className="w-full flex items-center justify-between text-xs mb-2 pb-1.5 border-b">
                  <span className="font-semibold text-foreground">
                    Live 203-DPI Sticker Preview ({widthMm}×{heightMm}mm)
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {renderedPages.length} Sticker(s)
                  </Badge>
                </div>

                <div className="flex-1 w-full overflow-y-auto max-h-[320px] flex flex-col items-center gap-2.5 py-2">
                  {renderedPages.slice(0, 20).map((dataUrl, idx) => (
                    <div
                      key={idx}
                      className="bg-white p-1.5 rounded shadow-sm border border-slate-300 flex flex-col items-center"
                    >
                      <img
                        src={dataUrl}
                        alt={`Sticker ${idx + 1}`}
                        className="w-[235px] h-auto object-contain"
                      />
                      <span className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        Sticker #{idx + 1} of {renderedPages.length}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl border bg-card space-y-1.5">
                  <div className="font-bold text-sm text-foreground">
                    1. Gap Sensor Calibration (Stop Label Skipping)
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    After loading a <strong>50×30mm</strong> or <strong>50×25mm</strong> label roll, turn the PSF-20 ON, then{' '}
                    <strong>press and hold the Power/Feed button for 2–3 seconds</strong> until the printer feeds one label and stops accurately at the tear-off gap.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl border bg-card space-y-1.5">
                  <div className="font-bold text-sm text-foreground">
                    2. Why 80×30 / 58×30 / 55×30 Works Seamless Now
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    The POSIFLOW PSF-20 (<code>SR20</code>) driver enforces a maximum width of 49.05mm (392 dots). Our direct print engine automatically maps 55×30, 58×30, and 80×30mm selections into the native <code>50 x 30</code> driver slot so Windows Print Spooler never drops the job.
                  </p>
                </div>
              </div>
              <div className="p-3.5 rounded-xl border bg-muted/30 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-foreground">
                    Official POSIFLOW PSF-20 Configuration Page
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    https://www.shreyanspos.com/pages/psf20
                  </div>
                </div>
                <a
                  href="https://www.shreyanspos.com/pages/psf20"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border bg-background hover:bg-muted text-xs font-semibold text-primary"
                >
                  Open PSF-20 Support <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
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
            <Button
              type="button"
              size="sm"
              disabled={isDirectPrinting || renderedPages.length === 0}
              onClick={handleDirectPrint}
              className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs px-4"
            >
              {isDirectPrinting ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {isDirectPrinting
                ? 'Printing…'
                : `Direct Print ${renderedPages.length} Label(s) [${widthMm}×${heightMm}mm]`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
