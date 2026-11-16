/**
 * Bewaart of het ouderslot is geopend, met een tijdstempel van de laatste activiteit.
 * Dit is geen echte beveiliging: het houdt alleen een jong kind uit de beheeromgeving.
 */

export const UNLOCK_KEY = 'dress-kid-parent-unlocked'
/** Na zoveel milliseconden zonder activiteit (of met een verborgen pagina) valt het slot weer dicht. */
export const UNLOCK_TTL_MS = 5 * 60 * 1000

/** Terugval als sessionStorage niet bruikbaar is (geblokkeerd, sommige privémodi). */
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

/** Zet het slot open en verlengt de geldigheid. */
export function touchUnlock(now = Date.now()): void {
  memoryStamp = now
  try {
    sessionStorage.setItem(UNLOCK_KEY, String(now))
  } catch {
    // De geheugenwaarde hierboven houdt het slot dan open.
  }
}

export function lock(): void {
  memoryStamp = 0
  try {
    sessionStorage.removeItem(UNLOCK_KEY)
  } catch {
    // Niets te wissen.
  }
}
