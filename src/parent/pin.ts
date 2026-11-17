import type { StoredPin } from '../domain/types'
import { AppError, translateError } from '../i18n/AppError'

/**
 * Parent PIN: we never store the PIN itself, only a PBKDF2-SHA-256 derivation with a random salt.
 * With 4 digits this is not strong security (10,000 possibilities), but it keeps a child out
 * and prevents the PIN from being readable in storage.
 */

/** Default number of PBKDF2 iterations (OWASP advice for SHA-256 is 210,000 or more). */
export const PIN_ITERATIONS = 210_000
const SALT_BYTES = 16
const KEY_BITS = 256

/** After this many wrong attempts a cooldown follows. */
export const MAX_PIN_ATTEMPTS = 5
export const PIN_COOLDOWN_MS = 30_000

/** Translated message for a PIN that is not exactly 4 digits. */
export function invalidPinFormatMessage(): string {
  return translateError(new AppError('pinInvalidFormat'))
}

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

/** Creates a derivation of the PIN to store. Throws for a PIN that is not 4 digits. */
export async function hashPin(
  pin: string,
  salt: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(SALT_BYTES)),
  iterations: number = PIN_ITERATIONS,
): Promise<StoredPin> {
  if (!isValidPinFormat(pin)) throw new AppError('pinInvalidFormat')
  if (!Number.isSafeInteger(iterations) || iterations <= 0) throw new AppError('pinInvalidIterations')
  const hash = await derive(pin, salt, iterations)
  return { salt: toBase64(salt), hash: toBase64(hash), iterations }
}

/** Compares without stopping early, so the duration does not reveal how many bytes match. */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length
  const length = Math.max(a.length, b.length)
  for (let i = 0; i < length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

/** Checks an entered PIN against the stored derivation. Corrupt storage yields false. */
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
// Counting attempts (in memory only: survives switching screens, not a reload)

/*
 * The counter and the cooldown live only in this page's memory and start over after the page is
 * reloaded. That is acceptable: this is a child lock, not real security.
 */
let failedAttempts = 0
let blockedUntil = 0

/** Remaining cooldown in milliseconds (0 when trying again is allowed). */
export function pinCooldownRemaining(now = Date.now()): number {
  return Math.max(0, blockedUntil - now)
}

/** Counts a wrong attempt; returns the cooldown that starts as a result, if any. */
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
