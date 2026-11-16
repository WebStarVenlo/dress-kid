/**
 * IndexedDB-implementatie van WardrobeStore (via `idb`).
 *
 * Foto's worden intern opgeslagen als `{ type, data: ArrayBuffer }` in plaats van als Blob.
 * Dat werkt betrouwbaar in alle browsers (oudere Safari-versies hadden problemen met Blobs in
 * IndexedDB) én in tests met fake-indexeddb. Naar buiten toe is `photo` altijd een Blob.
 */
import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase, IDBPTransaction, StoreNames } from 'idb'
import { normalizeSize } from '../domain/sizes'
import { CATEGORIES, DEFAULT_SETTINGS } from '../domain/types'
import type {
  Category,
  Child,
  ChildSizes,
  ClothingItem,
  CurrentSeason,
  ItemSeason,
  NewChild,
  NewClothingItem,
  Outfit,
  SavedOutfit,
  Settings,
  StoredPin,
} from '../domain/types'
import type { WardrobeStore } from './api'

/**
 * Versie 2: meerdere kinderen, maten en ouder-PIN. Bij een upgrade vanaf versie 1 worden alle
 * stores leeggegooid en opnieuw aangemaakt (de app was toen nog niet in gebruik).
 */
const DB_VERSION = 2
const SETTINGS_KEY = 'settings'
const PIN_KEY = 'parentPin'
const BACKUP_APP = 'dress-kid'
const BACKUP_VERSION = 1
const INVALID_BACKUP = 'Dit is geen geldig Dress Kid back-upbestand.'
/** Grenzen voor het importeren van een back-up (bescherming tegen per ongeluk gekozen grote bestanden). */
const MAX_BACKUP_BYTES = 200 * 1024 * 1024
const MAX_PHOTO_BYTES = 10 * 1024 * 1024
const MAX_NAME_LENGTH = 60
const MAX_SIZE_LENGTH = 20
const MAX_CHILD_NAME_LENGTH = 40
const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

const CHILD_NOT_FOUND = 'Dit kind bestaat niet (meer).'

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
  /**
   * Uniek label voor de huidige foto; verandert bij elke nieuwe foto. Oudere records hebben dit
   * veld niet; dan wordt een label afgeleid van type en grootte (zie `photoKey`).
   */
  photoRev?: string
}

