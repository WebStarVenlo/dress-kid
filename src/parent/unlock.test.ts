import { UNLOCK_TTL_MS, isUnlocked, lock, touchUnlock } from './unlock'

describe('unlock zonder bruikbare sessionStorage', () => {
  beforeEach(() => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('geblokkeerd', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('geblokkeerd', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('geblokkeerd', 'SecurityError')
    })
    lock()
  })

  afterEach(() => {
    lock()
    vi.restoreAllMocks()
  })

  it('blijft ontgrendeld na activiteit en verloopt daarna weer', () => {
    const t0 = 1_000_000
    expect(isUnlocked(t0)).toBe(false)
    touchUnlock(t0)
    expect(isUnlocked(t0 + 1000)).toBe(true)
    touchUnlock(t0 + 60_000)
    expect(isUnlocked(t0 + 60_000 + UNLOCK_TTL_MS - 1)).toBe(true)
    expect(isUnlocked(t0 + 60_000 + UNLOCK_TTL_MS + 1)).toBe(false)
  })

  it('lock() sluit het slot weer', () => {
    touchUnlock(Date.now())
    expect(isUnlocked()).toBe(true)
    lock()
    expect(isUnlocked()).toBe(false)
  })
})
