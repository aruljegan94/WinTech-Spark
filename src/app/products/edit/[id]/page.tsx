'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
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
import { useFirestore, useDoc, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { doc, setDoc, collection } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useRouter, useParams } from 'next/navigation';
import type { Product, User } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { ScanBarcode, Package, Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import { BarcodeScannerModal } from '@/components/barcode-scanner-modal';
import { ProductPricingCard } from '@/components/products/product-pricing-card';
import { CategorySelectField } from '@/components/categories/category-select-field';

// Ultra-robust schema using preprocess to prevent any silent NaN, undefined, or type mismatches
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
      const n = Number(v);
      return isNaN(n) || n < 0 ? 0 : Math.min(100, n);
    },
    z.number().min(0).max(100, 'GST must be between 0 and 100')
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

export default function EditProductPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const idParam = params?.id;
  const productId = typeof idParam === 'string'
    ? decodeURIComponent(idParam)
    : Array.isArray(idParam)
      ? decodeURIComponent(idParam[0])
      : '';

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const lastInitializedIdRef = useRef<string | null>(null);

  // Single product query
  const productRef = useMemoFirebase(
    () => (firestore && productId ? doc(firestore, 'products', productId) : null),
    [firestore, productId]
  );
  const { data: product, isLoading, error: docError } = useDoc<Product>(productRef);

  const { user: currentAuthUser } = useUser();
  const currentUserDocRef = useMemoFirebase(
    () => (firestore && currentAuthUser ? doc(firestore, 'users', currentAuthUser.uid) : null),
    [firestore, currentAuthUser]
  );
  const { data: currentUserDoc } = useDoc<User>(currentUserDocRef);

  // All products query for duplicate barcode detection and auto-generating next sequence
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
      gstPercentage: 0,
      barcode: '',
      markupPercentage: 30,
      isGstIncluded: false,
      basePurchasePrice: 0,
    },
  });

  // Watch barcode for live duplicate detection
  const currentBarcode = form.watch('barcode');
  const duplicateProduct = useMemo(() => {
    const raw = currentBarcode ? String(currentBarcode).trim().toLowerCase() : '';
    if (!raw) return null;
    return (
      (allProducts || []).find(
        (p) =>
          p.id !== productId &&
          p.barcode &&
          String(p.barcode).trim().toLowerCase() === raw
      ) || null
    );
  }, [allProducts, currentBarcode, productId]);

  // Handler to auto-generate the next barcode with prefix "WIN00"
  const handleAutoGenerateBarcode = () => {
    let maxNumber = 0;
    const existingBarcodes = new Set<string>();

    (allProducts || []).forEach((p) => {
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

    // Guarantee uniqueness
    while (existingBarcodes.has(candidate.toUpperCase())) {
      nextNumber++;
      candidate = `WIN00${nextNumber}`;
    }

    form.setValue('barcode', candidate, { shouldValidate: true, shouldDirty: true });
    toast({
      title: 'Barcode Generated',
      description: `Assigned unique barcode "${candidate}" (Prefix: WIN00).`,
    });
  };

  useEffect(() => {
    if (product && lastInitializedIdRef.current !== productId) {
      const isGstIncluded = Boolean(product.isGstIncluded);
      const purchasePrice = Number(product.purchasePrice) || 0;
      const sellingPrice = Number(product.sellingPrice) || 0;
      const gstPercentage = typeof product.gstPercentage === 'number' && !isNaN(product.gstPercentage)
        ? product.gstPercentage
        : 18;

      const baseCost = isGstIncluded && gstPercentage > 0
        ? Math.round(((purchasePrice / (1 + gstPercentage / 100)) + Number.EPSILON) * 100) / 100
        : (typeof product.basePurchasePrice === 'number' && !isNaN(product.basePurchasePrice)
          ? product.basePurchasePrice
          : purchasePrice);

      const calculatedMarkup = baseCost > 0
        ? Math.round(((sellingPrice - baseCost) / baseCost) * 100 * 10) / 10
        : 30;

      const rawBarcode = product.barcode != null ? String(product.barcode).trim() : '';

      form.reset({
        productName: product.productName ? String(product.productName).trim() : '',
        category: product.category ? String(product.category).trim() : 'General',
        purchasePrice,
        sellingPrice,
        stockQuantity: Number(product.stockQuantity) || 0,
        gstPercentage,
        barcode: rawBarcode,
        isGstIncluded,
        basePurchasePrice: baseCost,
        markupPercentage: typeof product.markupPercentage === 'number' && !isNaN(product.markupPercentage)
          ? product.markupPercentage
          : calculatedMarkup,
      });

      lastInitializedIdRef.current = productId;
    }
  }, [product, productId, form]);

  const onInvalid = (errors: any) => {
    console.warn('Product form validation failed:', errors);
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
        title: 'Connection Error',
        description: 'Firestore is not initialized. Please refresh and try again.',
      });
      return;
    }

    if (!productId) {
      toast({
        variant: 'destructive',
        title: 'Invalid Product',
        description: 'Unable to identify the product ID to update.',
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

      const barcodeVal = data.barcode ? String(data.barcode).trim() : '';

      // Ensure NO undefined or NaN values are passed to Firestore
      const cleanPayload = {
        productName: data.productName.trim(),
        category: (data.category || 'General').trim(),
        purchasePrice,
        sellingPrice: cleanSellingPrice,
        stockQuantity: Number(data.stockQuantity) || 0,
        gstPercentage,
        barcode: barcodeVal,
        markupPercentage,
        isGstIncluded,
        basePurchasePrice: baseCost,
        updatedBy: currentAuthUser?.uid || '',
        updatedByName: currentUserDoc?.name || currentAuthUser?.displayName || currentAuthUser?.email?.split('@')[0] || 'Admin',
        updatedAt: new Date().toISOString(),
      };

      const docRef = doc(firestore, 'products', productId);
      await setDoc(docRef, cleanPayload, { merge: true });

      toast({
        title: 'Product Updated',
        description: `"${cleanPayload.productName}" has been successfully updated.`,
      });

      router.push('/products');
    } catch (error: any) {
      console.error('Error updating product:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to Save Product',
        description: error?.message || 'An error occurred while updating the product. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <>
        <PageHeader
          title="Edit Product"
          description="Update the details of your product."
        />
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  if (docError) {
    return (
      <>
        <PageHeader
          title="Error Loading Product"
          description={docError.message || 'Unable to retrieve product details.'}
        />
        <Button onClick={() => router.push('/products')}>Back to Products</Button>
      </>
    );
  }

  if (!product && !isLoading) {
    return (
      <>
        <PageHeader
          title="Product Not Found"
          description="The product you are trying to edit does not exist or has been deleted."
        />
        <Button onClick={() => router.push('/products')}>Go to Products</Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Edit Product"
        description="Update the details, pricing, and profit margins of your product."
      />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6">
          {/* Card 1: Product Identification */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-muted text-foreground">
                  <Package className="h-4 w-4" />
                </div>
                <CardTitle className="text-lg">Product Details & Identification</CardTitle>
              </div>
              <CardDescription>
                Modify name, category, barcode, and inventory stock.
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
                      <Input placeholder="e.g., Engine Oil 5L" {...field} />
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
                      <FormLabel>Barcode / SKU</FormLabel>
                      {field.value && (
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {field.value}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          placeholder="e.g. WIN00123"
                          className="font-mono"
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
                        Auto-Generate
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
                      Scan using a camera/gun or click <strong>Auto-Generate</strong> for prefix WIN00 (e.g. WIN00123).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="stockQuantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Stock Quantity</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="any" className="font-mono" {...field} />
                    </FormControl>
                    <FormDescription>
                      The current number of units in stock.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Card 2: Pricing & Profit Margin (Auto-Calculated) */}
          <ProductPricingCard form={form} />

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-2">
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
              size="lg"
              disabled={isSaving}
              className="min-w-[140px] gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
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
