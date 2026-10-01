'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FileText,
  FileSpreadsheet,
  Download,
  Calendar as CalendarIcon,
  Building2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Scale,
  Receipt,
  ShieldCheck,
  FileCode,
  Info,
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval, differenceInDays } from 'date-fns';
import type { Sale, Purchase, Product, Vendor, CompanyProfile } from '@/lib/types';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => jsPDF;
}

interface GSTReportProps {
  allSales: Sale[] | null;
  allPurchases: Purchase[] | null;
  products: Product[] | null;
  vendors: Vendor[] | null;
  companyProfile?: CompanyProfile | null;
}

const GST_STATE_CODES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
};

export function GSTReport({
  allSales,
  allPurchases,
  products,
  vendors,
  companyProfile,
}: GSTReportProps) {
  // Generate options for the last 12 months for small business monthly filing
  const monthOptions = useMemo(() => {
    const list = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = subMonths(now, i);
      const value = format(d, 'yyyy-MM');
      const label = format(d, 'MMMM yyyy');
      list.push({ value, label, date: d });
    }
    return list;
  }, []);

  const [selectedMonth, setSelectedMonth] = useState<string>(monthOptions[0]?.value || format(new Date(), 'yyyy-MM'));
  const [supplyType, setSupplyType] = useState<'intra' | 'inter'>('intra'); // Intra (CGST+SGST) vs Inter (IGST)

  const selectedMonthDate = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    return new Date(year, month - 1, 1);
  }, [selectedMonth]);

  const monthInterval = useMemo(() => {
    return {
      start: startOfMonth(selectedMonthDate),
      end: endOfMonth(selectedMonthDate),
    };
  }, [selectedMonthDate]);

  // Company GSTIN Details
  const companyGstin = companyProfile?.gstNumber?.trim() || '33AAAAA0000A1Z5';
  const stateCode = companyGstin.slice(0, 2);
  const homeState = GST_STATE_CODES[stateCode] || 'Tamil Nadu';

  // Compliance Deadlines for Selected Month
  const complianceStatus = useMemo(() => {
    const now = new Date();
    // Return period is selectedMonthDate. Due dates are in the following month:
    const nextMonth = new Date(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth() + 1, 1);
    const gstr1DueDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 11);
    const gstr3bDueDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 20);

    const gstr1Days = differenceInDays(gstr1DueDate, now);
    const gstr3bDays = differenceInDays(gstr3bDueDate, now);

    return {
      gstr1DueDate,
      gstr3bDueDate,
      gstr1Days,
      gstr3bDays,
      isPastPeriod: now > gstr3bDueDate,
      isCurrentPeriod: selectedMonth === format(now, 'yyyy-MM'),
    };
  }, [selectedMonth, selectedMonthDate]);

  // Filter Sales for Selected Month
  const monthSales = useMemo(() => {
    if (!allSales) return [];
    return allSales.filter((s) => {
      try {
        const d = new Date(s.date);
        return isWithinInterval(d, monthInterval);
      } catch {
        return false;
      }
    });
  }, [allSales, monthInterval]);

  // Filter Purchases for Selected Month
  const monthPurchases = useMemo(() => {
    if (!allPurchases) return [];
    return allPurchases.filter((p) => {
      try {
        const d = new Date(p.date);
        return isWithinInterval(d, monthInterval);
      } catch {
        return false;
      }
    });
  }, [allPurchases, monthInterval]);

  // Map of vendor ID / Name to Vendor details
  const vendorMap = useMemo(() => {
    const map = new Map<string, Vendor>();
    vendors?.forEach((v) => {
      map.set(v.id, v);
      if (v.companyName) map.set(v.companyName.toLowerCase().trim(), v);
    });
    return map;
  }, [vendors]);

  // Map of product ID to Product details
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products?.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  // GSTR-1 Outward Supplies Analysis
  const gstr1Data = useMemo(() => {
    const rateWiseMap = new Map<
      number,
      { rate: number; taxable: number; cgst: number; sgst: number; igst: number; total: number; count: number }
    >();
    const hsnMap = new Map<
      string,
      { hsn: string; name: string; qty: number; taxable: number; rate: number; cgst: number; sgst: number; igst: number; total: number }
    >();

    const b2bInvoices: any[] = [];
    const b2cInvoices: any[] = [];

    let totalTaxable = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let totalInvoiceValue = 0;

    monthSales.forEach((sale) => {
      totalInvoiceValue += sale.total || 0;
      const isInter = supplyType === 'inter';

      // Check if B2B: if customer has GSTIN (checked via address/notes or 15-char code)
      const gstinMatch = (sale.customerAddress || '' + sale.notes || '').match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/);
      const isB2B = Boolean(gstinMatch);

      if (isB2B) {
        b2bInvoices.push({
          ...sale,
          customerGstin: gstinMatch ? gstinMatch[0] : 'N/A',
        });
      } else {
        b2cInvoices.push(sale);
      }

      if (sale.items && sale.items.length > 0) {
        sale.items.forEach((item) => {
          const rate = item.gstPercentage || 18;
          const taxable = item.total || 0;
          const tax = (taxable * rate) / 100;
          const cgst = isInter ? 0 : tax / 2;
          const sgst = isInter ? 0 : tax / 2;
          const igst = isInter ? tax : 0;

          totalTaxable += taxable;
          totalCgst += cgst;
          totalSgst += sgst;
          totalIgst += igst;

          // Rate breakdown
          const currentRate = rateWiseMap.get(rate) || {
            rate,
            taxable: 0,
            cgst: 0,
            sgst: 0,
            igst: 0,
            total: 0,
            count: 0,
          };
          currentRate.taxable += taxable;
          currentRate.cgst += cgst;
          currentRate.sgst += sgst;
          currentRate.igst += igst;
          currentRate.total += taxable + tax;
          currentRate.count += 1;
          rateWiseMap.set(rate, currentRate);

          // HSN Summary
          const hsnKey = item.productName || 'General Item';
          const currentHsn = hsnMap.get(hsnKey) || {
            hsn: '9988', // Standard SAC/HSN fallback
            name: item.productName || 'Products',
            qty: 0,
            taxable: 0,
            rate,
            cgst: 0,
            sgst: 0,
            igst: 0,
            total: 0,
          };
          currentHsn.qty += item.quantity || 1;
          currentHsn.taxable += taxable;
          currentHsn.cgst += cgst;
          currentHsn.sgst += sgst;
          currentHsn.igst += igst;
          currentHsn.total += taxable + tax;
          hsnMap.set(hsnKey, currentHsn);
        });
      } else {
        // Fallback for sales without line items
        const taxable = sale.subtotal || sale.total * 0.8475;
        const tax = sale.gstAmount || sale.total - taxable;
        const rate = taxable > 0 ? Math.round((tax / taxable) * 100) : 18;
        const cgst = isInter ? 0 : tax / 2;
        const sgst = isInter ? 0 : tax / 2;
        const igst = isInter ? tax : 0;

        totalTaxable += taxable;
        totalCgst += cgst;
        totalSgst += sgst;
        totalIgst += igst;

        const currentRate = rateWiseMap.get(rate) || {
          rate,
          taxable: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          total: 0,
          count: 0,
        };
        currentRate.taxable += taxable;
        currentRate.cgst += cgst;
        currentRate.sgst += sgst;
        currentRate.igst += igst;
        currentRate.total += taxable + tax;
        currentRate.count += 1;
        rateWiseMap.set(rate, currentRate);
      }
    });

    // Document series
    const sortedInvoices = [...monthSales].sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber));
    const firstInvoice = sortedInvoices[0]?.invoiceNumber || '—';
    const lastInvoice = sortedInvoices[sortedInvoices.length - 1]?.invoiceNumber || '—';

    return {
      totalTaxable,
      totalCgst,
      totalSgst,
      totalIgst,
      totalTax: totalCgst + totalSgst + totalIgst,
      totalInvoiceValue,
      rateWiseBreakdown: Array.from(rateWiseMap.values()).sort((a, b) => a.rate - b.rate),
      hsnSummary: Array.from(hsnMap.values()),
      b2bInvoices,
      b2cInvoices,
      docSummary: {
        from: firstInvoice,
        to: lastInvoice,
        totalIssued: monthSales.length,
        cancelled: 0,
        netIssued: monthSales.length,
      },
    };
  }, [monthSales, supplyType]);

  // GSTR-3B Input Tax Credit (ITC) from Purchases
  const itcData = useMemo(() => {
    let totalPurchaseValue = 0;
    let totalTaxablePurchase = 0;
    let eligibleCgstItc = 0;
    let eligibleSgstItc = 0;
    let eligibleIgstItc = 0;

    const purchaseList = monthPurchases.map((purchase) => {
      totalPurchaseValue += purchase.totalAmount || 0;
      const vendor =
        (purchase.vendorId ? vendorMap.get(purchase.vendorId) : undefined) ||
        (purchase.supplierName ? vendorMap.get(purchase.supplierName.toLowerCase().trim()) : undefined);

      const hasGst = Boolean(vendor && vendor.gstNo && vendor.gstNo.trim().length >= 10);
      const isInter = supplyType === 'inter';

      // Estimate taxable & tax (default 18% GST if not broken down)
      const baseTaxable = (purchase.totalAmount || 0) / 1.18;
      const taxAmount = (purchase.totalAmount || 0) - baseTaxable;

      totalTaxablePurchase += baseTaxable;

      // Inward ITC is eligible when purchased from registered GST supplier
      const cgst = hasGst && !isInter ? taxAmount / 2 : 0;
      const sgst = hasGst && !isInter ? taxAmount / 2 : 0;
      const igst = hasGst && isInter ? taxAmount : 0;

      eligibleCgstItc += cgst;
      eligibleSgstItc += sgst;
      eligibleIgstItc += igst;

      return {
        ...purchase,
        vendorGstNo: (vendor && vendor.gstNo) ? vendor.gstNo : 'Unregistered',
        isEligibleItc: hasGst,
        taxable: baseTaxable,
        cgst,
        sgst,
        igst,
        taxAmount,
      };
    });

    return {
      totalPurchaseValue,
      totalTaxablePurchase,
      eligibleCgstItc,
      eligibleSgstItc,
      eligibleIgstItc,
      totalEligibleItc: eligibleCgstItc + eligibleSgstItc + eligibleIgstItc,
      purchaseList,
    };
  }, [monthPurchases, vendorMap, supplyType]);

  // Net Tax Computation (Table 6.1 GSTR-3B)
  const taxComputation = useMemo(() => {
    const outputCgst = gstr1Data.totalCgst;
    const outputSgst = gstr1Data.totalSgst;
    const outputIgst = gstr1Data.totalIgst;
    const totalOutput = gstr1Data.totalTax;

    const itcCgst = itcData.eligibleCgstItc;
    const itcSgst = itcData.eligibleSgstItc;
    const itcIgst = itcData.eligibleIgstItc;
    const totalItc = itcData.totalEligibleItc;

    const netCgstPayable = Math.max(0, outputCgst - itcCgst);
    const netSgstPayable = Math.max(0, outputSgst - itcSgst);
    const netIgstPayable = Math.max(0, outputIgst - itcIgst);
    const netCashPayable = netCgstPayable + netSgstPayable + netIgstPayable;

    const cgstCreditBalance = Math.max(0, itcCgst - outputCgst);
    const sgstCreditBalance = Math.max(0, itcSgst - outputSgst);
    const igstCreditBalance = Math.max(0, itcIgst - outputIgst);
    const totalItcCarriedForward = cgstCreditBalance + sgstCreditBalance + igstCreditBalance;

    return {
      outputCgst,
      outputSgst,
      outputIgst,
      totalOutput,
      itcCgst,
      itcSgst,
      itcIgst,
      totalItc,
      netCgstPayable,
      netSgstPayable,
      netIgstPayable,
      netCashPayable,
      cgstCreditBalance,
      sgstCreditBalance,
      igstCreditBalance,
      totalItcCarriedForward,
    };
  }, [gstr1Data, itcData]);

  // Export GSTR-1 CSV / Excel
  const handleExportGSTR1CSV = () => {
    const periodLabel = format(selectedMonthDate, 'MMMyyyy');
    let csv = `GSTR-1 Outward Supplies Report - ${format(selectedMonthDate, 'MMMM yyyy')}\n`;
    csv += `Company GSTIN: ${companyGstin}, Legal Name: ${companyProfile?.companyName || 'WinTech-Spark'}\n\n`;

    // Table 7 B2C Summary
    csv += `TABLE 7 - B2C (SMALL) DETAILS\n`;
    csv += `Type,Place of Supply,Rate (%),Taxable Value (Rs),CGST (Rs),SGST (Rs),IGST (Rs),Total Invoice Value (Rs)\n`;
    gstr1Data.rateWiseBreakdown.forEach((r) => {
      csv += `OE,${homeState},${r.rate}%,${r.taxable.toFixed(2)},${r.cgst.toFixed(2)},${r.sgst.toFixed(2)},${r.igst.toFixed(2)},${r.total.toFixed(2)}\n`;
    });
    csv += `Total,,${gstr1Data.totalTaxable.toFixed(2)},${gstr1Data.totalCgst.toFixed(2)},${gstr1Data.totalSgst.toFixed(2)},${gstr1Data.totalIgst.toFixed(2)},${gstr1Data.totalInvoiceValue.toFixed(2)}\n\n`;

    // Table 12 HSN Summary
    csv += `TABLE 12 - HSN-WISE SUMMARY OF OUTWARD SUPPLIES\n`;
    csv += `HSN/SAC,Description,UQC,Total Qty,Total Value (Rs),Taxable Value (Rs),Rate (%),CGST (Rs),SGST (Rs),IGST (Rs)\n`;
    gstr1Data.hsnSummary.forEach((h) => {
      csv += `${h.hsn},"${h.name}",NOS,${h.qty},${h.total.toFixed(2)},${h.taxable.toFixed(2)},${h.rate}%,${h.cgst.toFixed(2)},${h.sgst.toFixed(2)},${h.igst.toFixed(2)}\n`;
    });
    csv += `\n`;

    // Table 13 Document Summary
    csv += `TABLE 13 - DOCUMENTS ISSUED DURING THE TAX PERIOD\n`;
    csv += `Nature of Document,Sr. No. From,Sr. No. To,Total Number,Cancelled,Net Issued\n`;
    csv += `Invoices for outward supply,${gstr1Data.docSummary.from},${gstr1Data.docSummary.to},${gstr1Data.docSummary.totalIssued},0,${gstr1Data.docSummary.netIssued}\n\n`;

    // Individual Invoices List
    csv += `DETAILED SALES INVOICES\n`;
    csv += `Invoice No,Date,Customer,Customer GSTIN,Taxable (Rs),GST Amount (Rs),Total (Rs),Status\n`;
    monthSales.forEach((s) => {
      csv += `${s.invoiceNumber},${format(new Date(s.date), 'dd-MMM-yyyy')},"${s.customerName || 'Consumer'}",N/A,${(s.subtotal || 0).toFixed(2)},${(s.gstAmount || 0).toFixed(2)},${(s.total || 0).toFixed(2)},${s.paymentStatus}\n`;
    });

    downloadCSV(csv, `GSTR1_${companyGstin}_${periodLabel}.csv`);
  };

  // Export GSTR-3B CSV / Excel
  const handleExportGSTR3BCSV = () => {
    const periodLabel = format(selectedMonthDate, 'MMMyyyy');
    let csv = `GSTR-3B Monthly Return Summary - ${format(selectedMonthDate, 'MMMM yyyy')}\n`;
    csv += `Company GSTIN: ${companyGstin}, Trade Name: ${companyProfile?.companyName || 'WinTech-Spark'}\n\n`;

    csv += `3.1 DETAILS OF OUTWARD SUPPLIES\n`;
    csv += `Nature of Supply,Total Taxable Value (Rs),Integrated Tax (Rs),Central Tax (Rs),State/UT Tax (Rs),Total Tax (Rs)\n`;
    csv += `(a) Outward taxable supplies (other than zero rated nil and exempt),${gstr1Data.totalTaxable.toFixed(2)},${gstr1Data.totalIgst.toFixed(2)},${gstr1Data.totalCgst.toFixed(2)},${gstr1Data.totalSgst.toFixed(2)},${gstr1Data.totalTax.toFixed(2)}\n\n`;

    csv += `4. ELIGIBLE INPUT TAX CREDIT (ITC)\n`;
    csv += `Details,Integrated Tax (Rs),Central Tax (Rs),State/UT Tax (Rs),Total ITC (Rs)\n`;
    csv += `(A)(5) All Other ITC (From Registered Vendors),${itcData.eligibleIgstItc.toFixed(2)},${itcData.eligibleCgstItc.toFixed(2)},${itcData.eligibleSgstItc.toFixed(2)},${itcData.totalEligibleItc.toFixed(2)}\n\n`;

    csv += `6.1 PAYMENT OF TAX (NET LIABILITY COMPUTATION)\n`;
    csv += `Description,Output Tax (Rs),Input Credit Utilized (Rs),Net Tax Payable in Cash (Rs),Credit Carried Forward (Rs)\n`;
    csv += `Central Tax (CGST),${taxComputation.outputCgst.toFixed(2)},${taxComputation.itcCgst.toFixed(2)},${taxComputation.netCgstPayable.toFixed(2)},${taxComputation.cgstCreditBalance.toFixed(2)}\n`;
    csv += `State/UT Tax (SGST),${taxComputation.outputSgst.toFixed(2)},${taxComputation.itcSgst.toFixed(2)},${taxComputation.netSgstPayable.toFixed(2)},${taxComputation.sgstCreditBalance.toFixed(2)}\n`;
    csv += `Integrated Tax (IGST),${taxComputation.outputIgst.toFixed(2)},${taxComputation.itcIgst.toFixed(2)},${taxComputation.netIgstPayable.toFixed(2)},${taxComputation.igstCreditBalance.toFixed(2)}\n`;
    csv += `TOTAL CASH PAYABLE VIA CHALLAN: Rs ${taxComputation.netCashPayable.toFixed(2)}\n`;
    csv += `TOTAL EXCESS ITC CARRIED FORWARD: Rs ${taxComputation.totalItcCarriedForward.toFixed(2)}\n`;

    downloadCSV(csv, `GSTR3B_${companyGstin}_${periodLabel}.csv`);
  };

  // Export GSTR-1 Portal-Ready JSON
  const handleExportGSTR1JSON = () => {
    const fp = format(selectedMonthDate, 'MMyyyy');
    const jsonPayload = {
      gstin: companyGstin,
      fp,
      version: 'GSTR1_3.0.4',
      hash: 'hash_sum_generated',
      b2cs: gstr1Data.rateWiseBreakdown.map((r) => ({
        sply_ty: supplyType === 'inter' ? 'INTER' : 'INTRA',
        rt: r.rate,
        typ: 'OE',
        pos: stateCode,
        txval: parseFloat(r.taxable.toFixed(2)),
        iamt: parseFloat(r.igst.toFixed(2)),
        camt: parseFloat(r.cgst.toFixed(2)),
        samt: parseFloat(r.sgst.toFixed(2)),
        csamt: 0.0,
      })),
      hsn: {
        data: gstr1Data.hsnSummary.map((h, idx) => ({
          num: idx + 1,
          hsn_sc: h.hsn,
          desc: h.name,
          uqc: 'NOS',
          qty: h.qty,
          val: parseFloat(h.total.toFixed(2)),
          txval: parseFloat(h.taxable.toFixed(2)),
          iamt: parseFloat(h.igst.toFixed(2)),
          camt: parseFloat(h.cgst.toFixed(2)),
          samt: parseFloat(h.sgst.toFixed(2)),
          csamt: 0.0,
        })),
      },
      doc_issue: {
        doc_det: [
          {
            doc_num: 1,
            doc_typ: 'Invoices for outward supply',
            docs: [
              {
                num: 1,
                from: gstr1Data.docSummary.from,
                to: gstr1Data.docSummary.to,
                totnum: gstr1Data.docSummary.totalIssued,
                canc: 0,
                net_issue: gstr1Data.docSummary.netIssued,
              },
            ],
          },
        ],
      },
    };

    const jsonString = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(jsonPayload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `GSTR1_${companyGstin}_${fp}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Export PDF Report
  const handleExportPDF = () => {
    const doc = new jsPDF() as jsPDFWithAutoTable;
    const periodStr = format(selectedMonthDate, 'MMMM yyyy');

    // Header
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text(`${companyProfile?.companyName || 'WinTech-Spark'} - GST Monthly Summary`, 14, 16);

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`GSTIN: ${companyGstin} | State: ${homeState} (Code: ${stateCode})`, 14, 22);
    doc.text(`Return Period: ${periodStr} | Generated on: ${format(new Date(), 'dd-MMM-yyyy HH:mm')}`, 14, 27);

    // Summary Metric Box
    doc.autoTable({
      startY: 33,
      head: [['GST Return Compliance & Summary', 'Amount (INR)']],
      body: [
        ['Total Taxable Sales Turnover (Outward)', `Rs ${gstr1Data.totalTaxable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`],
        ['Total Output GST Liability (Sales)', `Rs ${gstr1Data.totalTax.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`],
        ['Total Eligible Input Tax Credit (ITC on Purchases)', `Rs ${itcData.totalEligibleItc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`],
        ['NET CASH TAX PAYABLE (Challan)', `Rs ${taxComputation.netCashPayable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`],
        ['EXCESS ITC CREDIT CARRIED FORWARD', `Rs ${taxComputation.totalItcCarriedForward.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`],
      ],
      theme: 'striped',
      headStyles: { fillColor: [44, 62, 80] },
    });

    // GSTR-3B Table 3.1 & 6.1
    const nextY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text('GSTR-3B: Outward Supplies & Net Cash Tax Payable', 14, nextY);

    doc.autoTable({
      startY: nextY + 3,
      head: [['Tax Head', 'Output Liability (Rs)', 'ITC Offset (Rs)', 'Net Cash Payable (Rs)', 'ITC Balance (Rs)']],
      body: [
        ['Central Tax (CGST)', taxComputation.outputCgst.toFixed(2), taxComputation.itcCgst.toFixed(2), taxComputation.netCgstPayable.toFixed(2), taxComputation.cgstCreditBalance.toFixed(2)],
        ['State/UT Tax (SGST)', taxComputation.outputSgst.toFixed(2), taxComputation.itcSgst.toFixed(2), taxComputation.netSgstPayable.toFixed(2), taxComputation.sgstCreditBalance.toFixed(2)],
        ['Integrated Tax (IGST)', taxComputation.outputIgst.toFixed(2), taxComputation.itcIgst.toFixed(2), taxComputation.netIgstPayable.toFixed(2), taxComputation.igstCreditBalance.toFixed(2)],
        ['TOTAL', taxComputation.totalOutput.toFixed(2), taxComputation.totalItc.toFixed(2), taxComputation.netCashPayable.toFixed(2), taxComputation.totalItcCarriedForward.toFixed(2)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235] },
    });

    // Rate-wise Table
    const rateY = (doc as any).lastAutoTable.finalY + 8;
    doc.text('GSTR-1: Rate-Wise Outward Supplies (Table 7 B2C Small)', 14, rateY);
    doc.autoTable({
      startY: rateY + 3,
      head: [['GST Rate', 'Taxable Turnover (Rs)', 'CGST (Rs)', 'SGST (Rs)', 'IGST (Rs)', 'Gross Total (Rs)']],
      body: gstr1Data.rateWiseBreakdown.map((r) => [
        `${r.rate}%`,
        r.taxable.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        r.cgst.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        r.sgst.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        r.igst.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
        r.total.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
    });

    doc.save(`GST_Report_${companyGstin}_${periodStr}.pdf`);
  };

  const downloadCSV = (content: string, filename: string) => {
    const encoded = encodeURI('data:text/csv;charset=utf-8,' + content);
    const link = document.createElement('a');
    link.setAttribute('href', encoded);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="space-y-3">
      {/* Filing Header Bar & Compliance Controls */}
      <Card className="border-indigo-500/20 bg-gradient-to-r from-indigo-500/5 via-card to-card">
        <CardContent className="p-3.5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Left: GSTIN & Company Info */}
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-sm flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Indian GST Monthly Compliance
                </span>
                <Badge variant="outline" className="font-mono text-xs px-2 py-0.5 h-6 bg-background">
                  GSTIN: {companyGstin}
                </Badge>
                <Badge variant="secondary" className="text-xs px-2 py-0.5 h-6">
                  {homeState} ({stateCode})
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Automated monthly return computations for small business filers (GSTR-1 &amp; GSTR-3B).
              </p>
            </div>

            {/* Right: Month Selector, Supply Type & Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-background border rounded-md px-2 py-1 shadow-2xs">
                <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-medium text-muted-foreground">Return Period:</span>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="h-7 text-xs w-[145px] border-0 bg-transparent shadow-none focus:ring-0 p-0 font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {monthOptions.map((m) => (
                      <SelectItem key={m.value} value={m.value} className="text-xs">
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Supply Mode */}
              <div className="flex items-center gap-1 bg-background border rounded-md p-0.5 text-xs shadow-2xs">
                <button
                  type="button"
                  onClick={() => setSupplyType('intra')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    supplyType === 'intra' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Intra-State: CGST (50%) + SGST (50%)"
                >
                  Intra-State
                </button>
                <button
                  type="button"
                  onClick={() => setSupplyType('inter')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    supplyType === 'inter' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Inter-State: Integrated Tax (IGST 100%)"
                >
                  Inter-State
                </button>
              </div>

              {/* Export Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="h-8 gap-1.5 text-xs shadow-sm">
                    <Download className="h-3.5 w-3.5" />
                    <span>Export GST Return</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={handleExportPDF} className="text-xs gap-2">
                    <FileText className="h-3.5 w-3.5 text-red-500" />
                    Official GST Summary (PDF)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportGSTR1CSV} className="text-xs gap-2">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                    GSTR-1 Outward Sales (CSV)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportGSTR3BCSV} className="text-xs gap-2">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-indigo-600" />
                    GSTR-3B Monthly Return (CSV)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleExportGSTR1JSON} className="text-xs gap-2">
                    <FileCode className="h-3.5 w-3.5 text-blue-600" />
                    GSTR-1 JSON (GST Portal Format)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Deadlines & Compliance Status Bar */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-center justify-between p-2.5 rounded-lg border bg-gradient-to-r from-violet-500/10 via-background to-background">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400 flex items-center justify-center font-bold text-xs">
              GSTR-1
            </div>
            <div>
              <div className="text-xs font-semibold">GSTR-1 (Outward Sales Return)</div>
              <div className="text-[11px] text-muted-foreground">
                Due by 11th of succeeding month: <span className="font-semibold">{format(complianceStatus.gstr1DueDate, 'dd-MMM-yyyy')}</span>
              </div>
            </div>
          </div>
          <Badge
            variant="outline"
            className={
              complianceStatus.gstr1Days >= 0
                ? 'bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30 text-[10px]'
                : 'bg-muted text-muted-foreground text-[10px]'
            }
          >
            <Clock className="h-3 w-3 mr-1" />
            {complianceStatus.gstr1Days >= 0 ? `${complianceStatus.gstr1Days}d left` : 'Filed / Period closed'}
          </Badge>
        </div>

        <div className="flex items-center justify-between p-2.5 rounded-lg border bg-gradient-to-r from-indigo-500/10 via-background to-background">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
              GSTR-3B
            </div>
            <div>
              <div className="text-xs font-semibold">GSTR-3B (Summary &amp; Tax Payment)</div>
              <div className="text-[11px] text-muted-foreground">
                Due by 20th of succeeding month: <span className="font-semibold">{format(complianceStatus.gstr3bDueDate, 'dd-MMM-yyyy')}</span>
              </div>
            </div>
          </div>
          <Badge
            variant="outline"
            className={
              complianceStatus.gstr3bDays >= 0
                ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30 text-[10px]'
                : 'bg-muted text-muted-foreground text-[10px]'
            }
          >
            <Clock className="h-3 w-3 mr-1" />
            {complianceStatus.gstr3bDays >= 0 ? `${complianceStatus.gstr3bDays}d left` : 'Filed / Period closed'}
          </Badge>
        </div>
      </div>

      {/* 4 Summary Stat Cards */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {/* Output Tax */}
        <Card className="border-rose-500/20 bg-gradient-to-br from-rose-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Output GST Liability</CardTitle>
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500">
              <ArrowUpRight className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="text-xl font-bold text-rose-600 dark:text-rose-400">
              ₹{gstr1Data.totalTax.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Tax on {monthSales.length} invoice{monthSales.length === 1 ? '' : 's'} (Sales)
            </p>
          </CardContent>
        </Card>

        {/* Input Tax Credit (ITC) */}
        <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Input Tax Credit (ITC)</CardTitle>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
              <ArrowDownLeft className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
              ₹{itcData.totalEligibleItc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Eligible GST credit from {monthPurchases.length} purchases
            </p>
          </CardContent>
        </Card>

        {/* Net Tax Payable in Cash */}
        <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Net Cash Tax to Pay</CardTitle>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
              <Scale className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
              ₹{taxComputation.netCashPayable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {taxComputation.netCashPayable > 0 ? 'Payable via Challan / PMT-06' : '₹0 (Fully offset by ITC!)'}
            </p>
          </CardContent>
        </Card>

        {/* Excess ITC / Taxable Sales */}
        <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground">
              {taxComputation.totalItcCarriedForward > 0 ? 'Excess ITC Balance' : 'Taxable Turnover'}
            </CardTitle>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
              <Receipt className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
              {taxComputation.totalItcCarriedForward > 0
                ? `₹${taxComputation.totalItcCarriedForward.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                : `₹${gstr1Data.totalTaxable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {taxComputation.totalItcCarriedForward > 0 ? 'Carried forward to next month' : 'Net sales excluding GST'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main GST Sub-Tabs */}
      <Tabs defaultValue="gstr3b" className="w-full">
        <TabsList className="h-8 p-0.5">
          <TabsTrigger value="gstr3b" className="text-xs px-3 h-7">
            GSTR-3B Summary &amp; Tax Computation
          </TabsTrigger>
          <TabsTrigger value="gstr1" className="text-xs px-3 h-7">
            GSTR-1 Outward Supplies (Sales)
          </TabsTrigger>
          <TabsTrigger value="itc" className="text-xs px-3 h-7">
            Inward Supplies &amp; ITC (Purchases)
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: GSTR-3B */}
        <TabsContent value="gstr3b" className="space-y-3 mt-2">
          {/* Table 3.1 & 4 Combined View */}
          <Card>
            <CardHeader className="p-3 pb-2 space-y-1 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  GSTR-3B Table 3.1 &amp; Table 4 Summary
                </CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  Filing Period: {format(selectedMonthDate, 'MMMM yyyy')}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Copy these numbers directly into the GST Portal when filing monthly GSTR-3B.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[200px]">Description / Return Table</TableHead>
                    <TableHead className="w-[140px] text-right">Taxable Value</TableHead>
                    <TableHead className="w-[120px] text-right">CGST</TableHead>
                    <TableHead className="w-[120px] text-right">SGST</TableHead>
                    <TableHead className="w-[120px] text-right">IGST</TableHead>
                    <TableHead className="w-[130px] text-right font-semibold">Total Tax</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Row 1: Outward Taxable */}
                  <TableRow>
                    <TableCell>
                      <div className="font-semibold text-xs">3.1(a) Outward Taxable Supplies</div>
                      <div className="text-[11px] text-muted-foreground">Sales invoices issued to customers</div>
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      ₹{gstr1Data.totalTaxable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-xs font-medium text-rose-600 dark:text-rose-400">
                      ₹{gstr1Data.totalCgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-xs font-medium text-rose-600 dark:text-rose-400">
                      ₹{gstr1Data.totalSgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-xs font-medium text-rose-600 dark:text-rose-400">
                      ₹{gstr1Data.totalIgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-xs font-bold text-rose-600 dark:text-rose-400">
                      ₹{gstr1Data.totalTax.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>

                  {/* Row 2: Eligible ITC */}
                  <TableRow>
                    <TableCell>
                      <div className="font-semibold text-xs">4(A)(5) All Other Eligible ITC</div>
                      <div className="text-[11px] text-muted-foreground">GST credit paid to registered vendors</div>
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      ₹{itcData.totalTaxablePurchase.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      ₹{itcData.eligibleCgstItc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      ₹{itcData.eligibleSgstItc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      ₹{itcData.eligibleIgstItc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      ₹{itcData.totalEligibleItc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>

                  {/* Row 3: Net Tax Payable via Cash */}
                  <TableRow className="bg-muted/30">
                    <TableCell>
                      <div className="font-bold text-xs text-primary">6.1 Net Tax Payable in Cash</div>
                      <div className="text-[11px] text-muted-foreground">After offsetting Input Tax Credit (ITC)</div>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">—</TableCell>
                    <TableCell className="text-right text-xs font-bold">
                      ₹{taxComputation.netCgstPayable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-xs font-bold">
                      ₹{taxComputation.netSgstPayable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-xs font-bold">
                      ₹{taxComputation.netIgstPayable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-xs font-extrabold text-amber-600 dark:text-amber-400">
                      ₹{taxComputation.netCashPayable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Rate-Wise Summary Table */}
          <Card>
            <CardHeader className="p-3 pb-2 space-y-1 border-b">
              <CardTitle className="text-sm font-semibold">Rate-Wise Outward Supplies Breakdown</CardTitle>
              <CardDescription className="text-xs">
                Categorized by Indian GST tax slabs (0%, 5%, 12%, 18%, 28%).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[100px]">GST Rate</TableHead>
                    <TableHead className="text-right">Taxable Turnover</TableHead>
                    <TableHead className="text-right">CGST</TableHead>
                    <TableHead className="text-right">SGST</TableHead>
                    <TableHead className="text-right">IGST</TableHead>
                    <TableHead className="text-right">Gross Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gstr1Data.rateWiseBreakdown.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                        No sales recorded for {format(selectedMonthDate, 'MMMM yyyy')}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    gstr1Data.rateWiseBreakdown.map((r) => (
                      <TableRow key={r.rate}>
                        <TableCell>
                          <Badge variant="outline" className="font-semibold text-xs">
                            {r.rate}% Slab
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          ₹{r.taxable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          ₹{r.cgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          ₹{r.sgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          ₹{r.igst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold">
                          ₹{r.total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {gstr1Data.rateWiseBreakdown.length > 0 && (
                  <TableFooter>
                    <TableRow className="font-bold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">
                        ₹{gstr1Data.totalTaxable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{gstr1Data.totalCgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{gstr1Data.totalSgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{gstr1Data.totalIgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-extrabold">
                        ₹{gstr1Data.totalInvoiceValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: GSTR-1 */}
        <TabsContent value="gstr1" className="space-y-3 mt-2">
          {/* Table 13 Documents Issued */}
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="p-3 border rounded-lg bg-card space-y-1">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                Table 13: Invoices Issued
              </span>
              <div className="text-lg font-bold">{gstr1Data.docSummary.totalIssued} invoices</div>
              <p className="text-[11px] text-muted-foreground">
                From <span className="font-mono font-medium">{gstr1Data.docSummary.from}</span> to{' '}
                <span className="font-mono font-medium">{gstr1Data.docSummary.to}</span>
              </p>
            </div>

            <div className="p-3 border rounded-lg bg-card space-y-1">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                B2C Small (Retail Consumers)
              </span>
              <div className="text-lg font-bold">{gstr1Data.b2cInvoices.length} invoices</div>
              <p className="text-[11px] text-muted-foreground">Reported under Table 7 of GSTR-1</p>
            </div>

            <div className="p-3 border rounded-lg bg-card space-y-1">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                B2B (Registered Businesses)
              </span>
              <div className="text-lg font-bold">{gstr1Data.b2bInvoices.length} invoices</div>
              <p className="text-[11px] text-muted-foreground">Reported under Table 4 of GSTR-1</p>
            </div>
          </div>

          {/* Table 12: HSN Summary */}
          <Card>
            <CardHeader className="p-3 pb-2 space-y-1 border-b">
              <CardTitle className="text-sm font-semibold">
                Table 12: HSN-Wise Summary of Outward Supplies
              </CardTitle>
              <CardDescription className="text-xs">
                Product-level quantities and tax amounts for GSTR-1 Table 12 compliance.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[100px]">HSN/SAC</TableHead>
                    <TableHead className="min-w-[150px]">Description</TableHead>
                    <TableHead className="w-[90px] text-right">UQC / Qty</TableHead>
                    <TableHead className="w-[120px] text-right">Taxable (Rs)</TableHead>
                    <TableHead className="w-[80px] text-right">Rate</TableHead>
                    <TableHead className="w-[110px] text-right">CGST</TableHead>
                    <TableHead className="w-[110px] text-right">SGST</TableHead>
                    <TableHead className="w-[120px] text-right">Total (Rs)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gstr1Data.hsnSummary.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-6 text-xs text-muted-foreground">
                        No product sales recorded in this period.
                      </TableCell>
                    </TableRow>
                  ) : (
                    gstr1Data.hsnSummary.map((h, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{h.hsn}</TableCell>
                        <TableCell className="font-medium text-xs">{h.name}</TableCell>
                        <TableCell className="text-right text-xs">
                          {h.qty} <span className="text-[10px] text-muted-foreground">NOS</span>
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          ₹{h.taxable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-xs">{h.rate}%</TableCell>
                        <TableCell className="text-right text-xs">
                          ₹{h.cgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          ₹{h.sgst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold">
                          ₹{h.total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Sales Invoices List */}
          <Card>
            <CardHeader className="p-3 pb-2 space-y-1 border-b">
              <CardTitle className="text-sm font-semibold">Monthly Outward Invoices</CardTitle>
              <CardDescription className="text-xs">
                Individual invoices issued in {format(selectedMonthDate, 'MMMM yyyy')}.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[130px]">Invoice #</TableHead>
                    <TableHead className="w-[120px]">Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="w-[120px] text-right">Taxable</TableHead>
                    <TableHead className="w-[110px] text-right">GST Amount</TableHead>
                    <TableHead className="w-[120px] text-right">Total</TableHead>
                    <TableHead className="w-[90px] text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthSales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-xs text-muted-foreground">
                        No sales invoices found for this month.
                      </TableCell>
                    </TableRow>
                  ) : (
                    monthSales.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-semibold text-xs font-mono">{s.invoiceNumber}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(s.date), 'dd-MMM-yyyy')}
                        </TableCell>
                        <TableCell className="text-xs">{s.customerName || 'Retail Customer'}</TableCell>
                        <TableCell className="text-right text-xs">
                          ₹{(s.subtotal || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-xs font-medium text-rose-600 dark:text-rose-400">
                          ₹{(s.gstAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right font-bold text-xs whitespace-nowrap">
                          ₹{(s.total || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal">
                            {s.paymentStatus}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: PURCHASES & ITC */}
        <TabsContent value="itc" className="space-y-3 mt-2">
          <Card>
            <CardHeader className="p-3 pb-2 space-y-1 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  Inward Supplies &amp; Eligible Input Tax Credit (ITC)
                </CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  Total ITC: ₹{itcData.totalEligibleItc.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Inward purchase entries recorded from registered suppliers eligible for GSTR-3B Table 4 credit.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[120px]">Invoice No</TableHead>
                    <TableHead className="w-[120px]">Date</TableHead>
                    <TableHead className="min-w-[160px]">Supplier Name</TableHead>
                    <TableHead className="w-[140px]">Supplier GSTIN</TableHead>
                    <TableHead className="w-[110px] text-right">Taxable</TableHead>
                    <TableHead className="w-[110px] text-right">Eligible ITC</TableHead>
                    <TableHead className="w-[120px] text-right">Total Amount</TableHead>
                    <TableHead className="w-[100px] text-right">Eligibility</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itcData.purchaseList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-6 text-xs text-muted-foreground">
                        No purchase invoices recorded for this month.
                      </TableCell>
                    </TableRow>
                  ) : (
                    itcData.purchaseList.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs font-semibold">{p.invoiceNo}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(p.date), 'dd-MMM-yyyy')}
                        </TableCell>
                        <TableCell className="text-xs font-medium">{p.supplierName}</TableCell>
                        <TableCell>
                          {p.vendorGstNo !== 'Unregistered' ? (
                            <Badge variant="outline" className="font-mono text-[10px] h-5 px-1.5">
                              {p.vendorGstNo}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Unregistered</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          ₹{p.taxable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          ₹{(p.cgst + p.sgst + p.igst).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-xs font-bold whitespace-nowrap">
                          ₹{p.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right">
                          {p.isEligibleItc ? (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px] h-5">
                              Eligible
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px] h-5">
                              No GSTIN
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
