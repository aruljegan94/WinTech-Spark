'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import type { Product } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn, formatCurrency } from '@/lib/utils';
import {
  Search,
  Check,
  ChevronsUpDown,
  X,
  Package,
  Barcode,
  Layers,
  AlertTriangle,
} from 'lucide-react';

interface ProductSearchComboboxProps {
  products: Product[];
  value?: string;
  onSelect: (product: Product | null) => void;
  placeholder?: string;
  disabled?: boolean;
  filterCategory?: string;
  priceType?: 'sellingPrice' | 'purchasePrice';
  showStock?: boolean;
  className?: string;
  autoFocus?: boolean;
}

export function ProductSearchCombobox({
  products = [],
  value,
  onSelect,
  placeholder = 'Search product by name, code or barcode...',
  disabled = false,
  filterCategory = 'all',
  priceType = 'sellingPrice',
  showStock = true,
  className,
}: ProductSearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedProduct = useMemo(() => {
    if (!value) return null;
    return products.find((p) => p.id === value) || null;
  }, [value, products]);

  // Filter products based on search query & category filter
  const filteredProducts = useMemo(() => {
    let list = products;

    if (filterCategory && filterCategory !== 'all') {
      list = list.filter((p) => p.category?.toLowerCase() === filterCategory.toLowerCase());
    }

    if (!searchQuery.trim()) {
      return list.slice(0, 50); // Show first 50 when no query
    }

    const q = searchQuery.toLowerCase().trim();
    return list
      .filter((p) => {
        const matchName = p.productName?.toLowerCase().includes(q);
        const matchCategory = p.category?.toLowerCase().includes(q);
        const matchBarcode = p.barcode?.toLowerCase().includes(q);
        return matchName || matchCategory || matchBarcode;
      })
      .slice(0, 50);
  }, [products, filterCategory, searchQuery]);

  // Auto-focus search input when popover opens
  useEffect(() => {
    if (open) {
      setHighlightedIndex(0);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setSearchQuery('');
    }
  }, [open]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filteredProducts.length - 1 ? prev + 1 : prev));
      scrollHighlightedIntoView(highlightedIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      scrollHighlightedIntoView(highlightedIndex - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredProducts[highlightedIndex]) {
        handleProductPick(filteredProducts[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const scrollHighlightedIntoView = (index: number) => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-product-item]');
    if (items[index]) {
      items[index].scrollIntoView({ block: 'nearest' });
    }
  };

  const handleProductPick = (product: Product) => {
    onSelect(product);
    setOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
    setSearchQuery('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between h-9 px-3 text-left font-normal bg-background hover:bg-muted/30 transition-colors',
            !selectedProduct && 'text-muted-foreground',
            className
          )}
        >
          {selectedProduct ? (
            <div className="flex items-center gap-2 overflow-hidden truncate pr-1">
              <Package className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="font-medium text-foreground text-xs truncate">
                {selectedProduct.productName}
              </span>
              {selectedProduct.category && (
                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0 hidden sm:inline">
                  {selectedProduct.category}
                </span>
              )}
              {showStock && (
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ml-auto mr-1',
                    selectedProduct.stockQuantity > 5
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : selectedProduct.stockQuantity > 0
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'bg-destructive/10 text-destructive'
                  )}
                >
                  {selectedProduct.stockQuantity} in stock
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs truncate text-muted-foreground">
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{placeholder}</span>
            </div>
          )}

          <div className="flex items-center gap-1 shrink-0 ml-1">
            {selectedProduct && !disabled && (
              <span
                role="button"
                tabIndex={0}
                onClick={handleClear}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(null);
                  }
                }}
                className="h-4 w-4 p-0.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer flex items-center justify-center transition-colors"
                title="Clear selection"
              >
                <X className="h-3 w-3" />
              </span>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[320px] sm:w-[420px] p-0 shadow-lg border rounded-xl"
        align="start"
      >
        <div className="flex flex-col max-h-[380px]">
          {/* Search Header */}
          <div className="p-2.5 border-b bg-muted/20">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                ref={inputRef}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Type product name, category, or barcode..."
                className="pl-8 pr-8 h-9 text-xs font-medium bg-background"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 h-4 w-4 text-muted-foreground hover:text-foreground flex items-center justify-center"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1 pt-1.5">
              <span>{filteredProducts.length} items found</span>
              {filterCategory && filterCategory !== 'all' && (
                <span className="flex items-center gap-1 font-medium text-primary">
                  <Layers className="h-3 w-3" /> Category: {filterCategory}
                </span>
              )}
            </div>
          </div>

          {/* Results List */}
          <div
            ref={listRef}
            className="overflow-y-auto divide-y divide-border/40 p-1 flex-1 max-h-[290px]"
          >
            {filteredProducts.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground space-y-1">
                <AlertTriangle className="h-5 w-5 mx-auto text-amber-500 opacity-80" />
                <p className="font-semibold text-foreground">No matching products</p>
                <p className="text-[11px]">
                  No products matched &ldquo;{searchQuery}&rdquo;. Try another name or scan barcode.
                </p>
              </div>
            ) : (
              filteredProducts.map((p, idx) => {
                const isSelected = selectedProduct?.id === p.id;
                const isHighlighted = idx === highlightedIndex;
                const price =
                  priceType === 'purchasePrice' ? p.purchasePrice : p.sellingPrice;

                return (
                  <div
                    key={p.id}
                    data-product-item
                    onClick={() => handleProductPick(p)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={cn(
                      'p-2.5 rounded-lg cursor-pointer flex items-center justify-between gap-3 text-xs transition-colors',
                      isHighlighted && 'bg-accent/60',
                      isSelected && 'bg-primary/10 border-l-2 border-primary'
                    )}
                  >
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground truncate">
                          {p.productName}
                        </span>
                        {isSelected && (
                          <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                        {p.category && (
                          <span className="bg-muted px-1.5 py-0.2 rounded">
                            {p.category}
                          </span>
                        )}
                        {p.barcode && (
                          <span className="flex items-center gap-0.5 font-mono text-[10px]">
                            <Barcode className="h-2.5 w-2.5" />
                            {p.barcode}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0 space-y-1">
                      <div className="font-bold text-foreground text-xs font-mono">
                        ₹{formatCurrency(Number(price || 0))}
                        <span className="text-[10px] text-muted-foreground font-normal ml-0.5 font-sans">
                          {priceType === 'purchasePrice' ? 'cost' : 'sale'}
                        </span>
                      </div>
                      {showStock && (
                        <div>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] px-1.5 py-0 font-medium',
                              p.stockQuantity > 5
                                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                                : p.stockQuantity > 0
                                ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                                : 'bg-destructive/10 text-destructive border-destructive/30'
                            )}
                          >
                            {p.stockQuantity > 0 ? `${p.stockQuantity} in stock` : 'Out of stock'}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
