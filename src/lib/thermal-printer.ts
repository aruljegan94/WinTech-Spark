import type { Sale, CompanyProfile } from '@/lib/types';
import { format } from 'date-fns';

// ── Helper: Format currency ──────────────────────────────────────────────────
function fmtCurrency(amount: number): string {
  return amount.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
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

// ── Dynamic Height Calculation for 80mm / 58mm System Print ──────────────────
export function calculateReceiptHeightMm(sale: Sale, is3Inch: boolean): number {
  // Base header, tax invoice title, invoice meta, divider lines, and footer
  let heightMm = 55;

  if (sale.customerName) heightMm += 4.5;
  if (sale.customerMobile) heightMm += 4.5;

  // Items table header + divider
  heightMm += 9;

  // Items
  const items = sale.items || [];
  for (const item of items) {
    const name = item.productName || '';
    const maxChars = is3Inch ? 26 : 18;
    const lines = Math.max(1, Math.ceil(name.length / maxChars));
    heightMm += lines * 4.5 + 4.5;
  }

  // Totals section (Subtotal, GST, TOTAL box, Payment Mode, Status)
  heightMm += 32;

  const total = Number(sale.total) || 0;
  const amountPaid = Number(sale.amountPaid) || 0;
  if (amountPaid > 0 && amountPaid < total) {
    heightMm += 9; // Paid + Balance Due
  }

  // Footer text
  heightMm += 14;

  // Cutter feed margin
  heightMm += 18;

  return Math.min(1200, Math.max(85, heightMm));
}

// ── ESC/POS Binary Command Generator ─────────────────────────────────────────
export function buildEscPosReceipt(
  sale: Sale,
  companyProfile: CompanyProfile,
  is3Inch: boolean = true
): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];

  const add = (...bytes: number[]) => {
    chunks.push(new Uint8Array(bytes));
  };

  const addText = (text: string) => {
    chunks.push(encoder.encode(text));
  };

  const addLine = (text: string = '') => {
    chunks.push(encoder.encode(text + '\n'));
  };

  const lineWidth = is3Inch ? 48 : 32;
  const divider = '-'.repeat(lineWidth);

  // Pad or truncate string
  const padRight = (str: string, len: number) => {
    if (str.length > len) return str.slice(0, len);
    return str + ' '.repeat(len - str.length);
  };
  const padLeft = (str: string, len: number) => {
    if (str.length > len) return str.slice(0, len);
    return ' '.repeat(len - str.length) + str;
  };

  // 1. Initialize printer: ESC @
  add(0x1b, 0x40);

  // 2. Center Align: ESC a 1
  add(0x1b, 0x61, 0x01);

  // 3. Double height & width for Store Name: GS ! 0x11
  add(0x1d, 0x21, 0x11);
  add(0x1b, 0x45, 0x01); // Bold ON
  addLine(companyProfile?.companyName?.toUpperCase() || 'WIN AUTOMOBILES');
  add(0x1d, 0x21, 0x00); // Normal size
  add(0x1b, 0x45, 0x00); // Bold OFF

  if (companyProfile?.address) {
    addLine(companyProfile.address);
  }
  if (companyProfile?.contact) {
    addLine(`Ph: ${companyProfile.contact}`);
  }
  if (companyProfile?.gstNumber) {
    addLine(`GSTIN: ${companyProfile.gstNumber}`);
  }

  addLine();
  add(0x1b, 0x45, 0x01); // Bold ON
  addLine('TAX INVOICE');
  add(0x1b, 0x45, 0x00); // Bold OFF
  addLine(divider);

  // 4. Left Align: ESC a 0
  add(0x1b, 0x61, 0x00);

  // Invoice Meta
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

  // 5. Items Header
  if (is3Inch) {
    // 48 chars: Item (22) + Qty (4) + Rate (10) + Amt (12)
    addLine(
      padRight('Item', 22) +
        padLeft('Qty', 4) +
        padLeft('Rate', 10) +
        padLeft('Amount', 12)
    );
  } else {
    // 32 chars: Item (14) + Qty (3) + Rate (7) + Amt (8)
    addLine(
      padRight('Item', 14) +
        padLeft('Qty', 3) +
        padLeft('Rate', 7) +
        padLeft('Amount', 8)
    );
  }
  addLine(divider);

  // 6. Items List
  const items = sale.items || [];
  for (const item of items) {
    const name = item.productName || 'Item';
    const qty = String(item.quantity || 1);
    const price = fmtCurrency(item.price || 0);
    const total = fmtCurrency(item.total || 0);

    if (is3Inch) {
      // Print item name (wrap if longer than 22)
      if (name.length <= 22) {
        addLine(
          padRight(name, 22) +
            padLeft(qty, 4) +
            padLeft(price, 10) +
            padLeft(total, 12)
        );
      } else {
        addLine(name);
        addLine(
          padRight('', 22) +
            padLeft(qty, 4) +
            padLeft(price, 10) +
            padLeft(total, 12)
        );
      }
    } else {
      if (name.length <= 14) {
        addLine(
          padRight(name, 14) +
            padLeft(qty, 3) +
            padLeft(price, 7) +
            padLeft(total, 8)
        );
      } else {
        addLine(name);
        addLine(
          padRight('', 14) +
            padLeft(qty, 3) +
            padLeft(price, 7) +
            padLeft(total, 8)
        );
      }
    }
  }

  addLine(divider);

  // 7. Totals
  printRow('Subtotal:', `Rs. ${fmtCurrency(sale.subtotal || 0)}`);
  printRow('GST:', `Rs. ${fmtCurrency(sale.gstAmount || 0)}`);

  // Bold Total
  add(0x1b, 0x45, 0x01); // Bold ON
  printRow('TOTAL:', `Rs. ${fmtCurrency(sale.total || 0)}`);
  add(0x1b, 0x45, 0x00); // Bold OFF

  printRow('Payment Mode:', sale.paymentMode || 'Cash');
  printRow('Payment Status:', (sale.paymentStatus || 'Paid').toUpperCase());

  const totalAmt = Number(sale.total) || 0;
  const paidAmt = Number(sale.amountPaid) || 0;
  if (paidAmt > 0 && paidAmt < totalAmt) {
    printRow('Paid:', `Rs. ${fmtCurrency(paidAmt)}`);
    printRow('Balance Due:', `Rs. ${fmtCurrency(totalAmt - paidAmt)}`);
  }

  addLine(divider);

  // 8. Footer (Centered)
  add(0x1b, 0x61, 0x01); // Center Align
  add(0x1b, 0x45, 0x01); // Bold ON
  addLine('Thank You for Your Business!');
  add(0x1b, 0x45, 0x00); // Bold OFF
  addLine('Please Visit Again');

  // 9. Paper Feed & Cut
  // Line feeds
  addLine();
  addLine();
  addLine();
  addLine();

  // Full/Partial Cut: GS V A 16 (0x1D, 0x56, 0x41, 0x10)
  add(0x1d, 0x56, 0x41, 0x10);

  // Calculate total length and concatenate
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }

  return result;
}

