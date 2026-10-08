'use client';

import { useState, useMemo, useEffect } from 'react';
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
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tag, Plus, Trash2, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
  getDocs,
} from 'firebase/firestore';
import type { Category, Product } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCategorySelected?: (categoryName: string) => void;
  currentSelected?: string;
}

export function CategoryManagerModal({
  isOpen,
  onClose,
  onCategorySelected,
  currentSelected,
}: CategoryManagerModalProps) {
  const firestore = useFirestore();
  const { toast } = useToast();

  const [newCatName, setNewCatName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [deletingCat, setDeletingCat] = useState<{ id?: string; name: string; count: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [unassignOnDelete, setUnassignOnDelete] = useState(true);

  // Load existing categories from collection
  const categoriesQuery = useMemoFirebase(
    () => (firestore ? query(collection(firestore, 'categories'), orderBy('name')) : null),
    [firestore]
  );
  const { data: dbCategories, isLoading: categoriesLoading } = useCollection<Category>(categoriesQuery);

  // Load products to compute category product counts and discover unseeded legacy categories
  const productsQuery = useMemoFirebase(
    () => (firestore ? collection(firestore, 'products') : null),
    [firestore]
  );
  const { data: products } = useCollection<Product>(productsQuery);

  // Auto-seed legacy categories from products if they don't exist in `categories` collection yet
  useEffect(() => {
    if (!firestore || !products || categoriesLoading || !isOpen) return;

    const existingNames = new Set((dbCategories || []).map((c) => c.name.toLowerCase().trim()));
    const unseededNames: string[] = [];

    products.forEach((p) => {
      const cat = (p.category || '').trim();
      if (cat && !existingNames.has(cat.toLowerCase())) {
        unseededNames.push(cat);
        existingNames.add(cat.toLowerCase());
      }
    });

    if (unseededNames.length > 0) {
      // Seed missing categories in batch
      const batch = writeBatch(firestore);
      unseededNames.forEach((name) => {
        const newDocRef = doc(collection(firestore, 'categories'));
        batch.set(newDocRef, {
          name,
          createdAt: new Date().toISOString(),
        });
      });
      batch.commit().catch((err) => {
        console.warn('Auto-seed categories failed:', err);
      });
    }
  }, [firestore, products, dbCategories, categoriesLoading, isOpen]);

  // Map product counts by lowercase category name
  const productCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    (products || []).forEach((p) => {
      const cat = (p.category || '').toLowerCase().trim();
      if (cat) {
        map[cat] = (map[cat] || 0) + 1;
      }
    });
    return map;
  }, [products]);

  // Combined and sorted list of categories
  const allCategories = useMemo(() => {
    const list = [...(dbCategories || [])];
    return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [dbCategories]);

  // Handle adding new category
  const handleAddCategory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!firestore) return;

    const trimmed = newCatName.trim();
    if (!trimmed) {
      toast({
        variant: 'destructive',
        title: 'Category Name Required',
        description: 'Please type a valid category name.',
      });
      return;
    }

    // Duplicate check: case-insensitive
    const duplicate = allCategories.find(
      (c) => c.name.toLowerCase().trim() === trimmed.toLowerCase()
    );

    if (duplicate) {
      toast({
        variant: 'destructive',
        title: 'Duplicate Category',
        description: `Category "${duplicate.name}" already exists to avoid duplicates.`,
      });
      return;
    }

    setIsAdding(true);
    try {
      await addDoc(collection(firestore, 'categories'), {
        name: trimmed,
        createdAt: new Date().toISOString(),
      });

      toast({
        title: 'Category Added',
        description: `"${trimmed}" is now ready to use.`,
      });

      // Auto-select this newly created category in the form
      onCategorySelected?.(trimmed);
      setNewCatName('');
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error Adding Category',
        description: err.message,
      });
    } finally {
      setIsAdding(false);
    }
  };

  // Trigger delete confirmation or delete directly
  const handlePromptDelete = (cat: Category) => {
    const count = productCountMap[cat.name.toLowerCase().trim()] || 0;
    setDeletingCat({ id: cat.id, name: cat.name, count });
  };

  // Perform actual category deletion
  const handleConfirmDelete = async () => {
    if (!firestore || !deletingCat) return;

    setIsDeleting(true);
    try {
      const batch = writeBatch(firestore);

      // 1. Delete category document
      if (deletingCat.id) {
        batch.delete(doc(firestore, 'categories', deletingCat.id));
      }

      // 2. Unassign from matching products if enabled
      if (unassignOnDelete && products && deletingCat.count > 0) {
        const catLower = deletingCat.name.toLowerCase().trim();
        products.forEach((p) => {
          if ((p.category || '').toLowerCase().trim() === catLower) {
            batch.update(doc(firestore, 'products', p.id), {
              category: '',
            });
          }
        });
      }

      await batch.commit();

      // If the currently selected category in form was deleted, reset it
      if (currentSelected?.toLowerCase().trim() === deletingCat.name.toLowerCase().trim()) {
        onCategorySelected?.('');
      }

      toast({
        title: 'Category Removed',
        description: `"${deletingCat.name}" has been deleted.`,
      });

      setDeletingCat(null);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error Deleting Category',
        description: err.message,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              Manage Product Categories
            </DialogTitle>
            <DialogDescription>
              Create standardized categories to prevent typos and duplicates, or delete unused categories.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Add Category Form */}
            <form onSubmit={handleAddCategory} className="space-y-2">
              <Label htmlFor="new-category-input">Add New Category</Label>
              <div className="flex gap-2">
                <Input
                  id="new-category-input"
                  placeholder="e.g. Engine Oils, Brake Pads, Filters..."
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  disabled={isAdding}
                  autoFocus
                />
                <Button
                  type="submit"
                  disabled={isAdding || !newCatName.trim()}
                  className="shrink-0 gap-1.5"
                >
                  {isAdding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Add
                </Button>
              </div>
            </form>

            {/* Existing Categories List */}
            <div className="space-y-1.5 pt-2 border-t">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                <span>Existing Categories ({allCategories.length})</span>
                <span>Assigned Items</span>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 divide-y rounded-md border p-2 bg-muted/20">
                {categoriesLoading ? (
                  <div className="py-6 flex items-center justify-center text-xs text-muted-foreground gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Loading categories...
                  </div>
                ) : allCategories.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    No categories found. Add your first category above!
                  </div>
                ) : (
                  allCategories.map((cat) => {
                    const count = productCountMap[cat.name.toLowerCase().trim()] || 0;
                    const isSelected =
                      currentSelected?.toLowerCase().trim() === cat.name.toLowerCase().trim();

                    return (
                      <div
                        key={cat.id || cat.name}
                        className="flex items-center justify-between py-1.5 px-2 hover:bg-muted/40 rounded-md transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium truncate">{cat.name}</span>
                          {isSelected && (
                            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20 shrink-0">
                              Selected
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            variant="secondary"
                            className="text-[11px] font-mono px-2 py-0.5"
                          >
                            {count} {count === 1 ? 'item' : 'items'}
                          </Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handlePromptDelete(cat)}
                            title={`Delete ${cat.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" onClick={onClose} className="w-full sm:w-auto">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={Boolean(deletingCat)} onOpenChange={(open) => !open && setDeletingCat(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Delete Category "{deletingCat?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Are you sure you want to delete this category? It will no longer appear in the category dropdown.
                </p>
                {deletingCat && deletingCat.count > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-2.5 text-xs text-amber-700 dark:text-amber-300">
                    <strong>Warning:</strong> {deletingCat.count} product(s) are currently assigned to this category. Their category will be cleared to prevent stale data.
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-1.5"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete Category
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
