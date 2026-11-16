import { createIndexedDbStore } from './indexedDbStore'
import type { WardrobeStore } from './api'

export { createIndexedDbStore }
export type { WardrobeStore }

let instance: WardrobeStore | undefined

/** De gedeelde opslag van de app (lui aangemaakt, één instantie). */
export function getStore(): WardrobeStore {
  instance ??= createIndexedDbStore()
  return instance
}
