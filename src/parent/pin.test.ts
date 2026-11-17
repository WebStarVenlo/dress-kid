import { afterEach } from 'vitest'
import {
  MAX_PIN_ATTEMPTS,
  PIN_COOLDOWN_MS,
  PIN_ITERATIONS,
  hashPin,
  isValidPinFormat,
  pinCooldownRemaining,
  registerFailedPinAttempt,
  resetPinAttempts,
  verifyPin,
} from './pin'

// Few iterations keep the tests fast; the default is checked separately.
const FAST = 1000

afterEach(() => resetPinAttempts())

describe('isValidPinFormat', () => {
  it('accepteert alleen precies 4 cijfers', () => {
    expect(isValidPinFormat('0000')).toBe(true)
    expect(isValidPinFormat('1234')).toBe(true)
    for (const pin of ['', '123', '12345', '12a4', ' 123', '1234 ', '١٢٣٤', '12.4']) {
      expect(isValidPinFormat(pin)).toBe(false)
    }
  })
})

describe('hashPin en verifyPin', () => {
  it('bewaart de PIN niet leesbaar en controleert hem', async () => {
    const stored = await hashPin('4321', undefined, FAST)
    expect(stored.iterations).toBe(FAST)
    expect(stored.hash).not.toContain('4321')
    expect(atob(stored.salt)).toHaveLength(16)
    expect(atob(stored.hash)).toHaveLength(32)
    expect(await verifyPin('4321', stored)).toBe(true)
    expect(await verifyPin('4322', stored)).toBe(false)
    expect(await verifyPin('432', stored)).toBe(false)
  })

  it('gebruikt standaard een willekeurige salt en veel iteraties', async () => {
    const a = await hashPin('1111')
    const b = await hashPin('1111')
    expect(a.iterations).toBe(PIN_ITERATIONS)
    expect(PIN_ITERATIONS).toBeGreaterThanOrEqual(210_000)
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
    expect(await verifyPin('1111', b)).toBe(true)
  })

  it('geeft met dezelfde salt en iteraties dezelfde uitkomst', async () => {
    const salt = new Uint8Array(16).fill(7)
    const a = await hashPin('2468', salt, FAST)
    const b = await hashPin('2468', new Uint8Array(16).fill(7), FAST)
    expect(a).toEqual(b)
    expect((await hashPin('2468', salt, FAST + 1)).hash).not.toBe(a.hash)
  })

  it('weigert een ongeldige PIN', async () => {
    await expect(hashPin('12345', undefined, FAST)).rejects.toThrow('precies 4 cijfers')
    await expect(hashPin('1234', undefined, 0)).rejects.toThrow()
  })

  it('geeft false bij een beschadigde opgeslagen PIN', async () => {
    const stored = await hashPin('1234', undefined, FAST)
    expect(await verifyPin('1234', { ...stored, hash: '%%%' })).toBe(false)
    expect(await verifyPin('1234', { ...stored, salt: '***' })).toBe(false)
    expect(await verifyPin('1234', { ...stored, hash: '' })).toBe(false)
    expect(await verifyPin('1234', { ...stored, iterations: -1 })).toBe(false)
    expect(await verifyPin('1234', { ...stored, hash: stored.hash.slice(0, 8) })).toBe(false)
  })
})

describe('pogingen', () => {
  it('start een wachttijd na te veel verkeerde pogingen', () => {
    const now = 1_000_000
    for (let i = 1; i < MAX_PIN_ATTEMPTS; i++) expect(registerFailedPinAttempt(now)).toBe(0)
    expect(registerFailedPinAttempt(now)).toBe(PIN_COOLDOWN_MS)
    expect(pinCooldownRemaining(now + 10_000)).toBe(PIN_COOLDOWN_MS - 10_000)
    expect(pinCooldownRemaining(now + PIN_COOLDOWN_MS)).toBe(0)
    // After that, counting starts over.
    expect(registerFailedPinAttempt(now + PIN_COOLDOWN_MS)).toBe(0)
  })

  it('wist de teller bij een reset', () => {
    for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) registerFailedPinAttempt(5)
    expect(pinCooldownRemaining(5)).toBeGreaterThan(0)
    resetPinAttempts()
    expect(pinCooldownRemaining(5)).toBe(0)
  })
})