interface DressKidDB extends DBSchema {
  items: { key: string; value: StoredItem }
  settings: { key: string; value: Settings }
  children: { key: string; value: Child }
  /** Sleutel: [childId, date]. */
  outfits: { key: [string, string]; value: SavedOutfit; indexes: { childId: string } }
  /** Alleen de ouder-PIN (sleutel `PIN_KEY`); valt bewust buiten de back-up. */
  pin: { key: string; value: StoredPin }
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

function photoKey(stored: StoredItem): string {
  return stored.photoRev ?? `legacy:${stored.photo.type}:${stored.photo.data.byteLength}`
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
  // Op codepoints knippen, zodat een surrogaatpaar (emoji) niet doormidden gaat.
  const trimmed = name === undefined ? undefined : Array.from(name.trim()).slice(0, MAX_NAME_LENGTH).join('').trim()
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

/** Maat: trimmen; leeg wordt `undefined`. Gooit bij geen tekst of meer dan 20 tekens. */
function cleanSize(size: unknown): string | undefined {
  if (size === undefined || size === null) return undefined
  if (typeof size !== 'string') throw new Error('De maat is ongeldig.')
  const trimmed = size.trim()
  if (!trimmed) return undefined
  if (Array.from(trimmed).length > MAX_SIZE_LENGTH) {
    throw new Error(`Een maat mag maximaal ${MAX_SIZE_LENGTH} tekens lang zijn.`)
  }
  return trimmed
}

/** Zet de (al opgeschoonde) maat op een kopie van `base`, of haalt hem weg. */
function withSize<T extends object>(base: T, size: string | undefined): T & { size?: string } {
  const result: T & { size?: string } = { ...base }
  delete result.size
  if (size !== undefined) result.size = size
  return result
}

function cleanChildName(name: unknown): string {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (!trimmed) throw new Error('Geef het kind een naam.')
  if (Array.from(trimmed).length > MAX_CHILD_NAME_LENGTH) {
    throw new Error(`De naam van een kind mag maximaal ${MAX_CHILD_NAME_LENGTH} tekens lang zijn.`)
  }
  return trimmed
}

function cleanColor(color: unknown): string {
  const trimmed = typeof color === 'string' ? color.trim() : ''
  if (!COLOR_RE.test(trimmed)) throw new Error('Kies een geldige kleur.')
  // <input type="color"> vraagt #rrggbb: vouw #rgb uit naar #rrggbb.
  const hex = trimmed.slice(1).toLowerCase()
  return hex.length === 3 ? `#${Array.from(hex, (c) => c + c).join('')}` : `#${hex}`
}

/**
 * Maten per categorie: alleen bekende categorieën; per categorie getrimde, niet-lege en unieke
 * (hoofdletterongevoelig) maten. Categorieën zonder maten vallen weg.
 */
function cleanChildSizes(value: unknown): ChildSizes {
  if (!isRecord(value)) throw new Error('De maten zijn ongeldig.')
  for (const key of Object.keys(value)) {
    if (!isCategory(key)) throw new Error('Onbekende soort kledingstuk bij de maten.')
  }
  const result: ChildSizes = {}
  for (const category of CATEGORIES) {
    const list = value[category]
    if (list === undefined) continue
    if (!Array.isArray(list)) throw new Error('De maten zijn ongeldig.')
    const seen = new Set<string>()
    const sizes: string[] = []
    for (const entry of list as unknown[]) {
      if (typeof entry !== 'string') throw new Error('De maten zijn ongeldig.')
      const size = cleanSize(entry)
      if (size === undefined || seen.has(normalizeSize(size))) continue
      seen.add(normalizeSize(size))
      sizes.push(size)
    }
    if (sizes.length > 0) result[category] = sizes
  }
  return result
}

function copySizes(sizes: ChildSizes): ChildSizes {
  const result: ChildSizes = {}
  for (const category of CATEGORIES) {
    const list = sizes[category]
    if (list) result[category] = [...list]
  }
  return result
}

function isStoredPin(value: unknown): value is StoredPin {
  return (
    isRecord(value) &&
    typeof value.salt === 'string' &&
    value.salt.length > 0 &&
    typeof value.hash === 'string' &&
    value.hash.length > 0 &&
    typeof value.iterations === 'number' &&
    Number.isSafeInteger(value.iterations) &&
    value.iterations > 0
  )
}

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
  size?: string
  createdAt: number
  photo: string
}

/** Back-upformaat. De ouder-PIN zit er bewust niet in. */
interface BackupFile {
  app: typeof BACKUP_APP
  version: typeof BACKUP_VERSION
  exportedAt: string
  settings: Settings
  children: Child[]
  items: BackupItem[]
  outfits: SavedOutfit[]
}

function invalid(detail?: string): Error {
  return new Error(detail ? `Dit is geen geldig Dress Kid back-upbestand: ${detail}.` : INVALID_BACKUP)
}

/** Voert een validatie uit en zet een fout om in een back-upfout met `detail`. */
function orInvalid<T>(fn: () => T, detail: string): T {
  try {
    return fn()
  } catch {
    throw invalid(detail)
  }
}

function parseChild(value: unknown, index: number): Child {
  const label = `kind ${index + 1}`
  if (!isRecord(value)) throw invalid(`${label} is ongeldig`)
  const { id, name, color, sizes, createdAt } = value
  if (typeof id !== 'string' || !id) throw invalid(`${label} heeft geen geldige id`)
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) throw invalid(`${label} heeft een ongeldige datum`)
  return {
    id,
    name: orInvalid(() => cleanChildName(name), `${label} heeft een ongeldige naam`),
    color: orInvalid(() => cleanColor(color), `${label} heeft een ongeldige kleur`),
    sizes: orInvalid(() => cleanChildSizes(sizes ?? {}), `${label} heeft ongeldige maten`),
    createdAt,
  }
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
  if (base64.length * 0.75 > MAX_PHOTO_BYTES + 3) {
    throw invalid(`${label} heeft een te grote foto (maximaal 10 MB)`)
  }
  let bytes: Uint8Array<ArrayBuffer>
  try {
    bytes = base64ToBytes(base64)
  } catch {
    throw invalid(`${label} heeft een beschadigde foto`)
  }
  if (bytes.length === 0) throw invalid(`${label} heeft een lege foto`)
  if (bytes.length > MAX_PHOTO_BYTES) throw invalid(`${label} heeft een te grote foto (maximaal 10 MB)`)
  return { type, data: bytes.buffer }
}

