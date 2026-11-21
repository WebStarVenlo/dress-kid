import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { DEFAULT_SETTINGS } from '../domain/types'
import type { ClothingItem, Settings } from '../domain/types'
import type { WardrobeStore } from '../storage'
import { todayKey } from '../domain/compat'
import { ensureLaundryProcessed, resetLaundryRun, usePhotoUrl, useWardrobe } from './hooks'

function makeItem(id: string): ClothingItem {
  return {
    id,
    category: 'top',
    season: 'all',
    available: true,
    excludedIds: [],
    photo: new Blob([id], { type: 'image/jpeg' }),
    createdAt: 1,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function fakeStore(
  listItems: () => Promise<ClothingItem[]>,
  getSettings: () => Promise<Settings> = () => Promise.resolve({ ...DEFAULT_SETTINGS, currentSeason: 'summer', soundEnabled: true }),
): WardrobeStore {
  const notUsed = () => Promise.reject(new Error('niet gebruikt'))
  return {
    listItems: vi.fn(listItems),
    getSettings: vi.fn(getSettings),
    getItem: notUsed,
    addItem: notUsed,
    updateItem: notUsed,
    deleteItem: notUsed,
    setExcluded: notUsed,
    setItemsAvailable: notUsed,
    processLaundry: vi.fn(() => Promise.resolve({ washed: 0, returned: 0 })),
    saveSettings: notUsed,
    listChildren: notUsed,
    addChild: notUsed,
    updateChild: notUsed,
    deleteChild: notUsed,
    getOutfit: notUsed,
    saveOutfit: notUsed,
    markOutfitCompleted: notUsed,
    countCompletedDays: notUsed,
    getParentPin: notUsed,
    setParentPin: notUsed,
    exportBackup: notUsed,
    importBackup: notUsed,
  }
}

describe('useWardrobe', () => {
  it('laadt items en instellingen bij het mounten', async () => {
    const items = [makeItem('a')]
    const store = fakeStore(() => Promise.resolve(items))
    const { result } = renderHook(() => useWardrobe(store))

    expect(result.current.loading).toBe(true)
    expect(result.current.items).toEqual([])
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toBe(items)
    expect(result.current.settings).toEqual({ ...DEFAULT_SETTINGS, currentSeason: 'summer', soundEnabled: true })
    expect(result.current.error).toBeUndefined()
  })

  it('reload haalt opnieuw op', async () => {
    let current = [makeItem('a')]
    const store = fakeStore(() => Promise.resolve(current))
    const { result } = renderHook(() => useWardrobe(store))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const reload = result.current.reload

    current = [makeItem('a'), makeItem('b')]
    await act(() => result.current.reload())
    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(result.current.reload).toBe(reload)
  })

  it('zet een foutmelding en wist die na een gelukte reload', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let fail = true
    const store = fakeStore(() => (fail ? Promise.reject(new Error('kapot')) : Promise.resolve([makeItem('a')])))
    const { result } = renderHook(() => useWardrobe(store))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toMatch(/kon niet worden geladen/)
    expect(result.current.items).toEqual([])

    fail = false
    await act(() => result.current.reload())
    expect(result.current.error).toBeUndefined()
    expect(result.current.items).toHaveLength(1)
    consoleSpy.mockRestore()
  })

  it('negeert resultaten na unmount', async () => {
    const pending = deferred<ClothingItem[]>()
    const store = fakeStore(() => pending.promise)
    const consoleSpy = vi.spyOn(console, 'error')
    const { result, unmount } = renderHook(() => useWardrobe(store))
    unmount()
    await act(async () => {
      pending.resolve([makeItem('a')])
      await pending.promise
    })
    expect(result.current.loading).toBe(true)
    expect(consoleSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('een ouder, trager antwoord overschrijft geen nieuwer antwoord', async () => {
    const first = deferred<ClothingItem[]>()
    const second = deferred<ClothingItem[]>()
    const queue = [first, second]
    const store = fakeStore(() => queue.shift()!.promise)
    const { result } = renderHook(() => useWardrobe(store))

    let reloading!: Promise<void>
    act(() => {
      reloading = result.current.reload()
    })
    await act(async () => {
      second.resolve([makeItem('nieuw')])
      await reloading
    })
    await act(async () => {
      first.resolve([makeItem('oud')])
      await first.promise
    })
    expect(result.current.items.map((i) => i.id)).toEqual(['nieuw'])
  })

  it('werkt in StrictMode', async () => {
    const store = fakeStore(() => Promise.resolve([makeItem('a')]))
    const { result } = renderHook(() => useWardrobe(store), { wrapper: StrictMode })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toHaveLength(1)
  })
})

describe('wasronde bij het laden', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('useWardrobe draait eerst processLaundry voor vandaag en laadt daarna', async () => {
    const order: string[] = []
    const store = fakeStore(() => {
      order.push('listItems')
      return Promise.resolve([makeItem('a')])
    })
    store.processLaundry = vi.fn((day: string) => {
      order.push(`processLaundry:${day}`)
      return Promise.resolve({ washed: 1, returned: 0 })
    })
    const first = renderHook(() => useWardrobe(store))
    const second = renderHook(() => useWardrobe(store))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    await act(() => first.result.current.reload())
    // Once per store and day, also with several users and reloads.
    expect(store.processLaundry).toHaveBeenCalledTimes(1)
    expect(order[0]).toBe(`processLaundry:${todayKey()}`)
    expect(order.slice(1)).toEqual(['listItems', 'listItems', 'listItems'])
  })

  it('een mislukte wasronde houdt het laden niet tegen en wordt later opnieuw geprobeerd', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const items = [makeItem('a')]
    const store = fakeStore(() => Promise.resolve(items))
    store.processLaundry = vi.fn(() => Promise.reject(new Error('stuk')))
    const { result } = renderHook(() => useWardrobe(store))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toBe(items)
    expect(result.current.error).toBeUndefined()
    expect(console.error).toHaveBeenCalled()
    await act(() => result.current.reload())
    expect(store.processLaundry).toHaveBeenCalledTimes(2)
  })

  it('ensureLaundryProcessed draait opnieuw voor een nieuwe dag', async () => {
    const store = fakeStore(() => Promise.resolve([]))
    await ensureLaundryProcessed(store, '2026-03-10')
    await ensureLaundryProcessed(store, '2026-03-10')
    await ensureLaundryProcessed(store, '2026-03-11')
    expect(store.processLaundry).toHaveBeenCalledTimes(2)
    expect(store.processLaundry).toHaveBeenLastCalledWith('2026-03-11')
  })

  it('resetLaundryRun laat de run van dezelfde dag opnieuw draaien', async () => {
    const store = fakeStore(() => Promise.resolve([]))
    await ensureLaundryProcessed(store, '2026-03-10')
    resetLaundryRun(store)
    await ensureLaundryProcessed(store, '2026-03-10')
    expect(store.processLaundry).toHaveBeenCalledTimes(2)
  })
})

describe('usePhotoUrl', () => {
  let counter = 0
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL
  beforeEach(() => {
    vi.useFakeTimers()
    counter = 0
    URL.createObjectURL = vi.fn(() => `blob:test-${++counter}`)
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => {
    vi.useRealTimers()
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
  })

  it('geeft undefined zonder foto', () => {
    const { result } = renderHook(() => usePhotoUrl(undefined))
    expect(result.current).toBeUndefined()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('maakt een URL en trekt die in bij wisselen en unmounten', () => {
    const a = new Blob(['a'])
    const b = new Blob(['b'])
    const { result, rerender, unmount } = renderHook(({ photo }) => usePhotoUrl(photo), {
      initialProps: { photo: a as Blob | undefined },
    })
    expect(result.current).toBe('blob:test-1')

    rerender({ photo: b })
    expect(result.current).toBe('blob:test-2')
    act(() => vi.runOnlyPendingTimers())
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-1')
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:test-2')

    rerender({ photo: undefined })
    expect(result.current).toBeUndefined()
    act(() => vi.runOnlyPendingTimers())
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-2')

    unmount()
  })

  it('trekt de URL in bij unmount', () => {
    const a = new Blob(['a'])
    const { unmount } = renderHook(() => usePhotoUrl(a))
    unmount()
    act(() => vi.runOnlyPendingTimers())
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-1')
  })

  it('deelt de URL tussen componenten en houdt hem geldig zolang er één gemount is', () => {
    const photo = new Blob(['gedeeld'])
    function Img() {
      const url = usePhotoUrl(photo)
      return <img alt="foto" src={url} />
    }
    const first = render(<Img />)
    const second = render(<Img />)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)

    first.unmount()
    act(() => vi.runOnlyPendingTimers())
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:test-1')

    second.unmount()
    act(() => vi.runOnlyPendingTimers())
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-1')
  })

  it('blijft geldig in StrictMode (mount → cleanup → mount)', () => {
    const photo = new Blob(['strict'])
    const { result, unmount } = renderHook(() => usePhotoUrl(photo), { wrapper: StrictMode })
    act(() => vi.runOnlyPendingTimers())
    expect(result.current).toBe('blob:test-1')
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    unmount()
    act(() => vi.runOnlyPendingTimers())
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-1')
  })
})
