'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Building2, Plus, Pencil, Trash2, Search, IndianRupee, Loader2, Phone, Mail, FileText, CheckCircle2, Wallet, AlertTriangle, Check
} from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import type { Vendor } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

const EMPTY_VENDOR: Omit<Vendor, 'id'> = {
  name: '',
  companyName: '',
  phone: '',
  email: '',
  address: '',
  gstNo: '',
  pendingAmount: 0,
  notes: '',
};

export default function VendorsPage() {
  const firestore = useFirestore();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [form, setForm] = useState<Omit<Vendor, 'id'>>(EMPTY_VENDOR);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteVendorId, setDeleteVendorId] = useState<string | null>(null);

  // Payment settle dialog state
  const [settleVendor, setSettleVendor] = useState<Vendor | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [isSettling, setIsSettling] = useState(false);

  const vendorsQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'vendors'), orderBy('name')) : null),
    [firestore]
  );
  const { data: vendors, isLoading } = useCollection<Vendor>(vendorsQuery);

  const filteredVendors = (vendors || []).filter((v) => {
    const q = searchTerm.toLowerCase();
    return (
      v.name.toLowerCase().includes(q) ||
      v.companyName.toLowerCase().includes(q) ||
      (v.gstNo && v.gstNo.toLowerCase().includes(q)) ||
      (v.phone && v.phone.includes(q))
    );
  });

  const totalPending = (vendors || []).reduce((acc, v) => acc + (v.pendingAmount || 0), 0);

  const openAddModal = () => {
    setEditingVendor(null);
    setForm(EMPTY_VENDOR);
    setVendorDialogOpen(true);
  };

  const openEditModal = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setForm({
      name: vendor.name || '',
      companyName: vendor.companyName || '',
      phone: vendor.phone || '',
      email: vendor.email || '',
      address: vendor.address || '',
      gstNo: vendor.gstNo || '',
      pendingAmount: vendor.pendingAmount || 0,
      notes: vendor.notes || '',
    });
    setVendorDialogOpen(true);
  };

  const saveVendor = async () => {
    if (!firestore || !form.name.trim() || !form.companyName.trim()) {
      toast({ variant: 'destructive', title: 'Name & Company Name are required.' });
      return;
    }

    setIsSaving(true);
    try {
      const vendorId = editingVendor?.id || doc(collection(firestore, 'vendors')).id;
      await setDoc(doc(firestore, 'vendors', vendorId), {
        ...form,
        pendingAmount: Number(form.pendingAmount) || 0,
        createdAt: editingVendor?.createdAt || new Date().toISOString(),
      });

      toast({
        title: editingVendor ? 'Vendor Updated' : 'Vendor Added',
        description: `${form.companyName} (${form.name}) has been saved.`,
      });
      setVendorDialogOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error Saving Vendor', description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteVendor = async () => {
    if (!firestore || !deleteVendorId) return;
    try {
      await deleteDoc(doc(firestore, 'vendors', deleteVendorId));
      toast({ title: 'Vendor Removed' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setDeleteVendorId(null);
    }
  };

  const handleSettlePayment = async () => {
    if (!firestore || !settleVendor) return;
    const amountPaid = Number(payAmount) || 0;
    if (amountPaid <= 0) {
      toast({ variant: 'destructive', title: 'Enter a valid payment amount.' });
      return;
    }

    setIsSettling(true);
    try {
      const newPending = Math.max(0, (settleVendor.pendingAmount || 0) - amountPaid);
      await setDoc(
        doc(firestore, 'vendors', settleVendor.id),
        { pendingAmount: newPending },
        { merge: true }
      );

      toast({
        title: 'Payment Recorded',
        description: `Paid ₹${amountPaid.toLocaleString()} to ${settleVendor.companyName}. Remaining pending: ₹${newPending.toLocaleString()}.`,
      });
      setSettleVendor(null);
      setPayAmount('');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Payment Error', description: e.message });
    } finally {
      setIsSettling(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Vendor Management"
        description="Manage suppliers, track pending balances, and record vendor details."
      >
        <Button size="sm" className="gap-1.5" onClick={openAddModal}>
          <Plus className="h-4 w-4" /> Add Vendor
        </Button>
      </PageHeader>

      {/* Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Card className="border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Total Vendors</CardTitle>
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
              <Building2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '...' : (vendors || []).length}</div>
            <p className="text-xs text-muted-foreground mt-1">Registered suppliers & vendors</p>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Total Pending to Pay</CardTitle>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
              <IndianRupee className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {isLoading ? '...' : `₹${totalPending.toLocaleString()}`}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Outstanding payable balance</p>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Clear Accounts</CardTitle>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {isLoading ? '...' : (vendors || []).filter((v) => (v.pendingAmount || 0) === 0).length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Vendors with zero balance</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Vendor Table Card */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">Vendor Directory</CardTitle>
            <CardDescription>A list of all supplier contacts and payment status.</CardDescription>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search vendor, company or GST..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company & Vendor</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>GST Number</TableHead>
                <TableHead className="text-right">Pending Amount</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Loading vendors...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filteredVendors.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No vendors found. Click "Add Vendor" to create one.
                  </TableCell>
                </TableRow>
              )}
              {!isLoading &&
                filteredVendors.map((vendor) => {
                  const pending = vendor.pendingAmount || 0;
                  return (
                    <TableRow key={vendor.id}>
                      <TableCell>
                        <div className="font-semibold text-sm">{vendor.companyName}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> {vendor.name}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="text-xs space-y-0.5">
                          {vendor.phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="h-3 w-3 text-muted-foreground" /> {vendor.phone}
                            </div>
                          )}
                          {vendor.email && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Mail className="h-3 w-3" /> {vendor.email}
                            </div>
                          )}
                          {!vendor.phone && !vendor.email && <span className="text-muted-foreground">—</span>}
                        </div>
                      </TableCell>

                      <TableCell>
                        {vendor.gstNo ? (
                          <Badge variant="outline" className="font-mono text-xs">
                            {vendor.gstNo}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Unregistered</span>
                        )}
                      </TableCell>

                      <TableCell className="text-right font-medium">
                        {pending > 0 ? (
                          <Badge
                            variant="outline"
                            className="bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400 font-semibold"
                          >
                            ₹{pending.toLocaleString()}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                            Clear (₹0)
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                        {vendor.notes || '—'}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex justify-end items-center gap-1">
                          {pending > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs gap-1 border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                              onClick={() => {
                                setSettleVendor(vendor);
                                setPayAmount(String(pending));
                              }}
                            >
                              <Wallet className="h-3.5 w-3.5" /> Pay
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditModal(vendor)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteVendorId(vendor.id)}
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
        </CardContent>
      </Card>

      {/* Add / Edit Vendor Dialog */}
      <Dialog open={vendorDialogOpen} onOpenChange={setVendorDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingVendor ? 'Edit Vendor' : 'Add New Vendor'}</DialogTitle>
            <DialogDescription>Fill in vendor and company contact details.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1">
              <Label>Company / Firm Name *</Label>
              <Input
                placeholder="e.g. TVS Auto Spares Ltd"
                value={form.companyName}
                onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Contact Person Name *</Label>
              <Input
                placeholder="e.g. Rajesh Kumar"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Phone Number</Label>
              <Input
                placeholder="e.g. 9876543210"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Email Address</Label>
              <Input
                type="email"
                placeholder="vendor@example.com"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>GST Number</Label>
              <Input
                placeholder="e.g. 33AAAAA0000A1Z5"
                value={form.gstNo}
                onChange={(e) => setForm((p) => ({ ...p, gstNo: e.target.value.toUpperCase() }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Pending Balance (₹)</Label>
              <Input
                type="number"
                placeholder="0"
                value={form.pendingAmount || ''}
                onChange={(e) => setForm((p) => ({ ...p, pendingAmount: Number(e.target.value) }))}
              />
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Address</Label>
              <Input
                placeholder="Store / Factory Address..."
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              />
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Notes</Label>
              <Textarea
                placeholder="Payment terms, bank details or extra notes..."
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setVendorDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveVendor} disabled={isSaving} className="gap-2">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {editingVendor ? 'Update Vendor' : 'Save Vendor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay / Settle Amount Dialog */}
      <Dialog open={!!settleVendor} onOpenChange={(open) => !open && setSettleVendor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Settle Vendor Payment</DialogTitle>
            <DialogDescription>
              Record payment to <strong>{settleVendor?.companyName}</strong>. Current Pending: ₹
              {(settleVendor?.pendingAmount || 0).toLocaleString()}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Amount Paid (₹)</Label>
              <Input
                type="number"
                placeholder="Enter paid amount"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Remaining balance will be automatically recalculated.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSettleVendor(null)}>
              Cancel
            </Button>
            <Button onClick={handleSettlePayment} disabled={isSettling} className="gap-2 bg-amber-600 hover:bg-amber-700 text-white">
              {isSettling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteVendorId} onOpenChange={(o: boolean) => !o && setDeleteVendorId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Vendor?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this vendor? Existing purchase records will remain intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteVendor} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
