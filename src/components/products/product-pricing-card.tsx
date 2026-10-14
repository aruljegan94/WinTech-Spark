'use client';

import { useState, useEffect, useRef } from 'react';
import { UseFormReturn } from 'react-hook-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Sparkles,
  TrendingUp,
  Percent,
  Check,
  BookmarkCheck,
  AlertTriangle,
  Receipt,
  Tag,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const PRESET_MARKUPS = [15, 20, 25, 30, 35, 40, 50];
const PRESET_GST = [0, 5, 12, 18, 28];
const STORAGE_KEY_DEFAULT_MARKUP = 'spark_standard_markup_percentage';

// Clean 2-decimal rounding helper that eliminates IEEE 754 precision tails
const roundTo2Decimals = (val: number): number => {
  return Math.round((val + Number.EPSILON) * 100) / 100;
};

// Compute base purchase price (cost excluding GST)
const computeBaseCost = (price: number, gst: number, isIncluded: boolean): number => {
  if (price <= 0) return 0;
  if (isIncluded && gst > 0) {
    return roundTo2Decimals(price / (1 + gst / 100));
  }
  return roundTo2Decimals(price);
};

// Compute auto-generated selling price based on base cost and markup percentage
const computeSellingPrice = (cost: number, markup: number): number => {
  if (cost <= 0) return 0;
  const calc = cost * (1 + markup / 100);
  return roundTo2Decimals(calc);
};

interface ProductPricingCardProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
}

