/**
 * Hulpfuncties rond "persistente opslag": zonder die toestemming mag de browser de IndexedDB
 * van de site opruimen als het apparaat vol raakt. Alles is feature-detected en gooit nooit.
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

/** Vraagt de browser de opslag te beschermen. `undefined` als de browser dit niet ondersteunt of het mislukt. */
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

/** Geeft de bekende gegevens over de opslag; velden ontbreken als de browser ze niet kent. */
export async function getStorageInfo(): Promise<StorageInfo> {
  const info: StorageInfo = {}
  const storage = storageManager()
  if (!storage) return info
  try {
    if (typeof storage.persisted === 'function') info.persisted = await storage.persisted()
  } catch {
    // Onbekend; veld blijft weg.
  }
  try {
    if (typeof storage.estimate === 'function') {
      const { usage, quota } = await storage.estimate()
      if (typeof usage === 'number') info.usage = usage
      if (typeof quota === 'number') info.quota = quota
    }
  } catch {
    // Onbekend; velden blijven weg.
  }
  return info
}
