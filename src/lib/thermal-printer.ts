import type { Sale, CompanyProfile } from '@/lib/types';
import { format } from 'date-fns';
import { encodeCode128, generateBarcodeSVG } from '@/lib/barcode-generator';

// ── Types & PSF-20 Size Presets ──────────────────────────────────────────────

export type PrintDarkness = 'normal' | 'dark' | 'extra-dark';

export type PaperSizeId =
  | '50x30'
  | '55x30'
  | '58x30'
  | '80x30'
  | '50x25'
  | '50x20'
  | '50x40'
  | '50x50'
  | '38x25'
  | '38x38'
  | '55mm-roll'
  | '57mm-roll'
  | '58mm-roll'
  | '80mm-roll';

export interface Psf20PaperPreset {
  id: PaperSizeId;
  label: string;
  shortLabel: string;
  mode: 'receipt' | 'label' | 'both';
  widthMm: number;
  heightMm: number; // 0 means dynamic continuous roll height
  isContinuousRoll?: boolean;
  sr20DriverPaperName: string;
  description: string;
  badge?: string;
}

export const PSF20_PAPER_PRESETS_LIST: Psf20PaperPreset[] = [
  // ── Continuous Thermal Receipt Rolls (Full-Length Normal Receipts) ──
  {
    id: '55mm-roll',
    label: '55mm Continuous Receipt Roll (Current Loaded Roll)',
    shortLabel: '55mm Roll',
    mode: 'receipt',
    widthMm: 55,
    heightMm: 0,
    isContinuousRoll: true,
    sr20DriverPaperName: 'SR20 Full-Length Roll (49mm Head)',
    description: 'Full-length continuous thermal receipt for 55mm paper roll on POSIFLOW PSF-20 (SR20) — large, clear, high-contrast text.',
    badge: 'Current Roll',
  },
  {
    id: '57mm-roll',
    label: '57mm Continuous Receipt Roll (POSIFLOW 57mm Max)',
    shortLabel: '57mm Roll',
    mode: 'receipt',
    widthMm: 57,
    heightMm: 0,
    isContinuousRoll: true,
    sr20DriverPaperName: 'SR20 Full-Length Roll (49mm Head)',
    description: 'Full-length continuous thermal receipt for standard 57mm (2.25") POS paper roll.',
    badge: 'Machine Max',
  },
  {
    id: '58mm-roll',
    label: '58mm Continuous Receipt Roll (2" Standard POS)',
    shortLabel: '58mm Roll',
    mode: 'receipt',
    widthMm: 58,
    heightMm: 0,
    isContinuousRoll: true,
    sr20DriverPaperName: 'SR20 Full-Length Roll (49mm Head)',
    description: 'Standard 58mm (2-inch) continuous full-length thermal receipt roll.',
  },
  {
    id: '80mm-roll',
    label: '80mm Continuous Receipt Roll (3" Standard POS)',
    shortLabel: '80mm Roll',
    mode: 'receipt',
    widthMm: 80,
    heightMm: 0,
    isContinuousRoll: true,
    sr20DriverPaperName: '80mm Full-Length Roll',
    description: 'Standard 80mm (3-inch) continuous full-length thermal receipt roll for desktop POS printers.',
  },

  // ── Barcode Sticker Label Sizes (When Sticker Roll is Loaded Separately) ──
  {
    id: '50x30',
    label: '50 × 30 mm (2" × 1.2") — PSF-20 / SR20 Default Sticker',
    shortLabel: '50×30mm',
    mode: 'label',
    widthMm: 50,
    heightMm: 30,
    sr20DriverPaperName: '50 x 30 (49×30mm)',
    description: 'Native default sticker size in POSIFLOW SR20 Windows driver (49mm printable × 30mm).',
    badge: 'Default Sticker',
  },
  {
    id: '55x30',
    label: '55 × 30 mm (2.1" × 1.2") — POSIFLOW 2" Sticker',
    shortLabel: '55×30mm',
    mode: 'label',
    widthMm: 55,
    heightMm: 30,
    sr20DriverPaperName: '50 x 30 (49×30mm)',
    description: '55mm × 30mm thermal sticker calibrated to SR20 49mm printable head.',
  },
  {
    id: '58x30',
    label: '58 × 30 mm (2.25" × 1.2") — 2" Thermal Sticker',
    shortLabel: '58×30mm',
    mode: 'label',
    widthMm: 58,
    heightMm: 30,
    sr20DriverPaperName: '50 x 30 (49×30mm)',
    description: '58mm × 30mm sticker roll auto-fitted to 49mm printable width.',
  },
  {
    id: '80x30',
    label: '80 × 30 mm (3" × 1.2") — Wide Sticker',
    shortLabel: '80×30mm',
    mode: 'label',
    widthMm: 80,
    heightMm: 30,
    sr20DriverPaperName: '50 x 30 (Auto-scaled)',
    description: '80mm × 30mm thermal sticker auto-calibrated for POSIFLOW PSF-20 and 3-inch label printers.',
  },
  {
    id: '50x25',
    label: '50 × 25 mm (2" × 1") — PSF-20 Compact Sticker',
    shortLabel: '50×25mm',
    mode: 'label',
    widthMm: 50,
    heightMm: 25,
    sr20DriverPaperName: 'Custom 49×25mm',
    description: 'Popular Shreyans / POSIFLOW 50×25mm direct thermal barcode & MRP label.',
    badge: 'Popular Label',
  },
  {
    id: '50x20',
    label: '50 × 20 mm (2" × 0.8") — SR20 Mini Sticker',
    shortLabel: '50×20mm',
    mode: 'label',
    widthMm: 50,
    heightMm: 20,
    sr20DriverPaperName: '50 x 20 (49×20mm)',
    description: 'Native SR20 driver preset (50 × 20 mm) for compact price/SKU tags.',
  },
  {
    id: '50x40',
    label: '50 × 40 mm (2" × 1.6") — SR20 Medium Sticker',
    shortLabel: '50×40mm',
    mode: 'label',
    widthMm: 50,
    heightMm: 40,
    sr20DriverPaperName: '50 x 40 (49×40mm)',
    description: 'Native SR20 driver preset (50 × 40 mm) for detailed product labels.',
  },
  {
    id: '50x50',
    label: '50 × 50 mm (2" × 2") — SR20 Large Square Sticker',
    shortLabel: '50×50mm',
    mode: 'label',
    widthMm: 50,
    heightMm: 50,
    sr20DriverPaperName: '50 x 50 (49×50mm)',
    description: 'Native SR20 driver preset (50 × 50 mm) for large box/carton labels.',
  },
  {
    id: '38x25',
    label: '38 × 25 mm (1.5" × 1") — PSF-20 Small Label',
    shortLabel: '38×25mm',
    mode: 'label',
    widthMm: 38,
    heightMm: 25,
    sr20DriverPaperName: 'Custom 38×25mm',
    description: 'Small spare-parts barcode sticker roll.',
  },
  {
    id: '38x38',
    label: '38 × 38 mm (1.5" × 1.5") — PSF-20 Small Square',
    shortLabel: '38×38mm',
    mode: 'label',
    widthMm: 38,
    heightMm: 38,
    sr20DriverPaperName: 'Custom 38×38mm',
    description: 'Small square sticker roll.',
  },
];