function parseItem(value: unknown, index: number): StoredItem {
  const label = `kledingstuk ${index + 1}`
  if (!isRecord(value)) throw invalid(`${label} is ongeldig`)
  const { id, category, name, season, available, excludedIds, size, createdAt, photo } = value
  if (typeof id !== 'string' || !id) throw invalid(`${label} heeft geen geldige id`)
  if (!isCategory(category)) throw invalid(`${label} heeft een onbekende soort`)
  if (!isItemSeason(season)) throw invalid(`${label} heeft een onbekend seizoen`)
  if (typeof available !== 'boolean') throw invalid(`${label} heeft een ongeldige beschikbaarheid`)
  if (name !== undefined && name !== null && typeof name !== 'string') throw invalid(`${label} heeft een ongeldige naam`)
  if (!Array.isArray(excludedIds) || !excludedIds.every((x) => typeof x === 'string')) {
    throw invalid(`${label} heeft ongeldige uitsluitingen`)
  }
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) throw invalid(`${label} heeft een ongeldige datum`)
  const cleanedSize = orInvalid(() => cleanSize(size), `${label} heeft een ongeldige maat`)
  const base: StoredItem = {
    id,
    category,
    season,
    available,
    excludedIds: excludedIds as string[],
    createdAt,
    photo: parsePhoto(photo, label),
    photoRev: newId(),
  }
  return withSize(withName(base, typeof name === 'string' ? name : undefined), cleanedSize)
}

function parseOutfits(
  value: unknown,
  itemsById: Map<string, StoredItem>,
  childIds: Set<string>,
): SavedOutfit[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw invalid('de outfits zijn ongeldig')
  const byKey = new Map<string, SavedOutfit>()
  value.forEach((entry: unknown, index) => {
    const label = `outfit ${index + 1}`
    if (
      !isRecord(entry) ||
      typeof entry.childId !== 'string' ||
      typeof entry.date !== 'string' ||
      !DATE_RE.test(entry.date) ||
      !isRecord(entry.outfit)
    ) {
      throw invalid(`${label} is ongeldig`)
    }
    if (!childIds.has(entry.childId)) throw invalid(`${label} hoort bij een onbekend kind`)
    const outfit: Outfit = {}
    for (const [category, id] of Object.entries(entry.outfit)) {
      if (!isCategory(category) || (id !== undefined && typeof id !== 'string')) throw invalid(`${label} is ongeldig`)
      // Verwijzingen naar onbekende of verkeerd ingedeelde kledingstukken laten we vallen.
      if (id !== undefined && itemsById.get(id)?.category === category) outfit[category] = id
    }
    // JSON-sleutel, zodat geen enkele combinatie van childId en datum kan botsen.
    byKey.set(JSON.stringify([entry.childId, entry.date]), { childId: entry.childId, date: entry.date, outfit })
  })
  return [...byKey.values()]
}

function parseChildren(value: unknown): Child[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw invalid('de kinderen zijn ongeldig')
  const children = value.map((entry: unknown, index) => parseChild(entry, index))
  const ids = new Set<string>()
  for (const child of children) {
    if (ids.has(child.id)) throw invalid('er komen dubbele kinderen in voor')
    ids.add(child.id)
  }
  return children
}

interface ParsedBackup {
  settings: Settings
  children: Child[]
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

  const children = parseChildren(json.children)
  const childIds = new Set(children.map((child) => child.id))
  return { settings, children, items, outfits: parseOutfits(json.outfits, itemsById, childIds) }
}

// ---------------------------------------------------------------------------
// De store

