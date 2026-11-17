/**
 * Foto's die via "Delen → Dress Kid" (Android, Web Share Target) binnenkomen.
 *
 * De service worker (public/share-target-sw.js) bewaart ze in een eigen kleine database, los van de
 * kledingkast. De ouderomgeving haalt ze na het ouderslot op met `takeShared` en geeft ze aan het
 * toevoegscherm. Ophalen leegt de wachtrij, zodat dezelfde foto's niet nog eens verschijnen.
 */
import { openDB } from 'idb'
import type { IDBPDatabase } from 'idb'

/** Moet gelijk blijven aan public/share-target-sw.js. */
export const SHARE_DB_NAME = 'dress-kid-share'
export const SHARE_DB_VERSION = 1
export const SHARE_STORE = 'pending'
/** Zoekparameter in de hash-URL na het delen (`#/ouder?gedeeld=1`). */
export const SHARED_FLAG = 'gedeeld'
/** Oudere delingen (ouderslot nooit geopend) worden weggegooid in plaats van later op te duiken. */
export const SHARE_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** Formaat van een record zoals de service worker het schrijft. */
export type PendingShare =
  | { kind: 'photo'; name: string; type: string; data: ArrayBuffer; sharedAt: number }
  | { kind: 'link'; url: string; sharedAt: number }

export interface SharedContent {
  files: File[]
  /** Gedeelde link (alleen als er geen foto's bij zaten), bv. de pagina van een webshop. */
  url?: string
}

export function openShareDb(dbName = SHARE_DB_NAME): Promise<IDBPDatabase> {
  return openDB(dbName, SHARE_DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(SHARE_STORE)) db.createObjectStore(SHARE_STORE, { autoIncrement: true })
    },
  })
}

function isRecent(record: PendingShare, now: number) {
  return typeof record.sharedAt === 'number' && now - record.sharedAt <= SHARE_MAX_AGE_MS && record.sharedAt <= now + 60_000
}

/** Leest en leegt de wachtrij. Geeft niets terug (zonder fout) als er niets is of IndexedDB ontbreekt. */
export async function takeShared(options: { dbName?: string; now?: number } = {}): Promise<SharedContent> {
  const empty: SharedContent = { files: [] }
  if (typeof indexedDB === 'undefined') return empty
  const now = options.now ?? Date.now()
  let db: IDBPDatabase | undefined
  try {
    db = await openShareDb(options.dbName)
    const tx = db.transaction(SHARE_STORE, 'readwrite')
    const records = (await tx.store.getAll()) as PendingShare[]
    await tx.store.clear()
    await tx.done

    const result: SharedContent = { files: [] }
    for (const record of records) {
      if (!record || !isRecent(record, now)) continue
      if (record.kind === 'photo' && record.data && record.data.byteLength > 0) {
        result.files.push(new File([record.data], record.name || 'gedeeld.jpg', { type: record.type, lastModified: record.sharedAt }))
      } else if (record.kind === 'link' && typeof record.url === 'string' && result.url === undefined) {
        result.url = record.url
      }
    }
    return result
  } catch (error) {
    console.error(error)
    return empty
  } finally {
    db?.close()
  }
}

/** Alleen de gedeelde foto's. */
export async function takeSharedPhotos(options?: { dbName?: string; now?: number }): Promise<File[]> {
  return (await takeShared(options)).files
}
