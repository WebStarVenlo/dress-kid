/**
 * IndexedDB implementation of WardrobeStore (via `idb`).
 *
 * Photos are stored internally as `{ type, data: ArrayBuffer }` instead of as a Blob.
 * That works reliably in all browsers (older Safari versions had problems with Blobs in
 * IndexedDB) and in tests with fake-indexeddb. Outwardly `photo` is always a Blob.
 */
import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase, IDBPObjectStore, IDBPTransaction, StoreNames } from 'idb'
import { isAvatarId } from '../domain/avatars'
import type { AvatarId } from '../domain/avatars'
import { todayKey } from '../domain/compat'
import { isTimestamp, normalizeAutoReturnDays, normalizeAutoWashCategories, planLaundry } from '../domain/laundry'
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
import { AppError } from '../i18n/AppError'
import type { ErrorCode } from '../i18n/AppError'
import type { WardrobeStore } from './api'

/**
 * Version 2: multiple children, sizes and parent PIN. An upgrade from version 1 drops all
 * stores and recreates them (the app was not in use yet at that point).
 * Version 3: laundry tracking. Existing outfits of earlier days are marked `laundryProcessed`, so
 * the first laundry run does not put the whole history into the wash.
 */
const DB_VERSION = 3
const SETTINGS_KEY = 'settings'
const PIN_KEY = 'parentPin'
const BACKUP_APP = 'dress-kid'
const BACKUP_VERSION = 1
/** Limits for importing a backup (protection against accidentally chosen large files). */
const MAX_BACKUP_BYTES = 200 * 1024 * 1024
const MAX_PHOTO_BYTES = 10 * 1024 * 1024
const MAX_NAME_LENGTH = 60
const MAX_SIZE_LENGTH = 20
const MAX_CHILD_NAME_LENGTH = 40
const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** Image types we accept from a backup (deliberately no SVG: it can contain scripts). */
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
   * Unique label for the current photo; changes with every new photo. Older records lack this
   * field; a label is then derived from type and size (see `photoKey`).
   */
  photoRev?: string
}

interface DressKidDB extends DBSchema {
  items: { key: string; value: StoredItem }
  settings: { key: string; value: Settings }
  children: { key: string; value: Child }
  /** Key: [childId, date]. */
  outfits: { key: [string, string]; value: SavedOutfit; indexes: { childId: string } }
  /** Only the parent PIN (key `PIN_KEY`); deliberately excluded from the backup. */
  pin: { key: string; value: StoredPin }
}

type Names = StoreNames<DressKidDB>
type Tx<S extends Names[], M extends IDBTransactionMode> = IDBPTransaction<DressKidDB, S, M>

// ---------------------------------------------------------------------------
// Helpers

