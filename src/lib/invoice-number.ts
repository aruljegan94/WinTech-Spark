/**
 * Invoice Number Utilities
 * Handles dynamic tokens ({YYYY}, {YY}, {MM}, {MMM}, {DD}, {FY}),
 * monthly auto-resets, padding, and sequence calculation.
 */

export function resolveInvoiceTokens(pattern: string = '', date: Date = new Date()): string {
  if (!pattern) return '';
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();

  const yyyy = d.getFullYear().toString();
  const yy = yyyy.slice(-2);
  const monthIndex = d.getMonth();
  const mm = String(monthIndex + 1).padStart(2, '0');
  const m = String(monthIndex + 1);
  const dd = String(d.getDate()).padStart(2, '0');
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const mmm = monthNames[monthIndex];

  // Financial Year (e.g. 26-27 for FY starting April)
  const fullYear = d.getFullYear();
  const fyStartYear = monthIndex >= 3 ? fullYear : fullYear - 1;
  const fyEndYear = fyStartYear + 1;
  const fy = `${String(fyStartYear).slice(-2)}-${String(fyEndYear).slice(-2)}`;

  return pattern
    .replace(/\{YYYY\}/gi, yyyy)
    .replace(/\{YY\}/gi, yy)
    .replace(/\{MMM\}/gi, mmm)
    .replace(/\{MM\}/gi, mm)
    .replace(/\{M\}/gi, m)
    .replace(/\{DD\}/gi, dd)
    .replace(/\{FY\}/gi, fy);
}

export function getCurrentMonthKey(date: Date = new Date()): string {
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export interface FormatInvoiceNumberOptions {
  prefix?: string;
  suffix?: string;
  sequenceNumber: number;
  date?: Date;
  padLength?: number;
}

export function formatInvoiceNumber({
  prefix = 'INV-',
  suffix = '',
  sequenceNumber,
  date = new Date(),
  padLength = 3,
}: FormatInvoiceNumberOptions): string {
  const resolvedPrefix = resolveInvoiceTokens(prefix, date);
  const resolvedSuffix = resolveInvoiceTokens(suffix, date);
  const paddedCount = String(Math.max(1, sequenceNumber)).padStart(padLength, '0');
  return `${resolvedPrefix}${paddedCount}${resolvedSuffix}`;
}

export function calculateNextSequence(
  salesCounter: { currentNumber?: number; lastResetMonth?: string } | null | undefined,
  autoResetMonthly: boolean = false,
  date: Date = new Date()
): number {
  const currentMonthKey = getCurrentMonthKey(date);
  if (autoResetMonthly && salesCounter?.lastResetMonth && salesCounter.lastResetMonth !== currentMonthKey) {
    return 1;
  }
  return (salesCounter?.currentNumber || 0) + 1;
}
