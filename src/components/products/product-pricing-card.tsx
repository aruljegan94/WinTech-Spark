'use client';

import { useState, useEffect } from 'react';
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
import { Label } from '@/components/ui/label';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Percent,
  Check,
  BookmarkCheck,
  AlertTriangle,
  Receipt,
  Tag,
  ArrowRight,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const PRESET_MARKUPS = [15, 20, 25, 30, 35, 40, 50];
const PRESET_GST = [0, 5, 12, 18, 28];
const STORAGE_KEY_DEFAULT_MARKUP = 'spark_standard_markup_percentage';

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

  // Standard markup percentage state (defaults to 30%, can be customized and saved)
  const [markupPct, setMarkupPct] = useState<number>(30);
  const [defaultSavedMarkup, setDefaultSavedMarkup] = useState<number>(30);
  const [autoCalculate, setAutoCalculate] = useState<boolean>(true);
  const [isSavedRecently, setIsSavedRecently] = useState<boolean>(false);

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

  // Compute calculated selling price based on current purchasePrice and markupPct
  const computeSellingPrice = (cost: number, markup: number) => {
    if (cost <= 0) return 0;
    const calc = cost * (1 + markup / 100);
    // Round to 2 decimals
    return Math.round(calc * 100) / 100;
  };

  // When purchasePrice changes and autoCalculate is enabled, update sellingPrice
  const handlePurchasePriceChange = (val: number) => {
    form.setValue('purchasePrice', val);
    if (autoCalculate && val >= 0) {
      const newSellingPrice = computeSellingPrice(val, markupPct);
      form.setValue('sellingPrice', newSellingPrice, { shouldValidate: true });
    }
  };

  // When user clicks a markup preset or modifies the markup %
  const applyMarkup = (newMarkup: number) => {
    setMarkupPct(newMarkup);
    form.setValue('markupPercentage', newMarkup);
    if (purchasePrice > 0) {
      const newSellingPrice = computeSellingPrice(purchasePrice, newMarkup);
      form.setValue('sellingPrice', newSellingPrice, { shouldValidate: true });
    }
  };

  // When user manually edits selling price, compute the actual margin %
  const handleSellingPriceChange = (val: number) => {
    form.setValue('sellingPrice', val);
    if (purchasePrice > 0) {
      const effectiveMargin = ((val - purchasePrice) / purchasePrice) * 100;
      setMarkupPct(Math.round(effectiveMargin * 10) / 10);
      form.setValue('markupPercentage', Math.round(effectiveMargin * 10) / 10);
    }
  };

  // Save current markup % as the system-wide standard default
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

  // Calculations for live preview
  const profitMarginAmount = sellingPrice - purchasePrice;
  const actualMarkupPct = purchasePrice > 0 ? (profitMarginAmount / purchasePrice) * 100 : 0;
  const gstAmount = sellingPrice * (gstPercentage / 100);
  const finalPriceWithGst = sellingPrice + gstAmount;

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
              Automatic standard markup calculation (excluding GST) with customizable rates & real-time preview.
            </CardDescription>
          </div>

          {/* Auto Calculate Switch */}
          <div className="flex items-center space-x-2 bg-muted/50 px-3 py-1.5 rounded-lg border border-border/60 self-start sm:self-auto">
            <Switch
              id="auto-calc-mode"
              checked={autoCalculate}
              onCheckedChange={setAutoCalculate}
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
          {/* Purchase Price (Buying Price) */}
          <FormField
            control={form.control}
            name="purchasePrice"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel className="font-semibold text-foreground">
                    Buying Price / Purchase Price (₹)
                  </FormLabel>
                  <span className="text-xs text-muted-foreground">Excl. GST</span>
                </div>
                <FormControl>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground font-semibold">₹</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="pl-7 font-mono font-medium text-base"
                      value={field.value || ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        field.onChange(val);
                        handlePurchasePriceChange(val);
                      }}
                    />
                  </div>
                </FormControl>
                <FormDescription>
                  Your unit cost price from the supplier or vendor.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

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
                  step="0.5"
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
                Custom markup percentage applied to buying price.
              </span>
            </div>
          </div>
        </div>

        {/* Row 2: Selling Price & GST Selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start border-t pt-5">
          {/* Selling Price (Excl. GST) */}
          <FormField
            control={form.control}
            name="sellingPrice"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel className="font-semibold text-foreground flex items-center gap-1.5">
                    <Tag className="h-4 w-4 text-emerald-600" />
                    Selling Price (₹)
                  </FormLabel>
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                    Base Price (Excl. GST)
                  </span>
                </div>
                <FormControl>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-emerald-700 dark:text-emerald-400 font-semibold">₹</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="pl-7 font-mono font-semibold text-base border-emerald-300 dark:border-emerald-700 focus-visible:ring-emerald-500"
                      value={field.value || ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        field.onChange(val);
                        handleSellingPriceChange(val);
                      }}
                    />
                  </div>
                </FormControl>
                <div className="flex items-center justify-between pt-0.5">
                  <FormDescription>
                    Catalog base selling price before GST. You can manually adjust anytime.
                  </FormDescription>
                  {purchasePrice > 0 && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => applyMarkup(markupPct)}
                      className="h-auto p-0 text-xs text-primary underline"
                    >
                      Recalculate +{markupPct}%
                    </Button>
                  )}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* GST Rate Percentage */}
          <FormField
            control={form.control}
            name="gstPercentage"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel className="font-semibold text-foreground flex items-center gap-1.5">
                    <Receipt className="h-4 w-4 text-primary" />
                    GST Rate (%)
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
                            onClick={() => field.onChange(rate)}
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
                          min="0"
                          max="100"
                          placeholder="0"
                          className="pr-6 h-8 text-xs font-mono font-medium"
                          value={field.value}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                        <span className="absolute right-2.5 top-2 text-xs text-muted-foreground">%</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Added during billing/invoicing.
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
            {purchasePrice > 0 && sellingPrice > 0 ? (
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
              <div className="text-[11px] text-muted-foreground">Buying Price</div>
              <div className="text-base font-semibold font-mono mt-0.5 text-foreground">
                ₹{purchasePrice.toFixed(2)}
              </div>
              <div className="text-[10px] text-muted-foreground">Supplier Cost</div>
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
                {actualMarkupPct >= 0 ? '+' : ''}{actualMarkupPct.toFixed(1)}% on cost
              </div>
            </div>

            {/* Selling Price (Excl. GST) */}
            <div className="bg-background rounded-lg p-2.5 border border-primary/20">
              <div className="text-[11px] font-medium text-primary">Selling Price (Excl. GST)</div>
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
