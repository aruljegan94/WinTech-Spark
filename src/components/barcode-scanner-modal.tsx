'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScanBarcode, Camera, Check, Plus, Minus, Search, Volume2 } from 'lucide-react';
import type { Product } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Html5Qrcode } from 'html5-qrcode';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  products?: Product[];
  onProductScanned?: (product: Product, quantity: number) => void;
  onBarcodeScannedRaw?: (barcode: string) => void;
  mode?: 'select' | 'set_barcode';
  title?: string;
}

export function BarcodeScannerModal({
  isOpen,
  onOpenChange,
  products = [],
  onProductScanned,
  onBarcodeScannedRaw,
  mode = 'select',
  title = 'Scan Product Barcode',
}: BarcodeScannerModalProps) {
  const [manualCode, setManualCode] = useState('');
  const [matchedProduct, setMatchedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState('');
  const { toast } = useToast();

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const keyBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  // Play audio feedback on successful scan
  const playBeep = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 1200;
      gain.gain.value = 0.1;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch {
      // AudioContext fallback
    }
  }, []);

  const handleBarcodeFound = useCallback(
    (code: string) => {
      const cleanCode = code.trim();
      if (!cleanCode) return;

      playBeep();
      setLastScannedCode(cleanCode);

      if (mode === 'set_barcode') {
        onBarcodeScannedRaw?.(cleanCode);
        toast({
          title: 'Barcode Captured',
          description: `Barcode ${cleanCode} set for product.`,
        });
        onOpenChange(false);
        return;
      }

      // Look up product by barcode, id, or exact product name
      const product = products.find(
        (p) =>
          p.barcode?.trim() === cleanCode ||
          p.id === cleanCode ||
          p.productName.toLowerCase() === cleanCode.toLowerCase()
      );

      if (product) {
        setMatchedProduct(product);
        setQuantity(1);
        toast({
          title: 'Product Found!',
          description: `${product.productName} - ₹${product.sellingPrice}`,
        });
      } else {
        setMatchedProduct(null);
        toast({
          variant: 'destructive',
          title: 'Product Not Found',
          description: `No product matching barcode: ${cleanCode}`,
        });
      }
    },
    [mode, products, playBeep, onBarcodeScannedRaw, onOpenChange, toast]
  );

  // Hardware Scanner Listener (USB / Bluetooth POS Guns)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore key events from inputs except when typing manual search
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        if (target.id === 'manual-barcode-input' && e.key === 'Enter') {
          e.preventDefault();
          handleBarcodeFound(manualCode);
        }
        return;
      }

      const currentTime = Date.now();
      if (currentTime - lastKeyTimeRef.current > 100) {
        keyBufferRef.current = '';
      }
      lastKeyTimeRef.current = currentTime;

      if (e.key === 'Enter') {
        if (keyBufferRef.current.length >= 2) {
          handleBarcodeFound(keyBufferRef.current);
          keyBufferRef.current = '';
        }
      } else if (e.key.length === 1) {
        keyBufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, manualCode, handleBarcodeFound]);

  // Camera Scanning Setup using Html5Qrcode
  const startCamera = async () => {
    setIsCameraActive(true);
    setTimeout(async () => {
      try {
        if (!scannerRef.current) {
          scannerRef.current = new Html5Qrcode('camera-reader');
        }
        await scannerRef.current.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText) => {
            handleBarcodeFound(decodedText);
            stopCamera();
          },
          () => {}
        );
      } catch (err) {
        console.error('Camera access failed:', err);
        setIsCameraActive(false);
        toast({
          variant: 'destructive',
          title: 'Camera Error',
          description: 'Could not access device camera for scanning.',
        });
      }
    }, 100);
  };

  const stopCamera = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
      } catch (err) {
        console.error('Error stopping camera scanner:', err);
      }
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setMatchedProduct(null);
      setManualCode('');
      setLastScannedCode('');
      setQuantity(1);
    }
  }, [isOpen]);

  const handleConfirmAdd = () => {
    if (!matchedProduct) return;
    onProductScanned?.(matchedProduct, quantity);
    toast({
      title: 'Item Added',
      description: `Added ${quantity} x ${matchedProduct.productName} to list.`,
    });
    setMatchedProduct(null);
    setManualCode('');
    setQuantity(1);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanBarcode className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Scan using your USB/Bluetooth hardware barcode gun, device camera, or type barcode manually.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Manual Input & Search */}
          <div className="space-y-1.5">
            <Label htmlFor="manual-barcode-input">Barcode / SKU Number</Label>
            <div className="flex gap-2">
              <Input
                id="manual-barcode-input"
                placeholder="Scan or type barcode (e.g. 890123456789)..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleBarcodeFound(manualCode);
                  }
                }}
                autoFocus
              />
              <Button type="button" onClick={() => handleBarcodeFound(manualCode)}>
                <Search className="h-4 w-4 mr-1" />
                Find
              </Button>
            </div>
          </div>

          {/* Camera Scanner Section */}
          <div className="border rounded-md p-3 bg-muted/30 text-center space-y-2">
            {!isCameraActive ? (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                onClick={startCamera}
              >
                <Camera className="h-4 w-4" />
                Use Device Camera Scanner
              </Button>
            ) : (
              <div className="space-y-2">
                <div id="camera-reader" className="w-full min-h-[200px] overflow-hidden rounded-md border bg-black" />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={stopCamera}
                >
                  Close Camera
                </Button>
              </div>
            )}
          </div>

          {/* Last Scanned Code Display */}
          {lastScannedCode && (
            <div className="flex items-center justify-between p-2 rounded bg-muted text-xs">
              <span className="text-muted-foreground">Last Scanned Code:</span>
              <Badge variant="secondary" className="font-mono">
                {lastScannedCode}
              </Badge>
            </div>
          )}

          {/* Matched Product Details & Quantity Control */}
          {matchedProduct && (
            <div className="border border-primary/40 bg-primary/5 rounded-md p-3 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-sm">{matchedProduct.productName}</h4>
                  <p className="text-xs text-muted-foreground">Category: {matchedProduct.category}</p>
                </div>
                <div className="text-right">
                  <span className="font-bold text-base text-primary">₹{matchedProduct.sellingPrice}</span>
                  <p className="text-xs text-muted-foreground">Stock: {matchedProduct.stockQuantity}</p>
                </div>
              </div>

              {mode === 'select' && (
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="text-xs font-medium">Quantity:</span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      type="number"
                      min={1}
                      max={matchedProduct.stockQuantity || 999}
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="h-7 w-14 text-center p-1 text-sm font-semibold"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setQuantity((q) => q + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}

              <Button type="button" className="w-full gap-2 mt-2" onClick={handleConfirmAdd}>
                <Check className="h-4 w-4" />
                Add to List ({quantity} x ₹{matchedProduct.sellingPrice} = ₹
                {(quantity * matchedProduct.sellingPrice).toLocaleString()})
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between border-t pt-3">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
