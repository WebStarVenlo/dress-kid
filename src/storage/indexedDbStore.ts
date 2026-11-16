/**
 * IndexedDB-implementatie van WardrobeStore (via `idb`).
 *
 * Foto's worden intern opgeslagen als `{ type, data: ArrayBuffer }` in plaats van als Blob.
 * Dat werkt betrouwbaar in alle browsers (oudere Safari-versies hadden problemen met Blobs in
 * IndexedDB) én in tests met fake-indexeddb. Naar buiten toe is `photo` altijd een Blob.
 */
import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase, IDBPTransaction, StoreNames } from 'idb'
import { CATEGORIES, DEFAULT_SETTINGS } from '../domain/types'
import type {
  Category,
  ClothingItem,
  CurrentSeason,
  ItemSeason,
  NewClothingItem,
  Outfit,
  SavedOutfit,
  Settings,
} from '../domain/types'
import type { WardrobeStore } from './api'

const DB_VERSION = 1
const SETTINGS_KEY = 'settings'
const BACKUP_APP = 'dress-kid'
const BACKUP_VERSION = 1
const INVALID_BACKUP = 'Dit is geen geldig Dress Kid back-upbestand.'

/** Afbeeldingstypes die we uit een back-up accepteren (bewust geen SVG: kan scripts bevatten). */
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/bmp',
  'image/heic',
  'image/heif',
])

interface StoredPhoto {
  type: string
  data: ArrayBuffer
}

interface StoredItem extends Omit<ClothingItem, 'photo'> {
  photo: StoredPhoto
}

interface DressKidDB extends DBSchema {
  items: { key: string; value: StoredItem }
  settings: { key: string; value: Settings }
  outfits: { key: string; value: SavedOutfit }
}

type Names = StoreNames<DressKidDB>
type Tx<S extends Names[], M extends IDBTransactionMode> = IDBPTransaction<DressKidDB, S, M>

// ---------------------------------------------------------------------------
// Hulpfuncties

function newId(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  // RFC 4122 versie 4
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function readWithFileReader<T extends string | ArrayBuffer>(
  blob: Blob,
  mode: 'text' | 'arrayBuffer',
): Promise<T> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as T)
    reader.onerror = () => reject(reader.error ?? new Error('Het bestand kon niet worden gelezen.'))
    if (mode === 'text') reader.readAsText(blob)
    else reader.readAsArrayBuffer(blob)
  })
}

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return readWithFileReader<ArrayBuffer>(blob, 'arrayBuffer')
}

async function blobToText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text()
  return readWithFileReader<string>(blob, 'text')
}

async function toStoredPhoto(photo: Blob): Promise<StoredPhoto> {
  if (!photo || typeof photo !== 'object' || typeof photo.size !== 'number') {
    throw new Error('De foto ontbreekt of is ongeldig.')
  }
  return { type: photo.type || 'image/jpeg', data: await blobToArrayBuffer(photo) }
}

function fromStoredPhoto(photo: StoredPhoto): Blob {
  return new Blob([new Uint8Array(photo.data)], { type: photo.type })
}

function toItem(stored: StoredItem): ClothingItem {
  return { ...stored, excludedIds: [...stored.excludedIds], photo: fromStoredPhoto(stored.photo) }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function photoToDataUrl(photo: StoredPhoto): string {
  return `data:${photo.type};base64,${bytesToBase64(new Uint8Array(photo.data))}`
}

function cleanName(name: string | undefined): string | undefined {
  const trimmed = name?.trim()
  return trimmed ? trimmed : undefined
}

function withName<T extends object>(base: T, name: string | undefined): T & { name?: string } {
  const result: T & { name?: string } = { ...base }
  delete result.name
  const cleaned = cleanName(name)
  if (cleaned !== undefined) result.name = cleaned
  return result
}

const isCategory = (value: unknown): value is Category =>
  typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value)
const isItemSeason = (value: unknown): value is ItemSeason =>
  value === 'summer' || value === 'winter' || value === 'all'
const isCurrentSeason = (value: unknown): value is CurrentSeason => isItemSeason(value)
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function normalizeSettings(value: unknown): Settings {
  if (isRecord(value) && isCurrentSeason(value.currentSeason)) return { currentSeason: value.currentSeason }
  return { ...DEFAULT_SETTINGS }
}

function normalizeOutfit(outfit: Outfit): Outfit {
  const result: Outfit = {}
  for (const category of CATEGORIES) {
    const id = outfit[category]
    if (typeof id === 'string' && id) result[category] = id
  }
  return result
}

