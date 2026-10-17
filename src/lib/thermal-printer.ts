import type { Sale, CompanyProfile } from '@/lib/types';
import { format } from 'date-fns';
import { encodeCode128, generateBarcodeSVG } from '@/lib/barcode-generator';

// ── Types & PSF-20 Size Presets ──────────────────────────────────────────────

export type PrintDarkness = 'normal' | 'dark' | 'extra-dark';

export interface Psf20PaperPreset {
  id: string;
  label: string;
  shortLabel: string;
  mode: 'receipt' | 'label' | 'both';
  widthMm: number;
  heightMm: number; // 0 means dynamic continuous roll height
  isContinuousRoll?: boolean;
  description: string;
  badge?: string;
}

export const PSF20_PAPER_PRESETS: Psf20PaperPreset[] = [
  // ── 30mm Height Sizes (50x30, 55x30, 58x30, 80x30) ──
  {
    id: '50x30',
    label: '50 × 30 mm (2" × 1.2") — PSF-20 / SR20 Default',
    shortLabel: '50×30mm',
    mode: 'both',
    widthMm: 50,
    heightMm: 30,
    description: 'Native default size in POSIFLOW SR20 Windows driver (49mm printable × 30mm). Works for both labels & compact bill stickers.',
    badge: 'SR20 Default',
  },
  {
    id: '55x30',
    label: '55 × 30 mm (2.1" × 1.2") — POSIFLOW 2" Roll',
    shortLabel: '55×30mm',
    mode: 'both',
    widthMm: 55,
    heightMm: 30,
    description: '55mm × 30mm thermal roll calibrated to SR20 49mm printable head so text never truncates.',
    badge: 'Calibrated',
  },
  {
    id: '58x30',
    label: '58 × 30 mm (2.25" × 1.2") — 2" Thermal Roll',
    shortLabel: '58×30mm',
    mode: 'both',
    widthMm: 58,
    heightMm: 30,
    description: 'Standard 58mm × 30mm roll auto-fitted to 48–49mm printable width.',
  },
  {
    id: '80x30',
    label: '80 × 30 mm (3" × 1.2") — 3" Wide Strip',
    shortLabel: '80×30mm',
    mode: 'both',
    widthMm: 80,
    heightMm: 30,
    description: 'Wide 80mm × 30mm thermal strip for 3-inch POS receipt/label printers.',
  },

  // ── Other Official PSF-20 / SR20 Label & Sticker Sizes ──
  {
    id: '50x25',
    label: '50 × 25 mm (2" × 1") — PSF-20 Compact Sticker',
    shortLabel: '50×25mm',
    mode: 'label',
    widthMm: 50,
    heightMm: 25,
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
    description: 'Native SR20 driver preset (50 × 20 mm) for compact price/SKU tags.',
  },
  {
    id: '50x40',
    label: '50 × 40 mm (2" × 1.6") — SR20 Medium Roll',
    shortLabel: '50×40mm',
    mode: 'both',
    widthMm: 50,
    heightMm: 40,
    description: 'Native SR20 driver preset (50 × 40 mm) for detailed product labels or mini bills.',
  },
  {
    id: '50x50',
    label: '50 × 50 mm (2" × 2") — SR20 Large Square',
    shortLabel: '50×50mm',
    mode: 'both',
    widthMm: 50,
    heightMm: 50,
    description: 'Native SR20 driver preset (50 × 50 mm) ideal for full compact receipts or box labels.',
    badge: 'Best for Bill',
  },
  {
    id: '38x25',
    label: '38 × 25 mm (1.5" × 1") — PSF-20 Small Label',
    shortLabel: '38×25mm',
    mode: 'label',
    widthMm: 38,
    heightMm: 25,
    description: 'Small spare-parts barcode sticker roll (featured in PSF-20 small roll guide).',
  },
  {
    id: '38x38',
    label: '38 × 38 mm (1.5" × 1.5") — PSF-20 Small Square',
    shortLabel: '38×38mm',
    mode: 'label',
    widthMm: 38,
    heightMm: 38,
    description: 'Small square sticker roll (featured in PSF-20 small roll guide).',
  },

  // ── Continuous Thermal Receipt Rolls ──
  {
    id: '55mm-roll',
    label: '55mm / 50mm Continuous Receipt Roll (PSF-20 2")',
    shortLabel: '55mm Roll',
    mode: 'receipt',
    widthMm: 55,
    heightMm: 70,
    isContinuousRoll: true,
    description: 'Continuous 2-inch receipt paper roll for POSIFLOW PSF-20 (auto-segmented within SR20 75mm limit).',
    badge: 'Continuous Roll',
  },
  {
    id: '58mm-roll',
    label: '58mm Continuous Receipt Roll (2" Standard POS)',
    shortLabel: '58mm Roll',
    mode: 'receipt',
    widthMm: 58,
    heightMm: 0,
    isContinuousRoll: true,
    description: 'Standard 58mm (2-inch) continuous thermal receipt roll.',
  },
  {
    id: '80mm-roll',
    label: '80mm Continuous Receipt Roll (3" Standard POS)',
    shortLabel: '80mm Roll',
    mode: 'receipt',
    widthMm: 80,
    heightMm: 0,
    isContinuousRoll: true,
    description: 'Standard 80mm (3-inch) continuous thermal receipt roll for desktop POS printers.',
  },
];

