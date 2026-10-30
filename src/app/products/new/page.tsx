'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { useFirestore, useCollection, useMemoFirebase, useUser, useDoc } from '@/firebase';
import { collection, addDoc, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { ScanBarcode, Package, Loader2, Sparkles, AlertTriangle, PlusCircle, Check } from 'lucide-react';
import { BarcodeScannerModal } from '@/components/barcode-scanner-modal';
import { ProductPricingCard } from '@/components/products/product-pricing-card';
import { CategorySelectField } from '@/components/categories/category-select-field';
import type { Product, User } from '@/lib/types';

const productSchema = z.object({
  productName: z.preprocess(
    (v) => (v == null ? '' : String(v).trim()),
    z.string().min(1, 'Product name is required')
  ),
  category: z.preprocess(
    (v) => {
      const s = v == null ? '' : String(v).trim();
      return s || 'General';
    },
    z.string().min(1, 'Category is required')
  ),
  purchasePrice: z.preprocess(
    (v) => {
      const n = Number(v);
      return isNaN(n) || n < 0 ? 0 : n;
    },
    z.number().min(0, 'Purchase price must be positive')
  ),
  sellingPrice: z.preprocess(
    (v) => {
      const n = Number(v);
      return isNaN(n) || n < 0 ? 0 : n;
    },
    z.number().min(0, 'Selling price must be positive')
  ),
  stockQuantity: z.preprocess(
    (v) => {
      const n = Number(v);
      return isNaN(n) || n < 0 ? 0 : n;
    },
    z.number().min(0, 'Stock must be positive')
  ),
  gstPercentage: z.preprocess(
    (v) => {
      if (v === '' || v == null) return 18;
      const n = Number(v);
      return isNaN(n) || n < 0 ? 18 : Math.min(100, n);
    },
    z.number().min(0).max(100, 'GST must be between 0 and 100').default(18)
  ),
  barcode: z.preprocess(
    (v) => (v == null ? '' : String(v).trim()),
    z.string().optional().default('')
  ),
  markupPercentage: z.preprocess(
    (v) => {
      const n = Number(v);
      return isNaN(n) ? 30 : n;
    },
    z.number().optional().default(30)
  ),
  isGstIncluded: z.preprocess(
    (v) => Boolean(v),
    z.boolean().optional().default(false)
  ),
  basePurchasePrice: z.preprocess(
    (v) => {
      const n = Number(v);
      return isNaN(n) || n < 0 ? 0 : n;
    },
    z.number().optional().default(0)
  ),
});

type ProductFormValues = z.infer<typeof productSchema>;

// Helper to calculate the next unique barcode with prefix WIN00
function calculateNextBarcode(products: Product[] | null | undefined): string {
  let maxNumber = 0;
  const existingBarcodes = new Set<string>();

  (products || []).forEach((p) => {
    if (p.barcode) {
      const trimmed = String(p.barcode).trim();
      existingBarcodes.add(trimmed.toUpperCase());
      const match = trimmed.match(/^WIN00(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNumber) {
          maxNumber = num;
        }
      }
    }
  });

  let nextNumber = maxNumber > 0 ? maxNumber + 1 : 101;
  let candidate = `WIN00${nextNumber}`;

  while (existingBarcodes.has(candidate.toUpperCase())) {
    nextNumber++;
    candidate = `WIN00${nextNumber}`;
  }

  return candidate;
}

export default function NewProductPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const { user: currentAuthUser } = useUser();
  const currentUserDocRef = useMemoFirebase(
    () => (firestore && currentAuthUser ? doc(firestore, 'users', currentAuthUser.uid) : null),
    [firestore, currentAuthUser]
  );
  const { data: currentUserDoc } = useDoc<User>(currentUserDocRef);

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMode, setSaveMode] = useState<'save' | 'saveAndNew'>('save');

  const productNameInputRef = useRef<HTMLInputElement | null>(null);
  const hasAutoAssignedBarcodeRef = useRef(false);

  // Load existing products to calculate next WIN00 barcode & check duplicates
  const allProductsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'products') : null),
    [firestore]
  );
  const { data: allProducts } = useCollection<Product>(allProductsQuery);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      productName: '',
      category: 'General',
      purchasePrice: 0,
      sellingPrice: 0,
      stockQuantity: 0,
      gstPercentage: 18, // 18% GST default as requested
      barcode: '',
      markupPercentage: 30,
      isGstIncluded: false,
      basePurchasePrice: 0,
    },
  });

  // Magic 1: Auto-generate the next barcode on mount as soon as products load (if user hasn't set one)
  useEffect(() => {
    if (allProducts && !hasAutoAssignedBarcodeRef.current) {
      const currentVal = form.getValues('barcode');
      if (!currentVal) {
        const nextBarcode = calculateNextBarcode(allProducts);
        form.setValue('barcode', nextBarcode, { shouldValidate: true });
        hasAutoAssignedBarcodeRef.current = true;
      }
    }
  }, [allProducts, form]);

  // Magic 2: Auto-focus the Product Name field on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      productNameInputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Watch barcode for live duplicate detection
  const currentBarcode = form.watch('barcode');
  const duplicateProduct = useMemo(() => {
    const raw = currentBarcode ? String(currentBarcode).trim().toLowerCase() : '';
    if (!raw) return null;
    return (
      (allProducts || []).find(
        (p) => p.barcode && String(p.barcode).trim().toLowerCase() === raw
      ) || null
    );
  }, [allProducts, currentBarcode]);

  // Handler to manually regenerate the next barcode
  const handleAutoGenerateBarcode = () => {
    const candidate = calculateNextBarcode(allProducts);
    form.setValue('barcode', candidate, { shouldValidate: true, shouldDirty: true });
    toast({
      title: 'Barcode Generated',
      description: `Assigned unique barcode "${candidate}" (Prefix: WIN00).`,
    });
  };

  const onInvalid = (errors: any) => {
    console.warn('New product form validation failed:', errors);
    const errorMessages = Object.entries(errors)
      .map(([field, err]: [string, any]) => `${field}: ${err?.message || 'Invalid'}`)
      .join(', ');
    toast({
      variant: 'destructive',
      title: 'Validation Error',
      description: errorMessages || 'Please check the required product fields.',
    });
  };

  const onSubmit = async (data: ProductFormValues) => {
    if (!firestore) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Firestore is not initialized. Please refresh and try again.',
      });
      return;
    }

    setIsSaving(true);

    try {
      const isGstIncluded = Boolean(data.isGstIncluded);
      const purchasePrice = Number(data.purchasePrice) || 0;
      const gstPercentage = Number(data.gstPercentage) || 0;
      const sellingPrice = Number(data.sellingPrice) || 0;

      const baseCost = isGstIncluded && gstPercentage > 0
        ? Math.round(((purchasePrice / (1 + gstPercentage / 100)) + Number.EPSILON) * 100) / 100
        : purchasePrice;
      const cleanSellingPrice = Math.round((sellingPrice + Number.EPSILON) * 100) / 100;

      const markupPercentage = typeof data.markupPercentage === 'number' && !isNaN(data.markupPercentage)
        ? data.markupPercentage
        : baseCost > 0
          ? Math.round(((cleanSellingPrice - baseCost) / baseCost) * 100 * 10) / 10
          : 30;

      const cleanPayload = {
        productName: data.productName.trim(),
        category: data.category.trim(),
        purchasePrice,
        sellingPrice: cleanSellingPrice,
        stockQuantity: Number(data.stockQuantity) || 0,
        gstPercentage,
        barcode: (data.barcode || '').trim(),
        markupPercentage,
        isGstIncluded,
        basePurchasePrice: baseCost,
        createdBy: currentAuthUser?.uid || '',
        createdByName: currentUserDoc?.name || currentAuthUser?.displayName || currentAuthUser?.email?.split('@')[0] || 'Admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const productsCollection = collection(firestore, 'products');
      await addDoc(productsCollection, cleanPayload);

      if (saveMode === 'saveAndNew') {
        toast({
          title: 'Product Saved',
          description: `"${cleanPayload.productName}" added! Ready for next product.`,
        });

        // Remember the category to speed up batch entry
        const previousCategory = data.category.trim() || 'General';

        // Calculate next candidate barcode factoring in the newly created product
        const updatedMockList: Product[] = [
          ...(allProducts || []),
          { id: 'temp', ...cleanPayload } as Product,
        ];
        const nextBarcode = calculateNextBarcode(updatedMockList);

        // Reset form for next item
        form.reset({
          productName: '',
          category: previousCategory,
          purchasePrice: 0,
          sellingPrice: 0,
          stockQuantity: 0,
          gstPercentage: 18,
          barcode: nextBarcode,
          markupPercentage: 30,
          isGstIncluded: false,
          basePurchasePrice: 0,
        });

        // Refocus product name input
        setTimeout(() => {
          productNameInputRef.current?.focus();
        }, 80);
      } else {
        toast({
          title: 'Product Added',
          description: `${cleanPayload.productName} has been successfully added to your inventory.`,
        });
        router.push('/products');
      }
    } catch (error: any) {
      console.error('Error adding product:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error?.message || 'Failed to add product. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Keyboard shortcut: Cmd+Enter or Ctrl+Enter to save immediately
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      setSaveMode('save');
      form.handleSubmit(onSubmit, onInvalid)();
    }
  };

  return (
    <>
      <PageHeader
        title="Add New Product"
        description="Fill out the details below. Default GST is 18%. Selling price is automatically calculated using standard markup."
      />
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit, onInvalid)}
          onKeyDown={handleKeyDown}
          className="space-y-6"
        >
          {/* Card 1: Product Information */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-muted text-foreground">
                  <Package className="h-4 w-4" />
                </div>
                <CardTitle className="text-lg">Product Details & Identification</CardTitle>
              </div>
              <CardDescription>
                Basic information, barcode/SKU, and starting inventory count.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <FormField
                control={form.control}
                name="productName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product Name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Castrol Engine Oil 15W-40 5L"
                        {...field}
                        ref={(e) => {
                          field.ref(e);
                          productNameInputRef.current = e;
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category *</FormLabel>
                    <FormControl>
                      <CategorySelectField
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select category..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="barcode"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <div className="flex items-center justify-between">
                      <FormLabel className="flex items-center gap-1.5">
                        <span>Barcode / SKU</span>
                        {field.value && (
                          <span className="text-[11px] text-muted-foreground font-normal">
                            (Auto-assigned)
                          </span>
                        )}
                      </FormLabel>
                      {field.value && (
                        <Badge variant="outline" className="text-[10px] font-mono bg-primary/5 text-primary border-primary/20">
                          {field.value}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          placeholder="e.g. WIN00123"
                          className="font-mono font-medium"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleAutoGenerateBarcode}
                        className="gap-1.5 shrink-0 text-primary hover:text-primary font-medium"
                        title="Auto-generate next unique barcode with prefix WIN00"
                      >
                        <Sparkles className="h-4 w-4" />
                        Next Barcode
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsScannerOpen(true)}
                        className="gap-1.5 shrink-0"
                      >
                        <ScanBarcode className="h-4 w-4" />
                        Scan
                      </Button>
                    </div>

                    {/* Warning if barcode already exists on another product */}
                    {duplicateProduct && (
                      <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold">Barcode Warning: </span>
                          Barcode &ldquo;<strong>{field.value}</strong>&rdquo; is already assigned to{' '}
                          <strong className="underline">{duplicateProduct.productName}</strong>
                          {duplicateProduct.category ? ` (${duplicateProduct.category})` : ''}.
                          Duplicate barcodes may cause scanner ambiguity during billing.
                        </div>
                      </div>
                    )}

                    <FormDescription>
                      Unique code for billing & labels. Auto-assigned with prefix WIN00, or scan physical barcode.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="stockQuantity"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <div className="flex items-center justify-between">
                      <FormLabel>Initial Stock Quantity</FormLabel>
                      <span className="text-xs text-muted-foreground">Current in-hand stock</span>
                    </div>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0"
                        className="font-mono"
                        {...field}
                      />
                    </FormControl>
                    {/* Quick stock pill presets */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[11px] text-muted-foreground mr-1">Quick:</span>
                      {[0, 5, 10, 20, 50, 100].map((qty) => (
                        <Button
                          key={qty}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[11px] font-mono rounded-md hover:bg-primary/10 hover:text-primary hover:border-primary/40"
                          onClick={() => form.setValue('stockQuantity', qty, { shouldValidate: true })}
                        >
                          {qty === 0 ? '0 (Out of stock)' : `${qty}`}
                        </Button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Card 2: Pricing & Profit Margin (Auto-Calculated with 18% default GST) */}
          <ProductPricingCard form={form} />

          {/* Form Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground hidden sm:block">
              Tip: Press <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px]">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 rounded bg-muted border font-mono text-[10px]">Enter</kbd> to save quickly.
            </p>
            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="secondary"
                disabled={isSaving}
                onClick={() => setSaveMode('saveAndNew')}
                className="gap-1.5 border border-primary/20 hover:border-primary/50 text-primary font-medium"
                title="Save product and immediately open blank form for next item"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Save & Add Another</span>
              </Button>
              <Button
                type="submit"
                size="default"
                disabled={isSaving}
                onClick={() => setSaveMode('save')}
                className="min-w-[130px] gap-1.5"
              >
                {isSaving && saveMode === 'save' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Save Product</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </Form>

      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onOpenChange={setIsScannerOpen}
        mode="set_barcode"
        onBarcodeScannedRaw={(scannedCode) => {
          form.setValue('barcode', scannedCode, { shouldValidate: true, shouldDirty: true });
        }}
      />
    </>
  );
}
