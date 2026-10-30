'use client';

import { useState, useMemo } from 'react';
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
import { Label } from '@/components/ui/label';
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
  useUser,
  useDoc,
} from '@/firebase';
import { collection, doc, runTransaction, getDoc, setDoc, query, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import type { Product, Vendor, Category, User } from '@/lib/types';
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
import { DatePicker } from '@/components/ui/date-picker';
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

  const { user: currentAuthUser } = useUser();
  const currentUserDocRef = useMemoFirebase(
    () => (firestore && currentAuthUser ? doc(firestore, 'users', currentAuthUser.uid) : null),
    [firestore, currentAuthUser]
  );
  const { data: currentUserDoc } = useDoc<User>(currentUserDocRef);

  // Item Bar inputs (like Invoice page)
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [itemQuantity, setItemQuantity] = useState<number | string>(1);
  const [itemPrice, setItemPrice] = useState<number | string>('');

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

  // Extract unique categories for the dropdown filter
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
    name: "items",
  });

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
      toast({ variant: 'destructive', title: 'Product not found' });
      return;
    }

    const qty = parseFloat(String(itemQuantity)) || 1;
    if (qty <= 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid quantity',
        description: 'Quantity must be greater than 0.',
      });
      return;
    }

    const price = itemPrice !== '' && !isNaN(parseFloat(String(itemPrice)))
      ? parseFloat(String(itemPrice))
      : (product.purchasePrice ?? 0);

    const currentItems = form.getValues('items') || [];
    const existingIndex = currentItems.findIndex((i) => i.productId === selectedProductId);

    if (existingIndex > -1) {
      const existing = currentItems[existingIndex];
      const newQty = Math.round((Number(existing.quantity) + qty) * 1000) / 1000;
      form.setValue(`items.${existingIndex}.quantity`, newQty, { shouldValidate: true });
      form.setValue(`items.${existingIndex}.purchasePrice`, price, { shouldValidate: true });
      toast({
        title: 'Quantity Updated',
        description: `Updated ${product.productName} quantity to ${newQty}.`,
      });
    } else {
      append({
        productId: product.id,
        quantity: qty,
        purchasePrice: price,
      });
      toast({
        title: 'Item Added',
        description: `Added ${qty} × ${product.productName} to purchase list.`,
      });
    }

    // Reset item form
    setSelectedProductId('');
    setItemQuantity(1);
    setItemPrice('');
  };

  const handleScannedProduct = (product: Product, scanQuantity: number) => {
    const currentItems = form.getValues('items') || [];
    const existingIndex = currentItems.findIndex(i => i.productId === product.id);

    if (existingIndex > -1) {
      const existing = currentItems[existingIndex];
      form.setValue(`items.${existingIndex}.quantity`, existing.quantity + scanQuantity, { shouldValidate: true });
    } else {
      append({
        productId: product.id,
        quantity: scanQuantity,
        purchasePrice: product.purchasePrice || 0,
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
          createdBy: currentAuthUser?.uid || '',
          createdByName: currentUserDoc?.name || currentAuthUser?.displayName || currentAuthUser?.email?.split('@')[0] || 'Admin',
          createdAt: new Date().toISOString(),
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
                        <FormControl>
                          <DatePicker
                            value={field.value}
                            onChange={field.onChange}
                            disabled={(date) => date > new Date() || date < new Date('1900-01-01')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Add Purchase Item Card (Matching Invoice Screen) */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-base font-semibold">Add Purchase Item</CardTitle>
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
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => remove(index)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span className="sr-only">Remove</span>
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
                          <FormControl>
                            <DatePicker
                              value={field.value}
                              onChange={field.onChange}
                              placeholder="Select Due Date"
                              allowClear
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
