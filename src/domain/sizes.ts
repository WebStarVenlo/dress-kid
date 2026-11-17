import type { Child, ClothingItem } from './types';

/** Normalises a size for comparison: trimmed and lower-cased. */
export function normalizeSize(size: string): string {
  return size.trim().toLowerCase();
}

/**
 * Does this item fit this child?
 * - Item without a size: fits everyone.
 * - Child without sizes for this category: everything in that category fits.
 * - Otherwise: the item's size must be among the child's sizes for that category.
 */
export function itemFitsChild(item: Pick<ClothingItem, 'category' | 'size'>, child: Pick<Child, 'sizes'>): boolean {
  const size = item.size ? normalizeSize(item.size) : '';
  if (!size) return true;
  const childSizes = (child.sizes[item.category] ?? []).map(normalizeSize).filter(Boolean);
  if (childSizes.length === 0) return true;
  return childSizes.includes(size);
}
