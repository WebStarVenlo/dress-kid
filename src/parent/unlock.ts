/**
 * Remembers whether the parent lock has been opened, with a timestamp of the last activity.
 * This is not real security: it only keeps a young child out of the management area.
 */

export const UNLOCK_KEY = 'dress-kid-parent-unlocked'
/** After this many milliseconds without activity (or with a hidden page) the lock closes again. */
export const UNLOCK_TTL_MS = 5 * 60 * 1000

/** Fallback when sessionStorage is unusable (blocked, some private modes). */
let memoryStamp = 0

function validStamp(stamp: number, now: number): boolean {
  return Number.isFinite(stamp) && stamp > 0 && now - stamp < UNLOCK_TTL_MS && stamp <= now + 1000
}

export function isUnlocked(now = Date.now()): boolean {
  let stamp: number
  try {
    stamp = Number(sessionStorage.getItem(UNLOCK_KEY))
  } catch {
    stamp = memoryStamp
  }
  return validStamp(stamp, now)
}

/** Opens the lock and extends its validity. */
export function touchUnlock(now = Date.now()): void {
  memoryStamp = now
  try {
    sessionStorage.setItem(UNLOCK_KEY, String(now))
  } catch {
    // The in-memory value above keeps the lock open then.
  }
}

export function lock(): void {
  memoryStamp = 0
  try {
    sessionStorage.removeItem(UNLOCK_KEY)
  } catch {
    // Nothing to clear.
  }
}
