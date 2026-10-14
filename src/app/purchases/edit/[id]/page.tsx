'use client';

import { useState, useEffect } from 'react';
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
import { collection, doc, runTransaction } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useRouter, useParams } from 'next/navigation';
import type { Product, Vendor, Purchase } from '@/lib/types';
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

  // Load existing purchase doc
  const purchaseRef = useMemoFirebase(
    () => (firestore && id ? doc(firestore, 'purchases', id) : null),
    [firestore, id]
  );
  const { data: purchase, isLoading: isPurchaseLoading } = useDoc<Purchase>(purchaseRef);

  // Load products & vendors
  const productsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'products') : null),
    [firestore]
  );
  const { data: products, isLoading: productsLoading } = useCollection<Product>(productsQuery);

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

  const handleAddItem = () => {
    if (products && products.length > 0) {
      append({
        productId: '',
        quantity: 1,
        purchasePrice: 0,
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'No Products',
        description: 'Please add products to your catalog first.',
      });
    }
  };

  const handleProductChange = (index: number, productId: string) => {
    const currentItem = form.getValues(`items.${index}`);
    if (!productId) {
      form.setValue(`items.${index}`, {
        ...currentItem,
        productId: '',
        purchasePrice: 0,
      });
      return;
    }
    const product = products?.find((p) => p.id === productId);
    if (product) {
      form.setValue(`items.${index}`, {
        ...currentItem,
        productId,
        purchasePrice: product.purchasePrice || 0,
      });
    }
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

              {/* Items Table */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Purchase Items & Quantities</CardTitle>
                    <CardDescription>Adjust items, unit costs, or add restocked products.</CardDescription>
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
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-2/5">Product</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Cost Price (₹)</TableHead>
                        <TableHead>Total (₹)</TableHead>
                        <TableHead><span className="sr-only">Remove</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fields.map((item, index) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Controller
                              control={form.control}
                              name={`items.${index}.productId`}
                              render={({ field }) => (
                                <ProductSearchCombobox
                                  products={products || []}
                                  value={field.value}
                                  disabled={productsLoading}
                                  priceType="purchasePrice"
                                  placeholder="Search & find product..."
                                  onSelect={(selected) => {
                                    field.onChange(selected ? selected.id : '');
                                    handleProductChange(index, selected ? selected.id : '');
                                  }}
                                />
                              )}
                            />
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
                                  placeholder="1"
                                  className="font-mono text-xs w-24"
                                  {...field}
                                />
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <Controller
                              control={form.control}
                              name={`items.${index}.purchasePrice`}
                              render={({ field }) => (
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  placeholder="0.00"
                                  className="font-mono text-xs w-28"
                                  {...field}
                                />
                              )}
                            />
                          </TableCell>
                          <TableCell className="font-semibold font-mono text-xs">
                            ₹{formatCurrency((watchedItems[index]?.quantity || 0) * (watchedItems[index]?.purchasePrice || 0))}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => remove(index)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
                <CardFooter className="justify-start border-t p-4">
                  <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={handleAddItem}>
                    <PlusCircle className="h-4 w-4" /> Add Item
                  </Button>
                </CardFooter>
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