function newId(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  // RFC 4122 version 4
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
    reader.onerror = () => reject(reader.error ?? new AppError('fileReadFailed'))
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
    throw new AppError('photoMissing')
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
  // Cut on code points so a surrogate pair (emoji) is not split in half.
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

/** Size: trimmed; empty becomes `undefined`. Throws on non-text or more than 20 characters. */
function cleanSize(size: unknown): string | undefined {
  if (size === undefined || size === null) return undefined
  if (typeof size !== 'string') throw new AppError('sizeInvalid')
  const trimmed = size.trim()
  if (!trimmed) return undefined
  if (Array.from(trimmed).length > MAX_SIZE_LENGTH) {
    throw new AppError('sizeTooLong', { max: MAX_SIZE_LENGTH })
  }
  return trimmed
}

/** Sets the (already cleaned) size on a copy of `base`, or removes it. */
function withSize<T extends object>(base: T, size: string | undefined): T & { size?: string } {
  const result: T & { size?: string } = { ...base }
  delete result.size
  if (size !== undefined) result.size = size
  return result
}

function cleanChildName(name: unknown): string {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (!trimmed) throw new AppError('childNameRequired')
  if (Array.from(trimmed).length > MAX_CHILD_NAME_LENGTH) {
    throw new AppError('childNameTooLong', { max: MAX_CHILD_NAME_LENGTH })
  }
  return trimmed
}

function cleanColor(color: unknown): string {
  const trimmed = typeof color === 'string' ? color.trim() : ''
  if (!COLOR_RE.test(trimmed)) throw new AppError('colorInvalid')
  // <input type="color"> expects #rrggbb: expand #rgb to #rrggbb.
  const hex = trimmed.slice(1).toLowerCase()
  return hex.length === 3 ? `#${Array.from(hex, (c) => c + c).join('')}` : `#${hex}`
}

/**
 * Sizes per category: only known categories; per category trimmed, non-empty and unique
 * (case-insensitive) sizes. Categories without sizes are dropped.
 */
function cleanChildSizes(value: unknown): ChildSizes {
  if (!isRecord(value)) throw new AppError('sizesInvalid')
  for (const key of Object.keys(value)) {
    if (!isCategory(key)) throw new AppError('sizesUnknownCategory')
  }
  const result: ChildSizes = {}
  for (const category of CATEGORIES) {
    const list = value[category]
    if (list === undefined) continue
    if (!Array.isArray(list)) throw new AppError('sizesInvalid')
    const seen = new Set<string>()
    const sizes: string[] = []
    for (const entry of list as unknown[]) {
      if (typeof entry !== 'string') throw new AppError('sizesInvalid')
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

/** `soundEnabled`: only a real boolean counts; anything else (including missing) becomes the default. */
function cleanSoundEnabled(value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_SETTINGS.soundEnabled
}

function normalizeSettings(value: unknown): Settings {
  const record = isRecord(value) ? value : {}
  return {
    currentSeason: isCurrentSeason(record.currentSeason) ? record.currentSeason : DEFAULT_SETTINGS.currentSeason,
    soundEnabled: cleanSoundEnabled(record.soundEnabled),
    autoWashCategories: normalizeAutoWashCategories(record.autoWashCategories),
    autoReturnDays: normalizeAutoReturnDays(record.autoReturnDays),
  }
}

/**
 * Sets the availability on a copy of `item` and keeps `washedAt` consistent: it is set to
 * `now` when the item goes from available to unavailable, kept while it stays unavailable
 * (also when absent: an item put away before laundry tracking keeps no `washedAt`), and
 * removed when the item becomes available again.
 */
function withAvailability(item: StoredItem, available: boolean, now: number): StoredItem {
  const result: StoredItem = { ...item, available }
  delete result.washedAt
  if (!available) {
    if (item.available) result.washedAt = now
    else if (isTimestamp(item.washedAt)) result.washedAt = item.washedAt
  }
  return result
}

/** Sets `stickersEnabled` on a copy of `base` if it is a real boolean; otherwise (including missing) it stays absent = on. */
function withStickers<T extends object>(base: T, value: unknown): T & { stickersEnabled?: boolean } {
  const result: T & { stickersEnabled?: boolean } = { ...base }
  delete result.stickersEnabled
  if (typeof value === 'boolean') result.stickersEnabled = value
  return result
}

/** Sets the avatar on a copy of `base` if it is valid, or removes it. */
function withAvatar<T extends object>(base: T, avatar: unknown): T & { avatar?: AvatarId } {
  const result: T & { avatar?: AvatarId } = { ...base }
  delete result.avatar
  if (isAvatarId(avatar)) result.avatar = avatar
  return result
}

/** Completion time: only a finite, positive number (epoch ms) is valid. */
function isCompletedAt(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/** Copy of a stored outfit; `completedAt` only if it is set (and valid), `laundryProcessed` only if true. */
function toSavedOutfit(saved: SavedOutfit): SavedOutfit {
  const result: SavedOutfit = { childId: saved.childId, date: saved.date, outfit: normalizeOutfit(saved.outfit) }
  if (isCompletedAt(saved.completedAt)) result.completedAt = saved.completedAt
  if (saved.laundryProcessed === true) result.laundryProcessed = true
  return result
}

function normalizeOutfit(outfit: Outfit): Outfit {
  const result: Outfit = {}
  for (const category of CATEGORIES) {
    const id = outfit[category]
    if (typeof id === 'string' && id) result[category] = id
  }
  return result
}

/** Runs `fn` inside `tx`; on an error the transaction is aborted (nothing is stored). */
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
      // Transaction was already finished or aborted.
    }
    await tx.done.catch(() => undefined)
    throw error
  }
}

// ---------------------------------------------------------------------------
// Backup

interface BackupItem {
  id: string
  category: Category
  name?: string
  season: ItemSeason
  available: boolean
  /** Only while `available` is false (and known). */
  washedAt?: number
  excludedIds: string[]
  size?: string
  createdAt: number
  photo: string
}

/**
 * Outfit in a backup. `laundryProcessed` is always written; an outfit without it (old
 * backup) is imported as processed.
 */
interface BackupOutfit extends Omit<SavedOutfit, 'laundryProcessed'> {
  laundryProcessed: boolean
}

/** Backup format. The parent PIN is deliberately not included. */
interface BackupFile {
  app: typeof BACKUP_APP
  version: typeof BACKUP_VERSION
  exportedAt: string
  settings: Settings
  children: Child[]
  items: BackupItem[]
  outfits: BackupOutfit[]
}

type BackupLabelCode = 'backupLabelChild' | 'backupLabelItem' | 'backupLabelOutfit'
/** Language-independent label of an entry in a backup list; resolved when the error is translated. */
interface BackupLabel {
  labelCode: BackupLabelCode
  n: number
}

/** Label of the n-th entry (zero-based `index`) in a backup list. */
function backupLabel(labelCode: BackupLabelCode, index: number): BackupLabel {
  return { labelCode, n: index + 1 }
}

/** Backup validation error; the optional detail is a `backupDetail*` code, translated later. */
function invalid(detailCode?: ErrorCode, params?: { label: BackupLabel }): AppError {
  if (!detailCode) return new AppError('backupInvalid')
  return new AppError('backupInvalidDetail', { ...params?.label, detailCode })
}

/** Runs a validation and turns a failure into a backup error with `detail`. */
function orInvalid<T>(fn: () => T, detailCode: ErrorCode, params?: { label: BackupLabel }): T {
  try {
    return fn()
  } catch {
    throw invalid(detailCode, params)
  }
}

function parseChild(value: unknown, index: number): Child {
  const label = backupLabel('backupLabelChild', index)
  if (!isRecord(value)) throw invalid('backupDetailInvalid', { label })
  const { id, name, color, avatar, stickersEnabled, sizes, createdAt } = value
  if (typeof id !== 'string' || !id) throw invalid('backupDetailNoId', { label })
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) throw invalid('backupDetailBadDate', { label })
  // An unknown avatar (e.g. from a newer app version) is silently dropped.
  // Older backups have no `stickersEnabled`; that (and an invalid value) becomes stickers on.
  return withStickers(
    withAvatar<Child>(
      {
        id,
        name: orInvalid(() => cleanChildName(name), 'backupDetailBadName', { label }),
        color: orInvalid(() => cleanColor(color), 'backupDetailBadColor', { label }),
        sizes: orInvalid(() => cleanChildSizes(sizes ?? {}), 'backupDetailBadSizes', { label }),
        createdAt,
      },
      avatar,
    ),
    stickersEnabled,
  )
}

const DATA_URL_RE = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/\s]*={0,2})$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parsePhoto(value: unknown, label: BackupLabel): StoredPhoto {
  if (typeof value !== 'string') throw invalid('backupDetailNoPhoto', { label })
  const match = DATA_URL_RE.exec(value)
  const type = match?.[1]?.toLowerCase()
  const base64 = match?.[2]?.replace(/\s+/g, '')
  if (!type || base64 === undefined || !ALLOWED_IMAGE_TYPES.has(type)) {
    throw invalid('backupDetailBadPhoto', { label })
  }
  if (base64.length * 0.75 > MAX_PHOTO_BYTES + 3) {
    throw invalid('backupDetailPhotoTooLarge', { label })
  }
  let bytes: Uint8Array<ArrayBuffer>
  try {
    bytes = base64ToBytes(base64)
  } catch {
    throw invalid('backupDetailPhotoCorrupt', { label })
  }
  if (bytes.length === 0) throw invalid('backupDetailPhotoEmpty', { label })
  if (bytes.length > MAX_PHOTO_BYTES) throw invalid('backupDetailPhotoTooLarge', { label })
  return { type, data: bytes.buffer }
}