export const PSF20_PAPER_PRESETS: Record<PaperSizeId, Psf20PaperPreset> =
  PSF20_PAPER_PRESETS_LIST.reduce((acc, preset) => {
    acc[preset.id] = preset;
    return acc;
  }, {} as Record<PaperSizeId, Psf20PaperPreset>);

export function getPaperPreset(id: PaperSizeId | string): Psf20PaperPreset {
  return (
    PSF20_PAPER_PRESETS[id as PaperSizeId] ||
    PSF20_PAPER_PRESETS['55mm-roll']
  );
}

export interface LabelItemData {
  companyName?: string;
  productName: string;
  barcodeValue: string;
  priceFormatted: string;
  subtitle?: string;
  copies?: number;
  showCompany?: boolean;
  showProduct?: boolean;
  showPrice?: boolean;
  showCodeText?: boolean;
  showBarcodeText?: boolean;
  showSubtitle?: boolean;
}

export type LabelPrintItem = LabelItemData;

export interface WindowsPrinterStatus {
  name: string;
  Name: string;
  driverName: string;
  DriverName: string;
  portName: string;
  PortName: string;
  status: string;
  isDefault: boolean;
  IsDefault: boolean;
  isPsf20: boolean;
  paperSizes: {
    name: string;
    widthMm: number;
    heightMm: number;
  }[];
}

export type WindowsPrinterInfo = WindowsPrinterStatus;

export interface PrinterApiStatusResponse {
  supported: boolean;
  platform: string;
  printers: WindowsPrinterStatus[];
  recommendedPrinter: string | null;
  hasPsf20: boolean;
  error?: string;
}