export function createIndexedDbStore(dbName = 'dress-kid'): WardrobeStore {
  let dbPromise: Promise<IDBPDatabase<DressKidDB>> | undefined
  let lastCreatedAt = 0
  /**
   * Blobs per kledingstuk, zodat opeenvolgende reads dezelfde Blob-instantie teruggeven zolang de
   * foto niet veranderd is (anders maakt `usePhotoUrl` telkens nieuwe object-URL's).
   */
  const blobCache = new Map<string, { key: string; blob: Blob }>()

  function toItem(stored: StoredItem): ClothingItem {
    const key = photoKey(stored)
    let cached = blobCache.get(stored.id)
    if (cached?.key !== key) {
      cached = { key, blob: fromStoredPhoto(stored.photo) }
      blobCache.set(stored.id, cached)
    }
    const { photoRev: _rev, ...rest } = stored
    void _rev
    return { ...rest, excludedIds: [...stored.excludedIds], photo: cached.blob }
  }

  function db(): Promise<IDBPDatabase<DressKidDB>> {
    if (!dbPromise) {
      const opening = openDB<DressKidDB>(dbName, DB_VERSION, {
        upgrade(database, oldVersion) {
          if (oldVersion > 0 && oldVersion < 2) {
            // Geen migratie: oude stores weggooien en schoon opnieuw beginnen.
            for (const name of Array.from(database.objectStoreNames)) database.deleteObjectStore(name)
          }
          const names = database.objectStoreNames
          if (!names.contains('items')) database.createObjectStore('items', { keyPath: 'id' })
          if (!names.contains('settings')) database.createObjectStore('settings')
          if (!names.contains('children')) database.createObjectStore('children', { keyPath: 'id' })
          if (!names.contains('outfits')) {
            const outfits = database.createObjectStore('outfits', { keyPath: ['childId', 'date'] })
            outfits.createIndex('childId', 'childId')
          }
          if (!names.contains('pin')) database.createObjectStore('pin')
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
      const live = new Set(items.map((item) => item.id))
      for (const id of blobCache.keys()) if (!live.has(id)) blobCache.delete(id)
      return items.sort((a, b) => a.createdAt - b.createdAt).map(toItem)
    },

    async getItem(id) {
      const item = await (await db()).get('items', id)
      return item ? toItem(item) : undefined
    },

    async addItem(input: NewClothingItem) {
      if (!isCategory(input.category)) throw new Error('Onbekende soort kledingstuk.')
      if (!isItemSeason(input.season)) throw new Error('Onbekend seizoen.')
      const size = cleanSize(input.size)
      const photo = await toStoredPhoto(input.photo)
      const stored = withSize(
        withName<StoredItem>(
          {
            id: newId(),
            category: input.category,
            season: input.season,
            available: true,
            excludedIds: [],
            createdAt: nextCreatedAt(),
            photo,
            photoRev: newId(),
          },
          input.name,
        ),
        size,
      )
      await (await db()).add('items', stored)
      return toItem(stored)
    },

    async updateItem(id, changes) {
      if (changes.category !== undefined && !isCategory(changes.category)) throw new Error('Onbekende soort kledingstuk.')
      if (changes.season !== undefined && !isItemSeason(changes.season)) throw new Error('Onbekend seizoen.')
      const size = 'size' in changes ? cleanSize(changes.size) : undefined
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
        if (photo) {
          updated.photo = photo
          updated.photoRev = newId()
        }
        if ('name' in changes) updated = withName(updated, changes.name)
        if ('size' in changes) updated = withSize(updated, size)
        await tx.store.put(updated)
        return updated
      }).then(toItem)
    },

    async deleteItem(id) {
      blobCache.delete(id)
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

    async listChildren() {
      const children = await (await db()).getAll('children')
      return children.sort((a, b) => a.createdAt - b.createdAt)
    },

    async addChild(input: NewChild) {
      const child: Child = {
        id: newId(),
        name: cleanChildName(input.name),
        color: cleanColor(input.color),
        sizes: cleanChildSizes(input.sizes ?? {}),
        createdAt: nextCreatedAt(),
      }
      await (await db()).add('children', child)
      return { ...child, sizes: copySizes(child.sizes) }
    },

    async updateChild(id, changes) {
      // Eerst valideren, zodat een fout niets half opslaat.
      const name = changes.name !== undefined ? cleanChildName(changes.name) : undefined
      const color = changes.color !== undefined ? cleanColor(changes.color) : undefined
      const sizes = changes.sizes !== undefined ? cleanChildSizes(changes.sizes) : undefined
      const tx = (await db()).transaction('children', 'readwrite')
      const updated = await runInTx(tx, async () => {
        const existing = await tx.store.get(id)
        if (!existing) throw new Error(CHILD_NOT_FOUND)
        const next: Child = {
          id: existing.id,
          name: name ?? existing.name,
          color: color ?? existing.color,
          sizes: sizes ?? existing.sizes,
          createdAt: existing.createdAt,
        }
        await tx.store.put(next)
        return next
      })
      return { ...updated, sizes: copySizes(updated.sizes) }
    },

    async deleteChild(id) {
      const tx = (await db()).transaction(['children', 'outfits'], 'readwrite')
      await runInTx(tx, async () => {
        await tx.objectStore('children').delete(id)
        let cursor = await tx.objectStore('outfits').index('childId').openCursor(id)
        while (cursor) {
          await cursor.delete()
          cursor = await cursor.continue()
        }
      })
    },

    async getOutfit(childId, date) {
      const saved = await (await db()).get('outfits', [childId, date])
      return saved ? { childId: saved.childId, date: saved.date, outfit: normalizeOutfit(saved.outfit) } : undefined
    },

    async saveOutfit(childId, date, outfit) {
      const tx = (await db()).transaction(['children', 'outfits'], 'readwrite')
      await runInTx(tx, async () => {
        if (!(await tx.objectStore('children').get(childId))) throw new Error(CHILD_NOT_FOUND)
        await tx.objectStore('outfits').put({ childId, date, outfit: normalizeOutfit(outfit) })
      })
    },

    async getParentPin() {
      const pin = await (await db()).get('pin', PIN_KEY)
      return isStoredPin(pin) ? { salt: pin.salt, hash: pin.hash, iterations: pin.iterations } : undefined
    },

    async setParentPin(pin) {
      if (pin === null) {
        await (await db()).delete('pin', PIN_KEY)
        return
      }
      if (!isStoredPin(pin)) throw new Error('De PIN is ongeldig.')
      await (await db()).put('pin', { salt: pin.salt, hash: pin.hash, iterations: pin.iterations }, PIN_KEY)
    },

    async exportBackup() {
      const tx = (await db()).transaction(['items', 'settings', 'children', 'outfits'], 'readonly')
      const [items, settings, children, outfits] = await runInTx(tx, () =>
        Promise.all([
          tx.objectStore('items').getAll(),
          tx.objectStore('settings').get(SETTINGS_KEY),
          tx.objectStore('children').getAll(),
          tx.objectStore('outfits').getAll(),
        ]),
      )
      const backup: BackupFile = {
        app: BACKUP_APP,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        settings: normalizeSettings(settings),
        children: children
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((child) => ({
            id: child.id,
            name: child.name,
            color: child.color,
            sizes: copySizes(child.sizes),
            createdAt: child.createdAt,
          })),
        items: items
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((item) =>
            withSize(
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
              item.size,
            ),
          ),
        outfits: outfits.map((saved) => ({
          childId: saved.childId,
          date: saved.date,
          outfit: normalizeOutfit(saved.outfit),
        })),
      }
      return new Blob([JSON.stringify(backup)], { type: 'application/json' })
    },

    async importBackup(file) {
      // Alles lezen en controleren vóór de schrijftransactie; bij een fout blijft alles onveranderd.
      if (file.size > MAX_BACKUP_BYTES) {
        throw new Error('Dit bestand is te groot om een back-up te zijn (meer dan 200 MB).')
      }
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

      // De ouder-PIN ('pin'-store) blijft bewust onaangeroerd.
      const tx = (await db()).transaction(['items', 'settings', 'children', 'outfits'], 'readwrite')
      await runInTx(tx, async () => {
        const items = tx.objectStore('items')
        const settings = tx.objectStore('settings')
        const children = tx.objectStore('children')
        const outfits = tx.objectStore('outfits')
        await Promise.all([items.clear(), settings.clear(), children.clear(), outfits.clear()])
        await Promise.all([
          ...parsed.items.map((item) => items.put(item)),
          settings.put(parsed.settings, SETTINGS_KEY),
          ...parsed.children.map((child) => children.put(child)),
          ...parsed.outfits.map((saved) => outfits.put(saved)),
        ])
      })
      blobCache.clear()
      lastCreatedAt = [...parsed.items, ...parsed.children].reduce(
        (max, entry) => Math.max(max, entry.createdAt),
        lastCreatedAt,
      )
    },
  }

  return store
}
