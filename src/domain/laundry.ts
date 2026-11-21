/**
 * Pure laundry logic: which worn items go into the wash and which come back.
 * No I/O; the storage layer applies the plan.
 */
import { CATEGORIES, DEFAULT_SETTINGS, MAX_AUTO_RETURN_DAYS } from './types'
import type { Category, ClothingItem, SavedOutfit, Settings } from './types'

export const DAY_MS = 86_400_000

export type LaundryOutfit = Pick<SavedOutfit, 'childId' | 'date' | 'outfit' | 'laundryProcessed'>
export type LaundryItem = Pick<ClothingItem, 'id' | 'category' | 'available' | 'washedAt'>
export type LaundrySettings = Pick<Settings, 'autoWashCategories' | 'autoReturnDays'>

export interface LaundryInput {
  outfits: readonly LaundryOutfit[]
  items: readonly LaundryItem[]
  settings: LaundrySettings
  /** Today's local date (YYYY-MM-DD); outfits of today and later are left alone. */
  today: string
  /** Current time (epoch ms), for the automatic return. */
  now: number
}

export interface LaundryPlan {
  /** Ids of available items that go into the wash (no duplicates). */
  toWash: string[]
  /** Keys [childId, date] of the outfits that are now processed. */
  processedOutfitKeys: Array<[string, string]>
  /** Ids of items in the wash that come back automatically (never one from `toWash`). */
  toReturn: string[]
}

/** Is the value a valid moment (finite, positive epoch ms)? */
export function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * Plans a laundry run:
 * - Every outfit of an earlier day that was not processed yet is processed now (picked
 *   outfits count, completed or not). Its still existing, available items whose category
 *   is in `autoWashCategories` go into the wash.
 * - With `autoReturnDays > 0`, items in the wash with a `washedAt` at least that many days
 *   ago come back. Items without `washedAt` (put away by hand before laundry tracking) never do.
 */
export function planLaundry({ outfits, items, settings, today, now }: LaundryInput): LaundryPlan {
  const autoWash = new Set<Category>(settings.autoWashCategories)
  const byId = new Map(items.map((item) => [item.id, item]))
  const toWash = new Set<string>()
  const processedOutfitKeys: Array<[string, string]> = []

  for (const saved of outfits) {
    if (saved.laundryProcessed === true || !(saved.date < today)) continue
    processedOutfitKeys.push([saved.childId, saved.date])
    for (const id of Object.values(saved.outfit)) {
      if (typeof id !== 'string') continue
      const item = byId.get(id)
      if (item && item.available && autoWash.has(item.category)) toWash.add(id)
    }
  }

  const toReturn: string[] = []
  const days = normalizeAutoReturnDays(settings.autoReturnDays)
  if (days > 0) {
    for (const item of items) {
      if (item.available || toWash.has(item.id) || !isTimestamp(item.washedAt)) continue
      if (now - item.washedAt >= days * DAY_MS) toReturn.push(item.id)
    }
  }

  return { toWash: [...toWash], processedOutfitKeys, toReturn }
}

/**
 * `autoWashCategories`: only known categories, without duplicates, in CATEGORIES order.
 * Anything that is not an array (including missing) becomes the default.
 */
export function normalizeAutoWashCategories(value: unknown): Category[] {
  if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.autoWashCategories]
  const chosen = new Set<unknown>(value)
  return CATEGORIES.filter((category) => chosen.has(category))
}

/**
 * `autoReturnDays`: a whole number of days from 0 (off) to MAX_AUTO_RETURN_DAYS.
 * A fraction is rounded down, a larger number is capped; anything else becomes the default.
 */
export function normalizeAutoReturnDays(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return DEFAULT_SETTINGS.autoReturnDays
  return Math.min(Math.floor(value), MAX_AUTO_RETURN_DAYS)
}
