'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { invoiceFollowUp } from '@/ai/flows/invoice-follow-up';
import type { Sale } from '@/lib/types';
import { Loader2, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InvoiceFollowUpButtonProps {
  sale: Sale;
}

export function InvoiceFollowUpButton({ sale }: InvoiceFollowUpButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const { toast } = useToast();

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const result = await invoiceFollowUp({
        customerName: sale.customerName || 'Valued Customer',
        invoiceNumber: sale.invoiceNumber,
        invoiceTotal: sale.total,
        dueDate: new Date(new Date(sale.date).getTime() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Assuming due in 15 days
        shopName: 'WinTech-Spark',
      });
      setMessage(result.followUpMessage);
    } catch (error) {
      console.error('Failed to generate follow-up message:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to generate follow-up message.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message);
    toast({
      title: 'Copied!',
      description: 'Follow-up message copied to clipboard.',
    });
  };

  const onOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setMessage('');
    }
  };

  return (
    <>
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault();
          onOpenChange(true);
        }}
        disabled={sale.status === 'Paid'}
      >
        AI Follow Up
      </DropdownMenuItem>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Invoice Follow-up Assistant</DialogTitle>
            <DialogDescription>
              Generate a personalized follow-up message for invoice{' '}
              {sale.invoiceNumber}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {message ? (
              <div className="relative">
                <Textarea value={message} readOnly rows={8} />
                 <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-7 w-7" onClick={handleCopy}>
                    <Copy className="h-4 w-4"/>
                 </Button>
              </div>
            ) : (
              <div className="flex h-[180px] items-center justify-center rounded-md border border-dashed">
                <Button onClick={handleGenerate} disabled={loading}>
                  <Loader2 className={cn('mr-2 h-4 w-4', { 'animate-spin': loading, 'hidden': !loading })} />
                  Generate Message
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
