import type { StoredPin } from '../domain/types'

/**
 * Ouder-PIN: we bewaren nooit de PIN zelf, alleen een PBKDF2-SHA-256-afleiding met een willekeurige salt.
 * Met 4 cijfers is dit geen sterke beveiliging (10.000 mogelijkheden), maar het houdt een kind buiten
 * en voorkomt dat de PIN leesbaar in de opslag staat.
 */

/** Standaard aantal PBKDF2-iteraties (OWASP-advies voor SHA-256 is 210.000 of meer). */
export const PIN_ITERATIONS = 210_000
const SALT_BYTES = 16
const KEY_BITS = 256

/** Na zoveel verkeerde pogingen volgt een wachttijd. */
export const MAX_PIN_ATTEMPTS = 5
export const PIN_COOLDOWN_MS = 30_000

export const INVALID_PIN_FORMAT = 'Een pincode bestaat uit precies 4 cijfers.'

export function isValidPinFormat(pin: string): boolean {
  return /^[0-9]{4}$/.test(pin)
}

function toBase64(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text)
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, KEY_BITS)
  return new Uint8Array(bits)
}

/** Maakt een op te slaan afleiding van de PIN. Gooit bij een PIN die geen 4 cijfers is. */
export async function hashPin(
  pin: string,
  salt: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(SALT_BYTES)),
  iterations: number = PIN_ITERATIONS,
): Promise<StoredPin> {
  if (!isValidPinFormat(pin)) throw new Error(INVALID_PIN_FORMAT)
  if (!Number.isSafeInteger(iterations) || iterations <= 0) throw new Error('Ongeldig aantal iteraties.')
  const hash = await derive(pin, salt, iterations)
  return { salt: toBase64(salt), hash: toBase64(hash), iterations }
}

/** Vergelijkt zonder vroegtijdig te stoppen, zodat de duur niet verraadt hoeveel bytes overeenkomen. */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

/** Controleert een ingevoerde PIN tegen de opgeslagen afleiding. Een beschadigde opslag geeft false. */
export async function verifyPin(pin: string, stored: StoredPin): Promise<boolean> {
  if (!isValidPinFormat(pin)) return false
  let salt: Uint8Array<ArrayBuffer>
  let expected: Uint8Array
  try {
    salt = fromBase64(stored.salt)
    expected = fromBase64(stored.hash)
  } catch {
    return false
  }
  if (!Number.isSafeInteger(stored.iterations) || stored.iterations <= 0 || expected.length === 0) return false
  const actual = await derive(pin, salt, stored.iterations)
  return equalBytes(actual, expected)
}

// ---------------------------------------------------------------------------
// Pogingen tellen (alleen in het geheugen: overleeft wisselen van scherm, niet herladen)

let failedAttempts = 0
let blockedUntil = 0

/** Resterende wachttijd in milliseconden (0 als er weer geprobeerd mag worden). */
export function pinCooldownRemaining(now = Date.now()): number {
  return Math.max(0, blockedUntil - now)
}

/** Telt een verkeerde poging; geeft de wachttijd terug die daardoor eventueel ingaat. */
export function registerFailedPinAttempt(now = Date.now()): number {
  failedAttempts += 1
  if (failedAttempts >= MAX_PIN_ATTEMPTS) {
    failedAttempts = 0
    blockedUntil = now + PIN_COOLDOWN_MS
  }
  return pinCooldownRemaining(now)
}

export function resetPinAttempts(): void {
  failedAttempts = 0
  blockedUntil = 0
}
