'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { PageHeader } from '@/components/page-header';
import {
  Plus,
  Search,
  RotateCcw,
  ArrowUpDown,
  X,
  Printer,
  MessageCircle,
  MoreHorizontal,
  Package,
  Clock,
  CheckCircle2,
  AlertCircle,
  Building2,
  Calendar,
  IndianRupee,
  ShoppingCart,
  Pencil,
  Trash2,
  Eye,
  FileCheck,
  ClipboardList,
} from 'lucide-react';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import type { PurchaseOrder, Product, Vendor, CompanyProfile } from '@/lib/types';
import { format, startOfDay, endOfDay } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { CreateOrderDialog } from './_components/create-order-dialog';
import { PurchaseOrderPreviewDialog } from './_components/purchase-order-preview-dialog';
import { ShareWhatsAppDialog } from './_components/share-whatsapp-dialog';

export const dynamic = 'force-dynamic';

export default function OrdersPage() {
  const firestore = useFirestore();
  const { toast } = useToast();

  // Dialog Controls
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [previewOrder, setPreviewOrder] = useState<PurchaseOrder | null>(null);
  const [whatsappOrder, setWhatsappOrder] = useState<PurchaseOrder | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<PurchaseOrder | null>(null);

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');

  // Firestore Queries
  const ordersQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'purchaseOrders') : null),
    [firestore]
  );
  const { data: orders, isLoading: ordersLoading } = useCollection<PurchaseOrder>(ordersQuery);

  const productsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'products') : null),
    [firestore]
  );
  const { data: products } = useCollection<Product>(productsQuery);

  const vendorsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'vendors') : null),
    [firestore]
  );
  const { data: vendors } = useCollection<Vendor>(vendorsQuery);

  const defaultProfileQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'companyProfiles'), where('isDefault', '==', true)) : null),
    [firestore]
  );
  const { data: defaultProfileData } = useCollection<CompanyProfile>(defaultProfileQuery);
  const companyProfile = useMemo(() => defaultProfileData?.[0], [defaultProfileData]);

  // Filtering and Sorting
  const filteredOrders = useMemo(() => {
    let list = (orders || []).filter((o) => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        o.orderNumber.toLowerCase().includes(q) ||
        o.vendorName.toLowerCase().includes(q) ||
        (o.items || []).some((item) => item.productName.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (statusFilter !== 'all' && o.status !== statusFilter) {
        return false;
      }

      if (startDate && o.date) {
        const start = startOfDay(new Date(startDate));
        if (new Date(o.date) < start) return false;
      }

      if (endDate && o.date) {
        const end = endOfDay(new Date(endDate));
        if (new Date(o.date) > end) return false;
      }

      return true;
    });

    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
        case 'date-asc':
          return new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime();
        case 'order-desc':
          return b.orderNumber.localeCompare(a.orderNumber);
        case 'order-asc':
          return a.orderNumber.localeCompare(b.orderNumber);
        case 'amount-desc':
          return (b.totalEstimatedAmount || 0) - (a.totalEstimatedAmount || 0);
        case 'amount-asc':
          return (a.totalEstimatedAmount || 0) - (b.totalEstimatedAmount || 0);
        case 'vendor-asc':
          return a.vendorName.localeCompare(b.vendorName);
        default:
          return 0;
      }
    });

    return list;
  }, [orders, searchTerm, statusFilter, startDate, endDate, sortBy]);

  const hasActiveFilters =
    searchTerm !== '' ||
    statusFilter !== 'all' ||
    startDate !== '' ||
    endDate !== '' ||
    sortBy !== 'date-desc';

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setStartDate('');
    setEndDate('');
    setSortBy('date-desc');
  };

  // Metrics
  const metrics = useMemo(() => {
    const list = orders || [];
    const totalOrders = list.length;
    const sentOrders = list.filter((o) => o.status === 'Sent').length;
    const receivedOrders = list.filter((o) => o.status === 'Received').length;
    const totalEstAmount = list
      .filter((o) => o.status !== 'Cancelled')
      .reduce((sum, o) => sum + (o.totalEstimatedAmount || 0), 0);

    return {
      totalOrders,
      sentOrders,
      receivedOrders,
      totalEstAmount,
    };
  }, [orders]);

