'use client';

import { useState } from 'react';
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
  useCollection,
  useMemoFirebase,
} from '@/firebase';
import { collection, doc, runTransaction, getDoc, setDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import type { Product, Vendor } from '@/lib/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, PlusCircle, Trash2, ScanBarcode, CreditCard, Building2, Calendar as CalendarLucide } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { cn, formatCurrency } from '@/lib/utils';
import { format, addDays } from 'date-fns';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { BarcodeScannerModal } from '@/components/barcode-scanner-modal';
import { Badge } from '@/components/ui/badge';
import { ProductSearchCombobox } from '@/components/products/product-search-combobox';

const purchaseItemSchema = z.object({
  productId: z.string().min(1, "Please select a product"),
  quantity: z.coerce.number().min(0.001, "Quantity must be at least 0.001"),
  purchasePrice: z.coerce.number().min(0, "Price must be positive"),
});

const purchaseSchema = z.object({
  supplierName: z.string().min(1, 'Supplier name is required'),
  vendorId: z.string().optional(),
  invoiceNo: z.string().min(1, 'Invoice number is required'),
  date: z.date({ required_error: 'A date is required.' }),
  paymentStatus: z.enum(['Paid', 'Partial', 'Pending']),
  amountPaid: z.coerce.number().min(0, "Amount paid cannot be negative"),
  discount: z.coerce.number().min(0, "Discount cannot be negative").optional(),
  dueDate: z.date().optional(),
  paymentNotes: z.string().optional(),
  items: z.array(purchaseItemSchema).min(1, "Please add at least one item."),
});

type PurchaseFormValues = z.infer<typeof purchaseSchema>;

export default function NewPurchasePage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const [isScannerOpen, setIsScannerOpen] = useState(false);

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
    name: "items",
  });

  const handleScannedProduct = (product: Product, scanQuantity: number) => {
    const currentItems = form.getValues('items') || [];
    const existingIndex = currentItems.findIndex(i => i.productId === product.id);

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

  const watchedItems = form.watch('items');
  const watchedPaymentStatus = form.watch('paymentStatus');
  const watchedAmountPaid = form.watch('amountPaid') || 0;
  const watchedDiscount = form.watch('discount') || 0;

  const totalPurchaseAmount = Math.round(
    watchedItems.reduce((acc, current) => {
      return acc + ((Number(current.quantity) || 0) * (Number(current.purchasePrice) || 0));
    }, 0) * 100
  ) / 100;

  const remainingBalance = Math.max(0, totalPurchaseAmount - watchedAmountPaid - watchedDiscount);

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

  const onSubmit = async (data: PurchaseFormValues) => {
    if (!firestore || !products) return;

    try {
      const finalDiscount = Number(data.discount) || 0;
      const finalAmountPaid = data.paymentStatus === 'Paid' 
        ? Math.max(0, totalPurchaseAmount - finalDiscount) 
        : data.amountPaid;
      const finalPending = Math.max(0, totalPurchaseAmount - finalAmountPaid - finalDiscount);

      await runTransaction(firestore, async (transaction) => {
        const purchaseRef = doc(collection(firestore, 'purchases'));

        // --- 1. READ PHASE ---
        const productRefs = data.items.map(item => doc(firestore, 'products', item.productId));
        const productDocs = await Promise.all(productRefs.map(ref => transaction.get(ref)));

        let vendorDocSnap = null;
        let vendorRef = null;
        let resolvedVendorId = data.vendorId;

        if (!resolvedVendorId && data.supplierName) {
          const match = vendors?.find((v) =>
            v.companyName.toLowerCase().trim() === data.supplierName.toLowerCase().trim() ||
            v.name.toLowerCase().trim() === data.supplierName.toLowerCase().trim() ||
            data.supplierName.toLowerCase().includes(v.companyName.toLowerCase().trim())
          );
          if (match) {
            resolvedVendorId = match.id;
          }
        }

        if (resolvedVendorId) {
          vendorRef = doc(firestore, 'vendors', resolvedVendorId);
          vendorDocSnap = await transaction.get(vendorRef);
        }

        // --- 2. LOGIC PHASE ---
        const purchaseItems = data.items.map((item, index) => {
          const product = products.find(p => p.id === item.productId);
          if (!product) throw new Error(`Product with id ${item.productId} not found.`);

          const productDoc = productDocs[index];
          if (!productDoc.exists()) {
            throw new Error(`Product with ID ${item.productId} not found in database.`);
          }

          return {
            ...item,
            productName: product.productName,
            totalAmount: item.quantity * item.purchasePrice,
          };
        });

        // --- 3. WRITE PHASE ---
        productDocs.forEach((productDoc, index) => {
          const currentStock = productDoc.data()!.stockQuantity;
          const newStock = currentStock + data.items[index].quantity;
          transaction.update(productRefs[index], { stockQuantity: newStock });
        });

        if (vendorRef && vendorDocSnap && vendorDocSnap.exists()) {
          const currentVendorPending = vendorDocSnap.data().pendingAmount || 0;
          transaction.update(vendorRef, {
            pendingAmount: currentVendorPending + finalPending,
          });
        }

        transaction.set(purchaseRef, {
          supplierName: data.supplierName,
          vendorId: resolvedVendorId || null,
          invoiceNo: data.invoiceNo,
          date: data.date.toISOString(),
          items: purchaseItems,
          totalAmount: totalPurchaseAmount,
          paymentStatus: data.paymentStatus,
          amountPaid: finalAmountPaid,
          discount: finalDiscount,
          dueDate: data.dueDate ? data.dueDate.toISOString() : null,
          paymentNotes: data.paymentNotes || '',
        });
      });

      toast({
        title: 'Purchase Recorded',
        description: `Purchase #${data.invoiceNo} saved. Stock & Vendor balance updated.`,
      });
      router.push('/purchases');
    } catch (error: any) {
      console.error('Error recording purchase:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to record purchase. Please try again.',
      });
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
        description: 'Please add a product before creating a purchase.',
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
    const product = products?.find(p => p.id === productId);
    if (product) {
      form.setValue(`items.${index}`, {
        ...currentItem,
        productId: productId,
        purchasePrice: product.purchasePrice || 0,
      });
    }
  };

  return (
    <>
      <PageHeader
        title="Record New Purchase"
        description="Fill out the form to add a new purchase entry with supplier & payment tracking."
      />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-8">
              {/* Purchase & Supplier Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Building2 className="h-4 w-4 text-primary" /> Supplier & Invoice Details
                  </CardTitle>
                  <CardDescription>Select vendor or enter custom supplier information.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <FormItem>
                    <FormLabel>Select Registered Vendor (Optional)</FormLabel>
                    <Select onValueChange={handleVendorSelect}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a registered vendor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom">-- Enter Custom Supplier --</SelectItem>
                        {(vendors || []).map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.companyName} ({v.name}) {v.pendingAmount > 0 ? `• ₹${v.pendingAmount.toLocaleString()} Due` : '• Clear'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.watch('vendorId') && (() => {
                      const selectedV = vendors?.find((v) => v.id === form.watch('vendorId'));
                      if (!selectedV) return null;
                      return (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-1">
                          <span>Vendor Total Due:</span>
                          <strong className={selectedV.pendingAmount > 0 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-emerald-600 font-semibold'}>
                            ₹{(selectedV.pendingAmount || 0).toLocaleString()}
                          </strong>
                        </p>
                      );
                    })()}
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
                          <Input placeholder="e.g., INV-GAP-2024-001" {...field} />
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
                                variant={'outline'}
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
                  <CardTitle>Purchase Items</CardTitle>
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
                        <TableHead>Price (₹)</TableHead>
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
                                  className="font-mono text-xs"
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
                                  className="font-mono text-xs"
                                  {...field}
                                />
                              )}
                            />
                          </TableCell>
                          <TableCell className="font-semibold font-mono text-xs">
                            ₹{formatCurrency((watchedItems[index]?.quantity || 0) * (watchedItems[index]?.purchasePrice || 0))}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => remove(index)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
                <CardFooter className="justify-start border-t p-4">
                  <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={handleAddItem}>
                    <PlusCircle className="h-3.5 w-3.5" /> Add Item
                  </Button>
                </CardFooter>
              </Card>
            </div>

            {/* Sidebar Summary & Payment Details */}
            <div className="space-y-8">
              <Card className="border-primary/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CreditCard className="h-4 w-4 text-primary" /> Payment & Due Date
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
                          defaultValue={field.value}
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
                              className="font-mono"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {watchedPaymentStatus !== 'Paid' && (
                    <FormField
                      control={form.control}
                      name="dueDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Payment Due Date (Reminder)</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant={'outline'}
                                  className={cn(
                                    'w-full pl-3 text-left font-normal',
                                    !field.value && 'text-muted-foreground'
                                  )}
                                >
                                  {field.value ? format(field.value, 'dd-MMM-yyyy') : <span>Select Due Date</span>}
                                  <CalendarLucide className="ml-auto h-4 w-4 opacity-50" />
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
                    name="discount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Settlement / Discount Concession (₹)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0.00"
                            className="font-mono"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="pt-2 border-t space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Bill Amount:</span>
                      <span className="font-bold font-mono">₹{formatCurrency(totalPurchaseAmount)}</span>
                    </div>

                    {watchedDiscount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Settlement Discount:</span>
                        <span className="font-semibold text-primary font-mono">
                          - ₹{formatCurrency(watchedDiscount)}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Amount Paid:</span>
                      <span className="font-semibold text-emerald-600 font-mono">
                        ₹{formatCurrency(watchedPaymentStatus === 'Paid' ? Math.max(0, totalPurchaseAmount - watchedDiscount) : watchedAmountPaid)}
                      </span>
                    </div>

                    {watchedPaymentStatus !== 'Paid' && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Pending Balance:</span>
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 font-mono">
                          ₹{formatCurrency(remainingBalance)}
                        </Badge>
                      </div>
                    )}
                  </div>
                </CardContent>

                <CardFooter className="flex-col gap-2">
                  <Button type="submit" className="w-full">
                    Save & Record Purchase
                  </Button>
                  <Button type="button" variant="outline" className="w-full" onClick={() => router.back()}>
                    Cancel
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        </form>
      </Form>

      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onOpenChange={setIsScannerOpen}
        products={products || []}
        onProductScanned={handleScannedProduct}
      />
    </>
  );
}
