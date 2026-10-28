'use client';

import { useState, useEffect, useMemo } from 'react';
import { z } from 'zod';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
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
  CardFooter,
} from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import {
  useFirestore,
  useDoc,
  useCollection,
  useMemoFirebase,
} from '@/firebase';
import { collection, doc, runTransaction, query, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useRouter, useParams } from 'next/navigation';
import type { Product, Vendor, Purchase, Category } from '@/lib/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  CalendarIcon,
  PlusCircle,
  Trash2,
  ScanBarcode,
  CreditCard,
  Building2,
  Loader2,
  Save,
} from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { cn, formatCurrency } from '@/lib/utils';
import { format, addDays } from 'date-fns';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { BarcodeScannerModal } from '@/components/barcode-scanner-modal';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { ProductSearchCombobox } from '@/components/products/product-search-combobox';
import { Skeleton } from '@/components/ui/skeleton';

const purchaseItemSchema = z.object({
  productId: z.string().min(1, 'Please select a product'),
  quantity: z.coerce.number().min(0.001, 'Quantity must be at least 0.001'),
  purchasePrice: z.coerce.number().min(0, 'Price must be positive'),
});

const purchaseSchema = z.object({
  supplierName: z.string().min(1, 'Supplier name is required'),
  vendorId: z.string().optional(),
  invoiceNo: z.string().min(1, 'Invoice number is required'),
  date: z.date({ required_error: 'A date is required.' }),
  paymentStatus: z.enum(['Paid', 'Partial', 'Pending']),
  amountPaid: z.coerce.number().min(0, 'Amount paid cannot be negative'),
  discount: z.coerce.number().min(0, 'Discount cannot be negative').optional(),
  dueDate: z.date().optional(),
  paymentNotes: z.string().optional(),
  items: z.array(purchaseItemSchema).min(1, 'Please add at least one item.'),
});

type PurchaseFormValues = z.infer<typeof purchaseSchema>;