function parseItem(value: unknown, index: number): StoredItem {
  const label = backupLabel('backupLabelItem', index)
  if (!isRecord(value)) throw invalid('backupDetailInvalid', { label })
  const { id, category, name, season, available, washedAt, excludedIds, size, createdAt, photo } = value
  if (typeof id !== 'string' || !id) throw invalid('backupDetailNoId', { label })
  if (!isCategory(category)) throw invalid('backupDetailBadCategory', { label })
  if (!isItemSeason(season)) throw invalid('backupDetailBadSeason', { label })
  if (typeof available !== 'boolean') throw invalid('backupDetailBadAvailability', { label })
  if (name !== undefined && name !== null && typeof name !== 'string') throw invalid('backupDetailBadName', { label })
  if (!Array.isArray(excludedIds) || !excludedIds.every((x) => typeof x === 'string')) {
    throw invalid('backupDetailBadExclusions', { label })
  }
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) throw invalid('backupDetailBadDate', { label })
  const cleanedSize = orInvalid(() => cleanSize(size), 'backupDetailBadSize', { label })
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
  // An invalid `washedAt` (or one on an available item) is silently dropped.
  if (!available && isTimestamp(washedAt)) base.washedAt = washedAt
  return withSize(withName(base, typeof name === 'string' ? name : undefined), cleanedSize)
}