export interface LabelItemData {
  companyName?: string;
  productName: string;
  barcodeValue: string;
  priceFormatted: string;
  subtitle?: string;
  showCompany?: boolean;
  showProduct?: boolean;
  showPrice?: boolean;
  showCodeText?: boolean;
  showSubtitle?: boolean;
}

export interface WindowsPrinterStatus {
  name: string;
  driverName: string;
  portName: string;
  status: string;
  isDefault: boolean;
  isPsf20: boolean;
  paperSizes: {
    name: string;
    widthMm: number;
    heightMm: number;
  }[];
}

export interface PrinterApiStatusResponse {
  supported: boolean;
  platform: string;
  printers: WindowsPrinterStatus[];
  recommendedPrinter: string | null;
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
      return { supported: false, platform: 'unknown', printers: [], recommendedPrinter: null };
    }
    return await res.json();
  } catch (_) {
    return { supported: false, platform: 'unknown', printers: [], recommendedPrinter: null };
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
}): Promise<{ success: boolean; printerName?: string; pagesPrinted?: number; error?: string }> {
  try {
    const res = await fetch('/api/printer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Failed to print via Windows Spooler.' };
    }
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network error calling local printer service.' };
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
  companyProfile: CompanyProfile,
  options: {
    widthMm: number;
    heightMm: number;
    darkness?: PrintDarkness;
    isSr20?: boolean;
  }
): { pages: string[]; effectiveWidthMm: number; effectiveHeightMm: number } {
  const { widthMm, heightMm, darkness = 'dark', isSr20 = true } = options;

  // SR20 printhead max printable width is 49mm (392 dots at 203 DPI).
  // For 50mm, 55mm, 58mm rolls on SR20, we use 49mm effective width so nothing ever clips on the right edge!
  const effectiveWidthMm = widthMm >= 75 ? 72 : widthMm <= 42 ? widthMm : 49;
  const isCompactSticker = heightMm > 0 && heightMm <= 42; // e.g. 50x30, 55x30, 58x30, 80x30, 50x40

  // 16 pixels per mm (~406 DPI, exact 2x of 203 DPI thermal head) for ultra-crisp text & lines
  const SCALE = 16;
  const canvasW = Math.round(effectiveWidthMm * SCALE);

  const fontWeightBold = darkness === 'extra-dark' ? '900' : '800';
  const fontWeightNormal = darkness === 'extra-dark' ? '800' : darkness === 'dark' ? '700' : '600';
  const strokeWidth = darkness === 'extra-dark' ? 3 : 2;

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

  // ── Mode A: Compact 30mm / 40mm Height Bill Sticker (e.g., 50x30, 55x30, 58x30, 80x30, 50x40) ──
  if (isCompactSticker) {
    const targetH = heightMm;
    const canvasH = Math.round(targetH * SCALE);
    const padX = Math.round(1.5 * SCALE);
    const padY = Math.round(1.2 * SCALE);
    const innerW = canvasW - padX * 2;

    // How many items fit per 30mm/40mm sticker?
    const maxItemsPerSticker = targetH <= 32 ? 2 : 4;
    const itemChunks: typeof items[] = [];
    if (items.length === 0) {
      itemChunks.push([]);
    } else {
      for (let i = 0; i < items.length; i += maxItemsPerSticker) {
        itemChunks.push(items.slice(i, i + maxItemsPerSticker));
      }
    }

    const pages: string[] = [];

    itemChunks.forEach((chunk, pageIdx) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvasW, canvasH);
      ctx.fillStyle = '#000000';
      ctx.strokeStyle = '#000000';
      ctx.textBaseline = 'top';

      let y = padY;
      const isWide = effectiveWidthMm >= 68;
      const titleFontPx = Math.round((isWide ? 2.6 : 2.2) * SCALE);
      const metaFontPx = Math.round((isWide ? 1.85 : 1.65) * SCALE);
      const itemFontPx = Math.round((isWide ? 1.85 : 1.65) * SCALE);
      const totalFontPx = Math.round((isWide ? 2.2 : 1.95) * SCALE);

      // 1. Store Header + Invoice # on top line
      ctx.font = `${fontWeightBold} ${titleFontPx}px "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = 'left';
      const headerLeft = compName.slice(0, isWide ? 26 : 16);
      ctx.fillText(headerLeft, padX, y);

      ctx.font = `${fontWeightBold} ${metaFontPx}px "Courier New", monospace`;
      ctx.textAlign = 'right';
      const invBadge = `#${sale.invoiceNumber || 'INV'}${itemChunks.length > 1 ? ` (${pageIdx + 1}/${itemChunks.length})` : ''}`;
      ctx.fillText(invBadge, canvasW - padX, y + 2);
      y += titleFontPx + 4;

      // 2. Customer & Date Row
      ctx.font = `${fontWeightNormal} ${metaFontPx}px "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = 'left';
      const custText = (sale.customerName && sale.customerName !== 'N/A' ? sale.customerName : 'Walk-in').slice(0, 16);
      ctx.fillText(`Cust: ${custText}`, padX, y);
      ctx.textAlign = 'right';
      ctx.fillText(sale.date ? format(new Date(sale.date), 'dd/MM/yy HH:mm') : '', canvasW - padX, y);
      y += metaFontPx + 5;

      // Divider
      ctx.lineWidth = strokeWidth;
      ctx.beginPath();
      ctx.moveTo(padX, y);
      ctx.lineTo(canvasW - padX, y);
      ctx.stroke();
      y += 5;

      // 3. Items Table Header
      ctx.font = `${fontWeightBold} ${metaFontPx}px "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText('ITEM', padX, y);
      ctx.textAlign = 'center';
      ctx.fillText('QTY', padX + Math.round(innerW * 0.56), y);
      ctx.textAlign = 'right';
      ctx.fillText('AMT', canvasW - padX, y);
      y += metaFontPx + 4;

      // 4. Items in this chunk
      ctx.font = `${fontWeightNormal} ${itemFontPx}px "Segoe UI", Arial, sans-serif`;
      for (const it of chunk) {
        const pName = (it.productName || 'Item').slice(0, isWide ? 24 : 15);
        ctx.textAlign = 'left';
        ctx.fillText(pName, padX, y);
        ctx.textAlign = 'center';
        ctx.fillText(String(it.quantity || 1), padX + Math.round(innerW * 0.56), y);
        ctx.textAlign = 'right';
        ctx.font = `${fontWeightBold} ${itemFontPx}px "Courier New", monospace`;
        ctx.fillText(`Rs.${fmtCurrency(it.total || 0)}`, canvasW - padX, y);
        ctx.font = `${fontWeightNormal} ${itemFontPx}px "Segoe UI", Arial, sans-serif`;
        y += itemFontPx + 4;
      }

      // Bottom Footer Box (pinned near bottom of 30mm/40mm sticker)
      const bottomY = canvasH - padY - totalFontPx - metaFontPx - 10;
      const dividerY = Math.max(y + 2, bottomY);

      ctx.lineWidth = strokeWidth;
      ctx.beginPath();
      ctx.moveTo(padX, dividerY);
      ctx.lineTo(canvasW - padX, dividerY);
      ctx.stroke();

      const totY = dividerY + 5;
      ctx.font = `${fontWeightBold} ${totalFontPx}px "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(`TOTAL (${items.length} items):`, padX, totY);
      ctx.textAlign = 'right';
      ctx.fillText(`Rs. ${fmtCurrency(total)}`, canvasW - padX, totY);

      const statusY = totY + totalFontPx + 3;
      ctx.font = `${fontWeightNormal} ${metaFontPx}px "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = 'left';
      const gstAndDisc =
        discountAmount > 0
          ? `GST: Rs.${fmtCurrency(gstAmount)} | Disc: -${fmtCurrency(discountAmount)}`
          : `Subtotal: Rs.${fmtCurrency(subtotal)} | GST: Rs.${fmtCurrency(gstAmount)}`;
      ctx.fillText(gstAndDisc, padX, statusY);

      ctx.font = `${fontWeightBold} ${metaFontPx}px "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(
        balance > 0.01 ? `DUE: Rs.${fmtCurrency(balance)}` : `${(sale.paymentStatus || 'PAID').toUpperCase()} (${sale.paymentMode || 'Cash'})`,
        canvasW - padX,
        statusY
      );

      pages.push(canvas.toDataURL('image/png'));
    });

    return { pages, effectiveWidthMm, effectiveHeightMm: targetH };
  }

  // ── Mode B: Full Thermal Receipt (50x50, 50mm/55mm/58mm/80mm Roll) ─────────
  // First draw onto a tall master canvas, then slice into SR20-compatible page segments if needed.
  const isWide = effectiveWidthMm >= 68;
  const padX = Math.round((isWide ? 2.5 : 1.5) * SCALE);
  const innerW = canvasW - padX * 2;

  const titleFontPx = Math.round((isWide ? 3.2 : 2.6) * SCALE);
  const subHeaderFontPx = Math.round((isWide ? 2.1 : 1.8) * SCALE);
  const bodyFontPx = Math.round((isWide ? 2.1 : 1.85) * SCALE);
  const totalFontPx = Math.round((isWide ? 2.7 : 2.3) * SCALE);
  const lineGap = Math.round(0.75 * SCALE);

  // Estimate max master canvas height
  const estHeightMm = Math.max(80, calculateReceiptHeightMm(sale, isWide) + 30);
  const masterCanvas = document.createElement('canvas');
  masterCanvas.width = canvasW;
  masterCanvas.height = Math.round(estHeightMm * SCALE);
  const ctx = masterCanvas.getContext('2d')!;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, masterCanvas.width, masterCanvas.height);
  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#000000';
  ctx.textBaseline = 'top';

  let y = Math.round(2.0 * SCALE);

  const drawCentered = (text: string, fontPx: number, weight: string) => {
    ctx.font = `${weight} ${fontPx}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(text, canvasW / 2, y, innerW);
    y += fontPx + lineGap;
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
      ctx.setLineDash([6, 4]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(canvasW - padX, y);
    ctx.stroke();
    ctx.setLineDash([]);
    y += 6;
  };

  // 1. Company Header
  drawCentered(compName, titleFontPx, fontWeightBold);
  if (companyProfile?.address) {
    const addrLines = companyProfile.address.split(/\r?\n/);
    for (const line of addrLines) {
      if (line.trim()) drawCentered(line.trim(), subHeaderFontPx, fontWeightNormal);
    }
  }
  if (companyProfile?.contact) {
    drawCentered(`Ph: ${companyProfile.contact}`, subHeaderFontPx, fontWeightNormal);
  }
  if (companyProfile?.gstNumber) {
    drawCentered(`GSTIN: ${companyProfile.gstNumber}`, subHeaderFontPx, fontWeightNormal);
  }

  // 2. TAX INVOICE Banner
  drawDivider(false);
  drawCentered('TAX INVOICE', bodyFontPx, fontWeightBold);
  drawDivider(false);

  // 3. Invoice Meta
  drawRow('Invoice #:', sale.invoiceNumber || '', bodyFontPx, fontWeightNormal, fontWeightBold);
  drawRow('Date:', formattedDate, bodyFontPx, fontWeightNormal, fontWeightNormal);
  if (sale.customerName && sale.customerName !== 'N/A') {
    drawRow('Customer:', sale.customerName.slice(0, 20), bodyFontPx, fontWeightNormal, fontWeightBold);
  }
  if (sale.customerMobile) {
    drawRow('Mobile:', sale.customerMobile, bodyFontPx, fontWeightNormal, fontWeightNormal);
  }

  drawDivider(true);

  // 4. Items Table Header
  ctx.font = `${fontWeightBold} ${bodyFontPx}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText('Item', padX, y);
  ctx.textAlign = 'center';
  ctx.fillText('Qty', padX + Math.round(innerW * 0.48), y);
  ctx.textAlign = 'right';
  ctx.fillText('Rate', padX + Math.round(innerW * 0.73), y);
  ctx.fillText('Amt', canvasW - padX, y);
  y += bodyFontPx + 4;
  drawDivider(false);

  // 5. Items
  for (const item of items) {
    const name = item.productName || 'Item';
    const qtyStr = String(item.quantity || 1);
    const rateStr = fmtCurrency(item.price || 0);
    const amtStr = fmtCurrency(item.total || 0);

    const maxInlineChars = isWide ? 20 : 12;
    if (name.length <= maxInlineChars) {
      ctx.font = `${fontWeightNormal} ${bodyFontPx}px "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(name, padX, y);
      ctx.textAlign = 'center';
      ctx.fillText(qtyStr, padX + Math.round(innerW * 0.48), y);
      ctx.font = `${fontWeightNormal} ${bodyFontPx}px "Courier New", monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(rateStr, padX + Math.round(innerW * 0.73), y);
      ctx.font = `${fontWeightBold} ${bodyFontPx}px "Courier New", monospace`;
      ctx.fillText(amtStr, canvasW - padX, y);
      y += bodyFontPx + lineGap;
    } else {
      // Line 1: Full product name
      ctx.font = `${fontWeightBold} ${bodyFontPx}px "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(name.slice(0, isWide ? 34 : 24), padX, y);
      y += bodyFontPx + 2;
      // Line 2: Qty, Rate, Amount
      ctx.font = `${fontWeightNormal} ${bodyFontPx}px "Courier New", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(qtyStr, padX + Math.round(innerW * 0.48), y);
      ctx.textAlign = 'right';
      ctx.fillText(rateStr, padX + Math.round(innerW * 0.73), y);
      ctx.font = `${fontWeightBold} ${bodyFontPx}px "Courier New", monospace`;
      ctx.fillText(amtStr, canvasW - padX, y);
      y += bodyFontPx + lineGap;
    }
  }

  drawDivider(true);

  // 6. Totals
  drawRow('Subtotal:', `Rs. ${fmtCurrency(subtotal)}`, bodyFontPx, fontWeightNormal, fontWeightNormal);
  drawRow('GST:', `Rs. ${fmtCurrency(gstAmount)}`, bodyFontPx, fontWeightNormal, fontWeightNormal);
  if (discountAmount > 0) {
    drawRow('Discount:', `-Rs. ${fmtCurrency(discountAmount)}`, bodyFontPx, fontWeightNormal, fontWeightBold);
  }

  drawDivider(false);
  drawRow('TOTAL:', `Rs. ${fmtCurrency(total)}`, totalFontPx, fontWeightBold, fontWeightBold);
  drawDivider(false);

  drawRow('Payment Mode:', sale.paymentMode || 'Cash', bodyFontPx, fontWeightNormal, fontWeightNormal);
  drawRow('Status:', (sale.paymentStatus || 'Paid').toUpperCase(), bodyFontPx, fontWeightNormal, fontWeightBold);

  if (paidAmount > 0 && balance > 0.01) {
    drawRow('Amount Paid:', `Rs. ${fmtCurrency(paidAmount)}`, bodyFontPx, fontWeightNormal, fontWeightNormal);
    drawRow('Balance Due:', `Rs. ${fmtCurrency(balance)}`, bodyFontPx, fontWeightBold, fontWeightBold);
  }

  drawDivider(true);

  // 7. Footer
  drawCentered('Thank You for Your Business!', subHeaderFontPx, fontWeightBold);
  drawCentered('Please Visit Again', subHeaderFontPx, fontWeightNormal);

  y += Math.round(2.5 * SCALE);

  const actualUsedHeightPx = y;
  const actualUsedHeightMm = Math.ceil(actualUsedHeightPx / SCALE);

  // If fixed 50x50 preset was selected and content fits or is scaled to 50mm:
  if (heightMm === 50) {
    const pageH = 50 * SCALE;
    if (actualUsedHeightPx <= pageH * 1.35) {
      // Scale smoothly to fit 1 single 50x50 page if close
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvasW;
      pageCanvas.height = pageH;
      const pCtx = pageCanvas.getContext('2d')!;
      pCtx.fillStyle = '#FFFFFF';
      pCtx.fillRect(0, 0, canvasW, pageH);
      const ratio = Math.min(1, pageH / actualUsedHeightPx);
      const drawW = canvasW * ratio;
      const drawX = (canvasW - drawW) / 2;
      pCtx.drawImage(masterCanvas, 0, 0, canvasW, actualUsedHeightPx, drawX, 0, drawW, actualUsedHeightPx * ratio);
      return { pages: [pageCanvas.toDataURL('image/png')], effectiveWidthMm, effectiveHeightMm: 50 };
    }
  }

  // For SR20 driver (max page height = 75mm), slice into <=72mm segments if needed, or single page if <=74mm
  const maxSegmentMm = isSr20 && effectiveWidthMm <= 50 ? 72 : Math.max(actualUsedHeightMm, 80);

  if (actualUsedHeightMm <= maxSegmentMm) {
    const finalMm = Math.max(30, actualUsedHeightMm);
    const outCanvas = document.createElement('canvas');
    outCanvas.width = canvasW;
    outCanvas.height = Math.round(finalMm * SCALE);
    const oCtx = outCanvas.getContext('2d')!;
    oCtx.fillStyle = '#FFFFFF';
    oCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);
    oCtx.drawImage(masterCanvas, 0, 0, canvasW, actualUsedHeightPx, 0, 0, canvasW, actualUsedHeightPx);
    return {
      pages: [outCanvas.toDataURL('image/png')],
      effectiveWidthMm,
      effectiveHeightMm: finalMm,
    };
  }

  // Multi-segment slicing for extra-long receipts on SR20
  const segmentPx = Math.round(maxSegmentMm * SCALE);
  const pages: string[] = [];
  for (let offsetY = 0; offsetY < actualUsedHeightPx; offsetY += segmentPx) {
    const sliceH = Math.min(segmentPx, actualUsedHeightPx - offsetY);
    const segCanvas = document.createElement('canvas');
    segCanvas.width = canvasW;
    segCanvas.height = segmentPx;
    const sCtx = segCanvas.getContext('2d')!;
    sCtx.fillStyle = '#FFFFFF';
    sCtx.fillRect(0, 0, canvasW, segmentPx);
    sCtx.drawImage(masterCanvas, 0, offsetY, canvasW, sliceH, 0, 0, canvasW, sliceH);
    pages.push(segCanvas.toDataURL('image/png'));
  }

  return {
    pages,
    effectiveWidthMm,
    effectiveHeightMm: maxSegmentMm,
  };
}

// ── High-Precision 203-DPI Canvas Barcode Label Renderer ─────────────────────
/**
 * Renders an array of product barcode labels into crisp 203-DPI (16 px/mm) PNG data URLs
 * for direct printing on POSIFLOW PSF-20 (SR20) or any thermal label printer.
 */
export function renderLabelsToPngPages(
  items: LabelItemData[],
  options: {
    widthMm: number;
    heightMm: number;
    darkness?: PrintDarkness;
  }
): { pages: string[]; effectiveWidthMm: number; effectiveHeightMm: number } {
  const { widthMm, heightMm, darkness = 'dark' } = options;
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
    const hasBottomRow = (item.showPrice !== false && item.priceFormatted) || (item.showSubtitle !== false && item.subtitle);
    const bottomRowHeight = hasBottomRow ? priceFontPx + 8 : 0;
    const bottomY = canvasH - padY - bottomRowHeight;

    // 4. Draw Crisp Code-128 Barcode in the middle zone
    const barcodeText = (item.barcodeValue || 'SKU-001').trim();
    const bits = encodeCode128(barcodeText);
    const showCodeStr = item.showCodeText !== false;
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
      if (item.showPrice !== false && item.priceFormatted && item.showSubtitle !== false && item.subtitle) {
        ctx.font = `${fontWeightBold} ${priceFontPx}px "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(`MRP: Rs.${item.priceFormatted}`, padX, textY);

        ctx.font = `${fontWeightNormal} ${ Math.round(priceFontPx * 0.85) }px "Segoe UI", Arial, sans-serif`;
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

    pages.push(canvas.toDataURL('image/png'));
  }

  return { pages, effectiveWidthMm, effectiveHeightMm };
}

