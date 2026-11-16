import { DEFAULT_SETTINGS } from '../domain/types'
import type { ClothingItem, NewClothingItem } from '../domain/types'
import type { WardrobeStore } from './api'
import { createIndexedDbStore } from './indexedDbStore'
import { createIndexedDbStore as reexported, getStore } from './index'

let dbCounter = 0
function freshStore(): WardrobeStore {
  dbCounter += 1
  return createIndexedDbStore(`dress-kid-test-${dbCounter}-${Math.random().toString(36).slice(2)}`)
}

function photo(bytes: number[] = [1, 2, 3, 250], type = 'image/jpeg'): Blob {
  return new Blob([new Uint8Array(bytes)], { type })
}

async function bytesOf(blob: Blob): Promise<number[]> {
  return Array.from(new Uint8Array(await blob.arrayBuffer()))
}

function newItem(overrides: Partial<NewClothingItem> = {}): NewClothingItem {
  return { category: 'top', season: 'all', photo: photo(), ...overrides }
}

async function backupJson(store: WardrobeStore): Promise<Record<string, unknown>> {
  return JSON.parse(await (await store.exportBackup()).text()) as Record<string, unknown>
}

function jsonBlob(value: unknown): Blob {
  return new Blob([JSON.stringify(value)], { type: 'application/json' })
}

const PNG_DATA_URL = 'data:image/png;base64,AQID'

function validBackup(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    app: 'dress-kid',
    version: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    settings: { currentSeason: 'summer' },
    items: [
      { id: 'a', category: 'top', season: 'all', available: true, excludedIds: [], createdAt: 1, photo: PNG_DATA_URL },
    ],
    outfits: [],
    ...overrides,
  }
}

describe('storage/index', () => {
  it('getStore geeft steeds dezelfde instantie', () => {
    expect(getStore()).toBe(getStore())
    expect(reexported).toBe(createIndexedDbStore)
  })
})

describe('createIndexedDbStore: kledingstukken', () => {
  it('voegt toe, leest en sorteert op createdAt', async () => {
    const store = freshStore()
    const a = await store.addItem(newItem({ name: '  Rood shirt  ' }))
    const b = await store.addItem(newItem({ category: 'bottom', season: 'winter', name: '   ' }))

    expect(a).toMatchObject({ category: 'top', season: 'all', available: true, excludedIds: [], name: 'Rood shirt' })
    expect(typeof a.id).toBe('string')
    expect(a.id).not.toBe(b.id)
    expect(b).not.toHaveProperty('name')
    expect(b.createdAt).toBeGreaterThan(a.createdAt)

    const list = await store.listItems()
    expect(list.map((i) => i.id)).toEqual([a.id, b.id])

    const fetched = await store.getItem(a.id)
    expect(fetched?.photo).toBeInstanceOf(Blob)
    expect(fetched?.photo.type).toBe('image/jpeg')
    expect(await bytesOf(fetched!.photo)).toEqual([1, 2, 3, 250])
    expect(await store.getItem('bestaat-niet')).toBeUndefined()
  })

  it('updateItem wijzigt alleen toegestane velden', async () => {
    const store = freshStore()
    const a = await store.addItem(newItem({ name: 'Oud' }))
    const b = await store.addItem(newItem({ category: 'bottom' }))
    await store.setExcluded(a.id, b.id, true)

    const updated = await store.updateItem(a.id, {
      category: 'sweater',
      season: 'winter',
      available: false,
      name: 'Nieuw',
      photo: photo([9, 8, 7], 'image/png'),
      // Pogingen om vaste velden te wijzigen worden genegeerd.
      ...({ id: 'hack', excludedIds: [], createdAt: 0 } as object),
    })
    expect(updated).toMatchObject({
      id: a.id,
      category: 'sweater',
      season: 'winter',
      available: false,
      name: 'Nieuw',
      excludedIds: [b.id],
      createdAt: a.createdAt,
    })
    const fetched = await store.getItem(a.id)
    expect(fetched?.photo.type).toBe('image/png')
    expect(await bytesOf(fetched!.photo)).toEqual([9, 8, 7])
    expect(await store.getItem('hack')).toBeUndefined()

    const cleared = await store.updateItem(a.id, { name: undefined })
    expect(cleared).not.toHaveProperty('name')
    const untouched = await store.updateItem(a.id, { available: true })
    expect(untouched.category).toBe('sweater')
  })

  it('updateItem gooit als het kledingstuk niet bestaat', async () => {
    const store = freshStore()
    await expect(store.updateItem('weg', { name: 'x' })).rejects.toThrow(/bestaat niet/)
  })
})