function parseOutfits(
  value: unknown,
  itemsById: Map<string, StoredItem>,
  childIds: Set<string>,
): SavedOutfit[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw invalid('backupDetailOutfitsInvalid')
  const byKey = new Map<string, SavedOutfit>()
  value.forEach((entry: unknown, index) => {
    const label = backupLabel('backupLabelOutfit', index)
    if (
      !isRecord(entry) ||
      typeof entry.childId !== 'string' ||
      typeof entry.date !== 'string' ||
      !DATE_RE.test(entry.date) ||
      !isRecord(entry.outfit)
    ) {
      throw invalid('backupDetailInvalid', { label })
    }
    if (!childIds.has(entry.childId)) throw invalid('backupDetailOutfitUnknownChild', { label })
    const outfit: Outfit = {}
    for (const [category, id] of Object.entries(entry.outfit)) {
      if (!isCategory(category) || (id !== undefined && typeof id !== 'string')) throw invalid('backupDetailInvalid', { label })
      // References to unknown or wrongly categorised items are dropped.
      if (id !== undefined && itemsById.get(id)?.category === category) outfit[category] = id
    }
    const saved: SavedOutfit = { childId: entry.childId, date: entry.date, outfit }
    // An invalid completion time is silently dropped (the outfit itself stays).
    if (isCompletedAt(entry.completedAt)) saved.completedAt = entry.completedAt
    // Only an explicit `false` (from a newer backup) leaves the day unprocessed. Without the
    // field (old backup), earlier days count as processed, so nothing goes into the wash;
    // today's and later outfits stay unprocessed and are handled normally.
    if (entry.laundryProcessed === true || (entry.laundryProcessed !== false && entry.date < todayKey())) {
      saved.laundryProcessed = true
    }
    // JSON key, so no combination of childId and date can collide.
    byKey.set(JSON.stringify([entry.childId, entry.date]), saved)
  })
  return [...byKey.values()]
}