// ── Render PSF-20 Calibration & Alignment Test Page ──────────────────────────
export function renderTestPageToDataUrl(options: {
  widthMm: number;
  heightMm: number;
  printerName?: string;
  darkness?: PrintDarkness;
}): { page: string; effectiveWidthMm: number; effectiveHeightMm: number } {
  const { widthMm = 50, heightMm = 30, printerName = 'SR20 (POSIFLOW PSF-20)', darkness = 'dark' } = options;
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

  return {
    page: canvas.toDataURL('image/png'),
    effectiveWidthMm,
    effectiveHeightMm,
  };
}

// ── Browser Iframe Print Engine (Fixed for SR20 Driver & All Sizes) ──────────
/**
 * Prints rendered 203-DPI PNG pages via an offscreen browser iframe with exact `@page` CSS
 * clamped to SR20's 49mm max width when <= 58mm so the Windows SR20 driver never rejects it.
 */
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
  const { pages, effectiveWidthMm, effectiveHeightMm } = renderReceiptToPngPages(sale, companyProfile, {
    widthMm,
    heightMm,
    darkness,
    isSr20: widthMm < 75,
  });
  printRenderedPagesViaIframe(
    pages,
    effectiveWidthMm,
    effectiveHeightMm,
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
  const { page, effectiveWidthMm, effectiveHeightMm } = renderTestPageToDataUrl({
    widthMm,
    heightMm,
  });
  printRenderedPagesViaIframe([page], effectiveWidthMm, effectiveHeightMm, 'PSF20_Test_Print');
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
