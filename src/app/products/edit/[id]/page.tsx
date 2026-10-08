'use client';

import { useState, useEffect } from 'react';
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { useFirestore, useDoc, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useRouter, useParams } from 'next/navigation';
import type { Product } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { ScanBarcode, Package } from 'lucide-react';
import { BarcodeScannerModal } from '@/components/barcode-scanner-modal';
import { ProductPricingCard } from '@/components/products/product-pricing-card';
import { CategorySelectField } from '@/components/categories/category-select-field';

const productSchema = z.object({
  productName: z.string().min(1, 'Product name is required'),
  category: z.string().min(1, 'Category is required'),
  purchasePrice: z.coerce.number().min(0, 'Purchase price must be positive'),
  sellingPrice: z.coerce.number().min(0, 'Selling price must be positive'),
  stockQuantity: z.coerce.number().min(0, 'Stock must be positive'),
  gstPercentage: z.coerce.number().min(0).max(100, 'GST must be between 0 and 100'),
  barcode: z.string().optional(),
  markupPercentage: z.coerce.number().optional(),
});

type ProductFormValues = z.infer<typeof productSchema>;

export default function EditProductPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const { id } = params;
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const productRef = useMemoFirebase(
    () => (firestore && id ? doc(firestore, 'products', id as string) : null),
    [firestore, id]
  );
  const { data: product, isLoading } = useDoc<Product>(productRef);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      productName: '',
      category: '',
      purchasePrice: 0,
      sellingPrice: 0,
      stockQuantity: 0,
      gstPercentage: 0,
      barcode: '',
      markupPercentage: 30,
    },
  });

  useEffect(() => {
    if (product) {
      const calculatedMarkup = product.purchasePrice > 0
        ? Math.round(((product.sellingPrice - product.purchasePrice) / product.purchasePrice) * 100 * 10) / 10
        : 30;

      form.reset({
        ...product,
        barcode: product.barcode || '',
        markupPercentage: product.markupPercentage ?? calculatedMarkup,
      });
    }
  }, [product, form]);

  const onSubmit = async (data: ProductFormValues) => {
    if (!firestore || !id) return;
    
    const docRef = doc(firestore, 'products', id as string);
    setDocumentNonBlocking(docRef, data, { merge: true });

    toast({
      title: 'Product Updated',
      description: `${data.productName} has been successfully updated.`,
    });
    router.push('/products');
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

  if (!product && !isLoading) {
    return (
      <>
        <PageHeader
          title="Product Not Found"
          description="The product you are trying to edit does not exist."
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
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                  <FormItem>
                    <FormLabel>Barcode / SKU</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input placeholder="Scan or type barcode" {...field} />
                      </FormControl>
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
                    <FormDescription>
                      Scan using camera or barcode gun to assign a barcode.
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
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" size="lg" className="min-w-[140px]">
              Save Changes
            </Button>
          </div>
        </form>
      </Form>

      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onOpenChange={setIsScannerOpen}
        mode="set_barcode"
        onBarcodeScannedRaw={(scannedCode) => {
          form.setValue('barcode', scannedCode);
        }}
      />
    </>
  );
}
