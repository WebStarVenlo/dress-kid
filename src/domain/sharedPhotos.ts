/**
 * Photos that arrive via "Share → Dress Kid" (Android, Web Share Target).
 *
 * The service worker (public/share-target-sw.js) stores them in its own small database, separate from the
 * wardrobe. The parent area picks them up after the parent lock with `takeShared` and hands them to the
 * add screen. Taking them empties the queue, so the same photos do not appear again.
 */
import { openDB } from 'idb'
import type { IDBPDatabase } from 'idb'

/** Must stay equal to public/share-target-sw.js. */
export const SHARE_DB_NAME = 'dress-kid-share'
export const SHARE_DB_VERSION = 1
export const SHARE_STORE = 'pending'
/** Query parameter in the hash URL after sharing (`#/parent?shared=1`). */
export const SHARED_FLAG = 'shared'
/** Older shares (parent lock never opened) are discarded instead of popping up later. */
export const SHARE_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** Format of a record as the service worker writes it. */
export type PendingShare =
  | { kind: 'photo'; name: string; type: string; data: ArrayBuffer; sharedAt: number }
  | { kind: 'link'; url: string; sharedAt: number }

export interface SharedContent {
  files: File[]
  /** Shared link (only if there were no photos), e.g. a web shop page. */
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

/** Reads and empties the queue. Returns nothing (without error) if there is none or IndexedDB is missing. */
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
        result.files.push(new File([record.data], record.name || 'shared.jpg', { type: record.type, lastModified: record.sharedAt }))
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

/** Only the shared photos. */
export async function takeSharedPhotos(options?: { dbName?: string; now?: number }): Promise<File[]> {
  return (await takeShared(options)).files
}
