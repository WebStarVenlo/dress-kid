/**
 * Pure domain logic: which items go together and what the child may pick.
 * No I/O; everything works on plain data.
 */
import { CATEGORIES } from './types'
import type { Category, ClothingItem, CurrentSeason, Outfit, Settings } from './types'

/** Does the item fit the configured season? */
export function isInSeason(item: Pick<ClothingItem, 'season'>, currentSeason: CurrentSeason): boolean {
  return currentSeason === 'all' || item.season === 'all' || item.season === currentSeason
}

/**
 * May two items be worn together?
 * Exclusions are symmetric, even if only one side mentions the other.
 */
export function isCompatible(
  a: Pick<ClothingItem, 'id' | 'excludedIds'>,
  b: Pick<ClothingItem, 'id' | 'excludedIds'>,
): boolean {
  return !a.excludedIds.includes(b.id) && !b.excludedIds.includes(a.id)
}

const SLOT_CONFLICTS: Partial<Record<Category, readonly Category[]>> = {
  dress: ['top', 'bottom'],
  top: ['dress'],
  bottom: ['dress'],
}

/** Categories that cannot be picked at the same time as this category. */
export function conflictingCategories(category: Category): Category[] {
  return [...(SLOT_CONFLICTS[category] ?? [])]
}

/** Items that can be worn now: available and in season. */
export function wearableItems(items: readonly ClothingItem[], settings: Settings): ClothingItem[] {
  return items.filter((item) => item.available && isInSeason(item, settings.currentSeason))
}

function sortByCreatedAt(items: ClothingItem[]): ClothingItem[] {
  // Array.prototype.sort is stabiel (ES2019+).
  return items.sort((a, b) => a.createdAt - b.createdAt)
}

/** The picked, still existing and wearable items in the outfit (in CATEGORIES order). */
function chosenWearable(
  wearable: readonly ClothingItem[],
  outfit: Outfit,
): Array<{ category: Category; item: ClothingItem }> {
  const byId = new Map(wearable.map((item) => [item.id, item]))
  const result: Array<{ category: Category; item: ClothingItem }> = []
  for (const category of CATEGORIES) {
    const id = outfit[category]
    if (id === undefined) continue
    const item = byId.get(id)
    if (item && item.category === category) result.push({ category, item })
  }
  return result
}

/**
 * Items from `category` the child can pick from now: wearable and compatible with
 * everything picked in the other categories (except conflicting slots, which get
 * replaced when picking). Sorted by createdAt.
 */
export function selectableItems(
  items: readonly ClothingItem[],
  settings: Settings,
  outfit: Outfit,
  category: Category,
): ClothingItem[] {
  const wearable = wearableItems(items, settings)
  // Picks in conflicting slots (dress vs. shirt/bottom) do not count: picking replaces them anyway.
  const replaced = conflictingCategories(category)
  const others = chosenWearable(wearable, outfit)
    .filter((chosen) => chosen.category !== category && !replaced.includes(chosen.category))
    .map((chosen) => chosen.item)
  return sortByCreatedAt(
    wearable.filter(
      (item) => item.category === category && others.every((other) => isCompatible(item, other)),
    ),
  )
}

/**
 * Cleans up an outfit: removes ids that no longer exist, are not wearable, sit in the
 * wrong slot or conflict. On a conflict the category that comes first in CATEGORIES wins.
 */
export function pruneOutfit(items: readonly ClothingItem[], settings: Settings, outfit: Outfit): Outfit {
  const result: Outfit = {}
  const kept: ClothingItem[] = []
  for (const { category, item } of chosenWearable(wearableItems(items, settings), outfit)) {
    const slotConflict = conflictingCategories(category).some((other) => result[other] !== undefined)
    if (slotConflict) continue
    if (!kept.every((other) => isCompatible(item, other))) continue
    result[category] = item.id
    kept.push(item)
  }
  return result
}

/**
 * Picks an item (or deselects it if it was already picked). Conflicting slots
 * (dress vs. shirt/bottom) and incompatible items are removed from the outfit.
 */
export function chooseItem(
  items: readonly ClothingItem[],
  settings: Settings,
  outfit: Outfit,
  item: ClothingItem,
): Outfit {
  if (outfit[item.category] === item.id) {
    const next: Outfit = { ...outfit }
    delete next[item.category]
    return pruneOutfit(items, settings, next)
  }

  const byId = new Map(items.map((i) => [i.id, i]))
  const current = byId.get(item.id)
  if (!current || !wearableItems([current], settings).length) {
    // No longer existing or not wearable: pick nothing, only clean up.
    return pruneOutfit(items, settings, outfit)
  }
  const conflicts = conflictingCategories(current.category)
  const next: Outfit = {}
  for (const category of CATEGORIES) {
    const id = outfit[category]
    if (id === undefined || category === current.category || conflicts.includes(category)) continue
    const other = byId.get(id)
    if (other && !isCompatible(current, other)) continue
    next[category] = id
  }
  next[current.category] = current.id
  return pruneOutfit(items, settings, next)
}

/** Categories (in fixed order) with at least one wearable item. */
export function visibleCategories(items: readonly ClothingItem[], settings: Settings): Category[] {
  const present = new Set(wearableItems(items, settings).map((item) => item.category))
  return CATEGORIES.filter((category) => present.has(category))
}

/** Is the outfit complete? (shirt and bottom) or a dress. */
export function isOutfitComplete(outfit: Outfit): boolean {
  return Boolean((outfit.top && outfit.bottom) || outfit.dress)
}

/**
 * Is the outfit done, measured against what is actually wearable now? Done if there is a dress, or if
 * each of shirt and bottom that can be picked has been picked. At least one item must be
 * picked. This keeps the child from getting stuck when e.g. no bottom at all is wearable.
 */
export function isOutfitReady(items: readonly ClothingItem[], settings: Settings, outfit: Outfit): boolean {
  const wearable = wearableItems(items, settings)
  const chosen = chosenWearable(wearable, outfit)
  if (chosen.length === 0) return false
  const has = (category: Category) => chosen.some((c) => c.category === category)
  if (has('dress')) return true
  const missing = (['top', 'bottom'] as const).some(
    (category) => !has(category) && selectableItems(items, settings, outfit, category).length > 0,
  )
  return !missing
}

/** Local date as YYYY-MM-DD. */
export function todayKey(now: Date = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