// ── ESC/POS Test Receipt Generator ───────────────────────────────────────────
export function buildEscPosTestReceipt(is3Inch: boolean = true): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];

  const add = (...bytes: number[]) => chunks.push(new Uint8Array(bytes));
  const addLine = (text: string = '') => chunks.push(encoder.encode(text + '\n'));
  const lineWidth = is3Inch ? 48 : 32;
  const divider = '-'.repeat(lineWidth);

  // Init
  add(0x1b, 0x40);

  // Center
  add(0x1b, 0x61, 0x01);
  add(0x1d, 0x21, 0x11);
  add(0x1b, 0x45, 0x01);
  addLine('WINTECH SPARK');
  add(0x1d, 0x21, 0x00);
  add(0x1b, 0x45, 0x00);

  addLine('THERMAL PRINTER TEST');
  addLine(is3Inch ? '80mm (3-Inch) Thermal Roll' : '58mm (2-Inch) Thermal Roll');
  addLine(divider);

  add(0x1b, 0x61, 0x00);
  addLine(`Status: Connected & Ready`);
  addLine(`Date: ${format(new Date(), 'dd-MMM-yyyy hh:mm a')}`);
  addLine(`Engine: Spark PWA Web Serial OK!`);
  addLine(divider);

  add(0x1b, 0x61, 0x01);
  add(0x1b, 0x45, 0x01);
  addLine('Thermal Alignment Test Passed!');
  add(0x1b, 0x45, 0x00);

  addLine();
  addLine();
  addLine();
  addLine();

  // Cut
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