// ── Helper: Format currency ──────────────────────────────────────────────────
function fmtCurrency(amount: number): string {
  return amount.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

// ── Query Installed Windows Printers via /api/printer ────────────────────────
export async function fetchWindowsPrinters(): Promise<PrinterApiStatusResponse> {
  try {
    const res = await fetch('/api/printer', { cache: 'no-store' });
    if (!res.ok) {
      return { supported: false, platform: 'unknown', printers: [], recommendedPrinter: null, hasPsf20: false };
    }
    const raw = await res.json();
    const printers: WindowsPrinterStatus[] = (raw.printers || []).map((p: any) => ({
      ...p,
      name: p.name || p.Name || 'Printer',
      Name: p.Name || p.name || 'Printer',
      driverName: p.driverName || p.DriverName || '',
      DriverName: p.DriverName || p.driverName || '',
      portName: p.portName || p.PortName || '',
      PortName: p.PortName || p.portName || '',
      isDefault: Boolean(p.isDefault ?? p.IsDefault),
      IsDefault: Boolean(p.IsDefault ?? p.isDefault),
      isPsf20: Boolean(p.isPsf20),
    }));
    const hasPsf20 = Boolean(raw.hasPsf20 ?? printers.some((p) => p.isPsf20 || /SR20|PSF|POSIFLOW/i.test(p.name)));
    return {
      supported: Boolean(raw.supported),
      platform: raw.platform || 'win32',
      printers,
      recommendedPrinter: raw.recommendedPrinter || (printers[0]?.name ?? null),
      hasPsf20,
      error: raw.error,
    };
  } catch (_) {
    return { supported: false, platform: 'unknown', printers: [], recommendedPrinter: null, hasPsf20: false };
  }
}

// ── Direct Print to Windows Printer Spooler (/api/printer) ───────────────────
export async function sendPagesToWindowsPrinter(params: {
  printerName?: string;
  pages: string[];
  widthMm: number;
  heightMm: number;
  copies?: number;
  jobTitle?: string;
}): Promise<{
  ok: boolean;
  success: boolean;
  printerName: string;
  paperName: string;
  pagesPrinted?: number;
  error?: string;
}> {
  try {
    const res = await fetch('/api/printer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    const ok = Boolean(res.ok && (data.success || data.ok));
    if (!ok) {
      return {
        ok: false,
        success: false,
        printerName: params.printerName || 'SR20',
        paperName: `${params.widthMm}x${params.heightMm}mm`,
        error: data.error || 'Failed to print via Windows Spooler.',
      };
    }
    return {
      ok: true,
      success: true,
      printerName: data.printerName || params.printerName || 'SR20',
      paperName: data.paperName || `${params.widthMm}x${params.heightMm}mm`,
      pagesPrinted: data.pagesPrinted,
    };
  } catch (err: any) {
    return {
      ok: false,
      success: false,
      printerName: params.printerName || 'SR20',
      paperName: `${params.widthMm}x${params.heightMm}mm`,
      error: err?.message || 'Network error calling local printer service.',
    };
  }
}

// ── Check if Web Serial API is supported in current browser ──────────────────
export function isWebSerialSupported(): boolean {
  return typeof window !== 'undefined' && 'serial' in navigator;
}

// ── Persistent Serial Port state ─────────────────────────────────────────────
let activeSerialPort: any = null;

export async function getConnectedSerialPort(): Promise<any> {
  if (activeSerialPort) return activeSerialPort;
  if (!isWebSerialSupported()) return null;

  try {
    const ports = await (navigator as any).serial.getPorts();
    if (ports && ports.length > 0) {
      activeSerialPort = ports[0];
      return activeSerialPort;
    }
  } catch (err) {
    console.warn('Error reading granted serial ports:', err);
  }
  return null;
}

export async function requestSerialPort(): Promise<any> {
  if (!isWebSerialSupported()) {
    throw new Error('Web Serial API is not supported in this browser. Use Chrome or Edge.');
  }

  try {
    const port = await (navigator as any).serial.requestPort();
    activeSerialPort = port;
    return port;
  } catch (err) {
    console.error('User cancelled or failed to select serial port:', err);
    throw err;
  }
}

export async function disconnectSerialPort(): Promise<void> {
  if (activeSerialPort) {
    try {
      await activeSerialPort.close();
    } catch (_) {}
    activeSerialPort = null;
  }
}

// ── Dynamic Height Calculation for Receipt Roll ──────────────────────────────
export function calculateReceiptHeightMm(sale: Sale, is3Inch: boolean = false): number {
  let heightMm = 46;

  if (sale.customerName) heightMm += 4.0;
  if (sale.customerMobile) heightMm += 4.0;

  heightMm += 8;

  const items = sale.items || [];
  for (const item of items) {
    const name = item.productName || '';
    const maxChars = is3Inch ? 26 : 16;
    const lines = Math.max(1, Math.ceil(name.length / maxChars));
    heightMm += lines * 3.8 + 3.0;
  }

  heightMm += 26;

  const discountAmount = Number(sale.discount) || 0;
  if (discountAmount > 0) {
    heightMm += 4.0;
  }

  const total = Number(sale.total) || 0;
  const amountPaid = Number(sale.amountPaid) || 0;
  if (amountPaid > 0 && amountPaid < total) {
    heightMm += 8;
  }

  heightMm += 12;
  return Math.min(1200, Math.max(60, heightMm));
}

// ── High-Precision 203-DPI (2x Oversampled = 16 px/mm) Canvas Receipt Renderer ──
/**
 * Renders a Sale receipt into 1 or more high-contrast black & white PNG data URLs
 * sized specifically for the chosen paper preset (e.g. 50x30, 55x30, 58x30, 80x30, 50x50, or continuous roll).
 */
export function renderReceiptToPngPages(
  sale: Sale,
  companyProfile?: CompanyProfile | null,
  sizeOrOptions?:
    | PaperSizeId
    | string
    | {
        widthMm: number;
        heightMm: number;
        darkness?: PrintDarkness;
        isSr20?: boolean;
      },
  darknessArg?: PrintDarkness
): string[] {
  let widthMm = 55;
  let darkness: PrintDarkness = darknessArg || 'dark';

  if (typeof sizeOrOptions === 'string') {
    const preset = getPaperPreset(sizeOrOptions);
    widthMm = preset.widthMm;
  } else if (sizeOrOptions && typeof sizeOrOptions === 'object') {
    widthMm = sizeOrOptions.widthMm;
    if (sizeOrOptions.darkness) darkness = sizeOrOptions.darkness;
  }

  // SR20 printhead max printable width is 49mm (392 dots at 203 DPI).
  // For 55mm, 57mm, 58mm continuous rolls on SR20, we use 49mm effective width so text fills the roll edge-to-edge without clipping!
  const effectiveWidthMm = widthMm >= 75 ? 72 : widthMm <= 42 ? widthMm : 49;

  // 16 pixels per mm (~406 DPI, exact 2x of 203 DPI thermal head) for ultra-crisp text & lines
  const SCALE = 16;
  const canvasW = Math.round(effectiveWidthMm * SCALE);

  // High-contrast thermal weights so 55mm / 57mm receipts print dark and crystal clear
  const fontWeightExtraBold = '900';
  const fontWeightBold = darkness === 'normal' ? '700' : '800';
  const fontWeightNormal = darkness === 'extra-dark' ? '800' : '700';
  const strokeWidth = darkness === 'extra-dark' ? 3.5 : 2.5;

  const compName = (companyProfile?.companyName || 'WIN AUTOMOBILES').toUpperCase();
  const formattedDate = sale.date ? format(new Date(sale.date), 'dd-MMM-yy hh:mm a') : '';
  const items = sale.items || [];
  const total = Number(sale.total) || 0;
  const subtotal = Number(sale.subtotal) || 0;
  const gstAmount = Number(sale.gstAmount) || 0;
  const discountAmount = Number(sale.discount) || 0;
  const paidAmount =
    sale.amountPaid !== undefined
      ? Number(sale.amountPaid)
      : sale.paymentStatus === 'Paid'
      ? total
      : 0;
  const balance = Math.max(0, total - paidAmount - discountAmount);

  // ── Full-Length Continuous Thermal Receipt Layout (55mm / 57mm / 58mm / 80mm Roll) ──
  const isWide = effectiveWidthMm >= 68;
  const padX = Math.round((isWide ? 2.0 : 1.0) * SCALE);
  const innerW = canvasW - padX * 2;

  const titleFontPx = Math.round((isWide ? 3.1 : 2.55) * SCALE); // ~41px on 55mm roll
  const subHeaderFontPx = Math.round((isWide ? 2.0 : 1.72) * SCALE); // ~28px
  const bodyFontPx = Math.round((isWide ? 2.05 : 1.82) * SCALE); // ~29px
  const totalFontPx = Math.round((isWide ? 2.65 : 2.25) * SCALE); // ~36px
  const lineGap = Math.round(0.32 * SCALE); // ~5px compact vertical rhythm

  // Allocate generous master canvas height and crop to exact used content height at the end
  const estHeightMm = Math.max(120, calculateReceiptHeightMm(sale, isWide) + 60);
  const masterCanvas = document.createElement('canvas');
  masterCanvas.width = canvasW;
  masterCanvas.height = Math.round(estHeightMm * SCALE);
  const ctx = masterCanvas.getContext('2d')!;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, masterCanvas.width, masterCanvas.height);
  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#000000';
  ctx.textBaseline = 'top';

  let y = Math.round(1.2 * SCALE);

  const drawCentered = (text: string, fontPx: number, weight: string) => {
    ctx.font = `${weight} ${fontPx}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(text, canvasW / 2, y, innerW);
    y += fontPx + lineGap;
  };

  const drawWrappedCentered = (text: string, fontPx: number, weight: string, maxCharsPerLine: number) => {
    const words = text.trim().split(/\s+/);
    let currentLine = '';
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (candidate.length <= maxCharsPerLine) {
        currentLine = candidate;
      } else {
        if (currentLine) drawCentered(currentLine, fontPx, weight);
        currentLine = word;
      }
    }
    if (currentLine) drawCentered(currentLine, fontPx, weight);
  };

  const drawRow = (left: string, right: string, fontPx: number, leftWeight: string, rightWeight: string) => {
    ctx.textAlign = 'left';
    ctx.font = `${leftWeight} ${fontPx}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText(left, padX, y);

    ctx.textAlign = 'right';
    ctx.font = `${rightWeight} ${fontPx}px "Courier New", monospace`;
    ctx.fillText(right, canvasW - padX, y);
    y += fontPx + lineGap;
  };

  const drawDivider = (dashed: boolean = true) => {
    y += 3;
    ctx.lineWidth = strokeWidth;
    if (dashed) {
      ctx.setLineDash([7, 4]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(canvasW - padX, y);
    ctx.stroke();
    ctx.setLineDash([]);
    y += 5;
  };

  // 1. Company Header
  drawCentered(compName, titleFontPx, fontWeightExtraBold);
  if (companyProfile?.address) {
    const addrLines = companyProfile.address.split(/\r?\n/);
    for (const line of addrLines) {
      if (line.trim()) {
        drawWrappedCentered(line.trim(), subHeaderFontPx, fontWeightNormal, isWide ? 42 : 30);
      }
    }
  }
  if (companyProfile?.contact) {
    drawCentered(`Ph: ${companyProfile.contact}`, subHeaderFontPx, fontWeightBold);
  }
  if (companyProfile?.gstNumber) {
    drawCentered(`GSTIN: ${companyProfile.gstNumber}`, subHeaderFontPx, fontWeightBold);
  }

  // 2. TAX INVOICE Banner
  drawDivider(false);
  drawCentered('TAX INVOICE', bodyFontPx, fontWeightExtraBold);
  drawDivider(false);

  // 3. Invoice Meta
  drawRow('Inv No:', `#${sale.invoiceNumber || ''}`, bodyFontPx, fontWeightNormal, fontWeightExtraBold);
  drawRow('Date:', formattedDate, bodyFontPx, fontWeightNormal, fontWeightBold);
  if (sale.customerName && sale.customerName !== 'N/A') {
    drawRow('Customer:', sale.customerName.slice(0, isWide ? 28 : 20), bodyFontPx, fontWeightNormal, fontWeightExtraBold);
  }
  if (sale.customerMobile) {
    drawRow('Mobile:', sale.customerMobile, bodyFontPx, fontWeightNormal, fontWeightBold);
  }

  drawDivider(true);

  // 4. Items Table Header
  ctx.font = `${fontWeightExtraBold} ${bodyFontPx}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText('ITEM', padX, y);
  ctx.textAlign = 'center';
  ctx.fillText('QTY', padX + Math.round(innerW * 0.44), y);
  ctx.textAlign = 'right';
  ctx.fillText('RATE', padX + Math.round(innerW * 0.71), y);
  ctx.fillText('AMT', canvasW - padX, y);
  y += bodyFontPx + 3;
  drawDivider(false);

  // 5. Items (Full-length vertical list with crystal-clear product names)
  for (const item of items) {
    const name = (item.productName || 'Item').trim();
    const qtyStr = String(item.quantity || 1);
    const rateStr = fmtCurrency(item.price || 0);
    const amtStr = fmtCurrency(item.total || 0);

    const maxInlineChars = isWide ? 18 : 11;
    if (name.length <= maxInlineChars) {
      ctx.font = `${fontWeightBold} ${bodyFontPx}px "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(name, padX, y);
      ctx.font = `${fontWeightBold} ${bodyFontPx}px "Courier New", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(qtyStr, padX + Math.round(innerW * 0.44), y);
      ctx.textAlign = 'right';
      ctx.fillText(rateStr, padX + Math.round(innerW * 0.71), y);
      ctx.font = `${fontWeightExtraBold} ${bodyFontPx}px "Courier New", monospace`;
      ctx.fillText(amtStr, canvasW - padX, y);
      y += bodyFontPx + lineGap + 2;
    } else {
      // Line 1: Full product name (never truncated at 12 chars!)
      ctx.font = `${fontWeightExtraBold} ${bodyFontPx}px "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(name.slice(0, isWide ? 36 : 26), padX, y, innerW);
      y += bodyFontPx + 1;
      // Line 2: Qty, Rate, Amount aligned cleanly under columns
      ctx.font = `${fontWeightBold} ${bodyFontPx}px "Courier New", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(qtyStr, padX + Math.round(innerW * 0.44), y);
      ctx.textAlign = 'right';
      ctx.fillText(rateStr, padX + Math.round(innerW * 0.71), y);
      ctx.font = `${fontWeightExtraBold} ${bodyFontPx}px "Courier New", monospace`;
      ctx.fillText(amtStr, canvasW - padX, y);
      y += bodyFontPx + lineGap + 2;
    }
  }

  drawDivider(true);

  // 6. Totals
  drawRow('Subtotal:', `Rs. ${fmtCurrency(subtotal)}`, bodyFontPx, fontWeightNormal, fontWeightBold);
  drawRow('GST:', `Rs. ${fmtCurrency(gstAmount)}`, bodyFontPx, fontWeightNormal, fontWeightBold);
  if (discountAmount > 0) {
    drawRow('Discount:', `-Rs. ${fmtCurrency(discountAmount)}`, bodyFontPx, fontWeightNormal, fontWeightExtraBold);
  }

  drawDivider(false);
  drawRow('TOTAL:', `Rs. ${fmtCurrency(total)}`, totalFontPx, fontWeightExtraBold, fontWeightExtraBold);
  drawDivider(false);

  drawRow('Pay Mode:', `${sale.paymentMode || 'Cash'} (${(sale.paymentStatus || 'Paid').toUpperCase()})`, bodyFontPx, fontWeightNormal, fontWeightExtraBold);

  if (paidAmount > 0 && balance > 0.01) {
    drawRow('Paid:', `Rs. ${fmtCurrency(paidAmount)}`, bodyFontPx, fontWeightNormal, fontWeightBold);
    drawRow('Balance Due:', `Rs. ${fmtCurrency(balance)}`, bodyFontPx, fontWeightExtraBold, fontWeightExtraBold);
  }

  drawDivider(true);

  // 7. Footer
  drawCentered('Thank You for Your Business!', subHeaderFontPx, fontWeightExtraBold);
  drawCentered('Please Visit Again', subHeaderFontPx, fontWeightBold);

  y += Math.round(1.5 * SCALE);

  const actualUsedHeightPx = y;
  const finalMm = Math.max(40, Math.ceil(actualUsedHeightPx / SCALE));

  // Return 1 single full-length continuous receipt image!
  // (POST /api/printer automatically configures SR20 PrintTicketXML height and 1:1 vertical band streaming if >74mm)
  const outCanvas = document.createElement('canvas');
  outCanvas.width = canvasW;
  outCanvas.height = Math.round(finalMm * SCALE);
  const oCtx = outCanvas.getContext('2d')!;
  oCtx.fillStyle = '#FFFFFF';
  oCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);
  oCtx.drawImage(masterCanvas, 0, 0, canvasW, actualUsedHeightPx, 0, 0, canvasW, actualUsedHeightPx);

  return [outCanvas.toDataURL('image/png')];
}

// ── High-Precision 203-DPI Canvas Barcode Label Renderer ─────────────────────
/**
 * Renders an array of product barcode labels into crisp 203-DPI (16 px/mm) PNG data URLs
 * for direct printing on POSIFLOW PSF-20 (SR20) or any thermal label printer.
 */
export function renderLabelsToPngPages(
  items: LabelItemData[],
  widthMmOrOptions:
    | number
    | {
        widthMm: number;
        heightMm: number;
        darkness?: PrintDarkness;
      },
  heightMmArg?: number,
  darknessArg?: PrintDarkness
): string[] {
  const widthMm =
    typeof widthMmOrOptions === 'number' ? widthMmOrOptions : widthMmOrOptions.widthMm;
  const heightMm =
    typeof widthMmOrOptions === 'number' ? heightMmArg || 30 : widthMmOrOptions.heightMm;
  const darkness: PrintDarkness =
    typeof widthMmOrOptions === 'number'
      ? darknessArg || 'dark'
      : widthMmOrOptions.darkness || 'dark';

  const effectiveWidthMm = widthMm >= 75 ? 72 : widthMm <= 42 ? widthMm : 49;
  const effectiveHeightMm = Math.max(15, Math.min(75, heightMm));

  const SCALE = 16; // 16 px/mm (2x of 203 DPI)
  const canvasW = Math.round(effectiveWidthMm * SCALE);
  const canvasH = Math.round(effectiveHeightMm * SCALE);

  const fontWeightBold = darkness === 'extra-dark' ? '900' : '800';
  const fontWeightNormal = darkness === 'extra-dark' ? '800' : '700';

  const pages: string[] = [];
  const isSmallH = effectiveHeightMm <= 25;
  const isMiniH = effectiveHeightMm <= 20;

  for (const item of items) {
    const copiesCount = Math.max(1, Math.min(200, Number(item.copies) || 1));

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#000000';
    ctx.textBaseline = 'top';

    const padX = Math.round(1.5 * SCALE);
    const padY = Math.round((isMiniH ? 0.8 : 1.2) * SCALE);
    const innerW = canvasW - padX * 2;

    let topY = padY;
    const compFontPx = Math.round((isMiniH ? 1.5 : 1.75) * SCALE);
    const prodFontPx = Math.round((isMiniH ? 1.75 : isSmallH ? 1.95 : 2.2) * SCALE);
    const priceFontPx = Math.round((isMiniH ? 1.75 : isSmallH ? 1.95 : 2.2) * SCALE);
    const codeFontPx = Math.round((isMiniH ? 1.5 : 1.75) * SCALE);

    // 1. Company Name (Top)
    if (item.showCompany !== false && item.companyName) {
      ctx.font = `${fontWeightBold} ${compFontPx}px "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(item.companyName.toUpperCase().slice(0, 26), canvasW / 2, topY, innerW);
      topY += compFontPx + 3;

      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padX, topY);
      ctx.lineTo(canvasW - padX, topY);
      ctx.stroke();
      topY += 4;
    }

    // 2. Product Name
    if (item.showProduct !== false && item.productName) {
      ctx.font = `${fontWeightBold} ${prodFontPx}px "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(item.productName.slice(0, 24), canvasW / 2, topY, innerW);
      topY += prodFontPx + 4;
    }

    // 3. Reserve Bottom Row for Price & Subtitle
    const hasBottomRow =
      (item.showPrice !== false && item.priceFormatted) ||
      (item.showSubtitle !== false && item.subtitle);
    const bottomRowHeight = hasBottomRow ? priceFontPx + 8 : 0;
    const bottomY = canvasH - padY - bottomRowHeight;

    // 4. Draw Crisp Code-128 Barcode in the middle zone
    const barcodeText = (item.barcodeValue || 'SKU-001').trim();
    const bits = encodeCode128(barcodeText);
    const showCodeStr = item.showCodeText !== false && item.showBarcodeText !== false;
    const codeTextHeight = showCodeStr ? codeFontPx + 4 : 0;
    const availBarHeight = Math.max(Math.round(5 * SCALE), bottomY - topY - codeTextHeight - 6);

    if (bits.length > 0) {
      const quietZonePx = Math.round(1.5 * SCALE);
      const maxBarcodeW = innerW - quietZonePx * 2;
      const moduleW = Math.max(2, Math.floor(maxBarcodeW / bits.length));
      const totalBarW = bits.length * moduleW;
      const startX = Math.round((canvasW - totalBarW) / 2);

      ctx.fillStyle = '#000000';
      for (let b = 0; b < bits.length; b++) {
        if (bits[b] === '1') {
          ctx.fillRect(startX + b * moduleW, topY + 2, moduleW, availBarHeight);
        }
      }

      if (showCodeStr) {
        ctx.font = `${fontWeightBold} ${codeFontPx}px "Courier New", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(barcodeText, canvasW / 2, topY + availBarHeight + 4, innerW);
      }
    }

    // 5. Bottom Row: MRP & Subtitle/Invoice
    if (hasBottomRow) {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(padX, bottomY);
      ctx.lineTo(canvasW - padX, bottomY);
      ctx.stroke();

      const textY = bottomY + 4;
      if (
        item.showPrice !== false &&
        item.priceFormatted &&
        item.showSubtitle !== false &&
        item.subtitle
      ) {
        ctx.font = `${fontWeightBold} ${priceFontPx}px "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(`MRP: Rs.${item.priceFormatted}`, padX, textY);

        ctx.font = `${fontWeightNormal} ${Math.round(priceFontPx * 0.85)}px "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(item.subtitle.slice(0, 14), canvasW - padX, textY + 2);
      } else if (item.showPrice !== false && item.priceFormatted) {
        ctx.font = `${fontWeightBold} ${priceFontPx}px "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`MRP: Rs. ${item.priceFormatted}`, canvasW / 2, textY);
      } else if (item.showSubtitle !== false && item.subtitle) {
        ctx.font = `${fontWeightNormal} ${priceFontPx}px "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(item.subtitle, canvasW / 2, textY);
      }
    }

    const dataUrl = canvas.toDataURL('image/png');
    for (let c = 0; c < copiesCount; c++) {
      pages.push(dataUrl);
    }
  }

  return pages;
}

