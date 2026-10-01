/**
 * High-precision Code 128 Barcode Generator.
 * Produces crisp, standard vector SVGs scannable by all commercial 1D/2D barcode guns,
 * laser scanners, and mobile camera apps.
 */

// Code 128 Pattern Table (Code Set B)
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0-9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10-19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20-29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30-39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40-49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50-59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60-69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70-79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80-89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90-99
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112', // 100-106 (106 is STOP)
];

const START_B = 104;
const STOP = 106;

/**
 * Encodes an ASCII string into Code 128 (Set B) bit string
 */
export function encodeCode128(text: string): string {
  if (!text) return '';

  const codes: number[] = [START_B];
  let checksum = START_B;

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    // Code 128 Set B covers ASCII 32 (space) to 126 (~)
    const code = charCode >= 32 && charCode <= 126 ? charCode - 32 : 0;
    codes.push(code);
    checksum += code * (i + 1);
  }

  const checkDigit = checksum % 103;
  codes.push(checkDigit);
  codes.push(STOP);

  let bitPattern = '';
  codes.forEach((c) => {
    const pattern = CODE128_PATTERNS[c] || CODE128_PATTERNS[0];
    let isBar = true;
    for (let j = 0; j < pattern.length; j++) {
      const width = parseInt(pattern[j], 10);
      bitPattern += (isBar ? '1' : '0').repeat(width);
      isBar = !isBar;
    }
  });

  return bitPattern;
}

export interface BarcodeRenderOptions {
  width?: number; // total width in px
  height?: number; // bar height in px
  barWidth?: number; // module width
  showText?: boolean;
  fontSize?: number;
  companyName?: string;
  productName?: string;
  price?: number;
}

/**
 * Generates an SVG string of a Code 128 barcode
 */
export function generateBarcodeSVG(text: string, options: BarcodeRenderOptions = {}): string {
  const safeText = text.trim() || 'SAMPLE';
  const bits = encodeCode128(safeText);

  const barWidth = options.barWidth || 2;
  const barHeight = options.height || 50;
  const quietZone = 20;
  const totalWidth = bits.length * barWidth + quietZone * 2;
  const totalHeight = barHeight + (options.showText ? 24 : 10);

  let rects = '';
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '1') {
      const x = quietZone + i * barWidth;
      rects += `<rect x="${x}" y="5" width="${barWidth}" height="${barHeight}" fill="#0f172a" />`;
    }
  }

  const textElement = options.showText
    ? `<text x="${totalWidth / 2}" y="${barHeight + 20}" font-family="monospace, Courier, sans-serif" font-size="${options.fontSize || 12}" font-weight="600" text-anchor="middle" fill="#0f172a" letter-spacing="1">${safeText}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
    <rect width="${totalWidth}" height="${totalHeight}" fill="#ffffff" />
    ${rects}
    ${textElement}
  </svg>`;
}
