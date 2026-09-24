'use client';

import { useState } from 'react';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Share2, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Sale, CompanyProfile } from '@/lib/types';
import { generateInvoiceImage } from '@/ai/flows/generate-invoice-image';
import { format } from 'date-fns';
import html2canvas from 'html2canvas';

interface ShareInvoiceDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale;
  companyProfile: CompanyProfile;
  invoiceRef: React.RefObject<HTMLDivElement | null>;
}

export function ShareInvoiceDialog({
  isOpen,
  onOpenChange,
  sale,
  companyProfile,
  invoiceRef
}: ShareInvoiceDialogProps) {
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const { toast } = useToast();

  const handleGenerateImage = async () => {
    if (!invoiceRef.current) {
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Invoice element not found.',
        });
        return;
    }
    setLoading(true);
    try {
        const canvas = await html2canvas(invoiceRef.current, {
            scale: 2, // Higher scale for better resolution
            useCORS: true,
            backgroundColor: window.getComputedStyle(document.body).backgroundColor,
        });
        const dataUrl = canvas.toDataURL('image/png');
        setImageUrl(dataUrl);
    } catch (error) {
        console.error('Failed to generate invoice image:', error);
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Failed to generate invoice image.',
        });
    } finally {
        setLoading(false);
    }
  };
  
  const handleShare = async () => {
    const dueDate = sale.date 
      ? format(new Date(new Date(sale.date).getTime() + 15 * 24 * 60 * 60 * 1000), 'dd-MMM-yyyy')
      : 'N/A';
    const message = `Dear ${sale.customerName || 'Customer'},\n\nPlease find your invoice ${sale.invoiceNumber} attached.\nTotal Amount: ₹${sale.total.toLocaleString()}\nDue Date: ${dueDate}\n\nThank you,\n${companyProfile.companyName || 'Win Automobiles'}`;
    const encodedMessage = encodeURIComponent(message);

    let phone = sale.customerMobile ? sale.customerMobile.replace(/\D/g, '') : '';
    if (phone && phone.length === 10) {
      phone = '91' + phone;
    }

    if (typeof navigator !== 'undefined' && navigator.share && imageUrl) {
      try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], `Invoice_${sale.invoiceNumber}.png`, { type: 'image/png' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `Invoice ${sale.invoiceNumber}`,
            text: message,
            files: [file],
          });
          toast({
            title: 'Invoice Shared',
            description: 'Invoice image and details shared successfully.',
          });
          return;
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }
        console.warn('Web Share failed, falling back to WhatsApp link:', error);
      }
    }

    const whatsappUrl = phone 
      ? `https://api.whatsapp.com/send?phone=${phone}&text=${encodedMessage}`
      : `https://api.whatsapp.com/send?text=${encodedMessage}`;

    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    
    toast({
      title: 'WhatsApp Opened',
      description: 'You can now paste the copied image into the chat.',
    });
  };

  const handleCopyToClipboard = () => {
     if (!imageUrl) return;
    
    // Convert base64 to blob
    const byteString = atob(imageUrl.split(',')[1]);
    const mimeString = imageUrl.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: mimeString });

    // Use the Clipboard API to copy the image
    navigator.clipboard.write([
        new ClipboardItem({
            [blob.type]: blob,
        }),
    ]).then(() => {
        toast({
            title: 'Copied!',
            description: 'Invoice image copied to clipboard. You can now paste it in WhatsApp.',
        });
    }).catch(err => {
        console.error('Could not copy image: ', err);
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Failed to copy image to clipboard.',
        });
    });
  }

  const onDialogStateChange = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      setImageUrl('');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onDialogStateChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Invoice</DialogTitle>
          <DialogDescription>
            Generate an image of the invoice to share on WhatsApp or other apps.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {imageUrl ? (
            <div className="relative group">
              <Image
                src={imageUrl}
                alt="Generated Invoice"
                width={400}
                height={600}
                className="rounded-md border"
              />
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                 <Button onClick={handleCopyToClipboard} variant="secondary" size="sm" className="gap-2">
                    <Copy className="h-4 w-4" />
                    Copy to Clipboard
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-md border border-dashed h-[200px] w-full">
              <p className="text-sm text-muted-foreground mb-4">Click below to generate the invoice image.</p>
              <Button onClick={handleGenerateImage} disabled={loading}>
                <Loader2 className={cn('mr-2 h-4 w-4', { 'animate-spin': loading, hidden: !loading })} />
                Generate Image
              </Button>
            </div>
          )}
        </div>
        <DialogFooter className="sm:justify-between">
           <Button variant="secondary" onClick={() => onDialogStateChange(false)}>
              Close
            </Button>
            <Button onClick={handleShare} disabled={!imageUrl}>
                <Share2 className="mr-2 h-4 w-4" />
                Share on WhatsApp
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
