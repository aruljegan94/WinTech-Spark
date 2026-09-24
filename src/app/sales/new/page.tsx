
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useFirestore, useCollection, useMemoFirebase, useDoc, setDocumentNonBlocking } from '@/firebase';
import {
  collection,
  doc,
  runTransaction,
  query,
  where,
} from 'firebase/firestore';
import type { Product, SaleItem, CompanyProfile } from '@/lib/types';
import { CalendarIcon, PlusCircle, Trash2, Settings2, ScanBarcode } from 'lucide-react';
import { BarcodeScannerModal } from '@/components/barcode-scanner-modal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/page-header';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const saleItemSchema = z.object({
  productId: z.string().min(1, 'Please select a product'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
});

type SaleItemFormValues = z.infer<typeof saleItemSchema>;


export default function NewInvoicePage() {
  const [items, setItems] = useState<SaleItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [invoiceDate, setInvoiceDate] = useState<Date>(new Date());
  
  const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Partial' | 'Pending'>('Paid');
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'UPI' | 'Bank Transfer'>('Cash');
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [popoverPrefix, setPopoverPrefix] = useState('');
  const [popoverSuffix, setPopoverSuffix] = useState('');

  const productsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'products') : null),
    [firestore]
  );
  const { data: products, isLoading: productsLoading } =
    useCollection<Product>(productsQuery);

  const defaultProfileQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'companyProfiles'), where('isDefault', '==', true)) : null),
    [firestore]
  );
  const { data: defaultProfileData } = useCollection<CompanyProfile>(defaultProfileQuery);

  const defaultProfile = useMemo(() => defaultProfileData?.[0], [defaultProfileData]);

  const salesCounterRef = useMemoFirebase(
    () => (firestore ? doc(firestore, 'counters', 'sales') : null),
    [firestore]
  );
  const { data: salesCounter } = useDoc<{currentNumber: number}>(salesCounterRef);

  useEffect(() => {
    if (defaultProfile) {
        setPopoverPrefix(defaultProfile.invoicePrefix || 'INV-');
        setPopoverSuffix(defaultProfile.invoiceSuffix || '');
    }
  }, [defaultProfile]);
  
  const nextInvoiceNumber = useMemo(() => {
    const nextNumber = (salesCounter?.currentNumber || 0) + 1;
    const formattedCount = String(nextNumber).padStart(3, '0');
    return `${popoverPrefix}${formattedCount}${popoverSuffix}`;
  }, [salesCounter, popoverPrefix, popoverSuffix]);


  const categories = useMemo(() => {
    if (!products) return [];
    return ['all', ...Array.from(new Set(products.map(p => p.category)))];
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (selectedCategory === 'all') return products;
    return products.filter(p => p.category === selectedCategory);
  }, [products, selectedCategory]);

  const itemForm = useForm<SaleItemFormValues>({
    resolver: zodResolver(saleItemSchema),
    defaultValues: {
      productId: '',
      quantity: 1,
    }
  });

  const handleAddItem = (data: SaleItemFormValues) => {
    const product = products?.find(p => p.id === data.productId);
    if (!product) {
      toast({ variant: 'destructive', title: 'Product not found' });
      return;
    }

    if (data.quantity > product.stockQuantity) {
      toast({
        variant: 'destructive',
        title: 'Stock Limit Exceeded',
        description: `Only ${product.stockQuantity} units of ${product.productName} available.`,
      });
      return;
    }

    const existingItemIndex = items.findIndex(item => item.productId === data.productId);
    
    if (existingItemIndex > -1) {
      const newItems = [...items];
      const existingItem = newItems[existingItemIndex];
      const newQuantity = existingItem.quantity + data.quantity;
       if (newQuantity > product.stockQuantity) {
        toast({
            variant: 'destructive',
            title: 'Stock Limit Exceeded',
            description: `Cannot add ${data.quantity} more. Only ${product.stockQuantity - existingItem.quantity} units of ${product.productName} left in stock.`,
        });
        return;
      }
      existingItem.quantity = newQuantity;
      existingItem.total = existingItem.quantity * existingItem.price;
      setItems(newItems);
    } else {
      const newItem: SaleItem = {
        productId: product.id,
        productName: product.productName,
        quantity: data.quantity,
        price: product.sellingPrice,
        gstPercentage: product.gstPercentage,
        total: data.quantity * product.sellingPrice,
      };
      setItems(prevItems => [...prevItems, newItem]);
    }
    
    itemForm.reset({ productId: '', quantity: 1 });
    setSelectedCategory('all');
  };

  const handleScannedProduct = (product: Product, scanQuantity: number) => {
    const existingItemIndex = items.findIndex(item => item.productId === product.id);
    
    if (existingItemIndex > -1) {
      const newItems = [...items];
      const existingItem = newItems[existingItemIndex];
      const newQuantity = existingItem.quantity + scanQuantity;
      if (newQuantity > product.stockQuantity) {
        toast({
            variant: 'destructive',
            title: 'Stock Limit Exceeded',
            description: `Only ${product.stockQuantity} units of ${product.productName} left in stock.`,
        });
        return;
      }
      existingItem.quantity = newQuantity;
      existingItem.total = existingItem.quantity * existingItem.price;
      setItems(newItems);
    } else {
      if (scanQuantity > product.stockQuantity) {
        toast({
          variant: 'destructive',
          title: 'Stock Limit Exceeded',
          description: `Only ${product.stockQuantity} units of ${product.productName} available.`,
        });
        return;
      }
      const newItem: SaleItem = {
        productId: product.id,
        productName: product.productName,
        quantity: scanQuantity,
        price: product.sellingPrice,
        gstPercentage: product.gstPercentage,
        total: scanQuantity * product.sellingPrice,
      };
      setItems(prevItems => [...prevItems, newItem]);
    }
  };

  const handleRemoveItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  const { subtotal, gstAmount, total } = useMemo(() => {
    let subtotal = 0;
    let gstAmount = 0;

    items.forEach((item) => {
      subtotal += item.total;
      gstAmount += (item.total * item.gstPercentage) / 100;
    });

    return {
      subtotal,
      gstAmount,
      total: subtotal + gstAmount,
    };
  }, [items]);

  useEffect(() => {
    if (paymentStatus === 'Paid') {
      setAmountPaid(total);
    } else if (paymentStatus === 'Pending') {
      setAmountPaid(0);
    }
  }, [paymentStatus, total]);


  const handleSaveInvoice = async () => {
      if (items.length === 0) {
          toast({ variant: 'destructive', title: 'Empty Invoice', description: 'Please add at least one item.'});
          return;
      }
      setIsSubmitting(true);
      if (!firestore) {
          toast({ variant: 'destructive', title: 'Error', description: 'Database connection not found.'});
          setIsSubmitting(false);
          return;
      }

      try {
          await runTransaction(firestore, async (transaction) => {
              const salesCollectionRef = collection(firestore, 'sales');
              const newInvoiceRef = doc(salesCollectionRef);
              const counterRef = doc(firestore, 'counters', 'sales');

              // --- 1. READ PHASE ---
              const counterDoc = await transaction.get(counterRef);
              const productDocsPromises = items.map(item => transaction.get(doc(firestore, 'products', item.productId)));
              const productDocs = await Promise.all(productDocsPromises);

              // --- 2. LOGIC PHASE ---
              let newCount = 1;
              if (counterDoc.exists()) {
                  newCount = counterDoc.data().currentNumber + 1;
              }
              const formattedCount = String(newCount).padStart(3, '0');
              const invoiceNumber = `${popoverPrefix}${formattedCount}${popoverSuffix}`;

              const productUpdates: { ref: any; newStock: number }[] = [];
              for (let i = 0; i < items.length; i++) {
                  const item = items[i];
                  const productDoc = productDocs[i];

                  if (!productDoc.exists()) {
                      throw new Error(`Product "${item.productName}" not found.`);
                  }
                  
                  const currentStock = productDoc.data().stockQuantity;
                  if (currentStock < item.quantity) {
                      throw new Error(`Not enough stock for "${item.productName}". Only ${currentStock} left.`);
                  }

                  productUpdates.push({
                      ref: productDoc.ref,
                      newStock: currentStock - item.quantity,
                  });
              }

              // --- 3. WRITE PHASE ---
              transaction.set(counterRef, { currentNumber: newCount }, { merge: true });

              for (const update of productUpdates) {
                  transaction.update(update.ref, { stockQuantity: update.newStock });
              }

              transaction.set(newInvoiceRef, {
                  invoiceNumber,
                  date: invoiceDate.toISOString(),
                  customerName: customerName || 'N/A',
                  customerMobile: customerMobile || '',
                  items,
                  subtotal,
                  gstAmount,
                  total,
                  paymentStatus,
                  paymentMode,
                  amountPaid: paymentStatus === 'Partial' ? amountPaid : total,
              });
          });

          toast({
              title: 'Invoice Created',
              description: 'The new invoice has been saved successfully.',
          });
          router.push('/sales');

      } catch (error: any) {
          console.error("Failed to save invoice: ", error);
          toast({
              variant: 'destructive',
              title: 'Error Saving Invoice',
              description: error.message || 'An unexpected error occurred.',
          });
      } finally {
          setIsSubmitting(false);
      }
  }

  const handleUpdateInvoiceFormat = () => {
    if (!firestore || !defaultProfile) return;
    
    const profileRef = doc(firestore, 'companyProfiles', defaultProfile.id);
    setDocumentNonBlocking(profileRef, {
        invoicePrefix: popoverPrefix,
        invoiceSuffix: popoverSuffix
    }, { merge: true });

    toast({
        title: 'Invoice Format Updated',
        description: 'The default invoice format has been saved.'
    });
  }

  return (
    <>
      <PageHeader
        title="New Invoice"
        description="Fill in the details to create a new sales invoice."
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="grid auto-rows-max items-start gap-4 lg:col-span-2">
           <Card>
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                 <Label>Invoice Date</Label>
                 <Popover>
                  <PopoverTrigger asChild>
                      <Button
                        variant={'outline'}
                        className={cn(
                          'justify-start text-left font-normal',
                          !invoiceDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {invoiceDate ? format(invoiceDate, 'dd-MMM-yyyy') : <span>Pick a date</span>}
                      </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={invoiceDate}
                      onSelect={(date) => setInvoiceDate(date || new Date())}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                    <Label>Next Invoice Number</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                             <Button variant="ghost" size="icon" className="h-6 w-6">
                                <Settings2 className="h-4 w-4"/>
                             </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80">
                            <div className="grid gap-4">
                                <div className="space-y-2">
                                    <h4 className="font-medium leading-none">Invoice Format</h4>
                                    <p className="text-sm text-muted-foreground">
                                        Set the prefix and suffix for invoice numbers.
                                    </p>
                                </div>
                                <div className="grid gap-2">
                                     <div className="grid grid-cols-3 items-center gap-4">
                                        <Label htmlFor="prefix">Prefix</Label>
                                        <Input id="prefix" value={popoverPrefix} onChange={(e) => setPopoverPrefix(e.target.value)} className="col-span-2 h-8" />
                                    </div>
                                    <div className="grid grid-cols-3 items-center gap-4">
                                        <Label htmlFor="suffix">Suffix</Label>
                                        <Input id="suffix" value={popoverSuffix} onChange={(e) => setPopoverSuffix(e.target.value)} className="col-span-2 h-8" />
                                    </div>
                                    <Button size="sm" onClick={handleUpdateInvoiceFormat}>Save</Button>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
                <Input
                  id="invoice-number"
                  value={nextInvoiceNumber}
                  disabled
                  className="font-mono"
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Add Invoice Item</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={() => setIsScannerOpen(true)} className="gap-2">
                    <ScanBarcode className="h-4 w-4" />
                    Scan Barcode
                </Button>
            </CardHeader>
            <CardContent>
                <form onSubmit={itemForm.handleSubmit(handleAddItem)} className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                    <div className="sm:col-span-3">
                        <Label>Category</Label>
                        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                                {categories.map(cat => (
                                    <SelectItem key={cat} value={cat}>{cat === 'all' ? 'All Categories' : cat}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                     <div className="sm:col-span-5">
                         <Label>Product</Label>
                        <Controller
                            name="productId"
                            control={itemForm.control}
                            render={({ field }) => (
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a product" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {productsLoading && <SelectItem value="loading" disabled>Loading...</SelectItem>}
                                        {filteredProducts.map((p) => (
                                        <SelectItem key={p.id} value={p.id} disabled={p.stockQuantity <= 0}>
                                            {p.productName} ({p.stockQuantity} left)
                                        </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        />
                    </div>
                     <div className="sm:col-span-2">
                        <Label>Quantity</Label>
                        <Controller
                            name="quantity"
                            control={itemForm.control}
                            render={({ field }) => <Input type="number" min="1" {...field} />}
                        />
                    </div>
                    <div className="flex items-end sm:col-span-2">
                        <Button type="submit" className="w-full">
                            <PlusCircle className="mr-2 h-4 w-4" /> Add
                        </Button>
                    </div>
                </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Invoice Items</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-[100px]">Qty</TableHead>
                    <TableHead className="w-[120px] text-right">
                      Price
                    </TableHead>
                    <TableHead className="w-[120px] text-right">
                      Total
                    </TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 && (
                      <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                              No items added yet.
                          </TableCell>
                      </TableRow>
                  )}
                  {items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        {item.productName}
                      </TableCell>
                      <TableCell>
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{item.price.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        ₹{item.total.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveItem(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
        <div className="grid auto-rows-max items-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Customer Details</CardTitle>
              <CardDescription>(Optional)</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="customer-name">Name</Label>
                <Input
                  id="customer-name"
                  placeholder="Enter customer name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="customer-mobile">Mobile</Label>
                <Input
                  id="customer-mobile"
                  placeholder="Enter mobile number"
                  value={customerMobile}
                  onChange={(e) => setCustomerMobile(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
           <Card>
            <CardHeader>
              <CardTitle>Payment Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label>Payment Status</Label>
                <RadioGroup 
                    value={paymentStatus} 
                    onValueChange={(value: 'Paid' | 'Partial' | 'Pending') => setPaymentStatus(value)}
                    className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Paid" id="status-paid" />
                    <Label htmlFor="status-paid">Paid</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Partial" id="status-partial" />
                    <Label htmlFor="status-partial">Partial</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Pending" id="status-pending" />
                    <Label htmlFor="status-pending">Pending</Label>
                  </div>
                </RadioGroup>
              </div>
              {paymentStatus === 'Partial' && (
                <div className="grid gap-2">
                  <Label htmlFor="amount-paid">Amount Paid</Label>
                  <Input
                    id="amount-paid"
                    type="number"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(Number(e.target.value))}
                    max={total}
                  />
                </div>
              )}
               <div className="grid gap-2">
                <Label>Payment Mode</Label>
                <Select value={paymentMode} onValueChange={(value: 'Cash' | 'UPI' | 'Bank Transfer') => setPaymentMode(value)}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select payment mode" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="UPI">UPI</SelectItem>
                        <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    </SelectContent>
                </Select>
               </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>₹{subtotal.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">GST</span>
                <span>
                  ₹{gstAmount.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between font-semibold">
                <span className="text-muted-foreground">Total</span>
                <span>
                  ₹{total.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onClick={handleSaveInvoice} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Invoice
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>

      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onOpenChange={setIsScannerOpen}
        products={products || []}
        onProductScanned={handleScannedProduct}
      />
    </>
  );
}