// ── Render PSF-20 Calibration & Alignment Test Page ──────────────────────────
export function renderTestPageToDataUrl(
  widthMmOrOptions:
    | number
    | {
        widthMm: number;
        heightMm: number;
        printerName?: string;
        darkness?: PrintDarkness;
      },
  heightMmArg?: number,
  darknessArg?: PrintDarkness
): string {
  const widthMm =
    typeof widthMmOrOptions === 'number' ? widthMmOrOptions : widthMmOrOptions.widthMm;
  const heightMm =
    typeof widthMmOrOptions === 'number' ? heightMmArg || 30 : widthMmOrOptions.heightMm;
  const darkness: PrintDarkness =
    typeof widthMmOrOptions === 'number'
      ? darknessArg || 'dark'
      : widthMmOrOptions.darkness || 'dark';
  const printerName =
    typeof widthMmOrOptions === 'object' && widthMmOrOptions.printerName
      ? widthMmOrOptions.printerName
      : 'SR20 (POSIFLOW PSF-20)';

  const effectiveWidthMm = widthMm >= 75 ? 72 : widthMm <= 42 ? widthMm : 49;
  const effectiveHeightMm = Math.max(20, Math.min(75, heightMm || 30));

  const SCALE = 16;
  const canvasW = Math.round(effectiveWidthMm * SCALE);
  const canvasH = Math.round(effectiveHeightMm * SCALE);

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#000000';
  ctx.textBaseline = 'top';

  const pad = Math.round(1.2 * SCALE);
  ctx.lineWidth = darkness === 'extra-dark' ? 4 : 3;
  ctx.strokeRect(pad, pad, canvasW - pad * 2, canvasH - pad * 2);

  let y = pad + Math.round(1.0 * SCALE);
  const titlePx = Math.round(2.3 * SCALE);
  const subPx = Math.round(1.7 * SCALE);

  ctx.font = `900 ${titlePx}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('WINTECH SPARK • PSF-20 OK', canvasW / 2, y);
  y += titlePx + 4;

  ctx.font = `700 ${subPx}px "Courier New", monospace`;
  ctx.fillText(`Size: ${widthMm}x${effectiveHeightMm}mm | ${printerName}`, canvasW / 2, y);
  y += subPx + 6;

  // Draw small scannable test barcode
  const bits = encodeCode128('PSF20-OK');
  const barH = Math.max(Math.round(5.5 * SCALE), canvasH - y - pad - subPx - 14);
  const modW = Math.max(2, Math.floor((canvasW - pad * 4) / bits.length));
  const totalW = bits.length * modW;
  const startX = Math.round((canvasW - totalW) / 2);

  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '1') {
      ctx.fillRect(startX + i * modW, y, modW, barH);
    }
  }
  y += barH + 4;

  ctx.font = `800 ${subPx}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText(`CALIBRATED • ${format(new Date(), 'dd-MMM HH:mm')}`, canvasW / 2, y);

  return canvas.toDataURL('image/png');
}