describe('createIndexedDbStore: uitsluitingen', () => {
  it('setExcluded werkt aan beide kanten en is idempotent', async () => {
    const store = freshStore()
    const a = await store.addItem(newItem())
    const b = await store.addItem(newItem({ category: 'bottom' }))
    const c = await store.addItem(newItem({ category: 'top' }))

    await store.setExcluded(a.id, b.id, true)
    await store.setExcluded(b.id, a.id, true)
    await store.setExcluded(a.id, c.id, true) // zelfde categorie: zinloos maar toegestaan
    expect((await store.getItem(a.id))?.excludedIds).toEqual([b.id, c.id])
    expect((await store.getItem(b.id))?.excludedIds).toEqual([a.id])
    expect((await store.getItem(c.id))?.excludedIds).toEqual([a.id])

    await store.setExcluded(b.id, a.id, false)
    expect((await store.getItem(a.id))?.excludedIds).toEqual([c.id])
    expect((await store.getItem(b.id))?.excludedIds).toEqual([])
  })

  it('negeert een uitsluiting met zichzelf', async () => {
    const store = freshStore()
    const a = await store.addItem(newItem())
    await store.setExcluded(a.id, a.id, true)
    expect((await store.getItem(a.id))?.excludedIds).toEqual([])
  })

  it('gooit als een van beide niet bestaat en wijzigt dan niets', async () => {
    const store = freshStore()
    const a = await store.addItem(newItem())
    await expect(store.setExcluded(a.id, 'weg', true)).rejects.toThrow(/bestaat niet/)
    await expect(store.setExcluded('weg', a.id, true)).rejects.toThrow(/bestaat niet/)
    expect((await store.getItem(a.id))?.excludedIds).toEqual([])
  })
})

describe('createIndexedDbStore: verwijderen', () => {
  it('verwijdert het item en alle verwijzingen in uitsluitingen en outfits', async () => {
    const store = freshStore()
    const a = await store.addItem(newItem())
    const b = await store.addItem(newItem({ category: 'bottom' }))
    const c = await store.addItem(newItem({ category: 'shoes' }))
    await store.setExcluded(a.id, b.id, true)
    await store.setExcluded(c.id, b.id, true)
    await store.setExcluded(a.id, c.id, true)
    await store.saveOutfit('2026-01-01', { top: a.id, bottom: b.id, shoes: c.id })
    await store.saveOutfit('2026-01-02', { bottom: b.id })
    await store.saveOutfit('2026-01-03', { top: a.id })

    await store.deleteItem(b.id)

    expect(await store.getItem(b.id)).toBeUndefined()
    expect((await store.getItem(a.id))?.excludedIds).toEqual([c.id])
    expect((await store.getItem(c.id))?.excludedIds).toEqual([a.id])
    expect(await store.getOutfit('2026-01-01')).toEqual({ date: '2026-01-01', outfit: { top: a.id, shoes: c.id } })
    expect(await store.getOutfit('2026-01-02')).toEqual({ date: '2026-01-02', outfit: {} })
    expect(await store.getOutfit('2026-01-03')).toEqual({ date: '2026-01-03', outfit: { top: a.id } })
  })

  it('verwijderen van een onbekend id doet niets', async () => {
    const store = freshStore()
    const a = await store.addItem(newItem())
    await store.deleteItem('weg')
    expect(await store.listItems()).toHaveLength(1)
    expect((await store.getItem(a.id))?.id).toBe(a.id)
  })
})

describe('createIndexedDbStore: instellingen en outfits', () => {
  it('geeft standaardinstellingen als er niets is opgeslagen', async () => {
    const store = freshStore()
    expect(await store.getSettings()).toEqual(DEFAULT_SETTINGS)
    await store.saveSettings({ currentSeason: 'winter' })
    expect(await store.getSettings()).toEqual({ currentSeason: 'winter' })
  })

  it('slaat outfits per datum op en overschrijft ze', async () => {
    const store = freshStore()
    expect(await store.getOutfit('2026-03-01')).toBeUndefined()
    await store.saveOutfit('2026-03-01', { top: 'x', bottom: 'y' })
    await store.saveOutfit('2026-03-01', { dress: 'z' })
    expect(await store.getOutfit('2026-03-01')).toEqual({ date: '2026-03-01', outfit: { dress: 'z' } })
  })

  it('verschillende databases zijn gescheiden', async () => {
    const one = freshStore()
    const two = freshStore()
    await one.addItem(newItem())
    expect(await two.listItems()).toEqual([])
  })
})

