'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Barcode,
  Printer,
  Download,
  Copy,
  Check,
  RefreshCw,
  Search,
  Package,
  Layers,
  Settings2,
  Sparkles,
  SlidersHorizontal,
  Eye,
  Grid3X3,
  Building2,
} from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { Product, CompanyProfile } from '@/lib/types';
import { generateBarcodeSVG } from '@/lib/barcode-generator';
import { useToast } from '@/hooks/use-toast';

interface LabelSizeConfig {
  id: string;
  name: string;
  category: 'roll' | 'sheet';
  widthMm: number;
  heightMm: number;
  cols?: number;
  rows?: number;
  perSheet?: number;
  description: string;
}

const LABEL_SIZES: LabelSizeConfig[] = [
  // Thermal Roll Sizes (Continuous label printers e.g. TSC, TVS, Zebra, Xprinter)
  {
    id: 'roll-50x25',
    name: '50mm × 25mm (2" × 1")',
    category: 'roll',
    widthMm: 50,
    heightMm: 25,
    description: 'Most common standard thermal sticker for retail, spares & hardware.',
  },
  {
    id: 'roll-50x38',
    name: '50mm × 38mm (2" × 1.5")',
    category: 'roll',
    widthMm: 50,
    heightMm: 38,
    description: 'Medium thermal label with ample space for company name, MRP, & batch.',
  },
  {
    id: 'roll-38x25',
    name: '38mm × 25mm (1.5" × 1")',
    category: 'roll',
    widthMm: 38,
    heightMm: 25,
    description: 'Compact label for small spare parts, jewelry, or electronic accessories.',
  },
  {
    id: 'roll-100x50',
    name: '100mm × 50mm (4" × 2")',
    category: 'roll',
    widthMm: 100,
    heightMm: 50,
    description: 'Large carton, warehouse box, or bulk inventory shipping label.',
  },

  // A4 Laser / Inkjet Adhesive Sticker Sheets
  {
    id: 'sheet-a4-24',
    name: 'A4 Sheet — 24 Labels (3 × 8)',
    category: 'sheet',
    widthMm: 70,
    heightMm: 37,
    cols: 3,
    rows: 8,
    perSheet: 24,
    description: 'Popular Indian A4 sticker sheet (70mm × 37mm, 24 labels per page).',
  },
  {
    id: 'sheet-a4-40',
    name: 'A4 Sheet — 40 Labels (4 × 10)',
    category: 'sheet',
    widthMm: 48.5,
    heightMm: 25.4,
    cols: 4,
    rows: 10,
    perSheet: 40,
    description: 'Standard retail A4 sticker sheet (48.5mm × 25.4mm, 40 labels per page).',
  },
  {
    id: 'sheet-a4-65',
    name: 'A4 Sheet — 65 Labels (5 × 13)',
    category: 'sheet',
    widthMm: 38.1,
    heightMm: 21.2,
    cols: 5,
    rows: 13,
    perSheet: 65,
    description: 'High-density micro barcode sticker sheet (38.1mm × 21.2mm, 65 per page).',
  },
];