/** Voert `fn` uit binnen `tx`; bij een fout wordt de transactie afgebroken (niets wordt opgeslagen). */
async function runInTx<S extends Names[], M extends IDBTransactionMode, T>(
  tx: Tx<S, M>,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    const result = await fn()
    await tx.done
    return result
  } catch (error) {
    try {
      tx.abort()
    } catch {
      // Transactie was al klaar of afgebroken.
    }
    await tx.done.catch(() => undefined)
    throw error
  }
}

// ---------------------------------------------------------------------------
// Back-up

interface BackupItem {
  id: string
  category: Category
  name?: string
  season: ItemSeason
  available: boolean
  excludedIds: string[]
  createdAt: number
  photo: string
}

interface BackupFile {
  app: typeof BACKUP_APP
  version: typeof BACKUP_VERSION
  exportedAt: string
  settings: Settings
  items: BackupItem[]
  outfits: SavedOutfit[]
}

function invalid(detail?: string): Error {
  return new Error(detail ? `Dit is geen geldig Dress Kid back-upbestand: ${detail}.` : INVALID_BACKUP)
}

const DATA_URL_RE = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/\s]*={0,2})$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parsePhoto(value: unknown, label: string): StoredPhoto {
  if (typeof value !== 'string') throw invalid(`${label} heeft geen foto`)
  const match = DATA_URL_RE.exec(value)
  const type = match?.[1]?.toLowerCase()
  const base64 = match?.[2]?.replace(/\s+/g, '')
  if (!type || base64 === undefined || !ALLOWED_IMAGE_TYPES.has(type)) {
    throw invalid(`${label} heeft een ongeldige foto`)
  }
  let bytes: Uint8Array<ArrayBuffer>
  try {
    bytes = base64ToBytes(base64)
  } catch {
    throw invalid(`${label} heeft een beschadigde foto`)
  }
  if (bytes.length === 0) throw invalid(`${label} heeft een lege foto`)
  return { type, data: bytes.buffer }
}

function parseItem(value: unknown, index: number): StoredItem {
  const label = `kledingstuk ${index + 1}`
  if (!isRecord(value)) throw invalid(`${label} is ongeldig`)
  const { id, category, name, season, available, excludedIds, createdAt, photo } = value
  if (typeof id !== 'string' || !id) throw invalid(`${label} heeft geen geldige id`)
  if (!isCategory(category)) throw invalid(`${label} heeft een onbekende soort`)
  if (!isItemSeason(season)) throw invalid(`${label} heeft een onbekend seizoen`)
  if (typeof available !== 'boolean') throw invalid(`${label} heeft een ongeldige beschikbaarheid`)
  if (name !== undefined && name !== null && typeof name !== 'string') throw invalid(`${label} heeft een ongeldige naam`)
  if (!Array.isArray(excludedIds) || !excludedIds.every((x) => typeof x === 'string')) {
    throw invalid(`${label} heeft ongeldige uitsluitingen`)
  }
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) throw invalid(`${label} heeft een ongeldige datum`)
  const base: StoredItem = {
    id,
    category,
    season,
    available,
    excludedIds: excludedIds as string[],
    createdAt,
    photo: parsePhoto(photo, label),
  }
  return withName(base, typeof name === 'string' ? name : undefined)
}

function parseOutfits(value: unknown, itemsById: Map<string, StoredItem>): SavedOutfit[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw invalid('de outfits zijn ongeldig')
  const byDate = new Map<string, SavedOutfit>()
  value.forEach((entry: unknown, index) => {
    const label = `outfit ${index + 1}`
    if (!isRecord(entry) || typeof entry.date !== 'string' || !DATE_RE.test(entry.date) || !isRecord(entry.outfit)) {
      throw invalid(`${label} is ongeldig`)
    }
    const outfit: Outfit = {}
    for (const [category, id] of Object.entries(entry.outfit)) {
      if (!isCategory(category) || (id !== undefined && typeof id !== 'string')) throw invalid(`${label} is ongeldig`)
      // Verwijzingen naar onbekende of verkeerd ingedeelde kledingstukken laten we vallen.
      if (id !== undefined && itemsById.get(id)?.category === category) outfit[category] = id
    }
    byDate.set(entry.date, { date: entry.date, outfit })
  })
  return [...byDate.values()]
}

interface ParsedBackup {
  settings: Settings
  items: StoredItem[]
  outfits: SavedOutfit[]
}

