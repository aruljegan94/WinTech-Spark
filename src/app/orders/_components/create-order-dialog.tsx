'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ShoppingCart,
  Plus,
  Trash2,
  PackagePlus,
  Building2,
  Calendar,
  Layers,
  Search,
  Check,
  RotateCcw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { PurchaseOrder, PurchaseOrderItem, Product, Vendor } from '@/lib/types';
import { format } from 'date-fns';

const STANDARD_UNITS = [
  'Nos',
  'Pcs',
  'Ltr',
  'Box',
  'Kg',
  'Mtr',
  'Set',
  'Pkt',
  'Can',
  'Pair',
  'Roll',
  'Brl',
  'Gms',
  'Doz',
];

interface CreateOrderDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  vendors: Vendor[];
  existingOrdersCount: number;
  editingOrder?: PurchaseOrder | null;
  onSaveOrder: (orderData: Omit<PurchaseOrder, 'id'>, orderId?: string) => Promise<PurchaseOrder | null>;
}

export function CreateOrderDialog({
  isOpen,
  onOpenChange,
  products,
  vendors,
  existingOrdersCount,
  editingOrder,
  onSaveOrder,
}: CreateOrderDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Order Details Form State
  const [orderNumber, setOrderNumber] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [customVendorName, setCustomVendorName] = useState('');
  const [customVendorPhone, setCustomVendorPhone] = useState('');
  const [customVendorGst, setCustomVendorGst] = useState('');
  const [customVendorAddress, setCustomVendorAddress] = useState('');
  const [orderStatus, setOrderStatus] = useState<'Draft' | 'Sent'>('Sent');
  const [orderNotes, setOrderNotes] = useState('');

  // Cart Items State
  const [cartItems, setCartItems] = useState<PurchaseOrderItem[]>([]);

  // Item Input Form (Cart Builder)
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemQuantity, setItemQuantity] = useState('1');
  const [itemUnit, setItemUnit] = useState('Nos');
  const [itemPrice, setItemPrice] = useState('');
  const [itemNotes, setItemNotes] = useState('');

  // Initialize form when opening or editing
  useEffect(() => {
    if (!isOpen) return;

    if (editingOrder) {
      setOrderNumber(editingOrder.orderNumber);
      setOrderDate(editingOrder.date ? editingOrder.date.split('T')[0] : format(new Date(), 'yyyy-MM-dd'));
      setExpectedDate(editingOrder.expectedDeliveryDate || '');
      setSelectedVendorId(editingOrder.vendorId || 'custom');
      setCustomVendorName(editingOrder.vendorName || '');
      setCustomVendorPhone(editingOrder.vendorPhone || '');
      setCustomVendorGst(editingOrder.vendorGst || '');
      setCustomVendorAddress(editingOrder.vendorAddress || '');
      setOrderStatus(editingOrder.status === 'Draft' ? 'Draft' : 'Sent');
      setOrderNotes(editingOrder.notes || '');
      setCartItems(editingOrder.items || []);
    } else {
      const year = new Date().getFullYear();
      const nextSeq = String(existingOrdersCount + 1).padStart(3, '0');
      setOrderNumber(`PO-${year}-${nextSeq}`);
      setOrderDate(format(new Date(), 'yyyy-MM-dd'));
      setExpectedDate('');
      setSelectedVendorId('');
      setCustomVendorName('');
      setCustomVendorPhone('');
      setCustomVendorGst('');
      setCustomVendorAddress('');
      setOrderStatus('Sent');
      setOrderNotes('');
      setCartItems([]);
    }

    // Reset item builder inputs
    resetItemInput();
  }, [isOpen, editingOrder, existingOrdersCount]);

  const resetItemInput = () => {
    setSelectedProductId('');
    setProductSearch('');
    setItemName('');
    setItemQuantity('1');
    setItemUnit('Nos');
    setItemPrice('');
    setItemNotes('');
  };

  // Vendor Lookup
  const activeVendor = useMemo(() => {
    return vendors.find((v) => v.id === selectedVendorId);
  }, [vendors, selectedVendorId]);

  // Filter Products for autocomplete
  const filteredProducts = useMemo(() => {
    const q = productSearch.toLowerCase().trim();
    if (!q) return products.slice(0, 10);
    return products
      .filter((p) => p.productName.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
      .slice(0, 10);
  }, [products, productSearch]);

  const handleSelectProduct = (product: Product) => {
    setSelectedProductId(product.id);
    setProductSearch(product.productName);
    setItemName(product.productName);
    setItemPrice(String(product.purchasePrice || product.sellingPrice || ''));
  };

  // Add Item to Cart
  const handleAddToCart = () => {
    const name = itemName.trim() || productSearch.trim();
    if (!name) {
      toast({ variant: 'destructive', title: 'Product Name Required', description: 'Please select or enter an item name.' });
      return;
    }

    const qty = Number(itemQuantity) || 1;
    if (qty <= 0) {
      toast({ variant: 'destructive', title: 'Invalid Quantity', description: 'Quantity must be at least 1.' });
      return;
    }

    const price = Number(itemPrice) || 0;
    const lineTotal = qty * price;

    const newItem: PurchaseOrderItem = {
      productId: selectedProductId || '',
      productName: name,
      quantity: qty,
      unit: itemUnit || 'Nos',
      estimatedPrice: price,
      estimatedTotal: lineTotal,
      notes: itemNotes.trim() || '',
    };

    setCartItems((prev) => [...prev, newItem]);
    resetItemInput();
  };

  const handleRemoveFromCart = (index: number) => {
    setCartItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateItemQty = (index: number, newQty: number) => {
    if (newQty <= 0) return;
    setCartItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              quantity: newQty,
              estimatedTotal: newQty * item.estimatedPrice,
            }
          : item
      )
    );
  };

  // Cart Totals
  const cartTotals = useMemo(() => {
    const totalQty = cartItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const totalAmount = cartItems.reduce((sum, item) => sum + (item.estimatedTotal || 0), 0);
    return {
      totalQty,
      totalAmount,
    };
  }, [cartItems]);

  const handleSubmit = async () => {
    const vendorName = activeVendor ? activeVendor.companyName : customVendorName.trim();
    if (!vendorName) {
      toast({ variant: 'destructive', title: 'Vendor Required', description: 'Please select or enter a supplier / vendor name.' });
      return;
    }

    if (cartItems.length === 0) {
      toast({ variant: 'destructive', title: 'Empty Order Cart', description: 'Please add at least one product to the order.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const sanitizedItems: PurchaseOrderItem[] = cartItems.map((item) => ({
        productId: item.productId || '',
        productName: item.productName || '',
        quantity: item.quantity || 1,
        unit: item.unit || 'Nos',
        estimatedPrice: item.estimatedPrice || 0,
        estimatedTotal: item.estimatedTotal || 0,
        notes: item.notes || '',
      }));

      const orderData: Omit<PurchaseOrder, 'id'> = {
        orderNumber: orderNumber.trim() || `PO-${new Date().getFullYear()}-001`,
        vendorId: activeVendor?.id || '',
        vendorName,
        vendorPhone: (activeVendor ? activeVendor.phone : customVendorPhone.trim()) || '',
        vendorGst: (activeVendor ? activeVendor.gstNo : customVendorGst.trim()) || '',
        vendorAddress: (activeVendor ? activeVendor.address : customVendorAddress.trim()) || '',
        date: orderDate ? new Date(orderDate).toISOString() : new Date().toISOString(),
        expectedDeliveryDate: expectedDate.trim() || '',
        items: sanitizedItems,
        totalQuantity: cartTotals.totalQty,
        totalEstimatedAmount: cartTotals.totalAmount,
        status: orderStatus,
        notes: orderNotes.trim() || '',
        createdAt: editingOrder?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const saved = await onSaveOrder(orderData, editingOrder?.id);
      if (saved) {
        onOpenChange(false);
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error Saving Order', description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <PackagePlus className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {editingOrder ? 'Edit Purchase Order' : 'Create Purchase Order'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Build an order cart from your product database and generate an official PO.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Section 1: Order Metadata & Vendor Selection */}
          <div className="p-3 rounded-lg border bg-muted/20 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">PO Number *</Label>
                <Input
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  className="h-8 text-xs font-mono font-bold"
                  placeholder="PO-2026-001"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Order Date *</Label>
                <Input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Expected Delivery Date</Label>
                <Input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* Vendor Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t">
              <div className="space-y-1">
                <Label className="text-xs font-semibold flex items-center justify-between">
                  <span>Vendor / Supplier *</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Choose from DB or enter custom</span>
                </Label>
                <Select
                  value={selectedVendorId}
                  onValueChange={(val) => {
                    setSelectedVendorId(val);
                    if (val !== 'custom') {
                      const v = vendors.find((vend) => vend.id === val);
                      if (v) {
                        setCustomVendorName(v.companyName);
                        setCustomVendorPhone(v.phone || '');
                        setCustomVendorGst(v.gstNo || '');
                        setCustomVendorAddress(v.address || '');
                      }
                    } else {
                      setCustomVendorName('');
                      setCustomVendorPhone('');
                      setCustomVendorGst('');
                      setCustomVendorAddress('');
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select Registered Vendor..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom" className="text-primary font-medium">
                      + Enter Custom / Other Vendor
                    </SelectItem>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.companyName} {v.phone ? `(${v.phone})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Vendor Name</Label>
                <Input
                  value={activeVendor ? activeVendor.companyName : customVendorName}
                  onChange={(e) => setCustomVendorName(e.target.value)}
                  placeholder="e.g. Bosch Auto Parts Ltd"
                  className="h-8 text-xs"
                  disabled={Boolean(activeVendor)}
                />
              </div>
            </div>

            {/* Vendor Phone and GST */}
            {(!activeVendor || selectedVendorId === 'custom') && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                <Input
                  placeholder="Vendor Phone / WhatsApp"
                  value={customVendorPhone}
                  onChange={(e) => setCustomVendorPhone(e.target.value)}
                  className="h-7 text-xs"
                />
                <Input
                  placeholder="Vendor GSTIN (Optional)"
                  value={customVendorGst}
                  onChange={(e) => setCustomVendorGst(e.target.value)}
                  className="h-7 text-xs font-mono"
                />
                <Input
                  placeholder="Vendor Address / City"
                  value={customVendorAddress}
                  onChange={(e) => setCustomVendorAddress(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
            )}
          </div>

          {/* Section 2: Product DB Cart Builder Tray */}
          <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-primary flex items-center gap-1.5">
                <ShoppingCart className="h-3.5 w-3.5" />
                Add Products to Order Cart
              </span>
              <span className="text-[10px] text-muted-foreground">Search product database or enter custom item</span>
            </div>

            {/* Autocomplete and Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              {/* Product Search & Dropdown */}
              <div className="sm:col-span-5 space-y-1">
                <Label className="text-[11px] font-medium">Product / Item Name *</Label>
                <div className="relative">
                  <Input
                    placeholder="Search product from DB..."
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setItemName(e.target.value);
                      setSelectedProductId('');
                    }}
                    className="h-8 text-xs pr-7 bg-background"
                  />
                  {productSearch && (
                    <button
                      type="button"
                      onClick={() => resetItemInput()}
                      className="absolute right-2 top-2 text-muted-foreground hover:text-foreground text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Quick suggestions when typing */}
                {productSearch && !selectedProductId && filteredProducts.length > 0 && (
                  <div className="absolute z-50 bg-popover text-popover-foreground border rounded-md shadow-md mt-1 w-72 max-h-48 overflow-y-auto divide-y">
                    {filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectProduct(p)}
                        className="w-full text-left p-2 hover:bg-muted text-xs flex justify-between items-center transition-colors"
                      >
                        <div>
                          <div className="font-semibold">{p.productName}</div>
                          <div className="text-[10px] text-muted-foreground">{p.category}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">₹{p.purchasePrice}</div>
                          <div className="text-[10px] text-muted-foreground">Stock: {p.stockQuantity}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Unit / Size Selector */}
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-[11px] font-medium">Unit / Size</Label>
                <Select value={itemUnit} onValueChange={setItemUnit}>
                  <SelectTrigger className="h-8 text-xs bg-background">
                    <SelectValue placeholder="Unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {STANDARD_UNITS.map((u) => (
                      <SelectItem key={u} value={u} className="text-xs">
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Quantity */}
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-[11px] font-medium">Quantity</Label>
                <Input
                  type="number"
                  min="0.001"
                  step="any"
                  value={itemQuantity}
                  onChange={(e) => setItemQuantity(e.target.value)}
                  className="h-8 text-xs text-right bg-background font-mono"
                />
              </div>

              {/* Est. Unit Rate */}
              <div className="sm:col-span-3 space-y-1">
                <Label className="text-[11px] font-medium">Est. Unit Price (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={itemPrice}
                  onChange={(e) => setItemPrice(e.target.value)}
                  className="h-8 text-xs text-right bg-background font-mono"
                />
              </div>
            </div>

            {/* Line Item Notes & Add Button */}
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <Input
                placeholder="Item specifications / notes (e.g. grade, size, brand, part #)"
                value={itemNotes}
                onChange={(e) => setItemNotes(e.target.value)}
                className="h-8 text-xs bg-background flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddToCart();
                  }
                }}
              />
              <Button type="button" size="sm" onClick={handleAddToCart} className="h-8 text-xs gap-1.5 shrink-0 w-full sm:w-auto">
                <Plus className="h-3.5 w-3.5" />
                Add to Cart
              </Button>
            </div>
          </div>

          {/* Section 3: The Live Cart Table */}
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent bg-muted/40">
                  <TableHead className="w-10 text-center">#</TableHead>
                  <TableHead>Item &amp; Notes</TableHead>
                  <TableHead className="w-20 text-center">Unit</TableHead>
                  <TableHead className="w-28 text-center">Quantity</TableHead>
                  <TableHead className="w-24 text-right">Est. Rate</TableHead>
                  <TableHead className="w-28 text-right font-semibold">Line Total</TableHead>
                  <TableHead className="w-10 text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cartItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-xs">
                      <ShoppingCart className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
                      Your order cart is empty. Add products above to start building the order.
                    </TableCell>
                  </TableRow>
                ) : (
                  cartItems.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-center text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>
                        <div className="font-semibold text-xs">{item.productName}</div>
                        {item.notes && <div className="text-[11px] text-muted-foreground">{item.notes}</div>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[10px] h-4 px-1 py-0">
                          {item.unit}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(idx, item.quantity - 1)}
                            className="h-5 w-5 rounded border flex items-center justify-center hover:bg-muted text-xs"
                          >
                            -
                          </button>
                          <span className="font-semibold text-xs px-1 min-w-[20px] text-center">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(idx, item.quantity + 1)}
                            className="h-5 w-5 rounded border flex items-center justify-center hover:bg-muted text-xs"
                          >
                            +
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        ₹{item.estimatedPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-xs">
                        ₹{item.estimatedTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveFromCart(idx)}
                          className="h-6 w-6 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {cartItems.length > 0 && (
                <tfoot className="border-t bg-muted/40 font-bold">
                  <tr>
                    <td colSpan={3} className="p-2.5 text-xs text-muted-foreground">
                      Total Items: {cartItems.length} ({cartTotals.totalQty} Units)
                    </td>
                    <td colSpan={2} className="p-2.5 text-right text-xs">
                      Estimated Order Total:
                    </td>
                    <td className="p-2.5 text-right font-extrabold text-sm text-primary">
                      ₹{cartTotals.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </Table>
          </div>

          {/* Section 4: Notes and Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs font-semibold">Special Instructions / Terms</Label>
              <Textarea
                placeholder="e.g. Deliver between 10am-2pm, include tax invoice, payment upon verification..."
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                className="h-16 text-xs resize-none"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Order Status</Label>
              <Select value={orderStatus} onValueChange={(v: any) => setOrderStatus(v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sent">Sent / Placed</SelectItem>
                  <SelectItem value="Draft">Draft (Not Sent)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Mark as 'Sent' to track pending delivery or 'Draft' to finalize later.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t pt-3 gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={isSubmitting} className="gap-1.5">
            <Check className="h-3.5 w-3.5" />
            {isSubmitting ? 'Saving...' : editingOrder ? 'Update Purchase Order' : 'Place Purchase Order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
