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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
} from 'lucide-react';
import type { Product } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, addDocumentNonBlocking } from '@/firebase';
import { collection, doc, runTransaction } from 'firebase/firestore';
import { parsePurchaseInvoice } from '@/ai/flows/parse-purchase-invoice';
import type { ParsePurchaseInvoiceOutput } from '@/ai/flows/parse-purchase-invoice-types';
import { format } from 'date-fns';

interface PurchaseOcrModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  products?: Product[];
  onPurchaseRecorded?: () => void;
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
  const [previewUrl, setPreviewUrl] = useState<string>('');

  const [supplierName, setSupplierName] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [items, setItems] = useState<
    Array<{
      productName: string;
      quantity: number;
      purchasePrice: number;
      gstPercentage: number;
      amountWithGst: number;
      matchedProductId?: string;
    }>
  >([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const firestore = useFirestore();
  const { toast } = useToast();

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

        // Match items with existing inventory products
        const processedItems = (result.items || []).map((item) => {
          const matched = products.find(
            (p) => p.productName.toLowerCase().trim() === item.productName.toLowerCase().trim()
          );
          return {
            productName: item.productName || 'Unspecified Part',
            quantity: item.quantity || 1,
            purchasePrice: item.purchasePrice || 0,
            gstPercentage: item.gstPercentage || 18,
            amountWithGst: item.amountWithGst || item.quantity * item.purchasePrice * 1.18,
            matchedProductId: matched?.id,
          };
        });

        setItems(processedItems);
        setStep('verify');
        toast({
          title: 'Invoice Parsed with AI OCR!',
          description: 'Review and edit extracted invoice values before confirming.',
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

  const handleItemChange = (index: number, field: string, value: any) => {
    const updated = [...items];
    const current = { ...updated[index], [field]: value };

    // Auto calculate amountWithGst if quantity, price, or gst changes
    if (field === 'quantity' || field === 'purchasePrice' || field === 'gstPercentage') {
      const q = Number(current.quantity) || 0;
      const p = Number(current.purchasePrice) || 0;
      const gst = Number(current.gstPercentage) || 0;
      current.amountWithGst = Math.round(q * p * (1 + gst / 100));
    }

    // Check inventory match on name change
    if (field === 'productName') {
      const matched = products.find(
        (p) => p.productName.toLowerCase().trim() === String(value).toLowerCase().trim()
      );
      current.matchedProductId = matched?.id;
    }

    updated[index] = current;
    setItems(updated);
  };

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        productName: '',
        quantity: 1,
        purchasePrice: 0,
        gstPercentage: 18,
        amountWithGst: 0,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const totalCalculatedAmount = items.reduce((sum, item) => sum + (item.amountWithGst || 0), 0);

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
          quantity: number;
          purchasePrice: number;
          totalAmount: number;
        }> = [];

        enriched.forEach(({ item, isNew, existingRef, newRef }, index) => {
          if (isNew && newRef) {
            // Create brand-new product
            transaction.set(newRef, {
              productName: item.productName,
              category: 'General',
              purchasePrice: item.purchasePrice,
              sellingPrice: Math.round(item.purchasePrice * 1.25),
              stockQuantity: item.quantity,
              gstPercentage: item.gstPercentage,
            });
            finalItems.push({
              productId: newRef.id,
              productName: item.productName,
              quantity: item.quantity,
              purchasePrice: item.purchasePrice,
              totalAmount: item.amountWithGst,
            });
          } else if (existingRef) {
            // Update stock on existing product
            const prodDoc = productDocs[index];
            if (prodDoc?.exists()) {
              const currentStock = prodDoc.data().stockQuantity || 0;
              transaction.update(existingRef, {
                stockQuantity: currentStock + item.quantity,
                purchasePrice: item.purchasePrice,
              });
            }
            finalItems.push({
              productId: existingRef.id,
              productName: item.productName,
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
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI OCR Purchase Invoice Scanner
          </DialogTitle>
          <DialogDescription>
            Upload a purchase bill or document to automatically extract line items, prices, and update stock.
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
                          quantity: 1,
                          purchasePrice: 0,
                          gstPercentage: 18,
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
                Extracting supplier details, product items, rates, and GST values.
              </p>
            </div>
          </div>
        )}

        {/* STEP 3: VERIFICATION & EDITABLE TABLE */}
        {step === 'verify' && (
          <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
            {/* Header Details */}
            <Card className="border-primary/20 bg-muted/20">
              <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4">
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
              </CardContent>
            </Card>

            {/* Extracted Line Items */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Extracted Items ({items.length})
                </h4>
                <Button type="button" variant="outline" size="sm" onClick={handleAddItem} className="gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  Add Item
                </Button>
              </div>

              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[28%] min-w-[120px]">Product Name</TableHead>
                      <TableHead className="w-[9%] min-w-[60px] text-center">Qty</TableHead>
                      <TableHead className="w-[17%] min-w-[90px]">Unit Price (₹)</TableHead>
                      <TableHead className="w-[10%] min-w-[65px] text-center">GST %</TableHead>
                      <TableHead className="w-[16%] min-w-[80px] text-right">Total (₹)</TableHead>
                      <TableHead className="w-[13%] min-w-[70px] text-center">Stock Match</TableHead>
                      <TableHead className="w-[7%]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Input
                            value={item.productName}
                            onChange={(e) => handleItemChange(idx, 'productName', e.target.value)}
                            className="h-8 text-xs font-medium"
                          />
                        </TableCell>
                        <TableCell className="px-2">
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                            className="h-8 text-sm text-center w-full min-w-[52px] px-1"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            value={item.purchasePrice}
                            onChange={(e) => handleItemChange(idx, 'purchasePrice', e.target.value)}
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell className="px-2">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={item.gstPercentage}
                            onChange={(e) => handleItemChange(idx, 'gstPercentage', e.target.value)}
                            className="h-8 text-sm text-center w-full min-w-[52px] px-1"
                          />
                        </TableCell>
                        <TableCell className="text-right font-semibold text-xs">
                          ₹{item.amountWithGst.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.matchedProductId ? (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px] gap-1">
                              <PackageCheck className="h-3 w-3" /> Match
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/30 text-[10px] gap-1">
                              <PackagePlus className="h-3 w-3" /> New
                            </Badge>
                          )}
                        </TableCell>
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
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Total Summary */}
            <div className="flex justify-end p-3 rounded-lg bg-primary/10 border border-primary/20">
              <div className="text-right">
                <span className="text-xs text-muted-foreground font-medium">Grand Total Purchase Amount:</span>
                <div className="text-xl font-bold text-primary">₹{totalCalculatedAmount.toLocaleString()}</div>
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
