/**
 * Converts a numerical amount into Indian currency words.
 * Handles Crores, Lakhs, Thousands, Hundreds, Rupees, and Paise.
 * Example: 1534.50 -> "One Thousand Five Hundred Thirty-Four Rupees and Fifty Paise Only"
 */
export function numberToIndianWords(amount: number): string {
  if (isNaN(amount) || amount === 0) return 'Zero Rupees Only';

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
  ];

  const convertGroup = (n: number): string => {
    let output = '';
    if (n >= 100) {
      output += ones[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      output += tens[Math.floor(n / 10)] + ' ';
      n %= 10;
    } else if (n >= 10) {
      output += ones[n] + ' ';
      n = 0;
    }
    if (n > 0) {
      output += ones[n] + ' ';
    }
    return output.trim();
  };

  const integerPart = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - integerPart) * 100);

  if (integerPart === 0 && paise > 0) {
    return `${convertGroup(paise)} Paise Only`;
  }

  let n = integerPart;
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const remainder = n;

  let words = '';
  if (crore > 0) words += convertGroup(crore) + ' Crore ';
  if (lakh > 0) words += convertGroup(lakh) + ' Lakh ';
  if (thousand > 0) words += convertGroup(thousand) + ' Thousand ';
  if (remainder > 0) words += convertGroup(remainder) + ' ';

  words = words.trim() + ' Rupees';

  if (paise > 0) {
    words += ' and ' + convertGroup(paise) + ' Paise';
  }

  return words + ' Only';
}
