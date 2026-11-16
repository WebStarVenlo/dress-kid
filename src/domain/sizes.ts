import type { Child, ClothingItem } from './types';

/** Normaliseert een maat voor vergelijking: trimmen en kleine letters. */
export function normalizeSize(size: string): string {
  return size.trim().toLowerCase();
}

/**
 * Past dit kledingstuk bij dit kind?
 * - Stuk zonder maat: past bij iedereen.
 * - Kind zonder maten voor deze categorie: alles in die categorie past.
 * - Anders: de maat van het stuk moet in de maten van het kind voor die categorie staan.
 */
export function itemFitsChild(item: Pick<ClothingItem, 'category' | 'size'>, child: Pick<Child, 'sizes'>): boolean {
  const size = item.size ? normalizeSize(item.size) : '';
  if (!size) return true;
  const childSizes = (child.sizes[item.category] ?? []).map(normalizeSize).filter(Boolean);
  if (childSizes.length === 0) return true;
  return childSizes.includes(size);
}