// Recursively clean undefined values so Firestore setDoc never fails
function cleanFirestoreData(data: any): any {
  if (data === undefined) return null;
  if (data === null) return null;
  if (Array.isArray(data)) {
    return data.map(cleanFirestoreData);
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        cleaned[key] = cleanFirestoreData(value);
      } else {
        cleaned[key] = '';
      }
    }
    return cleaned;
  }
  return data;
}

  // Save / Update Order
  const handleSaveOrder = async (orderData: Omit<PurchaseOrder, 'id'>, orderId?: string): Promise<PurchaseOrder | null> => {
    if (!firestore) return null;

    try {
      const id = orderId || doc(collection(firestore, 'purchaseOrders')).id;
      const completeOrder: PurchaseOrder = {
        ...orderData,
        id,
      };

      const firestorePayload = cleanFirestoreData(completeOrder);
      await setDoc(doc(firestore, 'purchaseOrders', id), firestorePayload, { merge: true });

      toast({
        title: orderId ? 'Purchase Order Updated' : 'Purchase Order Placed',
        description: `Order ${completeOrder.orderNumber} for ${completeOrder.vendorName} has been saved.`,
      });

      // Automatically offer to preview or share
      setPreviewOrder(completeOrder);
      return completeOrder;
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error Saving Order', description: e.message });
      return null;
    }
  };

  // Mark as Received / Completed
  const handleUpdateStatus = async (order: PurchaseOrder, newStatus: PurchaseOrder['status']) => {
    if (!firestore) return;
    try {
      await setDoc(
        doc(firestore, 'purchaseOrders', order.id),
        { status: newStatus, updatedAt: new Date().toISOString() },
        { merge: true }
      );
      toast({
        title: 'Status Updated',
        description: `Order ${order.orderNumber} marked as ${newStatus}.`,
      });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Update Failed', description: e.message });
    }
  };

  // Delete Order
  const handleDeleteOrder = async () => {
    if (!firestore || !orderToDelete) return;
    try {
      await deleteDoc(doc(firestore, 'purchaseOrders', orderToDelete.id));
      toast({
        title: 'Order Deleted',
        description: `Purchase order ${orderToDelete.orderNumber} deleted successfully.`,
      });
      setOrderToDelete(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error Deleting', description: e.message });
    }
  };

  const getStatusBadge = (status: PurchaseOrder['status']) => {
    switch (status) {
      case 'Sent':
        return (
          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 text-[10px] h-5 gap-1">
            <Clock className="h-3 w-3" /> Sent
          </Badge>
        );
      case 'Received':
        return (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px] h-5 gap-1">
            <CheckCircle2 className="h-3 w-3" /> Received
          </Badge>
        );
      case 'Cancelled':
        return (
          <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30 text-[10px] h-5">
            Cancelled
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px] h-5">
            Draft
          </Badge>
        );
    }
  };

  return (
    <>
      <PageHeader
        title="Purchase Orders"
        description="Generate, track, and share vendor purchase orders with live product DB cart."
      >
        <Button
          size="sm"
          className="gap-1.5 shadow-sm"
          onClick={() => {
            setEditingOrder(null);
            setIsCreateOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          <span>Create Purchase Order</span>
        </Button>
      </PageHeader>

      {/* 4 Metric Summary Cards */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 mb-2">
        <Card className="border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Total Purchase Orders</CardTitle>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500">
              <ClipboardList className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="text-xl font-bold">{ordersLoading ? '...' : metrics.totalOrders}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">All created vendor orders</p>
          </CardContent>
        </Card>

        <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Active / Sent Orders</CardTitle>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
              <Clock className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
              {ordersLoading ? '...' : metrics.sentOrders}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Awaiting delivery fulfillment</p>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Received / Fulfilled</CardTitle>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {ordersLoading ? '...' : metrics.receivedOrders}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Delivered &amp; received in store</p>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-card to-card">
          <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 py-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Est. Total Order Value</CardTitle>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
              <IndianRupee className="h-3.5 w-3.5" />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
              {ordersLoading ? '...' : `₹${metrics.totalEstAmount.toLocaleString('en-IN')}`}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Estimated cumulative purchase value</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Orders Table Card */}
      <Card>
        <CardHeader className="p-3 pb-2.5 space-y-2 border-b">
          {/* Top Line: Title, Count Badge, Clear Button */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold tracking-tight">Purchase Order Directory</CardTitle>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                {filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'}
              </Badge>
            </div>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                title="Reset filters"
                type="button"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Clear Filters</span>
              </Button>
            )}
          </div>

          {/* Bottom Line: Full-width spacious filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search input */}
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search PO #, vendor, or item..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-7 h-8 text-xs bg-background"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                  type="button"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Date Range: cleanly encapsulated */}
            <div className="flex items-center gap-1.5 border rounded-md px-2 py-0.5 bg-background shadow-2xs">
              <span className="text-[11px] font-medium text-muted-foreground">From:</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-7 w-[125px] border-0 bg-transparent text-xs px-1 shadow-none focus-visible:ring-0"
                title="Order Date From"
              />
              <span className="text-muted-foreground/40 text-xs">|</span>
              <span className="text-[11px] font-medium text-muted-foreground">To:</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-7 w-[125px] border-0 bg-transparent text-xs px-1 shadow-none focus-visible:ring-0"
                title="Order Date To"
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs w-[125px] bg-background">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Sent">Sent / Placed</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
                <SelectItem value="Received">Received</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            {/* Sorting Filter */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-8 text-xs w-[145px] bg-background">
                <div className="flex items-center gap-1.5 truncate">
                  <ArrowUpDown className="h-3 w-3 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Sort by" />
                </div>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="date-desc">Date: Newest</SelectItem>
                <SelectItem value="date-asc">Date: Oldest</SelectItem>
                <SelectItem value="order-asc">PO #: 1, 2, 3..</SelectItem>
                <SelectItem value="order-desc">PO #: 3, 2, 1..</SelectItem>
                <SelectItem value="amount-desc">Est. Amount: High → Low</SelectItem>
                <SelectItem value="amount-asc">Est. Amount: Low → High</SelectItem>
                <SelectItem value="vendor-asc">Vendor: A → Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[130px]">PO Number</TableHead>
                <TableHead className="min-w-[170px]">Vendor / Supplier</TableHead>
                <TableHead className="w-[125px]">Order Date</TableHead>
                <TableHead className="w-[135px]">Items &amp; Units</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead className="w-[130px] text-right">Est. Total</TableHead>
                <TableHead className="w-[130px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordersLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-xs">
                    Loading purchase orders...
                  </TableCell>
                </TableRow>
              )}
              {!ordersLoading && filteredOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                    <ClipboardList className="h-7 w-7 mx-auto mb-1.5 opacity-30" />
                    No purchase orders match your filter criteria.
                    <div className="mt-2">
                      {hasActiveFilters ? (
                        <Button variant="link" size="sm" onClick={resetFilters} className="text-xs h-auto p-0 text-primary">
                          Clear all filters
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingOrder(null);
                            setIsCreateOpen(true);
                          }}
                          className="text-xs h-7 gap-1"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Create First Purchase Order
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {!ordersLoading &&
                filteredOrders.map((order) => (
                  <TableRow key={order.id} className="hover:bg-muted/15">
                    {/* PO Number */}
                    <TableCell className="font-semibold text-xs font-mono whitespace-nowrap">
                      {order.orderNumber}
                    </TableCell>

                    {/* Vendor */}
                    <TableCell>
                      <div className="font-semibold text-xs">{order.vendorName}</div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        {order.vendorPhone ? (
                          <span>Ph: {order.vendorPhone}</span>
                        ) : order.vendorGst ? (
                          <span className="font-mono">GST: {order.vendorGst}</span>
                        ) : (
                          <span>Supplier</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Date & Expected */}
                    <TableCell className="text-xs whitespace-nowrap">
                      <div>{format(new Date(order.date), 'dd-MMM-yyyy')}</div>
                      {order.expectedDeliveryDate && (
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <span>Due: {format(new Date(order.expectedDeliveryDate), 'dd-MMM')}</span>
                        </div>
                      )}
                    </TableCell>

                    {/* Items & Units */}
                    <TableCell className="text-xs">
                      <div className="font-medium">
                        {(order.items || []).length} item{(order.items || []).length === 1 ? '' : 's'}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {order.totalQuantity} total units
                      </div>
                    </TableCell>

                    {/* Status */}
                    <TableCell>{getStatusBadge(order.status)}</TableCell>

                    {/* Est. Total Amount */}
                    <TableCell className="text-right font-bold text-xs whitespace-nowrap">
                      ₹{order.totalEstimatedAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Quick View / Print */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title="Preview & Print PO"
                          onClick={() => setPreviewOrder(order)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>

                        {/* Quick WhatsApp Share */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/10"
                          title="Share on WhatsApp"
                          onClick={() => setWhatsappOrder(order)}
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </Button>

                        {/* More Menu */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Order Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => setPreviewOrder(order)}>
                              <Printer className="h-4 w-4 mr-2" />
                              Print / PDF Preview
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setWhatsappOrder(order)}>
                              <MessageCircle className="h-4 w-4 mr-2 text-emerald-600" />
                              Share on WhatsApp
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {order.status !== 'Received' && (
                              <DropdownMenuItem onClick={() => handleUpdateStatus(order, 'Received')}>
                                <FileCheck className="h-4 w-4 mr-2 text-emerald-600" />
                                Mark as Received
                              </DropdownMenuItem>
                            )}
                            {order.status !== 'Sent' && (
                              <DropdownMenuItem onClick={() => handleUpdateStatus(order, 'Sent')}>
                                <Clock className="h-4 w-4 mr-2 text-blue-600" />
                                Mark as Sent / Placed
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => {
                                setEditingOrder(order);
                                setIsCreateOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit Order
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setOrderToDelete(order)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Cart-Style Create / Edit Dialog */}
      <CreateOrderDialog
        isOpen={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        products={products || []}
        vendors={vendors || []}
        existingOrdersCount={(orders || []).length}
        editingOrder={editingOrder}
        onSaveOrder={handleSaveOrder}
      />

      {/* PO Document Preview & Print Dialog */}
      <PurchaseOrderPreviewDialog
        order={previewOrder}
        isOpen={Boolean(previewOrder)}
        onOpenChange={(open) => !open && setPreviewOrder(null)}
        companyProfile={companyProfile}
        onShareWhatsApp={(order) => {
          setPreviewOrder(null);
          setWhatsappOrder(order);
        }}
      />

      {/* WhatsApp Share Dialog */}
      <ShareWhatsAppDialog
        order={whatsappOrder}
        isOpen={Boolean(whatsappOrder)}
        onOpenChange={(open) => !open && setWhatsappOrder(null)}
        companyProfile={companyProfile}
      />

      {/* Delete Confirmation Alert */}
      <AlertDialog open={Boolean(orderToDelete)} onOpenChange={(open) => !open && setOrderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete Purchase Order{' '}
              <span className="font-semibold text-foreground">{orderToDelete?.orderNumber}</span> for{' '}
              <span className="font-semibold text-foreground">{orderToDelete?.vendorName}</span>? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteOrder} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