// ── Browser Iframe Print Engine (Fixed for SR20 Driver & All Sizes) ──────────
/**
 * Prints rendered 203-DPI PNG pages via an offscreen browser iframe with exact `@page` CSS
 * clamped to SR20's 49mm max width when <= 58mm so the Windows SR20 driver never rejects it.
 */
export function cleanupPrintLocksAndIframes(): void {
  if (typeof document === 'undefined') return;
  const f1 = document.getElementById('spark-thermal-print-iframe');
  if (f1) f1.remove();
  const f2 = document.getElementById('label-print-iframe');
  if (f2) f2.remove();

  const restoreBody = () => {
    const hasOpenModal = document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
    );
    if (!hasOpenModal) {
      if (document.body.style.pointerEvents === 'none') {
        document.body.style.pointerEvents = '';
      }
      if (document.body.style.overflow === 'hidden') {
        document.body.style.overflow = '';
      }
      document.body.removeAttribute('data-scroll-locked');
    }
  };
  restoreBody();
  setTimeout(restoreBody, 60);
  setTimeout(restoreBody, 250);
  if (typeof window !== 'undefined') {
    try {
      window.focus();
    } catch (_) {}
  }
}

export function printRenderedPagesViaIframe(
  pages: string[],
  widthMm: number,
  heightMm: number,
  jobTitle: string = 'Thermal_Print'
): void {
  if (!pages || pages.length === 0) return;

  // Important: SR20 driver PrintCapabilities has MaxValue=49048 microns (49.048mm) width and 75073 microns (75.073mm) height.
  // Using 49mm for 50/55/58mm rolls guarantees Chrome/Edge print preview matches SR20 without clipping or failing!
  const cssWidthMm = widthMm >= 75 ? 80 : widthMm <= 42 ? widthMm : 49;
  const cssHeightMm = Math.max(20, Math.min(widthMm >= 75 ? 300 : 74, heightMm || 30));

  const existingFrame = document.getElementById('spark-thermal-print-iframe');
  if (existingFrame) existingFrame.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'spark-thermal-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '0';
  iframe.style.width = '450px';
  iframe.style.height = '450px';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${jobTitle}</title>
  <style>
    @page {
      size: ${cssWidthMm}mm ${cssHeightMm}mm;
      margin: 0mm !important;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: ${cssWidthMm}mm;
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-page {
      width: ${cssWidthMm}mm;
      height: ${cssHeightMm}mm;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
    }
    .print-page:last-child {
      page-break-after: avoid;
      break-after: avoid;
    }
    .print-page img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
  </style>
</head>
<body>
  ${pages.map((src, idx) => `<div class="print-page"><img src="${src}" alt="Page ${idx + 1}" /></div>`).join('')}
  <script>
    window.onafterprint = function() {
      try {
        if (window.parent) window.parent.focus();
      } catch(e) {}
    };
    window.onload = function() {
      setTimeout(function() {
        window.focus();
        window.print();
        setTimeout(function() {
          try {
            if (window.parent) window.parent.focus();
          } catch(e) {}
        }, 300);
      }, 150);
    };
  </script>
</body>
</html>`;

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
}

// ── ESC/POS Binary Command Generator (Fallback for COM/Serial Printers) ──────
export function buildEscPosReceipt(
  sale: Sale,
  companyProfile: CompanyProfile,
  is3Inch: boolean = false
): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];

  const add = (...bytes: number[]) => {
    chunks.push(new Uint8Array(bytes));
  };

  const addLine = (text: string = '') => {
    chunks.push(encoder.encode(text + '\n'));
  };

  const lineWidth = is3Inch ? 48 : 30;
  const divider = '-'.repeat(lineWidth);

  const padRight = (str: string, len: number) => {
    if (str.length > len) return str.slice(0, len);
    return str + ' '.repeat(len - str.length);
  };
  const padLeft = (str: string, len: number) => {
    if (str.length > len) return str.slice(0, len);
    return ' '.repeat(len - str.length) + str;
  };

  add(0x1b, 0x40);
  add(0x1b, 0x61, 0x01);
  add(0x1d, 0x21, 0x11);
  add(0x1b, 0x45, 0x01);
  addLine(companyProfile?.companyName?.toUpperCase() || 'WIN AUTOMOBILES');
  add(0x1d, 0x21, 0x00);
  add(0x1b, 0x45, 0x00);

  if (companyProfile?.address) addLine(companyProfile.address);
  if (companyProfile?.contact) addLine(`Ph: ${companyProfile.contact}`);
  if (companyProfile?.gstNumber) addLine(`GSTIN: ${companyProfile.gstNumber}`);

  addLine();
  add(0x1b, 0x45, 0x01);
  addLine('TAX INVOICE');
  add(0x1b, 0x45, 0x00);
  addLine(divider);

  add(0x1b, 0x61, 0x00);

  const printRow = (label: string, val: string) => {
    const space = lineWidth - label.length - val.length;
    if (space > 0) {
      addLine(label + ' '.repeat(space) + val);
    } else {
      addLine(label + ' ' + val);
    }
  };

  const formattedDate = sale.date
    ? format(new Date(sale.date), 'dd-MMM-yyyy hh:mm a')
    : '';

  printRow('Invoice #:', sale.invoiceNumber || '');
  printRow('Date:', formattedDate);
  if (sale.customerName) printRow('Customer:', sale.customerName);
  if (sale.customerMobile) printRow('Phone:', sale.customerMobile);

  addLine(divider);

  if (is3Inch) {
    addLine(padRight('Item', 22) + padLeft('Qty', 4) + padLeft('Rate', 10) + padLeft('Amount', 12));
  } else {
    addLine(padRight('Item', 12) + padLeft('Qty', 3) + padLeft('Rate', 7) + padLeft('Amount', 8));
  }
  addLine(divider);

  const items = sale.items || [];
  for (const item of items) {
    const name = item.productName || 'Item';
    const qty = String(item.quantity || 1);
    const price = fmtCurrency(item.price || 0);
    const total = fmtCurrency(item.total || 0);

    if (is3Inch) {
      if (name.length <= 22) {
        addLine(padRight(name, 22) + padLeft(qty, 4) + padLeft(price, 10) + padLeft(total, 12));
      } else {
        addLine(name);
        addLine(padRight('', 22) + padLeft(qty, 4) + padLeft(price, 10) + padLeft(total, 12));
      }
    } else {
      if (name.length <= 12) {
        addLine(padRight(name, 12) + padLeft(qty, 3) + padLeft(price, 7) + padLeft(total, 8));
      } else {
        addLine(name);
        addLine(padRight('', 12) + padLeft(qty, 3) + padLeft(price, 7) + padLeft(total, 8));
      }
    }
  }

  addLine(divider);
  printRow('Subtotal:', `Rs. ${fmtCurrency(sale.subtotal || 0)}`);
  printRow('GST:', `Rs. ${fmtCurrency(sale.gstAmount || 0)}`);

  const discAmt = Number(sale.discount) || 0;
  if (discAmt > 0) {
    printRow('Discount:', `-Rs. ${fmtCurrency(discAmt)}`);
  }

  add(0x1b, 0x45, 0x01);
  printRow('TOTAL:', `Rs. ${fmtCurrency(sale.total || 0)}`);
  add(0x1b, 0x45, 0x00);

  printRow('Payment Mode:', sale.paymentMode || 'Cash');
  printRow('Payment Status:', (sale.paymentStatus || 'Paid').toUpperCase());

  const totalAmt = Number(sale.total) || 0;
  const paidAmt = Number(sale.amountPaid) || 0;
  const balAmt = Math.max(0, totalAmt - paidAmt - discAmt);
  if (paidAmt > 0 && balAmt > 0.01) {
    printRow('Paid:', `Rs. ${fmtCurrency(paidAmt)}`);
    printRow('Balance Due:', `Rs. ${fmtCurrency(balAmt)}`);
  }

  addLine(divider);
  add(0x1b, 0x61, 0x01);
  add(0x1b, 0x45, 0x01);
  addLine('Thank You for Your Business!');
  add(0x1b, 0x45, 0x00);
  addLine('Please Visit Again');

  addLine();
  addLine();
  addLine();
  addLine();
  add(0x1d, 0x56, 0x41, 0x10);

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }

  return result;
}

export function buildEscPosTestReceipt(is3Inch: boolean = false): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];

  const add = (...bytes: number[]) => chunks.push(new Uint8Array(bytes));
  const addLine = (text: string = '') => chunks.push(encoder.encode(text + '\n'));
  const lineWidth = is3Inch ? 48 : 30;
  const divider = '-'.repeat(lineWidth);

  add(0x1b, 0x40);
  add(0x1b, 0x61, 0x01);
  add(0x1d, 0x21, 0x11);
  add(0x1b, 0x45, 0x01);
  addLine('WINTECH SPARK');
  add(0x1d, 0x21, 0x00);
  add(0x1b, 0x45, 0x00);

  addLine('THERMAL PRINTER TEST');
  addLine(is3Inch ? '80mm (3-Inch) Thermal Roll' : '50x30 / 55mm POSIFLOW');
  addLine(divider);

  add(0x1b, 0x61, 0x00);
  addLine(`Status: Connected & Ready`);
  addLine(`Date: ${format(new Date(), 'dd-MMM-yyyy hh:mm a')}`);
  addLine(`Engine: Spark Direct Print OK!`);
  addLine(divider);

  add(0x1b, 0x61, 0x01);
  add(0x1b, 0x45, 0x01);
  addLine('Thermal Alignment Test Passed!');
  add(0x1b, 0x45, 0x00);

  addLine();
  addLine();
  addLine();
  addLine();
  add(0x1d, 0x56, 0x41, 0x10);

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

export async function directPrintViaWebSerial(
  sale: Sale,
  companyProfile: CompanyProfile,
  is3Inch: boolean = false
): Promise<boolean> {
  let port = await getConnectedSerialPort();
  if (!port) {
    port = await requestSerialPort();
  }

  if (!port) {
    throw new Error('No thermal printer port selected.');
  }

  try {
    try {
      await port.open({ baudRate: 9600 });
    } catch (e: any) {
      if (!e.message?.includes('already open')) {
        try {
          await port.open({ baudRate: 115200 });
        } catch (_) {}
      }
    }

    const data = buildEscPosReceipt(sale, companyProfile, is3Inch);
    const writer = port.writable.getWriter();
    await writer.write(data);
    writer.releaseLock();
    return true;
  } catch (err) {
    console.error('Error writing to thermal printer serial port:', err);
    throw err;
  }
}

export async function directTestPrintViaWebSerial(is3Inch: boolean = false): Promise<boolean> {
  let port = await getConnectedSerialPort();
  if (!port) {
    port = await requestSerialPort();
  }

  if (!port) {
    throw new Error('No thermal printer port selected.');
  }

  try {
    try {
      await port.open({ baudRate: 9600 });
    } catch (e: any) {
      if (!e.message?.includes('already open')) {
        try {
          await port.open({ baudRate: 115200 });
        } catch (_) {}
      }
    }

    const data = buildEscPosTestReceipt(is3Inch);
    const writer = port.writable.getWriter();
    await writer.write(data);
    writer.releaseLock();
    return true;
  } catch (err) {
    console.error('Error writing test receipt to serial port:', err);
    throw err;
  }
}

// ── Legacy / Direct Iframe Wrappers (Now powered by 203-DPI Canvas Renderer) ─
export function printReceiptViaIframe(
  sale: Sale,
  companyProfile: CompanyProfile,
  is3Inch: boolean = false,
  widthMmOverride?: number,
  heightMmOverride?: number,
  darkness: PrintDarkness = 'dark'
): void {
  const widthMm = widthMmOverride ?? (is3Inch ? 80 : 50);
  const heightMm = heightMmOverride ?? (is3Inch ? 0 : 30);
  const pages = renderReceiptToPngPages(sale, companyProfile, {
    widthMm,
    heightMm,
    darkness,
    isSr20: widthMm < 75,
  });
  printRenderedPagesViaIframe(
    pages,
    widthMm,
    heightMm > 0 ? heightMm : 50,
    `Receipt_${sale.invoiceNumber || 'print'}`
  );
}

export function printTestReceiptViaIframe(
  is3Inch: boolean = false,
  widthMmOverride?: number,
  heightMmOverride?: number
): void {
  const widthMm = widthMmOverride ?? (is3Inch ? 80 : 50);
  const heightMm = heightMmOverride ?? 30;
  const page = renderTestPageToDataUrl({
    widthMm,
    heightMm,
  });
  printRenderedPagesViaIframe([page], widthMm, heightMm, 'PSF20_Test_Print');
}

export function printLabelViaIframe(
  labelsHtml: string[],
  widthMm: number = 50,
  heightMm: number = 30
): void {
  const cssWidthMm = widthMm >= 75 ? 80 : widthMm <= 42 ? widthMm : 49;
  const cssHeightMm = Math.max(20, Math.min(74, heightMm || 30));

  const existingFrame = document.getElementById('label-print-iframe');
  if (existingFrame) existingFrame.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'label-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '0';
  iframe.style.width = '450px';
  iframe.style.height = '450px';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Label_Print_${widthMm}x${heightMm}</title>
  <style>
    @page {
      size: ${cssWidthMm}mm ${cssHeightMm}mm;
      margin: 0mm !important;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html, body {
      width: ${cssWidthMm}mm;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff;
      color: #000;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .label-page {
      width: ${cssWidthMm}mm;
      height: ${cssHeightMm}mm;
      max-height: ${cssHeightMm}mm;
      padding: 1.2mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      text-align: center;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
      box-sizing: border-box;
    }
    .label-page:last-child {
      page-break-after: avoid;
      break-after: avoid;
    }
  </style>
</head>
<body>
  ${labelsHtml.map((h) => `<div class="label-page">${h}</div>`).join('')}
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.focus();
        window.print();
      }, 150);
    };
  </script>
</body>
</html>`;

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) return;

  doc.open();
  doc.write(html);
  doc.close();
}
