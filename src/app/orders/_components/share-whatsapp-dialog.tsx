'use client';

import { useState, useMemo } from 'react';
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
import { MessageCircle, Copy, Check, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import type { PurchaseOrder, CompanyProfile } from '@/lib/types';

interface ShareWhatsAppDialogProps {
  order: PurchaseOrder | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  companyProfile?: CompanyProfile | null;
}

export function ShareWhatsAppDialog({
  order,
  isOpen,
  onOpenChange,
  companyProfile,
}: ShareWhatsAppDialogProps) {
  const { toast } = useToast();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [hasCopied, setHasCopied] = useState(false);

  // Sync vendor phone when order opens
  const defaultPhone = order?.vendorPhone ? order.vendorPhone.replace(/[^0-9]/g, '') : '';
  const currentPhone = phoneNumber || defaultPhone;

  const companyName = companyProfile?.companyName || 'WinTech-Spark';
  const companyPhone = companyProfile?.contact || '';
  const companyGst = companyProfile?.gstNumber || '';

  // Generate well-formatted WhatsApp message
  const whatsappMessage = useMemo(() => {
    if (!order) return '';

    let text = `📦 *PURCHASE ORDER: ${order.orderNumber}*\n`;
    text += `🏢 *From:* ${companyName}\n`;
    text += `👤 *To:* ${order.vendorName}\n`;
    text += `📅 *Date:* ${format(new Date(order.date), 'dd-MMM-yyyy')}\n`;
    if (order.expectedDeliveryDate) {
      text += `🚚 *Expected Delivery:* ${format(new Date(order.expectedDeliveryDate), 'dd-MMM-yyyy')}\n`;
    }
    text += `\n*ORDER ITEMS:*\n`;
    text += `------------------------------------\n`;

    order.items.forEach((item, idx) => {
      text += `${idx + 1}. *${item.productName}*\n`;
      text += `   Qty: ${item.quantity} ${item.unit || 'Nos'} @ ₹${item.estimatedPrice.toLocaleString('en-IN')}\n`;
      text += `   Est. Total: ₹${item.estimatedTotal.toLocaleString('en-IN')}\n`;
      if (item.notes) {
        text += `   _Note: ${item.notes}_\n`;
      }
    });

    text += `------------------------------------\n`;
    text += `*Total Items:* ${order.items.length} (${order.totalQuantity} Units)\n`;
    text += `💰 *Est. Grand Total: ₹${order.totalEstimatedAmount.toLocaleString('en-IN')}*\n`;

    if (order.notes) {
      text += `\n📝 *Special Instructions:*\n${order.notes}\n`;
    }

    text += `\n------------------------------------\n`;
    text += `*${companyName}*\n`;
    if (companyPhone) text += `📞 ${companyPhone}\n`;
    if (companyGst) text += `GSTIN: ${companyGst}\n`;
    text += `_Please acknowledge this purchase order and confirm delivery timeline._`;

    return text;
  }, [order, companyName, companyPhone, companyGst]);

  const handleCopy = () => {
    navigator.clipboard.writeText(whatsappMessage);
    setHasCopied(true);
    toast({
      title: 'Copied to Clipboard',
      description: 'Purchase order details copied to clipboard.',
    });
    setTimeout(() => setHasCopied(false), 2000);
  };

  const handleSendWhatsApp = () => {
    const cleanNumber = currentPhone.replace(/[^0-9]/g, '');
    const encodedText = encodeURIComponent(whatsappMessage);

    let url = '';
    if (cleanNumber.length >= 10) {
      const formatted = cleanNumber.length === 10 ? `91${cleanNumber}` : cleanNumber;
      url = `https://wa.me/${formatted}?text=${encodedText}`;
    } else {
      url = `https://wa.me/?text=${encodedText}`;
    }

    window.open(url, '_blank');
    onOpenChange(false);
  };

  if (!order) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-emerald-600">
            <MessageCircle className="h-5 w-5" />
            <DialogTitle>Share Purchase Order on WhatsApp</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Send an itemized purchase order directly to your vendor or copy the order text.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Vendor WhatsApp Number</Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. 9876543210 (10-digit mobile)"
                value={currentPhone}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Message Preview</Label>
              <Button variant="ghost" size="sm" onClick={handleCopy} className="h-6 text-[11px] px-2 gap-1">
                {hasCopied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                <span>{hasCopied ? 'Copied' : 'Copy Text'}</span>
              </Button>
            </div>
            <div className="p-2.5 rounded-md border bg-muted/40 font-mono text-[11px] max-h-56 overflow-y-auto whitespace-pre-wrap leading-relaxed text-foreground select-all">
              {whatsappMessage}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            size="sm"
            onClick={handleSendWhatsApp}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Open WhatsApp</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
