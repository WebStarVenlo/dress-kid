/**
 * Bewaart of het ouderslot is geopend, met een tijdstempel van de laatste activiteit.
 * Dit is geen echte beveiliging: het houdt alleen een jong kind uit de beheeromgeving.
 */

export const UNLOCK_KEY = 'dress-kid-parent-unlocked'
/** Na zoveel milliseconden zonder activiteit (of met een verborgen pagina) valt het slot weer dicht. */
export const UNLOCK_TTL_MS = 5 * 60 * 1000

export function isUnlocked(now = Date.now()): boolean {
  try {
    const stamp = Number(sessionStorage.getItem(UNLOCK_KEY))
    return Number.isFinite(stamp) && stamp > 0 && now - stamp < UNLOCK_TTL_MS && stamp <= now + 1000
  } catch {
    return false
  }
}

/** Zet het slot open en verlengt de geldigheid. */
export function touchUnlock(now = Date.now()): void {
  try {
    sessionStorage.setItem(UNLOCK_KEY, String(now))
  } catch {
    // Zonder sessionStorage moet de ouder opnieuw de som maken; geen probleem.
  }
}

export function lock(): void {
  try {
    sessionStorage.removeItem(UNLOCK_KEY)
  } catch {
    // Niets te wissen.
  }
}
