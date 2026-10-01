'use client';

import { useState } from 'react';
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
import { useFirestore, addDocumentNonBlocking } from '@/firebase';
import { collection } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { ScanBarcode, Package } from 'lucide-react';
import { BarcodeScannerModal } from '@/components/barcode-scanner-modal';
import { ProductPricingCard } from '@/components/products/product-pricing-card';

const productSchema = z.object({
  productName: z.string().min(1, 'Product name is required'),
  category: z.string().min(1, 'Category is required'),
  purchasePrice: z.coerce.number().min(0, 'Purchase price must be positive'),
  sellingPrice: z.coerce.number().min(0, 'Selling price must be positive'),
  stockQuantity: z.coerce.number().int().min(0, 'Stock must be a whole number'),
  gstPercentage: z.coerce.number().min(0).max(100, 'GST must be between 0 and 100'),
  barcode: z.string().optional(),
  markupPercentage: z.coerce.number().optional(),
});

type ProductFormValues = z.infer<typeof productSchema>;

export default function NewProductPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const [isScannerOpen, setIsScannerOpen] = useState(false);

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

  const onSubmit = async (data: ProductFormValues) => {
    if (!firestore) return;

    try {
      const productsCollection = collection(firestore, 'products');
      await addDocumentNonBlocking(productsCollection, data);

      toast({
        title: 'Product Added',
        description: `${data.productName} has been successfully added to your inventory.`,
      });
      router.push('/products');
    } catch (error) {
      console.error('Error adding product:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to add product. Please try again.',
      });
    }
  };

  return (
    <>
      <PageHeader
        title="Add New Product"
        description="Fill out the details below. Selling price is automatically generated using standard markup."
      />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                      <Input placeholder="e.g., Lubricants, Spares, Electronics" {...field} />
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
                    <FormLabel>Initial Stock Quantity</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" placeholder="0" {...field} />
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
              Save Product
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
