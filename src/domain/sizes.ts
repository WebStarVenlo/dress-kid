import { isInSeason } from './compat';
import type { Child, ClothingItem, CurrentSeason } from './types';

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

const SIZE_COLLATOR = new Intl.Collator('nl', { numeric: true, sensitivity: 'base' });

/** Leading integer of a normalised size ("98/104" -> 98), or undefined when it does not start with a digit. */
function leadingNumber(size: string): number | undefined {
  const match = /^\d+/.exec(size);
  return match ? Number(match[0]) : undefined;
}

/**
 * Sort comparator for free-text sizes.
 * - Sizes starting with a number come first, ordered by that number ("92" < "98/104" < "110").
 * - Ties are broken with a numeric-aware, case-insensitive locale compare.
 * - Sizes without a leading digit ("s", "m", "xl") come after, by locale compare.
 */
export function compareSizes(a: string, b: string): number {
  const na = normalizeSize(a);
  const nb = normalizeSize(b);
  const numA = leadingNumber(na);
  const numB = leadingNumber(nb);
  if (numA !== undefined && numB !== undefined) {
    if (numA !== numB) return numA - numB;
    return SIZE_COLLATOR.compare(na, nb);
  }
  if (numA !== undefined) return -1;
  if (numB !== undefined) return 1;
  return SIZE_COLLATOR.compare(na, nb);
}

/**
 * Distinct, non-empty sizes across items, deduplicated case-insensitively.
 * Keeps the trimmed form of the first occurrence for display; sorted with compareSizes.
 */
export function distinctSizes(items: Pick<ClothingItem, 'size'>[]): string[] {
  const byKey = new Map<string, string>();
  for (const item of items) {
    const trimmed = item.size?.trim();
    if (!trimmed) continue;
    const key = normalizeSize(trimmed);
    if (!byKey.has(key)) byKey.set(key, trimmed);
  }
  return [...byKey.values()].sort(compareSizes);
}

/** Wardrobe filter state. `sizes` holds normalised size keys; chips are OR-ed together. */
export type WardrobeFilter = {
  sizes: string[];
  /** Also match items that have no (or a blank) size. */
  withoutSize: boolean;
  /** Only show items that fit this child. */
  childId?: string;
  /** Only show items for this season (items for all year round always match). Undefined or 'all' = every season. */
  season?: CurrentSeason;
};

export const EMPTY_WARDROBE_FILTER: WardrobeFilter = { sizes: [], withoutSize: false };

function isSeasonFiltered(filter: WardrobeFilter): boolean {
  return filter.season !== undefined && filter.season !== 'all';
}

/** Is any part of the filter set? */
export function isWardrobeFilterActive(filter: WardrobeFilter): boolean {
  return filter.sizes.length > 0 || filter.withoutSize || filter.childId !== undefined || isSeasonFiltered(filter);
}

/**
 * Does the item pass the filter?
 * - Size part: passes when no size chips are selected, otherwise when the item has no size
 *   and `withoutSize` is set, or its normalised size is among `filter.sizes`.
 * - Child part: when a child is given, the item must also fit that child.
 * - Season part: 'summer'/'winter' keep items of that season plus all-year items (see isInSeason).
 * All parts must pass.
 */
export function matchesWardrobeFilter(
  item: Pick<ClothingItem, 'category' | 'size' | 'season'>,
  filter: WardrobeFilter,
  child?: Pick<Child, 'sizes'>,
): boolean {
  if (filter.sizes.length > 0 || filter.withoutSize) {
    const size = item.size ? normalizeSize(item.size) : '';
    const sizeOk = size ? filter.sizes.includes(size) : filter.withoutSize;
    if (!sizeOk) return false;
  }
  if (filter.season !== undefined && !isInSeason(item, filter.season)) return false;
  return child ? itemFitsChild(item, child) : true;
}

/** Applies the filter to a list of items; an unknown `childId` is ignored. */
export function filterWardrobe<T extends Pick<ClothingItem, 'size' | 'category' | 'season'>>(
  items: T[],
  filter: WardrobeFilter,
  children: Pick<Child, 'id' | 'sizes'>[],
): T[] {
  const child = filter.childId === undefined ? undefined : children.find((c) => c.id === filter.childId);
  return items.filter((item) => matchesWardrobeFilter(item, filter, child));
}
