import { createIndexedDbStore } from './indexedDbStore'
import type { WardrobeStore } from './api'

export { createIndexedDbStore }
export type { WardrobeStore }

let instance: WardrobeStore | undefined

/** The app's shared storage (lazily created, a single instance). */
export function getStore(): WardrobeStore {
  instance ??= createIndexedDbStore()
  return instance
}

export { getStorageInfo, requestPersistentStorage } from './persistence'
export type { StorageInfo } from './persistence'