describe('createIndexedDbStore: back-up', () => {
  it('exporteert JSON met foto’s als data-URL', async () => {
    const store = freshStore()
    const a = await store.addItem(newItem({ name: 'Shirt', photo: photo([255, 0, 128]) }))
    const blob = await store.exportBackup()
    expect(blob.type).toBe('application/json')
    const json = await backupJson(store)
    expect(json).toMatchObject({ app: 'dress-kid', version: 1, settings: DEFAULT_SETTINGS, outfits: [] })
    expect(typeof json.exportedAt).toBe('string')
    expect(json.items).toEqual([
      {
        id: a.id,
        category: 'top',
        name: 'Shirt',
        season: 'all',
        available: true,
        excludedIds: [],
        createdAt: a.createdAt,
        photo: 'data:image/jpeg;base64,/wCA',
      },
    ])
  })

  it('round-trip: export en import in een andere database geven dezelfde data', async () => {
    const source = freshStore()
    const bigPhoto = Array.from({ length: 70_000 }, (_, i) => (i * 7) % 256)
    const a = await source.addItem(newItem({ name: 'Shirt', photo: photo(bigPhoto, 'image/webp') }))
    const b = await source.addItem(newItem({ category: 'bottom', season: 'winter' }))
    await source.updateItem(b.id, { available: false })
    await source.setExcluded(a.id, b.id, true)
    await source.saveSettings({ currentSeason: 'winter' })
    await source.saveOutfit('2026-02-02', { top: a.id, bottom: b.id })

    const target = freshStore()
    await target.addItem(newItem({ name: 'wordt vervangen' }))
    await target.saveOutfit('2025-12-31', { top: 'oud' })
    await target.importBackup(await source.exportBackup())

    const items = await target.listItems()
    const withoutPhoto = (list: ClothingItem[]) => list.map((i) => ({ ...i, photo: undefined }))
    expect(withoutPhoto(items)).toEqual(withoutPhoto(await source.listItems()))
    expect(items[0]?.photo.type).toBe('image/webp')
    expect(await bytesOf(items[0]!.photo)).toEqual(bigPhoto)
    expect(await target.getSettings()).toEqual({ currentSeason: 'winter' })
    expect(await target.getOutfit('2026-02-02')).toEqual({ date: '2026-02-02', outfit: { top: a.id, bottom: b.id } })
    expect(await target.getOutfit('2025-12-31')).toBeUndefined()

    // Nieuwe items na een import komen achteraan.
    const c = await target.addItem(newItem())
    expect((await target.listItems()).at(-1)?.id).toBe(c.id)
  })

  it('werkt ook als Blob geen text()/arrayBuffer() heeft (FileReader-fallback)', async () => {
    const stripped = <T extends Blob>(blob: T): T => {
      Object.defineProperty(blob, 'text', { value: undefined })
      Object.defineProperty(blob, 'arrayBuffer', { value: undefined })
      return blob
    }
    const store = freshStore()
    const a = await store.addItem(newItem({ photo: stripped(photo([4, 5, 6])) }))
    expect(await bytesOf((await store.getItem(a.id))!.photo)).toEqual([4, 5, 6])

    const target = freshStore()
    await target.importBackup(stripped(await store.exportBackup()))
    expect(await bytesOf((await target.getItem(a.id))!.photo)).toEqual([4, 5, 6])
  })

  it('ruimt losse uitsluitingen op en maakt ze symmetrisch', async () => {
    const store = freshStore()
    await store.importBackup(
      jsonBlob(
        validBackup({
          items: [
            { id: 'a', category: 'top', season: 'all', available: true, excludedIds: ['b', 'weg', 'a'], createdAt: 1, photo: PNG_DATA_URL },
            { id: 'b', category: 'bottom', season: 'summer', available: false, excludedIds: [], createdAt: 2, photo: PNG_DATA_URL, name: null },
          ],
          outfits: [{ date: '2026-01-01', outfit: { top: 'a', bottom: 'weg', shoes: 'b' } }],
        }),
      ),
    )
    expect((await store.getItem('a'))?.excludedIds).toEqual(['b'])
    expect((await store.getItem('b'))?.excludedIds).toEqual(['a'])
    expect(await store.getItem('b')).not.toHaveProperty('name')
    expect(await store.getOutfit('2026-01-01')).toEqual({ date: '2026-01-01', outfit: { top: 'a' } })
    expect(await store.getSettings()).toEqual({ currentSeason: 'summer' })
    expect(await bytesOf((await store.getItem('a'))!.photo)).toEqual([1, 2, 3])
  })

  it('accepteert een back-up zonder outfits en instellingen', async () => {
    const store = freshStore()
    const backup = validBackup()
    delete backup.outfits
    delete backup.settings
    await store.importBackup(jsonBlob(backup))
    expect(await store.listItems()).toHaveLength(1)
    expect(await store.getSettings()).toEqual(DEFAULT_SETTINGS)
  })

  const item = (overrides: Record<string, unknown>) => ({
    id: 'a',
    category: 'top',
    season: 'all',
    available: true,
    excludedIds: [],
    createdAt: 1,
    photo: PNG_DATA_URL,
    ...overrides,
  })

  const invalidCases: Array<[string, Blob]> = [
    ['geen JSON', new Blob(['dit is geen json'], { type: 'application/json' })],
    ['JSON-array', jsonBlob([])],
    ['ander app-merk', jsonBlob(validBackup({ app: 'iets-anders' }))],
    ['ontbrekende versie', jsonBlob(validBackup({ version: undefined }))],
    ['versie als tekst', jsonBlob(validBackup({ version: '1' }))],
    ['items geen array', jsonBlob(validBackup({ items: {} }))],
    ['item geen object', jsonBlob(validBackup({ items: ['x'] }))],
    ['onbekende categorie', jsonBlob(validBackup({ items: [item({ category: 'hoed' })] }))],
    ['onbekend seizoen', jsonBlob(validBackup({ items: [item({ season: 'lente' })] }))],
    ['numerieke id', jsonBlob(validBackup({ items: [item({ id: 5 })] }))],
    ['lege id', jsonBlob(validBackup({ items: [item({ id: '' })] }))],
    ['dubbele id', jsonBlob(validBackup({ items: [item({}), item({})] }))],
    ['available geen boolean', jsonBlob(validBackup({ items: [item({ available: 'ja' })] }))],
    ['excludedIds geen strings', jsonBlob(validBackup({ items: [item({ excludedIds: [1] })] }))],
    ['createdAt ontbreekt', jsonBlob(validBackup({ items: [item({ createdAt: undefined })] }))],
    ['naam geen tekst', jsonBlob(validBackup({ items: [item({ name: 42 })] }))],
    ['foto ontbreekt', jsonBlob(validBackup({ items: [item({ photo: undefined })] }))],
    ['foto geen data-URL', jsonBlob(validBackup({ items: [item({ photo: 'https://example.com/a.png' })] }))],
    ['foto met ander mime-type', jsonBlob(validBackup({ items: [item({ photo: 'data:text/html;base64,AQID' })] }))],
    ['SVG-foto', jsonBlob(validBackup({ items: [item({ photo: 'data:image/svg+xml;base64,AQID' })] }))],
    ['foto zonder base64', jsonBlob(validBackup({ items: [item({ photo: 'data:image/png,abc' })] }))],
    ['beschadigde base64', jsonBlob(validBackup({ items: [item({ photo: 'data:image/png;base64,A' })] }))],
    ['lege foto', jsonBlob(validBackup({ items: [item({ photo: 'data:image/png;base64,' })] }))],
    ['ongeldige instellingen', jsonBlob(validBackup({ settings: { currentSeason: 'lente' } }))],
    ['outfits geen array', jsonBlob(validBackup({ outfits: {} }))],
    ['outfit met ongeldige datum', jsonBlob(validBackup({ outfits: [{ date: 'gisteren', outfit: {} }] }))],
    ['outfit met onbekende categorie', jsonBlob(validBackup({ outfits: [{ date: '2026-01-01', outfit: { hoed: 'a' } }] }))],
  ]

  it.each(invalidCases)('weigert een ongeldige back-up (%s) en laat bestaande data staan', async (_label, file) => {
    const store = freshStore()
    const existing = await store.addItem(newItem({ name: 'Blijft' }))
    await store.saveSettings({ currentSeason: 'winter' })
    await store.saveOutfit('2026-05-05', { top: existing.id })

    await expect(store.importBackup(file)).rejects.toThrow(/geen geldig Dress Kid back-upbestand/)

    const items = await store.listItems()
    expect(items.map((i) => i.name)).toEqual(['Blijft'])
    expect(await bytesOf(items[0]!.photo)).toEqual([1, 2, 3, 250])
    expect(await store.getSettings()).toEqual({ currentSeason: 'winter' })
    expect(await store.getOutfit('2026-05-05')).toEqual({ date: '2026-05-05', outfit: { top: existing.id } })
  })

  it('geeft een aparte melding bij een back-up van een nieuwere versie', async () => {
    const store = freshStore()
    await expect(store.importBackup(jsonBlob(validBackup({ version: 2 })))).rejects.toThrow(/nieuwere versie/)
  })
})