export default function BarcodeGeneratorPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const printContainerRef = useRef<HTMLDivElement>(null);

  // 1. Load Products & Company Profile
  const productsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'products') : null),
    [firestore]
  );
  const { data: products, isLoading: productsLoading } = useCollection<Product>(productsQuery);

  const profileQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'companyProfiles'), where('isDefault', '==', true)) : null),
    [firestore]
  );
  const { data: profiles } = useCollection<CompanyProfile>(profileQuery);
  const companyProfile = useMemo(() => profiles?.[0] || null, [profiles]);

  // 2. Generator State
  const [selectedProductId, setSelectedProductId] = useState<string>('custom');
  const [productSearch, setProductSearch] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [productName, setProductName] = useState<string>('Engine Oil 5L Semi-Synthetic');
  const [barcodeValue, setBarcodeValue] = useState<string>('WTS-8901234');
  const [sellingPrice, setSellingPrice] = useState<string>('1250');
  const [customSubtitle, setCustomSubtitle] = useState<string>('Pkd: Oct 2026');

  // Display toggles
  const [showCompany, setShowCompany] = useState<boolean>(true);
  const [showProduct, setShowProduct] = useState<boolean>(true);
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showCodeText, setShowCodeText] = useState<boolean>(true);
  const [showSubtitle, setShowSubtitle] = useState<boolean>(true);

  // Size & Copies
  const [selectedSizeId, setSelectedSizeId] = useState<string>('roll-50x25');
  const [copies, setCopies] = useState<number>(10);
  const [viewMode, setViewMode] = useState<'single' | 'sheet'>('single');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Initialize company name from profile
  useEffect(() => {
    if (companyProfile?.companyName) {
      setCompanyName(companyProfile.companyName);
    } else {
      setCompanyName('WinTech-Spark');
    }
  }, [companyProfile]);

  // Check URL query parameters for productId (e.g. from Products table action)
  useEffect(() => {
    if (typeof window !== 'undefined' && products && products.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const pId = params.get('productId');
      if (pId) {
        handleProductSelect(pId);
      }
    }
  }, [products]);

  // When a product is selected from dropdown
  const handleProductSelect = (pId: string) => {
    setSelectedProductId(pId);
    if (pId === 'custom') return;

    const prod = products?.find((p) => p.id === pId);
    if (prod) {
      setProductName(prod.productName);
      setSellingPrice(prod.sellingPrice.toString());
      setBarcodeValue(prod.barcode || `SKU-${prod.id.slice(0, 8).toUpperCase()}`);
    }
  };

  const selectedSize = useMemo(() => {
    return LABEL_SIZES.find((s) => s.id === selectedSizeId) || LABEL_SIZES[0];
  }, [selectedSizeId]);

  // Adjust default copies when size changes
  useEffect(() => {
    if (selectedSize.category === 'sheet' && selectedSize.perSheet) {
      setCopies(selectedSize.perSheet);
      setViewMode('sheet');
    } else {
      setViewMode('single');
    }
  }, [selectedSize]);

  // Generate SVG string
  const barcodeSvgString = useMemo(() => {
    const barHeight = selectedSize.heightMm <= 25 ? 32 : 45;
    return generateBarcodeSVG(barcodeValue, {
      height: barHeight,
      showText: showCodeText,
      fontSize: 11,
      barWidth: 2,
    });
  }, [barcodeValue, showCodeText, selectedSize]);

  // Print Handler
  const handlePrint = () => {
    window.print();
  };

  // Download SVG file
  const handleDownloadSvg = () => {
    const blob = new Blob([barcodeSvgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Barcode-${barcodeValue}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Barcode Downloaded', description: `Saved as Barcode-${barcodeValue}.svg` });
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(barcodeValue);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    toast({ title: 'Barcode Copied', description: barcodeValue });
  };

  const generateRandomBarcode = () => {
    const rand = '890' + Math.floor(100000000 + Math.random() * 900000000).toString();
    setBarcodeValue(rand);
  };

  // Filtered products for search
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (!productSearch.trim()) return products.slice(0, 30);
    const q = productSearch.toLowerCase();
    return products.filter(
      (p) =>
        p.productName.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        p.category.toLowerCase().includes(q)
    );
  }, [products, productSearch]);

  // Render a Single Label Component
  const renderSingleLabel = (keyIndex: number = 0) => {
    const isSmall = selectedSize.heightMm <= 25;

    return (
      <div
        key={keyIndex}
        className="label-sticker bg-white text-slate-900 border border-slate-300 rounded p-1.5 flex flex-col justify-between items-center text-center overflow-hidden shadow-xs select-none"
        style={{
          width: `${selectedSize.widthMm * 3.78}px`,
          height: `${selectedSize.heightMm * 3.78}px`,
          maxWidth: '100%',
        }}
      >
        {/* Top: Company / Brand */}
        {showCompany && companyName && (
          <div className="w-full text-[9px] font-black uppercase tracking-wider text-slate-700 truncate leading-tight border-b border-slate-200 pb-0.5">
            {companyName}
          </div>
        )}

        {/* Product Name */}
        {showProduct && (
          <div className={`w-full font-bold text-slate-900 leading-tight truncate px-1 ${isSmall ? 'text-[10px]' : 'text-xs'}`}>
            {productName}
          </div>
        )}

        {/* Barcode Vector Graphic */}
        <div
          className="w-full flex items-center justify-center my-0.5 px-1 overflow-hidden"
          dangerouslySetInnerHTML={{ __html: barcodeSvgString }}
          style={{ maxHeight: isSmall ? '55%' : '65%' }}
        />

        {/* Bottom Row: MRP & Subtitle */}
        <div className="w-full flex items-center justify-between px-1 text-[9px] leading-tight pt-0.5 border-t border-slate-100">
          {showPrice ? (
            <div className="font-extrabold text-slate-900">
              MRP: <span className="font-mono text-[10px]">₹{parseFloat(sellingPrice || '0').toFixed(2)}</span>
            </div>
          ) : <div />}

          {showSubtitle && customSubtitle && (
            <div className="text-[8px] text-slate-500 font-medium truncate max-w-[50%]">
              {customSubtitle}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title="Product Barcode & Label Generator"
        description="Generate and print standardized scannable barcode price tags in thermal rolls or A4 sticker sheets."
      >
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={handleDownloadSvg} className="gap-1.5 shadow-sm">
            <Download className="h-4 w-4 text-primary" />
            Download SVG
          </Button>
          <Button size="sm" onClick={handlePrint} className="gap-1.5 font-semibold shadow-sm">
            <Printer className="h-4 w-4" />
            Print Labels ({copies})
          </Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ─── LEFT: Configuration Panel (Hidden on Print) ────────────────── */}
        <div className="lg:col-span-5 space-y-5 print:hidden">
          {/* Card 1: Product Selection */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <Package className="h-4 w-4" />
                </div>
                <CardTitle className="text-base">Product Information</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Pick a product from your inventory or manually enter label text.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3.5">
              {/* Product Selector */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Select From Inventory</Label>
                <Select value={selectedProductId} onValueChange={handleProductSelect}>
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue placeholder="Select a product from inventory..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="custom" className="font-semibold text-primary">
                      ✏️ Custom / Manual Entry
                    </SelectItem>
                    {filteredProducts.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.productName} — ₹{p.sellingPrice} {p.barcode ? `(${p.barcode})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Product Name */}
              <div className="space-y-1">
                <Label htmlFor="prodName" className="text-xs font-semibold">
                  Product Name *
                </Label>
                <Input
                  id="prodName"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="e.g. Engine Oil 5L"
                  className="text-xs h-9"
                />
              </div>

              {/* Barcode & Generate Button */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="barcodeVal" className="text-xs font-semibold flex items-center gap-1">
                    <Barcode className="h-3.5 w-3.5 text-primary" />
                    Barcode / SKU Value *
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={generateRandomBarcode}
                    className="h-5 px-1.5 text-[10px] text-primary gap-1"
                  >
                    <RefreshCw className="h-3 w-3" /> Auto-generate EAN
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input
                    id="barcodeVal"
                    value={barcodeValue}
                    onChange={(e) => setBarcodeValue(e.target.value)}
                    placeholder="e.g. 890123456789"
                    className="font-mono text-xs h-9"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyCode}
                    title="Copy barcode"
                    className="h-9 w-9 p-0 shrink-0"
                  >
                    {copiedCode ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Selling Price & Subtitle */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="sellingPrice" className="text-xs font-semibold">
                    MRP / Selling Price (₹)
                  </Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-xs text-muted-foreground font-semibold">₹</span>
                    <Input
                      id="sellingPrice"
                      type="number"
                      step="0.01"
                      value={sellingPrice}
                      onChange={(e) => setSellingPrice(e.target.value)}
                      placeholder="0.00"
                      className="pl-6 font-mono text-xs h-9 font-semibold"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="subText" className="text-xs font-semibold">
                    Subtitle / Batch
                  </Label>
                  <Input
                    id="subText"
                    value={customSubtitle}
                    onChange={(e) => setCustomSubtitle(e.target.value)}
                    placeholder="e.g. Batch #401"
                    className="text-xs h-9"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Label Dimensions & Content Controls */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Layers className="h-4 w-4" />
                </div>
                <CardTitle className="text-base">Label Dimensions & Layout</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Select your printer paper roll or A4 sticker sheet size.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Size Selector */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Sticker Paper Size</Label>
                <Select value={selectedSizeId} onValueChange={setSelectedSizeId}>
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue placeholder="Choose label size..." />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1">
                      Thermal Label Roll (POS / Barcode Printers)
                    </div>
                    {LABEL_SIZES.filter((s) => s.category === 'roll').map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">
                        {s.name}
                      </SelectItem>
                    ))}
                    <div className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1 border-t mt-1 pt-1">
                      A4 Sticker Sheets (Standard Laser / Inkjet)
                    </div>
                    {LABEL_SIZES.filter((s) => s.category === 'sheet').map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">{selectedSize.description}</p>
              </div>

              {/* Number of Copies */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="copies" className="text-xs font-semibold">
                    Number of Labels to Print
                  </Label>
                  <div className="flex gap-1">
                    {[1, 5, 10, 24, 40].map((num) => (
                      <Button
                        key={num}
                        type="button"
                        variant={copies === num ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCopies(num)}
                        className="h-6 px-2 text-[10px] rounded-full"
                      >
                        {num}
                      </Button>
                    ))}
                  </div>
                </div>
                <Input
                  id="copies"
                  type="number"
                  min="1"
                  max="500"
                  value={copies}
                  onChange={(e) => setCopies(parseInt(e.target.value) || 1)}
                  className="font-mono text-xs h-8 w-32"
                />
              </div>

              {/* Content Toggles */}
              <div className="border-t pt-3 space-y-2.5">
                <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                  Label Elements to Display:
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <Switch checked={showCompany} onCheckedChange={setShowCompany} />
                    <span>Company Name</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <Switch checked={showProduct} onCheckedChange={setShowProduct} />
                    <span>Product Name</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <Switch checked={showPrice} onCheckedChange={setShowPrice} />
                    <span>Price (MRP)</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <Switch checked={showCodeText} onCheckedChange={setShowCodeText} />
                    <span>Barcode Text</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer col-span-2">
                    <Switch checked={showSubtitle} onCheckedChange={setShowSubtitle} />
                    <span>Subtitle / Batch Info</span>
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── RIGHT: Live Preview & Print Grid ───────────────────────────── */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="shadow-sm border-border/80 print:border-none print:shadow-none">
            <CardHeader className="pb-3 border-b print:hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Eye className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base">Live Label Print Preview</CardTitle>
                  </div>
                  <CardDescription className="text-xs mt-0.5">
                    Dimensions: <strong>{selectedSize.widthMm}mm × {selectedSize.heightMm}mm</strong> (
                    {((selectedSize.widthMm) / 25.4).toFixed(1)}&quot; × {((selectedSize.heightMm) / 25.4).toFixed(1)}&quot;)
                  </CardDescription>
                </div>

                {/* View Mode Toggle */}
                <div className="flex items-center gap-1 bg-muted p-1 rounded-lg self-start sm:self-auto text-xs">
                  <button
                    type="button"
                    onClick={() => setViewMode('single')}
                    className={`px-2.5 py-1 rounded font-medium transition-all ${
                      viewMode === 'single' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground'
                    }`}
                  >
                    Single Label
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('sheet')}
                    className={`px-2.5 py-1 rounded font-medium transition-all ${
                      viewMode === 'sheet' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground'
                    }`}
                  >
                    Grid Sheet ({copies})
                  </button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-6 bg-muted/20 dark:bg-muted/10 min-h-[420px] flex flex-col justify-center items-center print:bg-white print:p-0">
              {/* Single Label View */}
              {viewMode === 'single' && (
                <div className="flex flex-col items-center justify-center space-y-4 py-8">
                  <div className="p-4 bg-white rounded-lg shadow-md border border-slate-300">
                    {renderSingleLabel(0)}
                  </div>
                  <div className="text-center text-xs text-muted-foreground">
                    Actual label scale preview. Ready for barcode thermal rolls or sheet printing.
                  </div>
                </div>
              )}

              {/* Sheet / Grid View (Multi-label) */}
              {viewMode === 'sheet' && (
                <div
                  ref={printContainerRef}
                  id="printable-barcode-sheet"
                  className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border border-slate-300 max-w-full overflow-x-auto print:border-none print:shadow-none print:p-0 print:m-0"
                >
                  <div
                    className="grid gap-2 items-center justify-center print:gap-1.5"
                    style={{
                      gridTemplateColumns: selectedSize.cols
                        ? `repeat(${selectedSize.cols}, minmax(0, 1fr))`
                        : 'repeat(auto-fit, minmax(160px, 1fr))',
                    }}
                  >
                    {Array.from({ length: Math.min(copies, 100) }).map((_, i) => (
                      <div key={i} className="flex justify-center print:break-inside-avoid">
                        {renderSingleLabel(i)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Info Box */}
          <div className="rounded-xl border bg-muted/30 p-3.5 text-xs text-muted-foreground space-y-1.5 print:hidden">
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Thermal & Sheet Label Tips:
            </div>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>
                <strong>For Thermal Printers (TSC, TVS, Zebra):</strong> Select 50mm × 25mm or 50mm × 38mm. Set printer margins to 0 in your print dialog.
              </li>
              <li>
                <strong>For A4 Sticker Sheets:</strong> Choose 24 or 40 labels per sheet. Print scale must be set to 100% (do not fit to printable area) for exact sticker alignment.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