// ── Direct Print via Web Serial (Instant 1-Click Print, No Spooler Dialog) ───
export async function directPrintViaWebSerial(
  sale: Sale,
  companyProfile: CompanyProfile,
  is3Inch: boolean = true
): Promise<boolean> {
  let port = await getConnectedSerialPort();
  if (!port) {
    port = await requestSerialPort();
  }

  if (!port) {
    throw new Error('No thermal printer port selected.');
  }

  try {
    // Open port if not already open (typical baudRate is 9600 or 115200 for thermal printers)
    try {
      await port.open({ baudRate: 9600 });
    } catch (e: any) {
      // If already open, continue
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

// ── Direct Test Print via Web Serial ─────────────────────────────────────────
export async function directTestPrintViaWebSerial(is3Inch: boolean = true): Promise<boolean> {
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

// ── Isolated Iframe System Print (Exact 80mm / 58mm Roll, Never A4) ──────────
export function printReceiptViaIframe(
  sale: Sale,
  companyProfile: CompanyProfile,
  is3Inch: boolean = true
): void {
  const rollWidth = is3Inch ? '80mm' : '58mm';
  const heightMm = calculateReceiptHeightMm(sale, is3Inch);
  const formattedDate = sale.date
    ? format(new Date(sale.date), 'dd-MMM-yyyy hh:mm a')
    : '';

  const total = Number(sale.total) || 0;
  const paidAmount = Number(sale.amountPaid) || 0;
  const balance = Math.max(0, total - paidAmount);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receipt_${sale.invoiceNumber || 'print'}</title>
  <style>
    @page {
      size: ${rollWidth} ${heightMm}mm;
      margin: 0;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html, body {
      width: ${rollWidth};
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
      font-family: 'Courier New', Courier, monospace;
      font-size: ${is3Inch ? '11px' : '9.5px'};
      line-height: 1.25;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .receipt {
      width: ${rollWidth};
      padding: ${is3Inch ? '4mm 3mm 8mm 3mm' : '3mm 2mm 6mm 2mm'};
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: bold; }
    .title {
      font-size: ${is3Inch ? '13px' : '11px'};
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .tax-box {
      border-top: 1px solid #000;
      border-bottom: 1px solid #000;
      padding: 2px 0;
      margin: 4px 0;
      text-align: center;
      font-weight: bold;
    }
    .divider {
      border-top: 1px dashed #000;
      margin: 3px 0;
    }
    .row {
      display: flex;
      justify-content: space-between;
      margin: 1.5px 0;
    }
    .table-header {
      display: flex;
      font-weight: bold;
      border-bottom: 1px solid #000;
      padding-bottom: 2px;
      margin-bottom: 3px;
    }
    .table-row {
      display: flex;
      margin: 2px 0;
    }
    .col-item { flex: 5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .col-qty { flex: 2; text-align: center; }
    .col-rate { flex: 2; text-align: right; }
    .col-amt { flex: 3; text-align: right; font-weight: bold; }
    .total-box {
      display: flex;
      justify-content: space-between;
      font-weight: bold;
      font-size: ${is3Inch ? '12px' : '11px'};
      border-top: 1px solid #000;
      border-bottom: 1px solid #000;
      padding: 3px 0;
      margin: 3px 0;
    }
    .footer {
      text-align: center;
      margin-top: 6px;
      font-size: ${is3Inch ? '10px' : '9px'};
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="text-center">
      <div class="title">${(companyProfile?.companyName || 'Win Automobiles').toUpperCase()}</div>
      ${companyProfile?.address ? `<div>${companyProfile.address}</div>` : ''}
      ${companyProfile?.contact ? `<div>Ph: ${companyProfile.contact}</div>` : ''}
      ${companyProfile?.gstNumber ? `<div>GSTIN: ${companyProfile.gstNumber}</div>` : ''}
    </div>

    <div class="tax-box">TAX INVOICE</div>

    <div class="row"><span>Invoice #:</span><span class="bold">${sale.invoiceNumber || ''}</span></div>
    <div class="row"><span>Date:</span><span>${formattedDate}</span></div>
    ${sale.customerName ? `<div class="row"><span>Customer:</span><span class="bold">${sale.customerName}</span></div>` : ''}
    ${sale.customerMobile ? `<div class="row"><span>Phone:</span><span>${sale.customerMobile}</span></div>` : ''}

    <div class="divider"></div>

    <div class="table-header">
      <span class="col-item">Item</span>
      <span class="col-qty">Qty</span>
      <span class="col-rate">Rate</span>
      <span class="col-amt">Amount</span>
    </div>

    ${(sale.items || [])
      .map(
        (it) => `
      <div class="table-row">
        <span class="col-item">${it.productName || ''}</span>
        <span class="col-qty">${it.quantity || 1}</span>
        <span class="col-rate">${fmtCurrency(it.price || 0)}</span>
        <span class="col-amt">${fmtCurrency(it.total || 0)}</span>
      </div>
    `
      )
      .join('')}

    <div class="divider"></div>

    <div class="row"><span>Subtotal:</span><span>Rs. ${fmtCurrency(sale.subtotal || 0)}</span></div>
    <div class="row"><span>GST:</span><span>Rs. ${fmtCurrency(sale.gstAmount || 0)}</span></div>

    <div class="total-box">
      <span>TOTAL:</span>
      <span>Rs. ${fmtCurrency(sale.total || 0)}</span>
    </div>

    <div class="row"><span>Payment Mode:</span><span>${sale.paymentMode || 'Cash'}</span></div>
    <div class="row"><span>Payment Status:</span><span class="bold">${(sale.paymentStatus || 'Paid').toUpperCase()}</span></div>
    ${
      paidAmount > 0 && balance > 0.01
        ? `
      <div class="row"><span>Amount Paid:</span><span>Rs. ${fmtCurrency(paidAmount)}</span></div>
      <div class="row bold"><span>Balance Due:</span><span>Rs. ${fmtCurrency(balance)}</span></div>
    `
        : ''
    }

    <div class="divider"></div>

    <div class="footer">
      <div class="bold">Thank You for Your Business!</div>
      <div>Please Visit Again</div>
    </div>
  </div>
</body>
</html>`;

  // Remove any previous hidden iframe
  const existingFrame = document.getElementById('thermal-print-iframe');
  if (existingFrame) existingFrame.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'thermal-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc || !iframe.contentWindow) return;

  doc.open();
  doc.write(html);
  doc.close();

  // Print once contents are loaded
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error('Error triggering iframe print:', e);
    }
  }, 350);
}

// ── Test Print via Iframe ────────────────────────────────────────────────────
export function printTestReceiptViaIframe(is3Inch: boolean = true): void {
  const rollWidth = is3Inch ? '80mm' : '58mm';
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Test_Receipt</title>
  <style>
    @page { size: ${rollWidth} 110mm; margin: 0; }
    html, body {
      width: ${rollWidth};
      margin: 0;
      padding: 4mm 3mm;
      font-family: 'Courier New', Courier, monospace;
      font-size: ${is3Inch ? '11px' : '9.5px'};
      text-align: center;
    }
    .bold { font-weight: bold; }
    .divider { border-top: 1px dashed #000; margin: 4px 0; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; }
  </style>
</head>
<body>
  <div class="bold" style="font-size: 13px;">WINTECH SPARK</div>
  <div class="bold">THERMAL PRINTER TEST</div>
  <div>${is3Inch ? '80mm (3-Inch) Thermal Roll' : '58mm (2-Inch) Thermal Roll'}</div>
  <div class="divider"></div>
  <div class="row"><span>Status:</span><span class="bold">Connected & Ready</span></div>
  <div class="row"><span>Date:</span><span>${format(new Date(), 'dd-MMM-yyyy hh:mm a')}</span></div>
  <div class="row"><span>Engine:</span><span>Spark+ Roll Engine OK</span></div>
  <div class="divider"></div>
  <div class="bold" style="margin-top: 4px;">Thermal Alignment Test Passed!</div>
</body>
</html>`;

  const existingFrame = document.getElementById('thermal-print-iframe');
  if (existingFrame) existingFrame.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'thermal-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc || !iframe.contentWindow) return;

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  }, 350);
}