function parseBackup(json: unknown): ParsedBackup {
  if (!isRecord(json) || json.app !== BACKUP_APP) throw invalid()
  if (typeof json.version === 'number' && json.version > BACKUP_VERSION) {
    throw new Error('Deze back-up is gemaakt met een nieuwere versie van Dress Kid en kan hier niet worden geladen.')
  }
  if (json.version !== BACKUP_VERSION) throw invalid()

  let settings: Settings = { ...DEFAULT_SETTINGS }
  if (json.settings !== undefined) {
    if (!isRecord(json.settings) || !isCurrentSeason(json.settings.currentSeason)) {
      throw invalid('de instellingen zijn ongeldig')
    }
    settings = { currentSeason: json.settings.currentSeason }
  }

  if (!Array.isArray(json.items)) throw invalid('de kledingstukken ontbreken')
  const items = json.items.map((value: unknown, index) => parseItem(value, index))
  const itemsById = new Map<string, StoredItem>()
  for (const item of items) {
    if (itemsById.has(item.id)) throw invalid('er komen dubbele kledingstukken in voor')
    itemsById.set(item.id, item)
  }

  // Uitsluitingen: alleen naar bestaande kledingstukken, nooit naar zichzelf, en symmetrisch.
  const exclusions = new Map<string, Set<string>>(items.map((item) => [item.id, new Set<string>()]))
  for (const item of items) {
    for (const other of item.excludedIds) {
      if (other === item.id || !itemsById.has(other)) continue
      exclusions.get(item.id)?.add(other)
      exclusions.get(other)?.add(item.id)
    }
  }
  for (const item of items) item.excludedIds = [...(exclusions.get(item.id) ?? [])]

  return { settings, items, outfits: parseOutfits(json.outfits, itemsById) }
}

// ---------------------------------------------------------------------------
// De store

