'use client';

import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import {
  FileText,
  Upload,
  Loader2,
  Sparkles,
  CheckCircle2,
  Plus,
  Trash2,
  Scan,
  PackageCheck,
  PackagePlus,
  AlertCircle,
  ExternalLink,
  Barcode,
  Tag,
  Receipt,
  Info,
} from 'lucide-react';
import type { Product } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase';
import { collection, doc, runTransaction } from 'firebase/firestore';
import { parsePurchaseInvoice } from '@/ai/flows/parse-purchase-invoice';
import type { ParsePurchaseInvoiceOutput } from '@/ai/flows/parse-purchase-invoice-types';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/utils';

interface PurchaseOcrModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  products?: Product[];
  onPurchaseRecorded?: () => void;
}

export interface PurchaseOcrItem {
  productName: string;
  partNumber: string; // SKU / Barcode / Item code
  quantity: number;
  purchasePrice: number; // Unit rate from bill
  gstPercentage: number;
  mrp?: number; // Extracted MRP
  sellingPrice: number; // Selling price (from MRP or markup)
  amountWithGst: number;
  matchedProductId?: string;
  matchedBy?: 'barcode' | 'name';
}

export function PurchaseOcrModal({
  isOpen,
  onOpenChange,
  products = [],
  onPurchaseRecorded,
}: PurchaseOcrModalProps) {
  const [step, setStep] = useState<'upload' | 'analyzing' | 'verify'>('upload');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [, setPreviewUrl] = useState<string>('');

  const [supplierName, setSupplierName] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isGstIncluded, setIsGstIncluded] = useState<boolean>(false);
  const [items, setItems] = useState<PurchaseOcrItem[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const firestore = useFirestore();
  const { toast } = useToast();

  const calculateItemTotal = (quantity: number, price: number, gst: number, gstIncluded: boolean) => {
    const q = Number(quantity) || 0;
    const p = Number(price) || 0;
    const g = Number(gst) || 0;
    if (gstIncluded) {
      // Rates printed on invoice already include GST
      return Math.round(q * p * 100) / 100;
    } else {
      // GST is calculated on top
      return Math.round(q * p * (1 + g / 100) * 100) / 100;
    }
  };

  const getBasePurchasePrice = (unitPrice: number, gst: number, gstIncluded: boolean) => {
    const p = Number(unitPrice) || 0;
    const g = Number(gst) || 0;
    if (gstIncluded && g > 0) {
      return Math.round((p / (1 + g / 100)) * 100) / 100;
    }
    return p;
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setPreviewUrl(dataUrl);
      setStep('analyzing');
      setIsAnalyzing(true);

      try {
        const result: ParsePurchaseInvoiceOutput = await parsePurchaseInvoice({ imageDataUrl: dataUrl });

        setSupplierName(result.supplierName || '');
        setInvoiceNo(result.invoiceNo || '');
        setPurchaseDate(result.date || format(new Date(), 'yyyy-MM-dd'));

        const detectedGstIncluded = Boolean(result.isGstIncluded);
        setIsGstIncluded(detectedGstIncluded);

        // Match items with existing inventory products (by Part No / Barcode first, then by Name)
        const processedItems: PurchaseOcrItem[] = (result.items || []).map((item) => {
          const partNo = (item.partNumber || '').trim();
          const name = (item.productName || '').trim();

          let matched = partNo
            ? products.find(
                (p) =>
                  p.barcode &&
                  p.barcode.trim().toLowerCase() === partNo.toLowerCase()
              )
            : undefined;
          let matchedBy: 'barcode' | 'name' | undefined = matched ? 'barcode' : undefined;

          if (!matched && name) {
            matched = products.find(
              (p) => p.productName.toLowerCase().trim() === name.toLowerCase()
            );
            if (matched) matchedBy = 'name';
          }

          const unitPrice = item.purchasePrice || 0;
          const gst = item.gstPercentage ?? 18;
          const lineTotal =
            item.amountWithGst ||
            calculateItemTotal(item.quantity || 1, unitPrice, gst, detectedGstIncluded);

          // If MRP is available, consider as selling price!
          let sellingPrice: number;
          if (typeof item.mrp === 'number' && item.mrp > 0) {
            sellingPrice = item.mrp;
          } else if (matched?.sellingPrice) {
            sellingPrice = matched.sellingPrice;
          } else {
            const baseCost = getBasePurchasePrice(unitPrice, gst, detectedGstIncluded);
            sellingPrice = Math.round(baseCost * 1.25);
          }

          return {
            productName: item.productName || 'Unspecified Part',
            partNumber: partNo,
            quantity: item.quantity || 1,
            purchasePrice: unitPrice,
            gstPercentage: gst,
            mrp: item.mrp,
            sellingPrice,
            amountWithGst: lineTotal,
            matchedProductId: matched?.id,
            matchedBy,
          };
        });

        setItems(processedItems);
        setStep('verify');
        toast({
          title: 'Invoice Parsed with AI OCR!',
          description: detectedGstIncluded
            ? 'Detected GST-inclusive rates. Part numbers and MRP selling prices extracted.'
            : 'Extracted invoice items, part numbers, and rates. Review before confirming.',
        });
      } catch (error: any) {
        console.error('OCR Parsing Error:', error);
        const msg = error.message || 'Could not parse purchase invoice. Please check the image.';
        setOcrError(msg);
        toast({
          variant: 'destructive',
          title: 'OCR Analysis Failed',
          description: msg,
        });
        setStep('upload');
      } finally {
        setIsAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleToggleGstIncluded = (checked: boolean) => {
    setIsGstIncluded(checked);
    setItems((prevItems) =>
      prevItems.map((item) => {
        const newTotal = calculateItemTotal(
          item.quantity,
          item.purchasePrice,
          item.gstPercentage,
          checked
        );
        let newSelling = item.sellingPrice;
        if (!item.mrp) {
          const baseCost = getBasePurchasePrice(item.purchasePrice, item.gstPercentage, checked);
          newSelling = Math.round(baseCost * 1.25);
        }
        return {
          ...item,
          amountWithGst: newTotal,
          sellingPrice: newSelling,
        };
      })
    );
  };

  const handleItemChange = (index: number, field: keyof PurchaseOcrItem, value: any) => {
    const updated = [...items];
    const current = { ...updated[index], [field]: value };

    // Auto calculate amountWithGst if quantity, price, or gst changes
    if (field === 'quantity' || field === 'purchasePrice' || field === 'gstPercentage') {
      const q = Number(current.quantity) || 0;
      const p = Number(current.purchasePrice) || 0;
      const gst = Number(current.gstPercentage) || 0;
      current.amountWithGst = calculateItemTotal(q, p, gst, isGstIncluded);

      // If no MRP set, auto-update default selling price
      if (!current.mrp) {
        const baseCost = getBasePurchasePrice(p, gst, isGstIncluded);
        current.sellingPrice = Math.round(baseCost * 1.25);
      }
    }

    if (field === 'mrp') {
      const mrpNum = Number(value);
      if (!isNaN(mrpNum) && mrpNum > 0) {
        current.sellingPrice = mrpNum;
      }
    }

    // Check inventory match on part number or name change
    if (field === 'partNumber' || field === 'productName') {
      const partNo = field === 'partNumber' ? String(value).trim() : current.partNumber.trim();
      const name = field === 'productName' ? String(value).trim() : current.productName.trim();

      let matched = partNo
        ? products.find((p) => p.barcode && p.barcode.trim().toLowerCase() === partNo.toLowerCase())
        : undefined;
      let matchedBy: 'barcode' | 'name' | undefined = matched ? 'barcode' : undefined;

      if (!matched && name) {
        matched = products.find((p) => p.productName.toLowerCase().trim() === name.toLowerCase());
        if (matched) matchedBy = 'name';
      }

      current.matchedProductId = matched?.id;
      current.matchedBy = matchedBy;
    }

    updated[index] = current;
    setItems(updated);
  };

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        productName: '',
        partNumber: '',
        quantity: 1,
        purchasePrice: 0,
        gstPercentage: 18,
        sellingPrice: 0,
        amountWithGst: 0,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const totalCalculatedAmount =
    Math.round(items.reduce((sum, item) => sum + (item.amountWithGst || 0), 0) * 100) / 100;

  const handleConfirmPurchase = async () => {
    if (!firestore) return;
    if (!supplierName.trim()) {
      toast({ variant: 'destructive', title: 'Supplier Name Required' });
      return;
    }
    if (items.length === 0) {
      toast({ variant: 'destructive', title: 'No Items', description: 'Please add at least one line item.' });
      return;
    }

    setIsSaving(true);
    try {
      await runTransaction(firestore, async (transaction) => {
        const purchaseRef = doc(collection(firestore, 'purchases'));

        // ── PHASE 1: Prepare all refs, then READ all existing products first ─
        const enriched = items.map((item) => ({
          item,
          isNew: !item.matchedProductId,
          existingRef: item.matchedProductId
            ? doc(firestore, 'products', item.matchedProductId)
            : null,
          newRef: !item.matchedProductId
            ? doc(collection(firestore, 'products'))
            : null,
        }));

        // Read ALL matched product docs in parallel — no writes yet
        const productDocs = await Promise.all(
          enriched.map(({ existingRef }) =>
            existingRef ? transaction.get(existingRef) : Promise.resolve(null)
          )
        );

        // ── PHASE 2: ALL WRITES (reads are complete) ──────────────────────────
        const finalItems: Array<{
          productId: string;
          productName: string;
          barcode?: string;
          quantity: number;
          purchasePrice: number;
          totalAmount: number;
        }> = [];

        enriched.forEach(({ item, isNew, existingRef, newRef }, index) => {
          const basePurchasePrice = getBasePurchasePrice(
            item.purchasePrice,
            item.gstPercentage,
            isGstIncluded
          );
          const finalSellingPrice =
            item.sellingPrice || item.mrp || Math.round(basePurchasePrice * 1.25);
          const partNoBarcode = item.partNumber.trim();

          if (isNew && newRef) {
            // Create brand-new product with SKU/barcode and selling price
            transaction.set(newRef, {
              productName: item.productName,
              barcode: partNoBarcode || '',
              category: 'General',
              purchasePrice: basePurchasePrice,
              sellingPrice: finalSellingPrice,
              stockQuantity: item.quantity,
              gstPercentage: item.gstPercentage,
            });
            finalItems.push({
              productId: newRef.id,
              productName: item.productName,
              barcode: partNoBarcode || undefined,
              quantity: item.quantity,
              purchasePrice: item.purchasePrice,
              totalAmount: item.amountWithGst,
            });
          } else if (existingRef) {
            // Update stock and prices on existing product
            const prodDoc = productDocs[index];
            if (prodDoc?.exists()) {
              const currentStock = prodDoc.data().stockQuantity || 0;
              const updateData: Record<string, any> = {
                stockQuantity: currentStock + item.quantity,
                purchasePrice: basePurchasePrice,
              };
              // Set barcode if existing product lacks one and partNo is present
              if (!prodDoc.data().barcode && partNoBarcode) {
                updateData.barcode = partNoBarcode;
              }
              // Update selling price if extracted from MRP or specified
              if (item.sellingPrice && item.sellingPrice > 0) {
                updateData.sellingPrice = finalSellingPrice;
              }
              transaction.update(existingRef, updateData);
            }
            finalItems.push({
              productId: existingRef.id,
              productName: item.productName,
              barcode: partNoBarcode || undefined,
              quantity: item.quantity,
              purchasePrice: item.purchasePrice,
              totalAmount: item.amountWithGst,
            });
          }
        });

        // Record the purchase document (final write)
        transaction.set(purchaseRef, {
          supplierName,
          invoiceNo: invoiceNo || `OCR-${Date.now().toString().slice(-6)}`,
          date: new Date(purchaseDate).toISOString(),
          items: finalItems,
          totalAmount: totalCalculatedAmount,
          isGstIncluded,
        });
      });

      toast({
        title: 'Purchase Recorded & Stock Updated!',
        description: `Successfully processed purchase invoice with ${items.length} items.`,
      });

      onPurchaseRecorded?.();
      handleReset();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error recording OCR purchase:', error);
      toast({
        variant: 'destructive',
        title: 'Error Saving Purchase',
        description: error.message || 'Failed to update inventory stock.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setStep('upload');
    setPreviewUrl('');
    setSupplierName('');
    setInvoiceNo('');
    setIsGstIncluded(false);
    setItems([]);
    setOcrError(null);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleReset();
        onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-5xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI OCR Purchase Invoice Scanner
          </DialogTitle>
          <DialogDescription>
            Upload a purchase bill or document to automatically extract line items, Part No (SKU/barcode), MRP selling prices, and update stock.
          </DialogDescription>
        </DialogHeader>

        {/* STEP 1: UPLOAD DROPZONE */}
        {step === 'upload' && (
          <div className="py-6 space-y-4">
            {ocrError && (
              <div className="p-3.5 rounded-xl border border-destructive/30 bg-destructive/10 text-xs text-destructive space-y-2">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>OCR Service Notice</span>
                </div>
                <p className="leading-relaxed">{ocrError}</p>
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setStep('verify');
                      setItems([
                        {
                          productName: '',
                          partNumber: '',
                          quantity: 1,
                          purchasePrice: 0,
                          gstPercentage: 18,
                          sellingPrice: 0,
                          amountWithGst: 0,
                        },
                      ]);
                    }}
                    className="h-7 text-xs font-semibold"
                  >
                    Enter Bill Details Manually
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => window.open('https://aistudio.google.com/app/apikey', '_blank')}
                    className="h-7 text-xs gap-1 text-primary hover:text-primary"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Get Free Gemini API Key
                  </Button>
                </div>
              </div>
            )}

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-primary/40 rounded-xl p-8 text-center bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer space-y-3"
            >
              <div className="p-3 rounded-full bg-primary/10 text-primary w-fit mx-auto">
                <Upload className="h-8 w-8" />
              </div>
              <div>
                <p className="font-semibold text-base">Click or Drag Purchase Invoice to Upload</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports Images (PNG, JPG, WEBP) & PDF documents
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" className="mt-2">
                Select File
              </Button>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />
          </div>
        )}

        {/* STEP 2: ANALYZING SPINNER */}
        {step === 'analyzing' && (
          <div className="py-12 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="relative">
              <div className="p-4 rounded-full bg-primary/15 text-primary animate-pulse">
                <Scan className="h-10 w-10 animate-spin" />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-lg flex items-center gap-2 justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Analyzing Invoice with AI OCR...
              </h3>
              <p className="text-sm text-muted-foreground">
                Extracting supplier details, Part No (SKU), MRP selling prices, and GST calculation mode.
              </p>
            </div>
          </div>
        )}

        {/* STEP 3: VERIFICATION & EDITABLE TABLE */}
        {step === 'verify' && (
          <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
            {/* Header Details + GST Inclusive Tick Box */}
            <Card className="border-primary/20 bg-muted/20">
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="ocr-supplier">Supplier Name</Label>
                    <Input
                      id="ocr-supplier"
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      placeholder="e.g. Global Auto Parts"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ocr-invoiceno">Invoice Number</Label>
                    <Input
                      id="ocr-invoiceno"
                      value={invoiceNo}
                      onChange={(e) => setInvoiceNo(e.target.value)}
                      placeholder="e.g. INV-99882"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ocr-date">Invoice Date</Label>
                    <Input
                      id="ocr-date"
                      type="date"
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* GST INCLUDED TICK BOX */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-background/80 shadow-xs">
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="ocr-gst-included"
                      checked={isGstIncluded}
                      onCheckedChange={(checked) => handleToggleGstIncluded(Boolean(checked))}
                      className="h-5 w-5 data-[state=checked]:bg-primary"
                    />
                    <div
                      className="grid gap-0.5 leading-none cursor-pointer select-none"
                      onClick={() => handleToggleGstIncluded(!isGstIncluded)}
                    >
                      <div className="flex items-center gap-2">
                        <Label htmlFor="ocr-gst-included" className="font-semibold text-sm cursor-pointer">
                          Invoice Prices Include GST (Tax Inclusive)
                        </Label>
                        {isGstIncluded ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] gap-1 font-medium">
                            <Receipt className="h-3 w-3" /> GST Included in Rate
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px] gap-1 font-medium">
                            <Receipt className="h-3 w-3" /> GST Calculated on Top
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {isGstIncluded
                          ? 'Bill rate already includes tax; base cost is calculated backwards (Rate ÷ (1 + GST%)). Total = Qty × Rate.'
                          : 'Bill rate is base price (tax excluded); GST is calculated and added to the total (Qty × Rate × (1 + GST%)).'}
                      </p>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    <Info className="h-3.5 w-3.5 text-primary" />
                    <span>Toggle this tick box to match your supplier invoice.</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Extracted Line Items */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <h4 className="font-semibold text-sm">
                    Extracted Items ({items.length})
                  </h4>
                  <span className="text-xs text-muted-foreground">
                    (Part No extracted as SKU/Barcode • MRP extracted as Selling Price)
                  </span>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleAddItem} className="gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  Add Item
                </Button>
              </div>

              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[16%] min-w-[110px]">
                        <span className="flex items-center gap-1">
                          <Barcode className="h-3 w-3 text-primary" /> Part No / SKU
                        </span>
                      </TableHead>
                      <TableHead className="w-[24%] min-w-[130px]">Product Name</TableHead>
                      <TableHead className="w-[8%] min-w-[55px] text-center">Qty</TableHead>
                      <TableHead className="w-[14%] min-w-[90px]">
                        Rate (₹) {isGstIncluded ? <span className="text-[10px] text-emerald-600 block">(Incl. GST)</span> : <span className="text-[10px] text-muted-foreground block">(Excl. GST)</span>}
                      </TableHead>
                      <TableHead className="w-[8%] min-w-[55px] text-center">GST %</TableHead>
                      <TableHead className="w-[14%] min-w-[95px]">
                        <span className="flex items-center gap-1">
                          <Tag className="h-3 w-3 text-emerald-600" /> Selling / MRP (₹)
                        </span>
                      </TableHead>
                      <TableHead className="w-[11%] min-w-[80px] text-right">Total (₹)</TableHead>
                      <TableHead className="w-[10%] min-w-[70px] text-center">Stock Match</TableHead>
                      <TableHead className="w-[5%]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => {
                      const basePrice = getBasePurchasePrice(
                        item.purchasePrice,
                        item.gstPercentage,
                        isGstIncluded
                      );

                      return (
                        <TableRow key={idx}>
                          {/* Part No / SKU / Barcode */}
                          <TableCell className="px-2">
                            <Input
                              value={item.partNumber}
                              onChange={(e) => handleItemChange(idx, 'partNumber', e.target.value)}
                              placeholder="Part No / SKU"
                              className="h-8 text-xs font-mono"
                              title="Part Number used as SKU / Barcode"
                            />
                          </TableCell>

                          {/* Product Name */}
                          <TableCell>
                            <Input
                              value={item.productName}
                              onChange={(e) => handleItemChange(idx, 'productName', e.target.value)}
                              placeholder="Item description"
                              className="h-8 text-xs font-medium"
                            />
                          </TableCell>

                          {/* Quantity */}
                          <TableCell className="px-2">
                            <Input
                              type="number"
                              min="0.001"
                              step="any"
                              value={item.quantity}
                              onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                              className="h-8 text-xs text-center w-full min-w-[50px] px-1 font-mono"
                            />
                          </TableCell>

                          {/* Unit Purchase Rate */}
                          <TableCell>
                            <div className="space-y-0.5">
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                value={item.purchasePrice}
                                onChange={(e) => handleItemChange(idx, 'purchasePrice', e.target.value)}
                                className="h-8 text-xs font-mono"
                              />
                              {isGstIncluded && item.gstPercentage > 0 && (
                                <span className="text-[10px] text-muted-foreground block font-mono">
                                  Base: ₹{formatCurrency(basePrice)}
                                </span>
                              )}
                            </div>
                          </TableCell>

                          {/* GST % */}
                          <TableCell className="px-2">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="any"
                              value={item.gstPercentage}
                              onChange={(e) => handleItemChange(idx, 'gstPercentage', e.target.value)}
                              className="h-8 text-xs text-center w-full min-w-[50px] px-1 font-mono"
                            />
                          </TableCell>

                          {/* Selling Price / MRP */}
                          <TableCell>
                            <div className="space-y-0.5">
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                value={item.sellingPrice}
                                onChange={(e) => handleItemChange(idx, 'sellingPrice', e.target.value)}
                                className="h-8 text-xs font-mono font-medium text-emerald-700 dark:text-emerald-400"
                              />
                              {item.mrp && item.mrp > 0 ? (
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-0.5">
                                  <Tag className="h-2.5 w-2.5" /> MRP: ₹{formatCurrency(item.mrp)}
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground block">
                                  Auto +25% markup
                                </span>
                              )}
                            </div>
                          </TableCell>

                          {/* Total with GST */}
                          <TableCell className="text-right font-semibold text-xs font-mono">
                            ₹{formatCurrency(item.amountWithGst)}
                          </TableCell>

                          {/* Inventory Match Badge */}
                          <TableCell className="text-center">
                            {item.matchedProductId ? (
                              <Badge
                                variant="outline"
                                className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px] gap-1"
                                title={item.matchedBy === 'barcode' ? 'Matched by Part No/Barcode' : 'Matched by Product Name'}
                              >
                                <PackageCheck className="h-3 w-3" />
                                {item.matchedBy === 'barcode' ? 'Part Match' : 'Match'}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/30 text-[10px] gap-1">
                                <PackagePlus className="h-3 w-3" /> New
                              </Badge>
                            )}
                          </TableCell>

                          {/* Remove */}
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => handleRemoveItem(idx)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Total Summary */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
              <div className="text-xs space-y-0.5">
                <span className="font-semibold text-foreground">Tax Calculation Summary:</span>
                <p className="text-muted-foreground">
                  {isGstIncluded
                    ? 'All invoice rates are GST-inclusive. Total is sum of line amounts.'
                    : 'Invoice rates exclude GST. Total includes calculated GST on top of unit rates.'}
                </p>
              </div>
              <div className="text-right self-end sm:self-auto">
                <span className="text-xs text-muted-foreground font-medium">Grand Total Purchase Amount:</span>
                <div className="text-xl font-bold text-primary font-mono">₹{formatCurrency(totalCalculatedAmount)}</div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="sm:justify-between border-t pt-3">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={isAnalyzing || isSaving}>
            Cancel
          </Button>
          {step === 'verify' && (
            <Button type="button" onClick={handleConfirmPurchase} disabled={isSaving} className="gap-2">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirm & Update Inventory
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