export function ProductPricingCard({ form }: ProductPricingCardProps) {
  const { toast } = useToast();

  // Watch key pricing fields
  const purchasePrice = Number(form.watch('purchasePrice')) || 0;
  const sellingPrice = Number(form.watch('sellingPrice')) || 0;
  const gstPercentage = Number(form.watch('gstPercentage')) || 0;
  const isGstIncluded = Boolean(form.watch('isGstIncluded'));

  // Standard markup percentage state (defaults to 30%, can be customized and saved)
  const [markupPct, setMarkupPct] = useState<number>(30);
  const [defaultSavedMarkup, setDefaultSavedMarkup] = useState<number>(30);
  const [autoCalculate, setAutoCalculate] = useState<boolean>(true);
  const [isSavedRecently, setIsSavedRecently] = useState<boolean>(false);
  const [isManualPrice, setIsManualPrice] = useState<boolean>(false);

  // Local input string buffers so typing decimals ("150.", "150.5", "") is never eaten by re-renders
  const [purchasePriceStr, setPurchasePriceStr] = useState<string>(
    purchasePrice > 0 ? String(purchasePrice) : ''
  );
  const [sellingPriceStr, setSellingPriceStr] = useState<string>(
    sellingPrice > 0 ? String(sellingPrice) : ''
  );

  const isEditingPurchaseRef = useRef<boolean>(false);
  const isEditingSellingRef = useRef<boolean>(false);

  // Load saved default standard markup from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DEFAULT_MARKUP);
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed > 0) {
          setMarkupPct(parsed);
          setDefaultSavedMarkup(parsed);
        }
      }
    } catch {
      // localStorage may fail in restricted environments
    }
  }, []);

  // Sync purchasePrice string buffer when form value changes externally (e.g. form.reset)
  useEffect(() => {
    if (!isEditingPurchaseRef.current) {
      const parsed = parseFloat(purchasePriceStr) || 0;
      if (Math.abs(parsed - purchasePrice) > 0.001) {
        setPurchasePriceStr(purchasePrice > 0 ? String(purchasePrice) : '');
      }
    }
  }, [purchasePrice]);

  // Sync sellingPrice string buffer when form value changes externally
  useEffect(() => {
    if (!isEditingSellingRef.current) {
      const parsed = parseFloat(sellingPriceStr) || 0;
      if (Math.abs(parsed - sellingPrice) > 0.001) {
        setSellingPriceStr(sellingPrice > 0 ? String(sellingPrice) : '');
      }
    }
  }, [sellingPrice]);

  // Derived effective base purchase cost (excluding GST)
  const effectiveBaseCost = computeBaseCost(purchasePrice, gstPercentage, isGstIncluded);

  // Keep form's basePurchasePrice field updated
  useEffect(() => {
    form.setValue('basePurchasePrice', effectiveBaseCost);
  }, [effectiveBaseCost, form]);

  // Handler when user toggles "Invoice Price Includes GST"
  const handleToggleGstIncluded = (included: boolean) => {
    form.setValue('isGstIncluded', included);
    const newBaseCost = computeBaseCost(purchasePrice, gstPercentage, included);
    form.setValue('basePurchasePrice', newBaseCost);

    if (autoCalculate && purchasePrice > 0) {
      const newSellingPrice = computeSellingPrice(newBaseCost, markupPct);
      form.setValue('sellingPrice', newSellingPrice, { shouldValidate: true });
      setSellingPriceStr(String(newSellingPrice));
      setIsManualPrice(false);
    }
  };

  // Handler when user selects/edits GST percentage
  const handleGstChange = (newGst: number) => {
    const cleanGst = Math.max(0, Math.min(100, roundTo2Decimals(newGst)));
    form.setValue('gstPercentage', cleanGst);
    const newBaseCost = computeBaseCost(purchasePrice, cleanGst, isGstIncluded);
    form.setValue('basePurchasePrice', newBaseCost);

    if (autoCalculate && purchasePrice > 0) {
      const newSellingPrice = computeSellingPrice(newBaseCost, markupPct);
      form.setValue('sellingPrice', newSellingPrice, { shouldValidate: true });
      setSellingPriceStr(String(newSellingPrice));
      setIsManualPrice(false);
    }
  };

  // Handler for typing in Buying / Purchase Price
  const handlePurchasePriceChange = (raw: string) => {
    setPurchasePriceStr(raw);

    if (raw === '' || raw === '.') {
      form.setValue('purchasePrice', 0);
      form.setValue('basePurchasePrice', 0);
      if (autoCalculate) {
        form.setValue('sellingPrice', 0);
        setSellingPriceStr('');
      }
      return;
    }

    const val = parseFloat(raw);
    if (!isNaN(val)) {
      form.setValue('purchasePrice', val);
      const newBaseCost = computeBaseCost(val, gstPercentage, isGstIncluded);
      form.setValue('basePurchasePrice', newBaseCost);

      if (autoCalculate && val >= 0) {
        const newSellingPrice = computeSellingPrice(newBaseCost, markupPct);
        form.setValue('sellingPrice', newSellingPrice, { shouldValidate: true });
        setSellingPriceStr(String(newSellingPrice));
        setIsManualPrice(false);
      }
    }
  };

  const handlePurchasePriceBlur = () => {
    isEditingPurchaseRef.current = false;
    if (!purchasePriceStr || purchasePriceStr.trim() === '') {
      form.setValue('purchasePrice', 0);
      form.setValue('basePurchasePrice', 0);
      setPurchasePriceStr('');
      return;
    }

    const val = parseFloat(purchasePriceStr);
    if (!isNaN(val) && val >= 0) {
      const clean = roundTo2Decimals(val);
      form.setValue('purchasePrice', clean, { shouldValidate: true });
      setPurchasePriceStr(String(clean));
      const newBaseCost = computeBaseCost(clean, gstPercentage, isGstIncluded);
      form.setValue('basePurchasePrice', newBaseCost);
    }
  };

  // When user clicks a markup preset (+20%, +30%...)
  const applyMarkup = (newMarkup: number) => {
    setMarkupPct(newMarkup);
    form.setValue('markupPercentage', newMarkup);
    if (effectiveBaseCost > 0) {
      const newSellingPrice = computeSellingPrice(effectiveBaseCost, newMarkup);
      form.setValue('sellingPrice', newSellingPrice, { shouldValidate: true });
      setSellingPriceStr(String(newSellingPrice));
      setIsManualPrice(false);
    }
  };

  // Handler for typing in Selling Price manually (allows free typing without decimal truncation/errors)
  const handleSellingPriceChange = (raw: string) => {
    setSellingPriceStr(raw);
    setIsManualPrice(true);

    if (raw === '' || raw === '.') {
      form.setValue('sellingPrice', 0);
      return;
    }

    const val = parseFloat(raw);
    if (!isNaN(val)) {
      form.setValue('sellingPrice', val);
      if (effectiveBaseCost > 0) {
        const effectiveMargin = ((val - effectiveBaseCost) / effectiveBaseCost) * 100;
        const roundedMargin = Math.round(effectiveMargin * 10) / 10;
        setMarkupPct(roundedMargin);
        form.setValue('markupPercentage', roundedMargin);
      }
    }
  };

  const handleSellingPriceBlur = () => {
    isEditingSellingRef.current = false;
    if (!sellingPriceStr || sellingPriceStr.trim() === '') {
      form.setValue('sellingPrice', 0);
      setSellingPriceStr('');
      return;
    }

    const val = parseFloat(sellingPriceStr);
    if (!isNaN(val) && val >= 0) {
      const clean = roundTo2Decimals(val);
      form.setValue('sellingPrice', clean, { shouldValidate: true });
      setSellingPriceStr(String(clean));
    } else {
      form.setValue('sellingPrice', 0);
      setSellingPriceStr('');
    }
  };

  // Quick button to round selling price to whole rupee
  const handleRoundSellingPriceToWholeRupee = () => {
    const rounded = Math.round(sellingPrice);
    form.setValue('sellingPrice', rounded, { shouldValidate: true });
    setSellingPriceStr(String(rounded));
    setIsManualPrice(true);
    if (effectiveBaseCost > 0) {
      const effectiveMargin = ((rounded - effectiveBaseCost) / effectiveBaseCost) * 100;
      setMarkupPct(Math.round(effectiveMargin * 10) / 10);
    }
  };

  // Save current markup % as system-wide default
  const handleSaveAsDefault = () => {
    try {
      localStorage.setItem(STORAGE_KEY_DEFAULT_MARKUP, markupPct.toString());
      setDefaultSavedMarkup(markupPct);
      setIsSavedRecently(true);
      setTimeout(() => setIsSavedRecently(false), 2500);
      toast({
        title: 'Standard Markup Updated',
        description: `${markupPct}% is now saved as your standard default markup for all new products.`,
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save default markup to browser storage.',
      });
    }
  };

  // Calculations for live breakdown card
  const profitMarginAmount = roundTo2Decimals(sellingPrice - effectiveBaseCost);
  const actualMarkupPct = effectiveBaseCost > 0 ? (profitMarginAmount / effectiveBaseCost) * 100 : 0;
  const gstAmount = roundTo2Decimals(sellingPrice * (gstPercentage / 100));
  const finalPriceWithGst = roundTo2Decimals(sellingPrice + gstAmount);
  const taxPortionInPurchase = isGstIncluded && gstPercentage > 0 ? roundTo2Decimals(purchasePrice - effectiveBaseCost) : 0;

  return (
    <Card className="border-primary/20 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <CardTitle className="text-lg">Pricing & Profit Margin</CardTitle>
            </div>
            <CardDescription className="mt-1">
              Supports tax-inclusive/tax-exclusive invoices, standard markups, manual selling price overrides & clean rounding.
            </CardDescription>
          </div>

          {/* Auto Calculate Switch */}
          <div className="flex items-center space-x-2 bg-muted/50 px-3 py-1.5 rounded-lg border border-border/60 self-start sm:self-auto">
            <Switch
              id="auto-calc-mode"
              checked={autoCalculate}
              onCheckedChange={(checked) => {
                setAutoCalculate(checked);
                if (checked && effectiveBaseCost > 0) {
                  const newSelling = computeSellingPrice(effectiveBaseCost, markupPct);
                  form.setValue('sellingPrice', newSelling, { shouldValidate: true });
                  setSellingPriceStr(String(newSelling));
                  setIsManualPrice(false);
                }
              }}
            />
            <Label htmlFor="auto-calc-mode" className="text-xs font-medium cursor-pointer">
              Auto-calculate Selling Price
            </Label>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Row 1: Buying Price & Standard Markup Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Purchase Price (Buying Price) with Tax-Included Checkbox */}
          <div className="space-y-3">
            <FormField
              control={form.control}
              name="purchasePrice"
              render={() => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel className="font-semibold text-foreground">
                      Buying Price / Purchase Price (₹) *
                    </FormLabel>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-medium px-1.5 py-0.5 ${
                        isGstIncluded
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800'
                          : 'bg-muted text-muted-foreground border-border'
                      }`}
                    >
                      {isGstIncluded ? 'Tax-Inclusive (GST Included)' : 'Excl. GST'}
                    </Badge>
                  </div>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-muted-foreground font-semibold">₹</span>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="0.00"
                        className="pl-7 font-mono font-medium text-base"
                        value={purchasePriceStr}
                        onFocus={() => {
                          isEditingPurchaseRef.current = true;
                        }}
                        onChange={(e) => handlePurchasePriceChange(e.target.value)}
                        onBlur={handlePurchasePriceBlur}
                      />
                    </div>
                  </FormControl>
                  <FormDescription>
                    Rate from your supplier invoice or vendor purchase order.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Checkbox: Mark if GST is included in supplier invoice */}
            <div className={`p-3 rounded-lg border transition-all ${
              isGstIncluded 
                ? 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/60'
                : 'bg-muted/30 border-border/70 hover:bg-muted/50'
            }`}>
              <div className="flex items-start space-x-2.5">
                <Checkbox
                  id="is-gst-included-checkbox"
                  checked={isGstIncluded}
                  onCheckedChange={(checked) => handleToggleGstIncluded(Boolean(checked))}
                  className="mt-0.5"
                />
                <div className="grid gap-1 leading-none select-none">
                  <label
                    htmlFor="is-gst-included-checkbox"
                    className="text-xs font-semibold cursor-pointer text-foreground flex items-center gap-1.5"
                  >
                    <span>Invoice rate includes GST</span>
                    {isGstIncluded && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-400 font-medium">
                        Tax-inclusive bill
                      </Badge>
                    )}
                  </label>
                  <p className="text-[11px] text-muted-foreground">
                    {isGstIncluded ? (
                      purchasePrice > 0 && gstPercentage > 0 ? (
                        <span>
                          Supplier bill is <strong className="text-foreground">₹{purchasePrice.toFixed(2)}</strong> (incl. <strong className="text-foreground">{gstPercentage}% GST</strong> of ₹{taxPortionInPurchase.toFixed(2)}). Net cost base is <strong className="text-foreground">₹{effectiveBaseCost.toFixed(2)}</strong>.
                        </span>
                      ) : (
                        <span>GST is included in invoice. Select the GST percentage below to compute net cost.</span>
                      )
                    ) : (
                      <span>Check this if the supplier invoice rate already includes GST. GST % remains selectable below.</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Standard Markup Selector & Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="font-semibold text-foreground flex items-center gap-1.5">
                <Percent className="h-3.5 w-3.5 text-primary" />
                Standard Markup (%)
              </Label>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">
                  Default: <strong className="text-foreground">{defaultSavedMarkup}%</strong>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSaveAsDefault}
                  title="Save current % as your standard default"
                  className="h-6 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10 gap-1"
                >
                  {isSavedRecently ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-600" />
                      <span className="text-emerald-600 font-medium">Saved</span>
                    </>
                  ) : (
                    <>
                      <BookmarkCheck className="h-3 w-3" />
                      <span>Set as Default</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Quick Preset Buttons */}
            <div className="flex flex-wrap gap-1.5">
              {PRESET_MARKUPS.map((preset) => {
                const isSelected = Math.abs(markupPct - preset) < 0.1;
                const isDefault = preset === defaultSavedMarkup;
                return (
                  <Button
                    key={preset}
                    type="button"
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => applyMarkup(preset)}
                    className={`h-7 px-2.5 text-xs font-medium rounded-full transition-all ${
                      isSelected
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'border-border/80 hover:border-primary/50'
                    }`}
                  >
                    +{preset}%
                    {isDefault && !isSelected && (
                      <span className="ml-1 text-[10px] text-muted-foreground font-normal">(std)</span>
                    )}
                  </Button>
                );
              })}
            </div>

            {/* Custom Markup Input */}
            <div className="flex items-center gap-2 pt-1">
              <div className="relative w-32">
                <Input
                  type="number"
                  step="any"
                  min="0"
                  max="1000"
                  value={markupPct || ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    applyMarkup(val);
                  }}
                  className="pr-6 h-8 text-xs font-mono font-medium"
                />
                <span className="absolute right-2.5 top-2 text-xs text-muted-foreground">%</span>
              </div>
              <span className="text-xs text-muted-foreground">
                Markup percentage applied to net base cost.
              </span>
            </div>
          </div>
        </div>

        {/* Row 2: Selling Price & GST Selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start border-t pt-5">
          {/* Selling Price (Excl. GST) - Can be added manually without decimal errors */}
          <FormField
            control={form.control}
            name="sellingPrice"
            render={() => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel className="font-semibold text-foreground flex items-center gap-1.5">
                    <Tag className="h-4 w-4 text-emerald-600" />
                    Selling Price (₹) *
                  </FormLabel>
                  <div className="flex items-center gap-1.5">
                    {isManualPrice ? (
                      <Badge variant="outline" className="text-[10px] bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800">
                        Manual Price
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800">
                        Auto-Calculated
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">Excl. GST</span>
                  </div>
                </div>
                <FormControl>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-emerald-700 dark:text-emerald-400 font-semibold">₹</span>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      className="pl-7 font-mono font-semibold text-base border-emerald-300 dark:border-emerald-700 focus-visible:ring-emerald-500"
                      value={sellingPriceStr}
                      onFocus={() => {
                        isEditingSellingRef.current = true;
                      }}
                      onChange={(e) => handleSellingPriceChange(e.target.value)}
                      onBlur={handleSellingPriceBlur}
                    />
                  </div>
                </FormControl>

                <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
                  <FormDescription className="text-xs">
                    Can be manually entered anytime. Clean decimal values are preserved.
                  </FormDescription>

                  <div className="flex items-center gap-2">
                    {/* Quick Round Off Button */}
                    {sellingPrice > 0 && Math.round(sellingPrice * 100) % 100 !== 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRoundSellingPriceToWholeRupee}
                        className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground underline p-0"
                        title="Round to nearest whole rupee"
                      >
                        Round to ₹{Math.round(sellingPrice)}
                      </Button>
                    )}

                    {/* Recalculate button */}
                    {effectiveBaseCost > 0 && (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        onClick={() => applyMarkup(markupPct)}
                        className="h-auto p-0 text-xs text-primary underline gap-1"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Recalculate +{markupPct}%
                      </Button>
                    )}
                  </div>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* GST Rate Percentage - Still selectable for product */}
          <FormField
            control={form.control}
            name="gstPercentage"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel className="font-semibold text-foreground flex items-center gap-1.5">
                    <Receipt className="h-4 w-4 text-primary" />
                    GST Rate (%) *
                  </FormLabel>
                  <span className="text-xs text-muted-foreground">Standard Tax Slabs</span>
                </div>
                <FormControl>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_GST.map((rate) => {
                        const isSelected = Number(field.value) === rate;
                        return (
                          <Button
                            key={rate}
                            type="button"
                            variant={isSelected ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleGstChange(rate)}
                            className={`h-7 px-2.5 text-xs font-medium rounded-full ${
                              isSelected
                                ? 'bg-primary text-primary-foreground'
                                : 'border-border/80 hover:border-primary/50'
                            }`}
                          >
                            {rate}% GST
                          </Button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative w-28">
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          max="100"
                          placeholder="0"
                          className="pr-6 h-8 text-xs font-mono font-medium"
                          value={field.value !== undefined && field.value !== null ? field.value : ''}
                          onChange={(e) => handleGstChange(parseFloat(e.target.value) || 0)}
                        />
                        <span className="absolute right-2.5 top-2 text-xs text-muted-foreground">%</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {isGstIncluded
                          ? 'Deducted from invoice rate & applied at sales checkout.'
                          : 'Added during customer billing/invoicing.'}
                      </span>
                    </div>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Live Calculation & Margin Breakdown Card */}
        <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              Live Margin & Price Breakdown
            </span>

            {/* Status / Health Badge */}
            {effectiveBaseCost > 0 && sellingPrice > 0 ? (
              profitMarginAmount > 0 ? (
                <Badge variant="outline" className="bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 gap-1 text-xs">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Profit: +₹{profitMarginAmount.toFixed(2)} (+{actualMarkupPct.toFixed(1)}% margin)
                </Badge>
              ) : profitMarginAmount === 0 ? (
                <Badge variant="outline" className="bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 gap-1 text-xs">
                  Break-even (0% margin)
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Loss Warning: Selling below buying price by ₹{Math.abs(profitMarginAmount).toFixed(2)}
                </Badge>
              )
            ) : (
              <span className="text-xs text-muted-foreground italic">
                Enter buying price to see breakdown
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {/* Buying Price */}
            <div className="bg-background rounded-lg p-2.5 border">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Net Cost Base</span>
                {isGstIncluded && (
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">Incl. Tax</span>
                )}
              </div>
              <div className="text-base font-semibold font-mono mt-0.5 text-foreground">
                ₹{effectiveBaseCost.toFixed(2)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {isGstIncluded && purchasePrice > 0
                  ? `Invoice: ₹${purchasePrice.toFixed(2)}`
                  : 'Supplier Cost (Excl. GST)'}
              </div>
            </div>

            {/* Profit Margin */}
            <div className="bg-background rounded-lg p-2.5 border">
              <div className="text-[11px] text-muted-foreground">Markup / Margin</div>
              <div className={`text-base font-semibold font-mono mt-0.5 ${
                profitMarginAmount > 0 ? 'text-emerald-600 dark:text-emerald-400' : profitMarginAmount < 0 ? 'text-rose-600' : 'text-foreground'
              }`}>
                {profitMarginAmount >= 0 ? '+' : ''}₹{profitMarginAmount.toFixed(2)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {actualMarkupPct >= 0 ? '+' : ''}{actualMarkupPct.toFixed(1)}% on net cost
              </div>
            </div>

            {/* Selling Price (Excl. GST) */}
            <div className="bg-background rounded-lg p-2.5 border border-primary/20">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-primary">Selling Price (Excl. GST)</span>
                {isManualPrice && (
                  <span className="text-[9px] bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 px-1 rounded">Manual</span>
                )}
              </div>
              <div className="text-base font-bold font-mono mt-0.5 text-primary">
                ₹{sellingPrice.toFixed(2)}
              </div>
              <div className="text-[10px] text-muted-foreground">Catalog Base Price</div>
            </div>

            {/* Estimated Final Price (Incl. GST) */}
            <div className="bg-emerald-50/60 dark:bg-emerald-950/30 rounded-lg p-2.5 border border-emerald-200 dark:border-emerald-800">
              <div className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                Customer Price (Incl. {gstPercentage}% GST)
              </div>
              <div className="text-base font-bold font-mono mt-0.5 text-emerald-700 dark:text-emerald-400">
                ₹{finalPriceWithGst.toFixed(2)}
              </div>
              <div className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80">
                ₹{sellingPrice.toFixed(2)} + ₹{gstAmount.toFixed(2)} GST
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
