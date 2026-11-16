import { afterEach, vi } from 'vitest'
import { getStorageInfo, requestPersistentStorage } from './persistence'

function mockStorage(storage: unknown) {
  vi.stubGlobal('navigator', { ...navigator, storage })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestPersistentStorage', () => {
  it('geeft undefined zonder StorageManager', async () => {
    mockStorage(undefined)
    expect(await requestPersistentStorage()).toBeUndefined()
  })

  it('geeft undefined zonder persist()', async () => {
    mockStorage({})
    expect(await requestPersistentStorage()).toBeUndefined()
  })

  it('vraagt persist() als het nog niet is toegekend', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    mockStorage({ persist, persisted: vi.fn().mockResolvedValue(false) })
    expect(await requestPersistentStorage()).toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('geeft false als de browser weigert', async () => {
    mockStorage({ persist: vi.fn().mockResolvedValue(false) })
    expect(await requestPersistentStorage()).toBe(false)
  })

  it('slaat persist() over als de opslag al beschermd is', async () => {
    const persist = vi.fn()
    mockStorage({ persist, persisted: vi.fn().mockResolvedValue(true) })
    expect(await requestPersistentStorage()).toBe(true)
    expect(persist).not.toHaveBeenCalled()
  })

  it('gooit nooit', async () => {
    mockStorage({ persist: vi.fn().mockRejectedValue(new Error('nee')) })
    expect(await requestPersistentStorage()).toBeUndefined()
  })
})

describe('getStorageInfo', () => {
  it('geeft een leeg object zonder StorageManager', async () => {
    mockStorage(undefined)
    expect(await getStorageInfo()).toEqual({})
  })

  it('combineert persisted en estimate', async () => {
    mockStorage({
      persisted: vi.fn().mockResolvedValue(true),
      estimate: vi.fn().mockResolvedValue({ usage: 1234, quota: 99999 }),
    })
    expect(await getStorageInfo()).toEqual({ persisted: true, usage: 1234, quota: 99999 })
  })

  it('geeft deelresultaten als een deel mislukt', async () => {
    mockStorage({
      persisted: vi.fn().mockRejectedValue(new Error('x')),
      estimate: vi.fn().mockResolvedValue({ usage: 5 }),
    })
    expect(await getStorageInfo()).toEqual({ usage: 5 })
  })
})
