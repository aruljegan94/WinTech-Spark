
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
  setDoc,
  runTransaction,
  query,
  where,
} from 'firebase/firestore';
import type { Product, SaleItem, CompanyProfile, Customer } from '@/lib/types';
import {
  CalendarIcon,
  PlusCircle,
  Trash2,
  Settings2,
  ScanBarcode,
  UserCheck,
  Tag,
  Wallet,
  Check,
  X,
  Plus,
  Phone,
  MapPin,
} from 'lucide-react';
import { BarcodeScannerModal } from '@/components/barcode-scanner-modal';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [saveToCustomerDb, setSaveToCustomerDb] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Quick Add Customer modal
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddMobile, setQuickAddMobile] = useState('');
  const [quickAddAddress, setQuickAddAddress] = useState('');
  const [quickAddOffers, setQuickAddOffers] = useState('');
  const [quickAddDue, setQuickAddDue] = useState('');
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

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

  const customersQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'customers') : null),
    [firestore]
  );
  const { data: customers } = useCollection<Customer>(customersQuery);

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

  // Check URL query parameters for customerId (e.g. redirected from Customers page)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const cId = params.get('customerId');
      if (cId) {
        setSelectedCustomerId(cId);
      }
    }
  }, []);

  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId || !customers) return null;
    return customers.find((c) => c.id === selectedCustomerId) || null;
  }, [selectedCustomerId, customers]);

  useEffect(() => {
    if (selectedCustomer) {
      setCustomerName(selectedCustomer.name);
      setCustomerMobile(selectedCustomer.mobile || '');
      setCustomerAddress(selectedCustomer.address || '');
    }
  }, [selectedCustomer]);

  const matchingCustomers = useMemo(() => {
    if (!customers || selectedCustomerId || !customerName.trim()) return [];
    const q = customerName.toLowerCase().trim();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.mobile && c.mobile.includes(q))
    );
  }, [customers, selectedCustomerId, customerName]);

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomerId(customer.id);
    setCustomerName(customer.name);
    setCustomerMobile(customer.mobile || '');
    setCustomerAddress(customer.address || '');
    setShowSuggestions(false);
  };

  const handleClearSelectedCustomer = () => {
    setSelectedCustomerId('');
    setCustomerName('');
    setCustomerMobile('');
    setCustomerAddress('');
    setShowSuggestions(false);
  };

  const handleQuickAddCustomer = async () => {
    if (!firestore || !quickAddName.trim()) {
      toast({ variant: 'destructive', title: 'Customer name is required' });
      return;
    }
    setIsSavingCustomer(true);
    try {
      const now = new Date().toISOString();
      const newCustRef = doc(collection(firestore, 'customers'));
      const newCust: Customer = {
        id: newCustRef.id,
        name: quickAddName.trim(),
        mobile: quickAddMobile.trim(),
        address: quickAddAddress.trim(),
        pendingDue: parseFloat(quickAddDue) || 0,
        totalSpent: 0,
        totalInvoices: 0,
        offers: quickAddOffers.trim(),
        notes: '',
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(newCustRef, newCust);
      setSelectedCustomerId(newCustRef.id);
      setCustomerName(newCust.name);
      setCustomerMobile(newCust.mobile);
      setCustomerAddress(newCust.address || '');
      setIsQuickAddOpen(false);
      setQuickAddName('');
      setQuickAddMobile('');
      setQuickAddAddress('');
      setQuickAddOffers('');
      setQuickAddDue('');
      toast({
        title: 'Customer Created & Selected',
        description: `${newCust.name} added to database and linked to this invoice.`,
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to create customer', description: err.message });
    } finally {
      setIsSavingCustomer(false);
    }
  };


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

              const customerDoc = selectedCustomer
                ? await transaction.get(doc(firestore, 'customers', selectedCustomer.id))
                : null;

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

              const invoicePendingDue =
                paymentStatus === 'Pending'
                  ? total
                  : paymentStatus === 'Partial'
                  ? Math.max(0, total - (amountPaid || 0))
                  : 0;

              let finalCustomerId = selectedCustomer?.id || '';

              // --- 3. WRITE PHASE ---
              transaction.set(counterRef, { currentNumber: newCount }, { merge: true });

              for (const update of productUpdates) {
                  transaction.update(update.ref, { stockQuantity: update.newStock });
              }

              const now = new Date().toISOString();
              if (selectedCustomer && customerDoc && customerDoc.exists()) {
                const cData = customerDoc.data();
                transaction.update(customerDoc.ref, {
                  totalSpent: (cData.totalSpent || 0) + total,
                  totalInvoices: (cData.totalInvoices || 0) + 1,
                  pendingDue: (cData.pendingDue || 0) + invoicePendingDue,
                  address: customerAddress.trim() || cData.address || '',
                  mobile: customerMobile.trim() || cData.mobile || '',
                  updatedAt: now,
                });
              } else if (saveToCustomerDb && customerName.trim() && customerName.trim() !== 'N/A') {
                const newCustRef = doc(collection(firestore, 'customers'));
                finalCustomerId = newCustRef.id;
                transaction.set(newCustRef, {
                  id: newCustRef.id,
                  name: customerName.trim(),
                  mobile: customerMobile.trim(),
                  address: customerAddress.trim(),
                  pendingDue: invoicePendingDue,
                  totalSpent: total,
                  totalInvoices: 1,
                  offers: '',
                  notes: '',
                  createdAt: now,
                  updatedAt: now,
                });
              }

              transaction.set(newInvoiceRef, {
                  invoiceNumber,
                  date: invoiceDate.toISOString(),
                  customerId: finalCustomerId || undefined,
                  customerName: customerName || 'N/A',
                  customerMobile: customerMobile || '',
                  customerAddress: customerAddress || '',
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
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base">Customer Details</CardTitle>
                <CardDescription className="text-xs">
                  {selectedCustomer ? 'Registered Customer Selected' : 'Search database or enter walk-in details'}
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={() => setIsQuickAddOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                New Customer
              </Button>
            </CardHeader>
            <CardContent className="grid gap-3 pt-2">
              {selectedCustomer ? (
                /* Selected Customer View */
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center text-xs uppercase">
                        {selectedCustomer.name.slice(0, 2)}
                      </div>
                      <div>
                        <div className="font-semibold text-sm leading-tight flex items-center gap-1.5">
                          {selectedCustomer.name}
                          <UserCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">
                          {selectedCustomer.mobile || 'No phone'}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                      onClick={handleClearSelectedCustomer}
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Change
                    </Button>
                  </div>

                  {selectedCustomer.address && (
                    <div className="flex items-start gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                      <span className="line-clamp-1">{selectedCustomer.address}</span>
                    </div>
                  )}

                  {/* Active Offers Banner */}
                  {selectedCustomer.offers && (
                    <div className="rounded-md bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 p-2 text-xs flex items-center gap-2 text-purple-900 dark:text-purple-200">
                      <Tag className="h-3.5 w-3.5 shrink-0 text-purple-600" />
                      <div className="leading-tight">
                        <strong>Active Offer:</strong> {selectedCustomer.offers}
                      </div>
                    </div>
                  )}

                  {/* Pending Due / Credit Alert */}
                  {(selectedCustomer.pendingDue || 0) > 0 ? (
                    <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-2 text-xs flex items-center gap-2 text-amber-900 dark:text-amber-200">
                      <Wallet className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                      <div className="leading-tight">
                        <strong>Outstanding Due:</strong> ₹{(selectedCustomer.pendingDue || 0).toLocaleString('en-IN')}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-emerald-600 flex items-center gap-1 font-medium">
                      <Check className="h-3 w-3" /> No pending credit due
                    </div>
                  )}

                  <div className="text-[11px] text-muted-foreground pt-1 border-t flex justify-between">
                    <span>Lifetime Business:</span>
                    <span className="font-medium text-foreground">
                      ₹{(selectedCustomer.totalSpent || 0).toLocaleString('en-IN')} ({selectedCustomer.totalInvoices || 0} bills)
                    </span>
                  </div>
                </div>
              ) : (
                /* Unselected / Walk-in / Search Mode */
                <div className="space-y-3">
                  <div className="relative">
                    <Label htmlFor="customer-name" className="text-xs">Customer Name</Label>
                    <div className="relative mt-1">
                      <Input
                        id="customer-name"
                        placeholder="Type name or search existing customer..."
                        value={customerName}
                        onChange={(e) => {
                          setCustomerName(e.target.value);
                          setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        autoComplete="off"
                      />
                    </div>

                    {/* Dropdown Suggestions */}
                    {showSuggestions && matchingCustomers.length > 0 && (
                      <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover text-popover-foreground border rounded-md shadow-lg max-h-52 overflow-y-auto p-1 divide-y">
                        <div className="text-[11px] font-medium text-muted-foreground px-2 py-1">
                          Existing Customers in Database:
                        </div>
                        {matchingCustomers.slice(0, 6).map((c) => (
                          <div
                            key={c.id}
                            onMouseDown={() => handleSelectCustomer(c)}
                            className="flex items-center justify-between p-2 hover:bg-accent rounded-sm cursor-pointer text-xs"
                          >
                            <div>
                              <div className="font-semibold text-foreground">{c.name}</div>
                              <div className="text-muted-foreground text-[11px]">
                                {c.mobile || 'No phone'} {c.address ? `• ${c.address}` : ''}
                              </div>
                            </div>
                            <div className="text-right">
                              {(c.pendingDue || 0) > 0 && (
                                <span className="text-amber-600 font-medium block">
                                  Due: ₹{c.pendingDue}
                                </span>
                              )}
                              {c.offers && (
                                <span className="text-purple-600 block text-[10px]">
                                  🎁 {c.offers}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="customer-mobile" className="text-xs">Mobile Number</Label>
                    <Input
                      id="customer-mobile"
                      placeholder="e.g. 9876543210"
                      value={customerMobile}
                      onChange={(e) => setCustomerMobile(e.target.value)}
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="customer-address" className="text-xs">Address / Location (Optional)</Label>
                    <Input
                      id="customer-address"
                      placeholder="e.g. City / Area"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                    />
                  </div>

                  {customerName.trim() && (
                    <div className="flex items-center space-x-2 pt-1 border-t">
                      <input
                        type="checkbox"
                        id="save-customer"
                        checked={saveToCustomerDb}
                        onChange={(e) => setSaveToCustomerDb(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <label htmlFor="save-customer" className="text-xs text-muted-foreground cursor-pointer">
                        Save <strong className="text-foreground">{customerName}</strong> to Customers directory for future credit & offer tracking
                      </label>
                    </div>
                  )}
                </div>
              )}
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

      {/* Quick Add Customer Dialog */}
      <Dialog open={isQuickAddOpen} onOpenChange={setIsQuickAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Quick Register Customer</DialogTitle>
            <DialogDescription>
              Create and link a new customer without leaving this invoice.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="qa-name" className="text-xs">
                Customer Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="qa-name"
                placeholder="Full Name"
                value={quickAddName}
                onChange={(e) => setQuickAddName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="qa-mobile" className="text-xs">Mobile Number</Label>
                <Input
                  id="qa-mobile"
                  placeholder="Phone"
                  value={quickAddMobile}
                  onChange={(e) => setQuickAddMobile(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="qa-due" className="text-xs">Opening Due (₹)</Label>
                <Input
                  id="qa-due"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={quickAddDue}
                  onChange={(e) => setQuickAddDue(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="qa-address" className="text-xs">Address / Location</Label>
              <Input
                id="qa-address"
                placeholder="Street / City"
                value={quickAddAddress}
                onChange={(e) => setQuickAddAddress(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="qa-offers" className="text-xs">Special Offer / Discount Note</Label>
              <Input
                id="qa-offers"
                placeholder="e.g. 5% Discount / VIP"
                value={quickAddOffers}
                onChange={(e) => setQuickAddOffers(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsQuickAddOpen(false)}
              disabled={isSavingCustomer}
            >
              Cancel
            </Button>
            <Button
              onClick={handleQuickAddCustomer}
              disabled={isSavingCustomer}
              className="gap-2"
            >
              {isSavingCustomer && <Loader2 className="h-4 w-4 animate-spin" />}
              Save & Link Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onOpenChange={setIsScannerOpen}
        products={products || []}
        onProductScanned={handleScannedProduct}
      />
    </>
  );
}