export default function EditPurchasePage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Item Bar inputs (like Invoice page)
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [itemQuantity, setItemQuantity] = useState<number | string>(1);
  const [itemPrice, setItemPrice] = useState<number | string>('');

  // Load existing purchase doc
  const purchaseRef = useMemoFirebase(
    () => (firestore && id ? doc(firestore, 'purchases', id) : null),
    [firestore, id]
  );
  const { data: purchase, isLoading: isPurchaseLoading } = useDoc<Purchase>(purchaseRef);

  // Load products & vendors & categories
  const productsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'products') : null),
    [firestore]
  );
  const { data: products, isLoading: productsLoading } = useCollection<Product>(productsQuery);

  const categoriesQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'categories'), orderBy('name')) : null),
    [firestore]
  );
  const { data: dbCategories } = useCollection<Category>(categoriesQuery);

  // Extract unique categories for dropdown filter
  const categories = useMemo(() => {
    const set = new Set<string>();
    (dbCategories || []).forEach((c) => {
      if (c.name && c.name.trim()) set.add(c.name.trim());
    });
    (products || []).forEach((p) => {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    });
    return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))];
  }, [dbCategories, products]);

  const vendorsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'vendors') : null),
    [firestore]
  );
  const { data: vendors } = useCollection<Vendor>(vendorsQuery);

  const form = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      supplierName: '',
      vendorId: '',
      invoiceNo: '',
      items: [],
      date: new Date(),
      paymentStatus: 'Paid',
      amountPaid: 0,
      discount: 0,
      dueDate: addDays(new Date(), 15),
      paymentNotes: '',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  // Populate form with existing purchase data when loaded
  useEffect(() => {
    if (purchase) {
      form.reset({
        supplierName: purchase.supplierName || '',
        vendorId: purchase.vendorId || '',
        invoiceNo: purchase.invoiceNo || '',
        items: (purchase.items || []).map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          purchasePrice: i.purchasePrice,
        })),
        date: purchase.date ? new Date(purchase.date) : new Date(),
        paymentStatus: purchase.paymentStatus || 'Paid',
        amountPaid: purchase.amountPaid ?? purchase.totalAmount,
        discount: purchase.discount || 0,
        dueDate: purchase.dueDate ? new Date(purchase.dueDate) : undefined,
        paymentNotes: purchase.paymentNotes || '',
      });
    }
  }, [purchase, form]);

  const handleScannedProduct = (product: Product, scanQuantity: number) => {
    const currentItems = form.getValues('items') || [];
    const existingIndex = currentItems.findIndex((i) => i.productId === product.id);

    if (existingIndex > -1) {
      const existing = currentItems[existingIndex];
      form.setValue(`items.${existingIndex}.quantity`, existing.quantity + scanQuantity);
    } else {
      append({
        productId: product.id,
        quantity: scanQuantity,
        purchasePrice: product.purchasePrice,
      });
    }

    toast({
      title: 'Item Scanned',
      description: `${scanQuantity} x ${product.productName} added to purchase list.`,
    });
  };

  const watchedItems = form.watch('items') || [];
  const watchedPaymentStatus = form.watch('paymentStatus');
  const watchedAmountPaid = form.watch('amountPaid') || 0;
  const watchedDiscount = form.watch('discount') || 0;

  const totalPurchaseAmount = Math.round(
    watchedItems.reduce((acc, current) => {
      return acc + ((Number(current?.quantity) || 0) * (Number(current?.purchasePrice) || 0));
    }, 0) * 100
  ) / 100;

  const remainingBalance = Math.max(0, Math.round((totalPurchaseAmount - watchedAmountPaid - watchedDiscount) * 100) / 100);

  const handleVendorSelect = (vendorId: string) => {
    if (vendorId === 'custom') {
      form.setValue('vendorId', '');
      return;
    }
    const vendor = vendors?.find((v) => v.id === vendorId);
    if (vendor) {
      form.setValue('vendorId', vendor.id);
      form.setValue('supplierName', `${vendor.companyName} (${vendor.name})`);
    }
  };

  const handleProductSelect = (product: Product | null) => {
    if (product) {
      setSelectedProductId(product.id);
      setItemPrice(product.purchasePrice ?? 0);
    } else {
      setSelectedProductId('');
      setItemPrice('');
    }
  };

  const handleAddItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!selectedProductId) {
      toast({
        variant: 'destructive',
        title: 'Please select a product',
        description: 'Choose a product from the search combobox before adding.',
      });
      return;
    }

    const product = products?.find((p) => p.id === selectedProductId);
    if (!product) {
      toast({
        variant: 'destructive',
        title: 'Product not found',
        description: 'Selected product could not be identified.',
      });
      return;
    }

    const qty = Number(itemQuantity);
    if (isNaN(qty) || qty <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid quantity',
        description: 'Quantity must be greater than 0.',
      });
      return;
    }

    const price = Number(itemPrice);
    if (isNaN(price) || price < 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid price',
        description: 'Purchase price must be positive.',
      });
      return;
    }

    const currentItems = form.getValues('items') || [];
    const existingIndex = currentItems.findIndex((i) => i.productId === selectedProductId);

    if (existingIndex > -1) {
      const existing = currentItems[existingIndex];
      const newQty = (Number(existing.quantity) || 0) + qty;
      form.setValue(`items.${existingIndex}.quantity`, newQty, { shouldValidate: true });
      form.setValue(`items.${existingIndex}.purchasePrice`, price, { shouldValidate: true });
      toast({
        title: 'Quantity Updated',
        description: `Updated ${product.productName} quantity to ${newQty}.`,
      });
    } else {
      append({
        productId: selectedProductId,
        quantity: qty,
        purchasePrice: price,
      });
      toast({
        title: 'Item Added',
        description: `Added ${product.productName} to purchase list.`,
      });
    }

    // Reset inputs
    setSelectedProductId('');
    setItemQuantity(1);
    setItemPrice('');
  };

  const onSubmit = async (data: PurchaseFormValues) => {
    if (!firestore || !products || !purchase || !id) return;
    setIsSaving(true);

    try {
      const finalDiscount = Number(data.discount) || 0;
      const finalAmountPaid = data.paymentStatus === 'Paid'
        ? Math.max(0, Math.round((totalPurchaseAmount - finalDiscount) * 100) / 100)
        : Number(data.amountPaid) || 0;
      const finalPending = Math.max(0, Math.round((totalPurchaseAmount - finalAmountPaid - finalDiscount) * 100) / 100);

      await runTransaction(firestore, async (transaction) => {
        const purchaseDocRef = doc(firestore, 'purchases', id);
        const currentPurchaseDoc = await transaction.get(purchaseDocRef);
        if (!currentPurchaseDoc.exists()) {
          throw new Error('Purchase record no longer exists.');
        }

        const originalPurchase = currentPurchaseDoc.data() as Purchase;

        // Build list of all distinct product IDs involved in original or new purchase
        const originalItemMap = new Map<string, number>();
        (originalPurchase.items || []).forEach((item) => {
          originalItemMap.set(item.productId, (originalItemMap.get(item.productId) || 0) + Number(item.quantity));
        });

        const newItemMap = new Map<string, number>();
        data.items.forEach((item) => {
          newItemMap.set(item.productId, (newItemMap.get(item.productId) || 0) + Number(item.quantity));
        });

        const allProductIds = Array.from(new Set([...originalItemMap.keys(), ...newItemMap.keys()]));

        // Read all product docs first (Transaction Read Phase)
        const productDocRefs = allProductIds.map((pId) => doc(firestore, 'products', pId));
        const productSnapshots = await Promise.all(productDocRefs.map((ref) => transaction.get(ref)));

        // Read vendor doc(s)
        let oldVendorRef = null;
        let oldVendorSnap = null;
        if (originalPurchase.vendorId) {
          oldVendorRef = doc(firestore, 'vendors', originalPurchase.vendorId);
          oldVendorSnap = await transaction.get(oldVendorRef);
        }

        let newVendorRef = null;
        let newVendorSnap = null;
        if (data.vendorId) {
          if (data.vendorId === originalPurchase.vendorId && oldVendorSnap) {
            newVendorRef = oldVendorRef;
            newVendorSnap = oldVendorSnap;
          } else {
            newVendorRef = doc(firestore, 'vendors', data.vendorId);
            newVendorSnap = await transaction.get(newVendorRef);
          }
        }

        // --- Transaction Write Phase ---
        // 1. Synchronize Inventory Stock deltas
        productSnapshots.forEach((snap, idx) => {
          if (snap.exists()) {
            const pId = allProductIds[idx];
            const currentStock = Number(snap.data()?.stockQuantity || 0);
            const oldQty = originalItemMap.get(pId) || 0;
            const newQty = newItemMap.get(pId) || 0;
            const delta = newQty - oldQty;

            if (delta !== 0) {
              const updatedStock = Math.max(0, Math.round((currentStock + delta) * 1000) / 1000);
              transaction.update(productDocRefs[idx], { stockQuantity: updatedStock });
            }
          }
        });

        // 2. Synchronize Vendor Pending Balances
        const oldUnpaid = Math.max(
          0,
          Math.round(
            (originalPurchase.totalAmount -
              (originalPurchase.amountPaid ?? (originalPurchase.paymentStatus === 'Paid' ? originalPurchase.totalAmount : 0)) -
              (originalPurchase.discount || 0)) * 100
          ) / 100
        );

        if (oldVendorRef && oldVendorSnap && oldVendorSnap.exists() && oldVendorRef.id !== data.vendorId) {
          // Vendor changed: deduct old unpaid from former vendor
          const currentPending = Number(oldVendorSnap.data()?.pendingAmount || 0);
          transaction.update(oldVendorRef, {
            pendingAmount: Math.max(0, Math.round((currentPending - oldUnpaid) * 100) / 100),
          });
        }

        if (newVendorRef && newVendorSnap && newVendorSnap.exists()) {
          const currentPending = Number(newVendorSnap.data()?.pendingAmount || 0);
          if (newVendorRef.id === originalPurchase.vendorId) {
            // Same vendor: adjust by difference
            const deltaUnpaid = finalPending - oldUnpaid;
            transaction.update(newVendorRef, {
              pendingAmount: Math.max(0, Math.round((currentPending + deltaUnpaid) * 100) / 100),
            });
          } else {
            // New vendor: add new unpaid amount
            transaction.update(newVendorRef, {
              pendingAmount: Math.max(0, Math.round((currentPending + finalPending) * 100) / 100),
            });
          }
        }

        // 3. Format line items with product names
        const enrichedItems = data.items.map((item) => {
          const prod = products.find((p) => p.id === item.productId);
          return {
            productId: item.productId,
            productName: prod?.productName || 'Product',
            quantity: Number(item.quantity),
            purchasePrice: Number(item.purchasePrice),
            totalAmount: Math.round(Number(item.quantity) * Number(item.purchasePrice) * 100) / 100,
          };
        });

        // 4. Update the Purchase document
        transaction.update(purchaseDocRef, {
          supplierName: data.supplierName,
          vendorId: data.vendorId || null,
          invoiceNo: data.invoiceNo,
          date: data.date.toISOString(),
          items: enrichedItems,
          totalAmount: totalPurchaseAmount,
          paymentStatus: data.paymentStatus,
          amountPaid: finalAmountPaid,
          discount: finalDiscount,
          dueDate: data.dueDate ? data.dueDate.toISOString() : null,
          paymentNotes: data.paymentNotes || '',
          updatedAt: new Date().toISOString(),
        });
      });

      toast({
        title: 'Purchase Updated',
        description: `Invoice #${data.invoiceNo} successfully updated. Stock and balances synced.`,
      });
      router.push('/purchases');
    } catch (error: any) {
      console.error('Error updating purchase:', error);
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: error.message || 'Failed to update purchase.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isPurchaseLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Edit Purchase" description="Loading purchase details..." />
        <Card className="p-6">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-32 w-full" />
        </Card>
      </div>
    );
  }

  if (!purchase && !isPurchaseLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Purchase Not Found" description="The requested purchase record could not be found." />
        <Button onClick={() => router.push('/purchases')}>Back to Purchases</Button>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={`Edit Purchase: #${form.watch('invoiceNo') || purchase?.invoiceNo}`}
        description="Update supplier, invoice items, prices, quantities, and payment status."
      >
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          Back
        </Button>
      </PageHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-8">
              {/* Supplier & Invoice Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Building2 className="h-4 w-4 text-primary" /> Supplier & Invoice Details
                  </CardTitle>
                  <CardDescription>Select vendor or edit supplier info and bill number.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <FormItem>
                    <FormLabel>Select Registered Vendor (Optional)</FormLabel>
                    <Select
                      value={form.watch('vendorId') || 'custom'}
                      onValueChange={handleVendorSelect}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a registered vendor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom">-- Custom / Unregistered Supplier --</SelectItem>
                        {(vendors || []).map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.companyName} ({v.name}) {v.pendingAmount > 0 ? `• ₹${v.pendingAmount.toLocaleString()} Due` : '• Clear'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>

                  <FormField
                    control={form.control}
                    name="supplierName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Supplier / Vendor Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., TVS Auto Spares" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="invoiceNo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Invoice Number *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., INV-2024-001" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Purchase Date *</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  'w-full pl-3 text-left font-normal',
                                  !field.value && 'text-muted-foreground'
                                )}
                              >
                                {field.value ? format(field.value, 'dd-MMM-yyyy') : <span>Pick a date</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => date > new Date() || date < new Date('1900-01-01')}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Add Item Bar (Matches Invoice layout) */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div>
                    <CardTitle className="text-base font-semibold">Add Purchase Item</CardTitle>
                    <CardDescription>Filter by category, search product, set cost and quantity.</CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => setIsScannerOpen(true)}
                  >
                    <ScanBarcode className="h-4 w-4" /> Scan Barcode
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-12 items-end">
                    {/* Category Filter */}
                    <div className="sm:col-span-3">
                      <Label className="text-xs font-medium mb-1.5 block">Category</Label>
                      <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="All Categories" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat === 'all' ? 'All Categories' : cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Search & Find Product */}
                    <div className="sm:col-span-4">
                      <Label className="text-xs font-medium mb-1.5 block">Search & Find Product</Label>
                      <ProductSearchCombobox
                        products={products || []}
                        value={selectedProductId}
                        filterCategory={selectedCategory}
                        disabled={productsLoading}
                        priceType="purchasePrice"
                        placeholder="Search by name, part no, barcode..."
                        onSelect={handleProductSelect}
                      />
                    </div>

                    {/* Quantity */}
                    <div className="sm:col-span-2">
                      <Label className="text-xs font-medium mb-1.5 block">Quantity</Label>
                      <Input
                        type="number"
                        min="0.001"
                        step="any"
                        placeholder="1"
                        className="font-mono"
                        value={itemQuantity}
                        onChange={(e) => setItemQuantity(e.target.value)}
                      />
                    </div>

                    {/* Purchase Price */}
                    <div className="sm:col-span-2">
                      <Label className="text-xs font-medium mb-1.5 block">Price (₹)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0.00"
                        className="font-mono"
                        value={itemPrice}
                        onChange={(e) => setItemPrice(e.target.value)}
                      />
                    </div>

                    {/* Add Button */}
                    <div className="sm:col-span-1">
                      <Button
                        type="button"
                        onClick={handleAddItem}
                        className="w-full gap-1.5"
                      >
                        <PlusCircle className="h-4 w-4" /> Add
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Purchase Items List Table */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-base font-semibold">Purchase Items</CardTitle>
                  {fields.length > 0 && (
                    <Badge variant="outline" className="text-xs font-mono font-normal">
                      {fields.length} {fields.length === 1 ? 'item' : 'items'}
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-6">Product</TableHead>
                        <TableHead className="w-[110px]">Qty</TableHead>
                        <TableHead className="w-[130px] text-right">Price (₹)</TableHead>
                        <TableHead className="w-[130px] text-right">Total (₹)</TableHead>
                        <TableHead className="w-[50px] pr-6"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fields.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-10 text-muted-foreground text-sm">
                            No items added yet. Select a product above or scan barcodes.
                          </TableCell>
                        </TableRow>
                      ) : (
                        fields.map((item, index) => {
                          const product = products?.find((p) => p.id === form.watch(`items.${index}.productId`));
                          const currentQty = Number(form.watch(`items.${index}.quantity`)) || 0;
                          const currentPrice = Number(form.watch(`items.${index}.purchasePrice`)) || 0;
                          const rowTotal = Math.round(currentQty * currentPrice * 100) / 100;

                          return (
                            <TableRow key={item.id}>
                              <TableCell className="pl-6">
                                <div className="font-medium text-foreground">
                                  {product?.productName || 'Custom Product'}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                                  {product?.category && (
                                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4 font-normal">
                                      {product.category}
                                    </Badge>
                                  )}
                                  {product?.barcode && (
                                    <span className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded border">
                                      {product.barcode}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Controller
                                  control={form.control}
                                  name={`items.${index}.quantity`}
                                  render={({ field }) => (
                                    <Input
                                      type="number"
                                      min="0.001"
                                      step="any"
                                      className="font-mono text-xs h-8 w-20"
                                      {...field}
                                    />
                                  )}
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                <Controller
                                  control={form.control}
                                  name={`items.${index}.purchasePrice`}
                                  render={({ field }) => (
                                    <Input
                                      type="number"
                                      min="0"
                                      step="any"
                                      className="font-mono text-xs h-8 w-24 text-right ml-auto"
                                      {...field}
                                    />
                                  )}
                                />
                              </TableCell>
                              <TableCell className="text-right font-mono font-medium text-xs">
                                ₹{formatCurrency(rowTotal)}
                              </TableCell>
                              <TableCell className="pr-6 text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => remove(index)}
                                  className="text-muted-foreground hover:text-destructive h-8 w-8"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar Summary & Payment Details */}
            <div className="space-y-8">
              <Card className="border-primary/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CreditCard className="h-4 w-4 text-primary" /> Payment & Settlement
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="paymentStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Status</FormLabel>
                        <Select
                          onValueChange={(val) => {
                            field.onChange(val);
                            if (val === 'Paid') {
                              form.setValue('amountPaid', totalPurchaseAmount);
                            } else if (val === 'Pending') {
                              form.setValue('amountPaid', 0);
                            }
                          }}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Paid">Fully Paid</SelectItem>
                            <SelectItem value="Partial">Partial Payment</SelectItem>
                            <SelectItem value="Pending">Pending / Credit</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  {watchedPaymentStatus === 'Partial' && (
                    <FormField
                      control={form.control}
                      name="amountPaid"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount Paid (₹)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="0.00"
                              className="font-mono text-sm"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="discount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Discount from Supplier (₹)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0.00"
                            className="font-mono text-sm"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {watchedPaymentStatus !== 'Paid' && (
                    <FormField
                      control={form.control}
                      name="dueDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Payment Due Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    'w-full pl-3 text-left font-normal text-xs',
                                    !field.value && 'text-muted-foreground'
                                  )}
                                >
                                  {field.value ? format(field.value, 'dd-MMM-yyyy') : <span>Set reminder date</span>}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="paymentNotes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes / Payment Ref</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Cheque #1029, NEFT ref" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Summary Breakdown */}
                  <div className="rounded-lg bg-muted/60 p-4 space-y-2 border text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal Items:</span>
                      <span className="font-mono font-semibold">₹{formatCurrency(totalPurchaseAmount)}</span>
                    </div>
                    {watchedDiscount > 0 && (
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                        <span>Supplier Discount:</span>
                        <span className="font-mono font-semibold">-₹{formatCurrency(watchedDiscount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-2 text-sm font-bold">
                      <span>Total Payable:</span>
                      <span className="font-mono text-primary">
                        ₹{formatCurrency(Math.max(0, totalPurchaseAmount - watchedDiscount))}
                      </span>
                    </div>
                    {watchedPaymentStatus !== 'Paid' && (
                      <div className="flex justify-between border-t pt-1 font-semibold text-amber-600 dark:text-amber-400">
                        <span>Remaining Balance:</span>
                        <span className="font-mono">₹{formatCurrency(remainingBalance)}</span>
                      </div>
                    )}
                  </div>

                  <Button type="submit" size="lg" className="w-full gap-2 font-semibold" disabled={isSaving}>
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Purchase Changes
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </Form>

      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onOpenChange={setIsScannerOpen}
        onProductScanned={handleScannedProduct}
      />
    </>
  );
}
