'use client';

import { useState, useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tag, Plus, Settings2 } from 'lucide-react';
import { CategoryManagerModal } from './category-manager-modal';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import type { Category, Product } from '@/lib/types';

interface CategorySelectFieldProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function CategorySelectField({
  value = '',
  onChange,
  placeholder = 'Select a category...',
  disabled = false,
}: CategorySelectFieldProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const firestore = useFirestore();

  // Load categories from collection
  const categoriesQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'categories'), orderBy('name')) : null),
    [firestore]
  );
  const { data: dbCategories, isLoading: categoriesLoading } = useCollection<Category>(categoriesQuery);

  // Load products to capture any legacy categories that haven't been seeded yet
  const productsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'products') : null),
    [firestore]
  );
  const { data: products } = useCollection<Product>(productsQuery);

  // Unified list of unique category names
  const categoryNames = useMemo(() => {
    const set = new Set<string>();

    (dbCategories || []).forEach((c) => {
      if (c.name && c.name.trim()) set.add(c.name.trim());
    });

    (products || []).forEach((p) => {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    });

    if (value && value.trim()) {
      set.add(value.trim());
    }

    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [dbCategories, products, value]);

  return (
    <>
      <div className="flex items-center gap-2">
        <Select
          value={value}
          onValueChange={onChange}
          disabled={disabled}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {categoryNames.length === 0 ? (
              <div className="py-3 px-2 text-center text-xs text-muted-foreground">
                No categories found. Click &quot;Manage&quot; to add one.
              </div>
            ) : (
              categoryNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          size="default"
          onClick={() => setIsModalOpen(true)}
          disabled={disabled}
          className="shrink-0 gap-1.5 px-3 border-dashed hover:border-primary hover:text-primary"
          title="Manage Categories"
        >
          <Tag className="h-4 w-4 text-primary" />
          <span className="hidden sm:inline">Manage</span>
        </Button>
      </div>

      <CategoryManagerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCategorySelected={(cat) => onChange(cat)}
        currentSelected={value}
      />
    </>
  );
}