export function createIndexedDbStore(dbName = 'dress-kid'): WardrobeStore {
  let dbPromise: Promise<IDBPDatabase<DressKidDB>> | undefined
  let lastCreatedAt = 0

  function db(): Promise<IDBPDatabase<DressKidDB>> {
    if (!dbPromise) {
      const opening = openDB<DressKidDB>(dbName, DB_VERSION, {
        upgrade(database) {
          if (!database.objectStoreNames.contains('items')) database.createObjectStore('items', { keyPath: 'id' })
          if (!database.objectStoreNames.contains('settings')) database.createObjectStore('settings')
          if (!database.objectStoreNames.contains('outfits')) database.createObjectStore('outfits', { keyPath: 'date' })
        },
        blocking() {
          // Een nieuwere versie (bijv. in een ander tabblad) wil upgraden: maak ruimte.
          void opening.then((database) => database.close())
          dbPromise = undefined
        },
        terminated() {
          dbPromise = undefined
        },
      })
      opening.catch(() => {
        if (dbPromise === opening) dbPromise = undefined
      })
      dbPromise = opening
    }
    return dbPromise
  }

  function nextCreatedAt(): number {
    // Strikt oplopend, zodat sorteren op createdAt altijd de toevoegvolgorde geeft.
    lastCreatedAt = Math.max(Date.now(), lastCreatedAt + 1)
    return lastCreatedAt
  }

  const store: WardrobeStore = {
    async listItems() {
      const items = await (await db()).getAll('items')
      return items.sort((a, b) => a.createdAt - b.createdAt).map(toItem)
    },

    async getItem(id) {
      const item = await (await db()).get('items', id)
      return item ? toItem(item) : undefined
    },

    async addItem(input: NewClothingItem) {
      if (!isCategory(input.category)) throw new Error('Onbekende soort kledingstuk.')
      if (!isItemSeason(input.season)) throw new Error('Onbekend seizoen.')
      const photo = await toStoredPhoto(input.photo)
      const stored = withName<StoredItem>(
        {
          id: newId(),
          category: input.category,
          season: input.season,
          available: true,
          excludedIds: [],
          createdAt: nextCreatedAt(),
          photo,
        },
        input.name,
      )
      await (await db()).add('items', stored)
      return toItem(stored)
    },

    async updateItem(id, changes) {
      if (changes.category !== undefined && !isCategory(changes.category)) throw new Error('Onbekende soort kledingstuk.')
      if (changes.season !== undefined && !isItemSeason(changes.season)) throw new Error('Onbekend seizoen.')
      // Foto eerst omzetten: een transactie sluit zichzelf zodra we op iets anders dan IDB wachten.
      const photo = changes.photo !== undefined ? await toStoredPhoto(changes.photo) : undefined
      const tx = (await db()).transaction('items', 'readwrite')
      return runInTx(tx, async () => {
        const existing = await tx.store.get(id)
        if (!existing) throw new Error('Dit kledingstuk bestaat niet (meer).')
        let updated: StoredItem = { ...existing }
        if (changes.category !== undefined) updated.category = changes.category
        if (changes.season !== undefined) updated.season = changes.season
        if (changes.available !== undefined) updated.available = Boolean(changes.available)
        if (photo) updated.photo = photo
        if ('name' in changes) updated = withName(updated, changes.name)
        await tx.store.put(updated)
        return toItem(updated)
      })
    },

    async deleteItem(id) {
      const tx = (await db()).transaction(['items', 'outfits'], 'readwrite')
      await runInTx(tx, async () => {
        const items = tx.objectStore('items')
        await items.delete(id)
        let itemCursor = await items.openCursor()
        while (itemCursor) {
          const value = itemCursor.value
          if (value.excludedIds.includes(id)) {
            await itemCursor.update({ ...value, excludedIds: value.excludedIds.filter((x) => x !== id) })
          }
          itemCursor = await itemCursor.continue()
        }
        let outfitCursor = await tx.objectStore('outfits').openCursor()
        while (outfitCursor) {
          const saved = outfitCursor.value
          const entries = Object.entries(saved.outfit).filter(([, value]) => value !== id)
          if (entries.length !== Object.keys(saved.outfit).length) {
            await outfitCursor.update({ ...saved, outfit: Object.fromEntries(entries) as Outfit })
          }
          outfitCursor = await outfitCursor.continue()
        }
      })
    },

    async setExcluded(idA, idB, excluded) {
      if (idA === idB) return
      const tx = (await db()).transaction('items', 'readwrite')
      await runInTx(tx, async () => {
        const [a, b] = await Promise.all([tx.store.get(idA), tx.store.get(idB)])
        if (!a || !b) throw new Error('Een van deze kledingstukken bestaat niet (meer).')
        const update = (item: StoredItem, otherId: string): StoredItem => {
          const rest = item.excludedIds.filter((x) => x !== otherId)
          return { ...item, excludedIds: excluded ? [...rest, otherId] : rest }
        }
        await Promise.all([tx.store.put(update(a, idB)), tx.store.put(update(b, idA))])
      })
    },

    async getSettings() {
      return normalizeSettings(await (await db()).get('settings', SETTINGS_KEY))
    },

    async saveSettings(settings) {
      if (!isCurrentSeason(settings.currentSeason)) throw new Error('Onbekend seizoen.')
      await (await db()).put('settings', { currentSeason: settings.currentSeason }, SETTINGS_KEY)
    },

    async getOutfit(date) {
      const saved = await (await db()).get('outfits', date)
      return saved ? { date: saved.date, outfit: normalizeOutfit(saved.outfit) } : undefined
    },

    async saveOutfit(date, outfit) {
      await (await db()).put('outfits', { date, outfit: normalizeOutfit(outfit) })
    },

    async exportBackup() {
      const tx = (await db()).transaction(['items', 'settings', 'outfits'], 'readonly')
      const [items, settings, outfits] = await runInTx(tx, () =>
        Promise.all([
          tx.objectStore('items').getAll(),
          tx.objectStore('settings').get(SETTINGS_KEY),
          tx.objectStore('outfits').getAll(),
        ]),
      )
      const backup: BackupFile = {
        app: BACKUP_APP,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        settings: normalizeSettings(settings),
        items: items
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((item) =>
            withName<BackupItem>(
              {
                id: item.id,
                category: item.category,
                season: item.season,
                available: item.available,
                excludedIds: [...item.excludedIds],
                createdAt: item.createdAt,
                photo: photoToDataUrl(item.photo),
              },
              item.name,
            ),
          ),
        outfits: outfits.map((saved) => ({ date: saved.date, outfit: normalizeOutfit(saved.outfit) })),
      }
      return new Blob([JSON.stringify(backup)], { type: 'application/json' })
    },

    async importBackup(file) {
      // Alles lezen en controleren vóór de schrijftransactie; bij een fout blijft alles onveranderd.
      let text: string
      try {
        text = await blobToText(file)
      } catch {
        throw new Error('Het bestand kon niet worden gelezen.')
      }
      let json: unknown
      try {
        json = JSON.parse(text)
      } catch {
        throw invalid()
      }
      const parsed = parseBackup(json)

      const tx = (await db()).transaction(['items', 'settings', 'outfits'], 'readwrite')
      await runInTx(tx, async () => {
        const items = tx.objectStore('items')
        const settings = tx.objectStore('settings')
        const outfits = tx.objectStore('outfits')
        await Promise.all([items.clear(), settings.clear(), outfits.clear()])
        await Promise.all([
          ...parsed.items.map((item) => items.put(item)),
          settings.put(parsed.settings, SETTINGS_KEY),
          ...parsed.outfits.map((saved) => outfits.put(saved)),
        ])
      })
      lastCreatedAt = parsed.items.reduce((max, item) => Math.max(max, item.createdAt), lastCreatedAt)
    },
  }

  return store
}