function parseChildren(value: unknown): Child[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw invalid('backupDetailChildrenInvalid')
  const children = value.map((entry: unknown, index) => parseChild(entry, index))
  const ids = new Set<string>()
  for (const child of children) {
    if (ids.has(child.id)) throw invalid('backupDetailDuplicateChildren')
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
    throw new AppError('backupNewerVersion')
  }
  if (json.version !== BACKUP_VERSION) throw invalid()

  let settings: Settings = { ...DEFAULT_SETTINGS }
  if (json.settings !== undefined) {
    if (!isRecord(json.settings) || !isCurrentSeason(json.settings.currentSeason)) {
      throw invalid('backupDetailSettingsInvalid')
    }
    // Older backups lack `soundEnabled`, `autoWashCategories` and `autoReturnDays`; those (and
    // invalid values) get their default.
    settings = normalizeSettings(json.settings)
  }

  if (!Array.isArray(json.items)) throw invalid('backupDetailItemsMissing')
  const items = json.items.map((value: unknown, index) => parseItem(value, index))
  const itemsById = new Map<string, StoredItem>()
  for (const item of items) {
    if (itemsById.has(item.id)) throw invalid('backupDetailDuplicateItems')
    itemsById.set(item.id, item)
  }

  // Exclusions: only to existing items, never to themselves, and symmetric.
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
// Migration

type UpgradeOutfitStore = IDBPObjectStore<DressKidDB, ArrayLike<Names>, 'outfits', 'versionchange'>

async function markPastOutfitsProcessed(outfits: UpgradeOutfitStore): Promise<void> {
  const today = todayKey()
  let cursor = await outfits.openCursor()
  while (cursor) {
    if (cursor.value.laundryProcessed !== true && cursor.value.date < today) await cursor.update({ ...cursor.value, laundryProcessed: true })
    cursor = await cursor.continue()
  }
}

// ---------------------------------------------------------------------------
// The store

export function createIndexedDbStore(dbName = 'dress-kid'): WardrobeStore {
  let dbPromise: Promise<IDBPDatabase<DressKidDB>> | undefined
  let lastCreatedAt = 0
  /**
   * Blobs per item, so consecutive reads return the same Blob instance as long as the
   * photo has not changed (otherwise `usePhotoUrl` keeps creating new object URLs).
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
        upgrade(database, oldVersion, _newVersion, transaction) {
          if (oldVersion > 0 && oldVersion < 2) {
            // No migration: drop the old stores and start fresh.
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
          if (oldVersion === 2) {
            // Laundry tracking: the days so far count as processed. A failure aborts the
            // upgrade (and so the opening); nothing is changed halfway.
            void markPastOutfitsProcessed(transaction.objectStore('outfits')).catch((error: unknown) => {
              console.error(error)
              try {
                transaction.abort()
              } catch {
                // Already finished or aborted.
              }
            })
          }
        },
        blocking() {
          // A newer version (e.g. in another tab) wants to upgrade: make room.
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
    // Strictly increasing, so sorting by createdAt always gives the insertion order.
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
      if (!isCategory(input.category)) throw new AppError('categoryUnknown')
      if (!isItemSeason(input.season)) throw new AppError('seasonUnknown')
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
      if (changes.category !== undefined && !isCategory(changes.category)) throw new AppError('categoryUnknown')
      if (changes.season !== undefined && !isItemSeason(changes.season)) throw new AppError('seasonUnknown')
      const size = 'size' in changes ? cleanSize(changes.size) : undefined
      // Convert the photo first: a transaction closes itself as soon as we await anything other than IDB.
      const photo = changes.photo !== undefined ? await toStoredPhoto(changes.photo) : undefined
      const tx = (await db()).transaction('items', 'readwrite')
      return runInTx(tx, async () => {
        const existing = await tx.store.get(id)
        if (!existing) throw new AppError('itemNotFound')
        let updated: StoredItem = { ...existing }
        if (changes.category !== undefined) updated.category = changes.category
        if (changes.season !== undefined) updated.season = changes.season
        if (changes.available !== undefined) updated = withAvailability(updated, Boolean(changes.available), Date.now())
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
        if (!a || !b) throw new AppError('itemsNotFound')
        const update = (item: StoredItem, otherId: string): StoredItem => {
          const rest = item.excludedIds.filter((x) => x !== otherId)
          return { ...item, excludedIds: excluded ? [...rest, otherId] : rest }
        }
        await Promise.all([tx.store.put(update(a, idB)), tx.store.put(update(b, idA))])
      })
    },

    async setItemsAvailable(ids, available) {
      const unique = [...new Set(ids)]
      if (unique.length === 0) return
      const now = Date.now()
      const tx = (await db()).transaction('items', 'readwrite')
      await runInTx(tx, async () => {
        const found = await Promise.all(unique.map((id) => tx.store.get(id)))
        await Promise.all(
          found.map((item) => (item ? tx.store.put(withAvailability(item, Boolean(available), now)) : undefined)),
        )
      })
    },

    async processLaundry(today, now = Date.now()) {
      if (typeof today !== 'string' || !DATE_RE.test(today)) throw new AppError('unknown')
      const tx = (await db()).transaction(['items', 'outfits', 'settings'], 'readwrite')
      return runInTx(tx, async () => {
        const items = tx.objectStore('items')
        const outfits = tx.objectStore('outfits')
        const [storedItems, storedOutfits, storedSettings] = await Promise.all([
          items.getAll(),
          outfits.getAll(),
          tx.objectStore('settings').get(SETTINGS_KEY),
        ])
        const plan = planLaundry({
          outfits: storedOutfits,
          items: storedItems,
          settings: normalizeSettings(storedSettings),
          today,
          now,
        })
        const byId = new Map(storedItems.map((item) => [item.id, item]))
        const outfitsByKey = new Map(storedOutfits.map((saved) => [JSON.stringify([saved.childId, saved.date]), saved]))
        const writes: Array<Promise<unknown>> = []
        for (const id of plan.toWash) {
          const item = byId.get(id)
          if (item) writes.push(items.put(withAvailability(item, false, now)))
        }
        for (const id of plan.toReturn) {
          const item = byId.get(id)
          if (item) writes.push(items.put(withAvailability(item, true, now)))
        }
        for (const key of plan.processedOutfitKeys) {
          const saved = outfitsByKey.get(JSON.stringify(key))
          if (saved) writes.push(outfits.put({ ...saved, laundryProcessed: true }))
        }
        await Promise.all(writes)
        return { washed: plan.toWash.length, returned: plan.toReturn.length }
      })
    },

    async getSettings() {
      return normalizeSettings(await (await db()).get('settings', SETTINGS_KEY))
    },

    async saveSettings(settings) {
      if (!isCurrentSeason(settings.currentSeason)) throw new AppError('seasonUnknown')
      await (await db()).put('settings', normalizeSettings(settings), SETTINGS_KEY)
    },

    async listChildren() {
      const children = await (await db()).getAll('children')
      return children.sort((a, b) => a.createdAt - b.createdAt)
    },

    async addChild(input: NewChild) {
      const child = withStickers(
        withAvatar<Child>(
          {
            id: newId(),
            name: cleanChildName(input.name),
            color: cleanColor(input.color),
            sizes: cleanChildSizes(input.sizes ?? {}),
            createdAt: nextCreatedAt(),
          },
          input.avatar,
        ),
        input.stickersEnabled,
      )
      await (await db()).add('children', child)
      return { ...child, sizes: copySizes(child.sizes) }
    },

    async updateChild(id, changes) {
      // Validate first, so a failure never stores anything halfway.
      const name = changes.name !== undefined ? cleanChildName(changes.name) : undefined
      const color = changes.color !== undefined ? cleanColor(changes.color) : undefined
      const sizes = changes.sizes !== undefined ? cleanChildSizes(changes.sizes) : undefined
      // `avatar: undefined` (or null) clears the avatar; an unknown value leaves the existing one.
      const avatarValue: unknown = changes.avatar
      const clearAvatar = 'avatar' in changes && (avatarValue === undefined || avatarValue === null)
      const newAvatar = isAvatarId(avatarValue) ? avatarValue : undefined
      const tx = (await db()).transaction('children', 'readwrite')
      const updated = await runInTx(tx, async () => {
        const existing = await tx.store.get(id)
        if (!existing) throw new AppError('childNotFound')
        const next = withStickers(
          withAvatar<Child>(
            {
              id: existing.id,
              name: name ?? existing.name,
              color: color ?? existing.color,
              sizes: sizes ?? existing.sizes,
              createdAt: existing.createdAt,
            },
            clearAvatar ? undefined : (newAvatar ?? existing.avatar),
          ),
          typeof changes.stickersEnabled === 'boolean' ? changes.stickersEnabled : existing.stickersEnabled,
        )
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
      return saved ? toSavedOutfit(saved) : undefined
    },

    async saveOutfit(childId, date, outfit) {
      const tx = (await db()).transaction(['children', 'outfits'], 'readwrite')
      await runInTx(tx, async () => {
        if (!(await tx.objectStore('children').get(childId))) throw new AppError('childNotFound')
        const outfits = tx.objectStore('outfits')
        const existing = await outfits.get([childId, date])
        const next: SavedOutfit = { childId, date, outfit: normalizeOutfit(outfit) }
        // An earned sticker stays, even if the outfit changes afterwards; so does the laundry mark.
        if (isCompletedAt(existing?.completedAt)) next.completedAt = existing.completedAt
        if (existing?.laundryProcessed === true) next.laundryProcessed = true
        await outfits.put(next)
      })
    },

    async markOutfitCompleted(childId, date) {
      const tx = (await db()).transaction(['children', 'outfits'], 'readwrite')
      return runInTx(tx, async () => {
        if (!(await tx.objectStore('children').get(childId))) throw new AppError('childNotFound')
        const outfits = tx.objectStore('outfits')
        const existing = await outfits.get([childId, date])
        if (isCompletedAt(existing?.completedAt)) return false
        const next: SavedOutfit = {
          childId,
          date,
          outfit: existing ? normalizeOutfit(existing.outfit) : {},
          completedAt: Date.now(),
        }
        if (existing?.laundryProcessed === true) next.laundryProcessed = true
        await outfits.put(next)
        return true
      })
    },

    async countCompletedDays(childId) {
      const outfits = await (await db()).getAllFromIndex('outfits', 'childId', childId)
      return outfits.filter((saved) => isCompletedAt(saved.completedAt)).length
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
      if (!isStoredPin(pin)) throw new AppError('pinInvalid')
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
      const toBackupItem = (item: StoredItem): BackupItem => {
        const result: BackupItem = {
          id: item.id,
          category: item.category,
          season: item.season,
          available: item.available,
          excludedIds: [...item.excludedIds],
          createdAt: item.createdAt,
          photo: photoToDataUrl(item.photo),
        }
        if (!item.available && isTimestamp(item.washedAt)) result.washedAt = item.washedAt
        return withSize(withName(result, item.name), item.size)
      }
      const backup: BackupFile = {
        app: BACKUP_APP,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        settings: normalizeSettings(settings),
        children: children
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((child) =>
            withStickers(
              withAvatar<Child>(
                {
                  id: child.id,
                  name: child.name,
                  color: child.color,
                  sizes: copySizes(child.sizes),
                  createdAt: child.createdAt,
                },
                child.avatar,
              ),
              child.stickersEnabled,
            ),
          ),
        items: items.sort((a, b) => a.createdAt - b.createdAt).map(toBackupItem),
        outfits: outfits.map((saved) => ({ ...toSavedOutfit(saved), laundryProcessed: saved.laundryProcessed === true })),
      }
      return new Blob([JSON.stringify(backup)], { type: 'application/json' })
    },

    async importBackup(file) {
      // Read and check everything before the write transaction; on a failure everything stays unchanged.
      if (file.size > MAX_BACKUP_BYTES) {
        throw new AppError('backupTooLarge')
      }
      let text: string
      try {
        text = await blobToText(file)
      } catch {
        throw new AppError('fileReadFailed')
      }
      let json: unknown
      try {
        json = JSON.parse(text)
      } catch {
        throw invalid()
      }
      const parsed = parseBackup(json)

      // The parent PIN ('pin' store) is deliberately left untouched.
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
