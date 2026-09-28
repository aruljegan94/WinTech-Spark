'use client';

import { useState, useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  UserCheck,
  Plus,
  Pencil,
  Trash2,
  Search,
  IndianRupee,
  Loader2,
  Phone,
  Mail,
  MapPin,
  Tag,
  Receipt,
  Wallet,
  AlertCircle,
  MessageCircle,
  FilePlus2,
  Users,
  Percent,
} from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  runTransaction,
} from 'firebase/firestore';
import type { Customer } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

const EMPTY_CUSTOMER_FORM: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  mobile: '',
  address: '',
  email: '',
  pendingDue: 0,
  totalSpent: 0,
  totalInvoices: 0,
  offers: '',
  notes: '',
};

export default function CustomersPage() {
  const firestore = useFirestore();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'pending' | 'offers'>('all');
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState(EMPTY_CUSTOMER_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteCustomerId, setDeleteCustomerId] = useState<string | null>(null);

  // Settle Due Dialog state
  const [settleCustomer, setSettleCustomer] = useState<Customer | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settlePaymentMode, setSettlePaymentMode] = useState<'Cash' | 'UPI' | 'Bank Transfer'>('Cash');
  const [settleNote, setSettleNote] = useState('');
  const [isSettling, setIsSettling] = useState(false);

  // Query customers ordered by name
  const customersQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'customers'), orderBy('name')) : null),
    [firestore]
  );
  const { data: customers, isLoading } = useCollection<Customer>(customersQuery);

  // Filtered customers
  const filteredCustomers = useMemo(() => {
    return (customers || []).filter((c) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        c.name.toLowerCase().includes(q) ||
        (c.mobile && c.mobile.includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q)) ||
        (c.offers && c.offers.toLowerCase().includes(q)) ||
        (c.notes && c.notes.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (filterType === 'pending') {
        return (c.pendingDue || 0) > 0;
      }
      if (filterType === 'offers') {
        return Boolean(c.offers && c.offers.trim().length > 0);
      }
      return true;
    });
  }, [customers, searchTerm, filterType]);

  // Analytics Metrics
  const metrics = useMemo(() => {
    const list = customers || [];
    const totalCustomers = list.length;
    const totalPendingDue = list.reduce((sum, c) => sum + (c.pendingDue || 0), 0);
    const totalLifetimeSales = list.reduce((sum, c) => sum + (c.totalSpent || 0), 0);
    const customersWithOffers = list.filter((c) => Boolean(c.offers && c.offers.trim())).length;
    const customersWithDue = list.filter((c) => (c.pendingDue || 0) > 0).length;

    return {
      totalCustomers,
      totalPendingDue,
      totalLifetimeSales,
      customersWithOffers,
      customersWithDue,
    };
  }, [customers]);

  const openAddModal = () => {
    setEditingCustomer(null);
    setForm(EMPTY_CUSTOMER_FORM);
    setCustomerDialogOpen(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setForm({
      name: customer.name || '',
      mobile: customer.mobile || '',
      address: customer.address || '',
      email: customer.email || '',
      pendingDue: customer.pendingDue || 0,
      totalSpent: customer.totalSpent || 0,
      totalInvoices: customer.totalInvoices || 0,
      offers: customer.offers || '',
      notes: customer.notes || '',
    });
    setCustomerDialogOpen(true);
  };

  const handleSaveCustomer = async () => {
    if (!firestore) return;
    if (!form.name.trim()) {
      toast({
        variant: 'destructive',
        title: 'Customer Name is mandatory',
        description: 'Please provide a valid customer name.',
      });
      return;
    }

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      if (editingCustomer) {
        // Update existing customer
        const customerRef = doc(firestore, 'customers', editingCustomer.id);
        await setDoc(
          customerRef,
          {
            ...form,
            name: form.name.trim(),
            mobile: form.mobile.trim(),
            address: form.address?.trim() || '',
            email: form.email?.trim() || '',
            pendingDue: Number(form.pendingDue) || 0,
            offers: form.offers?.trim() || '',
            notes: form.notes?.trim() || '',
            updatedAt: now,
          },
          { merge: true }
        );
        toast({ title: 'Customer Updated', description: `${form.name} was updated successfully.` });
      } else {
        // Create new customer
        const customersCol = collection(firestore, 'customers');
        const newCustomerRef = doc(customersCol);
        await setDoc(newCustomerRef, {
          ...form,
          name: form.name.trim(),
          mobile: form.mobile.trim(),
          address: form.address?.trim() || '',
          email: form.email?.trim() || '',
          pendingDue: Number(form.pendingDue) || 0,
          totalSpent: 0,
          totalInvoices: 0,
          offers: form.offers?.trim() || '',
          notes: form.notes?.trim() || '',
          createdAt: now,
          updatedAt: now,
        });
        toast({ title: 'Customer Added', description: `${form.name} was added to the database.` });
      }
      setCustomerDialogOpen(false);
    } catch (err: any) {
      console.error('Failed to save customer:', err);
      toast({
        variant: 'destructive',
        title: 'Error Saving Customer',
        description: err.message || 'An unexpected error occurred.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!firestore || !deleteCustomerId) return;
    try {
      await deleteDoc(doc(firestore, 'customers', deleteCustomerId));
      toast({ title: 'Customer Deleted', description: 'Customer was successfully removed.' });
      setDeleteCustomerId(null);
    } catch (err: any) {
      console.error('Failed to delete customer:', err);
      toast({ variant: 'destructive', title: 'Error Deleting Customer', description: err.message });
    }
  };

  // Settle / Record Due Payment
  const openSettleDialog = (customer: Customer) => {
    setSettleCustomer(customer);
    setSettleAmount(String(customer.pendingDue || 0));
    setSettlePaymentMode('Cash');
    setSettleNote('');
  };

  const handleSettleDue = async () => {
    if (!firestore || !settleCustomer) return;
    const amount = parseFloat(settleAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ variant: 'destructive', title: 'Invalid Amount', description: 'Enter a valid payment amount.' });
      return;
    }

    if (amount > (settleCustomer.pendingDue || 0)) {
      toast({
        variant: 'destructive',
        title: 'Amount Exceeds Due',
        description: `Settlement amount cannot exceed the pending due of ₹${settleCustomer.pendingDue.toLocaleString()}.`,
      });
      return;
    }

    setIsSettling(true);
    try {
      await runTransaction(firestore, async (transaction) => {
        const customerRef = doc(firestore, 'customers', settleCustomer.id);
        const currentDoc = await transaction.get(customerRef);
        if (!currentDoc.exists()) {
          throw new Error('Customer does not exist');
        }

        const currentPending = currentDoc.data().pendingDue || 0;
        const newPending = Math.max(0, currentPending - amount);

        transaction.update(customerRef, {
          pendingDue: newPending,
          updatedAt: new Date().toISOString(),
        });
      });

      toast({
        title: 'Payment Recorded',
        description: `Successfully collected ₹${amount.toLocaleString()} from ${settleCustomer.name}.`,
      });
      setSettleCustomer(null);
    } catch (err: any) {
      console.error('Failed to settle customer due:', err);
      toast({ variant: 'destructive', title: 'Error Settling Payment', description: err.message });
    } finally {
      setIsSettling(false);
    }
  };

  const getCleanMobile = (mobile: string) => {
    return mobile.replace(/[^0-9]/g, '');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Manage customer profiles, credit dues, special promotional offers, and invoice history."
      >
        <Button onClick={openAddModal} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Customer
        </Button>
      </PageHeader>

      {/* Analytics & Summary Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalCustomers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Registered customers in database
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow border-amber-200 dark:border-amber-900/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Pending Credit Due</CardTitle>
            <Wallet className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              ₹{metrics.totalPendingDue.toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.customersWithDue} customer{metrics.customersWithDue === 1 ? '' : 's'} with outstanding credit
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Active Offers / Deals</CardTitle>
            <Tag className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {metrics.customersWithOffers}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Customers eligible for special discounts
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Customer Revenue</CardTitle>
            <IndianRupee className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              ₹{metrics.totalLifetimeSales.toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Lifetime sales from registered customers
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Customers List Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Customer Directory</CardTitle>
              <CardDescription>
                Search customer records, track receivables, or launch an invoice with 1-click.
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search name, phone, address, offer..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 text-sm"
                />
              </div>

              {/* Filter Tabs */}
              <div className="flex rounded-md border p-1 bg-muted/40">
                <Button
                  size="sm"
                  variant={filterType === 'all' ? 'secondary' : 'ghost'}
                  className="h-7 text-xs px-2.5"
                  onClick={() => setFilterType('all')}
                >
                  All ({customers?.length || 0})
                </Button>
                <Button
                  size="sm"
                  variant={filterType === 'pending' ? 'secondary' : 'ghost'}
                  className="h-7 text-xs px-2.5 text-amber-600 dark:text-amber-400"
                  onClick={() => setFilterType('pending')}
                >
                  Due ({metrics.customersWithDue})
                </Button>
                <Button
                  size="sm"
                  variant={filterType === 'offers' ? 'secondary' : 'ghost'}
                  className="h-7 text-xs px-2.5 text-purple-600 dark:text-purple-400"
                  onClick={() => setFilterType('offers')}
                >
                  Offers ({metrics.customersWithOffers})
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Loading customer directory...</p>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <UserCheck className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No customers found</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                {searchTerm || filterType !== 'all'
                  ? 'No customer matched your search or active filter criteria.'
                  : 'Get started by creating your first customer profile to track credits, offers, and invoices.'}
              </p>
              <Button onClick={openAddModal} className="mt-4 gap-2">
                <Plus className="h-4 w-4" />
                Add First Customer
              </Button>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="min-w-[180px]">Customer Name</TableHead>
                    <TableHead className="min-w-[150px]">Contact Info</TableHead>
                    <TableHead className="min-w-[180px]">Address</TableHead>
                    <TableHead className="min-w-[140px]">Credit / Due</TableHead>
                    <TableHead className="min-w-[150px]">Offers / Tags</TableHead>
                    <TableHead className="min-w-[120px] text-right">Invoices / Spent</TableHead>
                    <TableHead className="min-w-[140px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => {
                    const cleanPhone = getCleanMobile(customer.mobile || '');
                    const hasDue = (customer.pendingDue || 0) > 0;

                    return (
                      <TableRow key={customer.id} className="hover:bg-muted/20">
                        {/* Name & Initials */}
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center text-sm shrink-0 uppercase">
                              {customer.name.slice(0, 2)}
                            </div>
                            <div>
                              <div className="font-semibold text-sm leading-tight flex items-center gap-1.5">
                                {customer.name}
                              </div>
                              {customer.notes && (
                                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5" title={customer.notes}>
                                  {customer.notes}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Contact */}
                        <TableCell>
                          <div className="space-y-1">
                            {customer.mobile ? (
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs">{customer.mobile}</span>
                                <div className="flex items-center gap-1">
                                  <a
                                    href={`tel:${customer.mobile}`}
                                    className="text-muted-foreground hover:text-primary transition-colors p-1"
                                    title="Call Customer"
                                  >
                                    <Phone className="h-3.5 w-3.5" />
                                  </a>
                                  {cleanPhone.length >= 10 && (
                                    <a
                                      href={`https://wa.me/91${cleanPhone.slice(-10)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-emerald-600 hover:text-emerald-700 transition-colors p-1"
                                      title="Chat on WhatsApp"
                                    >
                                      <MessageCircle className="h-3.5 w-3.5" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">No phone</span>
                            )}
                            {customer.email && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                <span className="truncate max-w-[140px]">{customer.email}</span>
                              </div>
                            )}
                          </div>
                        </TableCell>

                        {/* Address */}
                        <TableCell>
                          {customer.address ? (
                            <div className="flex items-start gap-1 text-xs text-muted-foreground max-w-[200px]">
                              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                              <span className="line-clamp-2">{customer.address}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">—</span>
                          )}
                        </TableCell>

                        {/* Credit Due */}
                        <TableCell>
                          {hasDue ? (
                            <div className="flex flex-col gap-1 items-start">
                              <Badge variant="destructive" className="font-mono font-medium text-xs">
                                ₹{(customer.pendingDue || 0).toLocaleString('en-IN')} Due
                              </Badge>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[11px] px-2 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/50"
                                onClick={() => openSettleDialog(customer)}
                              >
                                Settle Due
                              </Button>
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-emerald-600 border-emerald-300 text-xs">
                              All Clear
                            </Badge>
                          )}
                        </TableCell>

                        {/* Offers */}
                        <TableCell>
                          {customer.offers ? (
                            <Badge
                              variant="secondary"
                              className="bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 gap-1 text-xs font-normal"
                            >
                              <Tag className="h-3 w-3 shrink-0" />
                              <span className="truncate max-w-[120px]">{customer.offers}</span>
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">—</span>
                          )}
                        </TableCell>

                        {/* Invoices & Lifetime Spent */}
                        <TableCell className="text-right">
                          <div className="font-semibold text-xs">
                            ₹{(customer.totalSpent || 0).toLocaleString('en-IN')}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {customer.totalInvoices || 0} bill{(customer.totalInvoices || 0) === 1 ? '' : 's'}
                          </div>
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link href={`/sales/new?customerId=${customer.id}`}>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1.5 text-xs text-primary border-primary/30 hover:bg-primary/5"
                                title="Create Invoice for this Customer"
                              >
                                <FilePlus2 className="h-3.5 w-3.5" />
                                <span className="hidden xl:inline">Bill</span>
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditModal(customer)}
                              title="Edit Customer Details"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteCustomerId(customer.id)}
                              title="Delete Customer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Customer Dialog */}
      <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCustomer ? 'Edit Customer Profile' : 'Add New Customer'}
            </DialogTitle>
            <DialogDescription>
              Store customer details for quick auto-complete on invoices, credit tracking, and special offers.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Name (Mandatory) */}
            <div className="space-y-1.5">
              <Label htmlFor="customer-name" className="flex items-center gap-1 font-medium">
                Customer Name <span className="text-destructive font-bold">*</span>
              </Label>
              <Input
                id="customer-name"
                placeholder="e.g. Ramesh Kumar / Sri Auto Spares"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full"
                autoFocus
              />
            </div>

            {/* Mobile & Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="customer-mobile">Mobile Number</Label>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="customer-mobile"
                    placeholder="e.g. 9876543210"
                    value={form.mobile}
                    onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                    className="pl-8"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="customer-email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="customer-email"
                    type="email"
                    placeholder="e.g. customer@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="pl-8"
                  />
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="space-y-1.5">
              <Label htmlFor="customer-address">Address / Location</Label>
              <Textarea
                id="customer-address"
                placeholder="Door No, Street, Landmark, City, Pincode"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                rows={2}
              />
            </div>

            {/* Pending Due & Offers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="customer-due" className="flex items-center gap-1">
                  Pending Credit Due (₹)
                  <span className="text-xs text-muted-foreground">(Receivable)</span>
                </Label>
                <div className="relative">
                  <IndianRupee className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="customer-due"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={form.pendingDue || ''}
                    onChange={(e) => setForm({ ...form, pendingDue: parseFloat(e.target.value) || 0 })}
                    className="pl-8 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="customer-offers" className="flex items-center gap-1">
                  Special Offer / Discount
                  <Tag className="h-3.5 w-3.5 text-purple-600" />
                </Label>
                <Input
                  id="customer-offers"
                  placeholder="e.g. 5% VIP Discount / Free Checkup"
                  value={form.offers}
                  onChange={(e) => setForm({ ...form, offers: e.target.value })}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="customer-notes">Internal Notes / Vehicle Info</Label>
              <Input
                id="customer-notes"
                placeholder="e.g. Honda City (TN-01-AB-1234), Regular service client"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCustomerDialogOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveCustomer} disabled={isSaving} className="gap-2">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingCustomer ? 'Update Customer' : 'Save Customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settle Due Payment Dialog */}
      <Dialog open={Boolean(settleCustomer)} onOpenChange={(open) => !open && setSettleCustomer(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-amber-600" />
              Settle Customer Due
            </DialogTitle>
            <DialogDescription>
              Record an incoming credit clearance payment for{' '}
              <strong className="text-foreground">{settleCustomer?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 p-3 border border-amber-200 dark:border-amber-900/60 flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">Current Outstanding Due</p>
                <p className="text-xl font-bold text-amber-900 dark:text-amber-200">
                  ₹{(settleCustomer?.pendingDue || 0).toLocaleString('en-IN')}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => setSettleAmount(String(settleCustomer?.pendingDue || 0))}
              >
                Pay Full
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settle-amount">Payment Amount (₹)</Label>
              <div className="relative">
                <IndianRupee className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="settle-amount"
                  type="number"
                  min="1"
                  step="any"
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  className="pl-8 font-mono"
                  placeholder="Enter amount paid"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Payment Mode</Label>
              <Select
                value={settlePaymentMode}
                onValueChange={(val: any) => setSettlePaymentMode(val)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="UPI">UPI (Google Pay / PhonePe / Paytm)</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer / NEFT</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="settle-note">Note / Reference (Optional)</Label>
              <Input
                id="settle-note"
                placeholder="e.g. GPay Ref ID #12345"
                value={settleNote}
                onChange={(e) => setSettleNote(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSettleCustomer(null)}
              disabled={isSettling}
            >
              Cancel
            </Button>
            <Button onClick={handleSettleDue} disabled={isSettling} className="gap-2">
              {isSettling && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog
        open={Boolean(deleteCustomerId)}
        onOpenChange={(open) => !open && setDeleteCustomerId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Delete Customer Profile?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this customer from the database? Past completed invoices will remain safe in your records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCustomer}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
