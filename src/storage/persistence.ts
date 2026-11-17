/**
 * Helpers around "persistent storage": without that permission the browser may clear the site's
 * IndexedDB when the device runs low on space. Everything is feature-detected and never throws.
 */

export interface StorageInfo {
  persisted?: boolean
  usage?: number
  quota?: number
}

function storageManager(): StorageManager | undefined {
  try {
    return typeof navigator !== 'undefined' ? (navigator.storage as StorageManager | undefined) : undefined
  } catch {
    return undefined
  }
}

/** Asks the browser to protect the storage. `undefined` if the browser does not support this or it fails. */
export async function requestPersistentStorage(): Promise<boolean | undefined> {
  try {
    const storage = storageManager()
    if (!storage || typeof storage.persist !== 'function') return undefined
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return true
    return await storage.persist()
  } catch {
    return undefined
  }
}

/** Returns the known storage figures; fields are missing if the browser does not know them. */
export async function getStorageInfo(): Promise<StorageInfo> {
  const info: StorageInfo = {}
  const storage = storageManager()
  if (!storage) return info
  try {
    if (typeof storage.persisted === 'function') info.persisted = await storage.persisted()
  } catch {
    // Unknown; the field stays absent.
  }
  try {
    if (typeof storage.estimate === 'function') {
      const { usage, quota } = await storage.estimate()
      if (typeof usage === 'number') info.usage = usage
      if (typeof quota === 'number') info.quota = quota
    }
  } catch {
    // Unknown; the fields stay absent.
  }
  return info
}
