/**
 * Pure domeinlogica: welke kledingstukken passen bij elkaar en wat mag het kind kiezen.
 * Geen I/O; alles werkt op gewone data.
 */
import { CATEGORIES } from './types'
import type { Category, ClothingItem, CurrentSeason, Outfit, Settings } from './types'

/** Past het kledingstuk bij het ingestelde seizoen? */
export function isInSeason(item: Pick<ClothingItem, 'season'>, currentSeason: CurrentSeason): boolean {
  return currentSeason === 'all' || item.season === 'all' || item.season === currentSeason
}

/**
 * Mogen twee kledingstukken samen gedragen worden?
 * Uitsluitingen gelden symmetrisch, ook als maar één kant de ander noemt.
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

/** Categorieën die niet tegelijk met deze categorie gekozen kunnen worden. */
export function conflictingCategories(category: Category): Category[] {
  return [...(SLOT_CONFLICTS[category] ?? [])]
}

/** Kledingstukken die nu aangetrokken kunnen worden: beschikbaar en in het seizoen. */
export function wearableItems(items: readonly ClothingItem[], settings: Settings): ClothingItem[] {
  return items.filter((item) => item.available && isInSeason(item, settings.currentSeason))
}

function sortByCreatedAt(items: ClothingItem[]): ClothingItem[] {
  // Array.prototype.sort is stabiel (ES2019+).
  return items.sort((a, b) => a.createdAt - b.createdAt)
}

/** De gekozen, nog bestaande en draagbare kledingstukken in de outfit (in CATEGORIES-volgorde). */
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
 * Kledingstukken uit `category` waar het kind nu uit kan kiezen: draagbaar en passend bij
 * alles wat in de ándere categorieën gekozen is (behalve botsende vakken, die worden bij het
 * kiezen vervangen). Gesorteerd op createdAt.
 */
export function selectableItems(
  items: readonly ClothingItem[],
  settings: Settings,
  outfit: Outfit,
  category: Category,
): ClothingItem[] {
  const wearable = wearableItems(items, settings)
  // Keuzes in botsende vakken (jurk vs. shirt/broek) tellen niet mee: kiezen vervangt ze toch.
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
 * Ruimt een outfit op: verwijdert id's die niet (meer) bestaan, niet draagbaar zijn, in het
 * verkeerde vak staan of botsen. Bij een botsing wint de categorie die eerder in CATEGORIES staat.
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
 * Kiest een kledingstuk (of zet het uit als het al gekozen was). Botsende vakken
 * (jurk vs. shirt/broek) en niet-passende kledingstukken worden uit de outfit gehaald.
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
    // Niet (meer) bestaand of niet draagbaar: niets kiezen, alleen opruimen.
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

/** Categorieën (in vaste volgorde) met minstens één draagbaar kledingstuk. */
export function visibleCategories(items: readonly ClothingItem[], settings: Settings): Category[] {
  const present = new Set(wearableItems(items, settings).map((item) => item.category))
  return CATEGORIES.filter((category) => present.has(category))
}

/** Is de outfit compleet? (shirt én broek/rok) of een jurk. */
export function isOutfitComplete(outfit: Outfit): boolean {
  return Boolean((outfit.top && outfit.bottom) || outfit.dress)
}

/**
 * Is de outfit klaar, gemeten aan wat er nu echt draagbaar is? Klaar als er een jurk is, of als
 * elk van shirt en broek/rok dat te kiezen valt gekozen is. Er moet minstens één kledingstuk
 * gekozen zijn. Zo blijft het kind niet hangen als er bijv. geen enkele broek draagbaar is.
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

/** Lokale datum als YYYY-MM-DD. */
export function todayKey(now: Date = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
