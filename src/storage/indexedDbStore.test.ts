import { DEFAULT_SETTINGS, stickersOn } from '../domain/types'
import type { AvatarId } from '../domain/avatars'
import type { Category, ClothingItem, NewChild, NewClothingItem, Settings, StoredPin } from '../domain/types'
import { translateError } from '../i18n/AppError'
import type { WardrobeStore } from './api'
import { createIndexedDbStore } from './indexedDbStore'
import { createIndexedDbStore as reexported, getStore } from './index'

/** Resolves to the translated message of the error the promise rejects with. */
function failure(promise: Promise<unknown>): Promise<string> {
  return promise.then(() => '(no error)', translateError)
}

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

function newChild(overrides: Partial<NewChild> = {}): NewChild {
  return { name: 'Noor', color: '#ff8800', sizes: {}, ...overrides }
}

const PIN: StoredPin = { salt: 'c2FsdA==', hash: 'aGFzaA==', iterations: 210_000 }

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
    children: [{ id: 'k1', name: 'Noor', color: '#ff8800', sizes: {}, createdAt: 1 }],
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
      // Attempts to change fixed fields are ignored.
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
    await expect(failure(store.updateItem('weg', { name: 'x' }))).resolves.toMatch(/bestaat niet/)
  })
})

describe('createIndexedDbStore: namen', () => {
  it('knipt een lange naam op codepoints, zonder een surrogaatpaar te splitsen', async () => {
    const store = freshStore()
    const item = await store.addItem(newItem({ name: `${'a'.repeat(59)}😀extra` }))
    expect(item.name).toBe(`${'a'.repeat(59)}😀`)
  })
})

describe('createIndexedDbStore: maten van kledingstukken', () => {
  it('slaat een getrimde maat op; leeg betekent geen maat', async () => {
    const store = freshStore()
    const a = await store.addItem(newItem({ size: '  110  ' }))
    const b = await store.addItem(newItem({ size: '   ' }))
    const c = await store.addItem(newItem())
    expect(a.size).toBe('110')
    expect(b).not.toHaveProperty('size')
    expect(c).not.toHaveProperty('size')
    expect((await store.getItem(a.id))?.size).toBe('110')
  })

  it('accepteert precies 20 tekens en weigert langer', async () => {
    const store = freshStore()
    const ok = await store.addItem(newItem({ size: 'x'.repeat(20) }))
    expect(ok.size).toBe('x'.repeat(20))
    await expect(failure(store.addItem(newItem({ size: 'x'.repeat(21) })))).resolves.toMatch(
      'Een maat mag maximaal 20 tekens lang zijn.',
    )
    expect(await store.listItems()).toHaveLength(1)
  })

  it('updateItem wijzigt, wist en valideert de maat', async () => {
    const store = freshStore()
    const a = await store.addItem(newItem({ size: '104', name: 'Shirt' }))
    expect((await store.updateItem(a.id, { size: ' 110 ' })).size).toBe('110')
    // Other changes leave the size in place.
    expect((await store.updateItem(a.id, { available: false })).size).toBe('110')
    await expect(failure(store.updateItem(a.id, { size: 'x'.repeat(21) }))).resolves.toMatch(/maximaal 20 tekens/)
    expect((await store.getItem(a.id))?.size).toBe('110')
    expect(await store.updateItem(a.id, { size: '' })).not.toHaveProperty('size')
    await store.updateItem(a.id, { size: '98' })
    const cleared = await store.updateItem(a.id, { size: undefined })
    expect(cleared).not.toHaveProperty('size')
    expect(cleared.name).toBe('Shirt')
  })
})

describe('createIndexedDbStore: kinderen', () => {
  it('voegt kinderen toe en geeft ze terug op volgorde van toevoegen', async () => {
    const store = freshStore()
    expect(await store.listChildren()).toEqual([])
    const a = await store.addChild(newChild({ name: '  Noor ', color: ' #FF8800 ' }))
    const b = await store.addChild(newChild({ name: 'Sam', color: '#0af' }))
    expect(a).toMatchObject({ name: 'Noor', color: '#ff8800', sizes: {} })
    expect(typeof a.id).toBe('string')
    expect(a.id).not.toBe(b.id)
    expect(b.createdAt).toBeGreaterThan(a.createdAt)
    expect(await store.listChildren()).toEqual([a, b])
  })

  it('vouwt een kleur van 3 cijfers uit naar #rrggbb (ook bij updateChild)', async () => {
    const store = freshStore()
    const child = await store.addChild(newChild({ color: ' #0AF ' }))
    expect(child.color).toBe('#00aaff')
    expect((await store.updateChild(child.id, { color: '#F80' })).color).toBe('#ff8800')
  })

  it('schoont de maten op', async () => {
    const store = freshStore()
    const child = await store.addChild(
      newChild({
        sizes: { top: [' 110 ', '', '110', '116', 'S', 's'], bottom: ['  '], shoes: [], socks: undefined },
      }),
    )
    expect(child.sizes).toEqual({ top: ['110', '116', 'S'] })
  })

  const invalidChildren: Array<[string, Partial<NewChild>, string | RegExp]> = [
    ['lege naam', { name: '   ' }, 'Geef het kind een naam.'],
    ['te lange naam', { name: 'x'.repeat(41) }, 'De naam van een kind mag maximaal 40 tekens lang zijn.'],
    ['kleur zonder #', { color: 'ff8800' }, 'Kies een geldige kleur.'],
    ['kleurnaam', { color: 'red' }, 'Kies een geldige kleur.'],
    ['kleur met 4 tekens', { color: '#ff88' }, 'Kies een geldige kleur.'],
    ['onbekende maatcategorie', { sizes: { hoed: ['1'] } as object }, 'Onbekende soort kledingstuk bij de maten.'],
    ['maten geen array', { sizes: { top: '110' } as object }, 'De maten zijn ongeldig.'],
    ['maat geen tekst', { sizes: { top: [110] } as object }, 'De maten zijn ongeldig.'],
    ['te lange maat', { sizes: { top: ['x'.repeat(21)] } }, 'Een maat mag maximaal 20 tekens lang zijn.'],
  ]

  it.each(invalidChildren)('addChild weigert %s', async (_label, overrides, message) => {
    const store = freshStore()
    await expect(failure(store.addChild(newChild(overrides)))).resolves.toMatch(message)
    expect(await store.listChildren()).toEqual([])
  })

  it('accepteert een naam van precies 40 tekens', async () => {
    const store = freshStore()
    expect((await store.addChild(newChild({ name: 'x'.repeat(40) }))).name).toBe('x'.repeat(40))
  })

  it('updateChild wijzigt alleen opgegeven velden', async () => {
    const store = freshStore()
    const a = await store.addChild(newChild({ sizes: { top: ['110'] } }))
    const renamed = await store.updateChild(a.id, {
      name: ' Noortje ',
      // Attempts to change fixed fields are ignored.
      ...({ id: 'hack', createdAt: 0 } as object),
    })
    expect(renamed).toEqual({ ...a, name: 'Noortje' })
    const recolored = await store.updateChild(a.id, { color: '#123', sizes: { shoes: ['28'] } })
    expect(recolored).toEqual({ ...a, name: 'Noortje', color: '#112233', sizes: { shoes: ['28'] } })
    expect(await store.listChildren()).toEqual([recolored])
  })

  it.each(invalidChildren)('updateChild weigert %s en wijzigt niets', async (_label, overrides, message) => {
    const store = freshStore()
    const a = await store.addChild(newChild())
    await expect(failure(store.updateChild(a.id, overrides))).resolves.toMatch(message)
    expect(await store.listChildren()).toEqual([a])
  })

  it('updateChild gooit als het kind niet bestaat', async () => {
    const store = freshStore()
    await expect(failure(store.updateChild('weg', { name: 'x' }))).resolves.toMatch('Dit kind bestaat niet (meer).')
  })

  it('deleteChild verwijdert het kind en alleen zijn eigen outfits', async () => {
    const store = freshStore()
    const a = await store.addChild(newChild())
    const b = await store.addChild(newChild({ name: 'Sam' }))
    await store.saveOutfit(a.id, '2026-01-01', { top: 'x' })
    await store.saveOutfit(a.id, '2026-01-02', { top: 'y' })
    await store.saveOutfit(b.id, '2026-01-01', { top: 'z' })

    await store.deleteChild(a.id)

    expect(await store.listChildren()).toEqual([b])
    expect(await store.getOutfit(a.id, '2026-01-01')).toBeUndefined()
    expect(await store.getOutfit(a.id, '2026-01-02')).toBeUndefined()
    expect((await store.getOutfit(b.id, '2026-01-01'))?.outfit).toEqual({ top: 'z' })
    expect((await backupJson(store)).outfits).toEqual([
      { childId: b.id, date: '2026-01-01', outfit: { top: 'z' }, laundryProcessed: false },
    ])
    // Unknown id: nothing happens.
    await store.deleteChild('weg')
    expect(await store.listChildren()).toEqual([b])
  })
})

describe('createIndexedDbStore: ouder-PIN', () => {
  it('zet, leest en verwijdert de PIN', async () => {
    const store = freshStore()
    expect(await store.getParentPin()).toBeUndefined()
    await store.setParentPin({ ...PIN, ...({ extra: 'weg' } as object) })
    expect(await store.getParentPin()).toEqual(PIN)
    const other: StoredPin = { salt: 'YQ==', hash: 'Yg==', iterations: 1 }
    await store.setParentPin(other)
    expect(await store.getParentPin()).toEqual(other)
    await store.setParentPin(null)
    expect(await store.getParentPin()).toBeUndefined()
    // Removing without a PIN is also allowed.
    await store.setParentPin(null)
    expect(await store.getParentPin()).toBeUndefined()
  })

  const invalidPins: Array<[string, unknown]> = [
    ['lege salt', { ...PIN, salt: '' }],
    ['lege hash', { ...PIN, hash: '' }],
    ['salt geen tekst', { ...PIN, salt: 5 }],
    ['iterations 0', { ...PIN, iterations: 0 }],
    ['negatieve iterations', { ...PIN, iterations: -1 }],
    ['iterations geen geheel getal', { ...PIN, iterations: 1.5 }],
    ['iterations als tekst', { ...PIN, iterations: '1000' }],
    ['geen object', 'geheim'],
  ]

  it.each(invalidPins)('weigert een ongeldige PIN (%s) en houdt de oude', async (_label, pin) => {
    const store = freshStore()
    await store.setParentPin(PIN)
    await expect(failure(store.setParentPin(pin as StoredPin))).resolves.toMatch('De PIN is ongeldig.')
    expect(await store.getParentPin()).toEqual(PIN)
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
    await expect(failure(store.setExcluded(a.id, 'weg', true))).resolves.toMatch(/bestaat niet/)
    await expect(failure(store.setExcluded('weg', a.id, true))).resolves.toMatch(/bestaat niet/)
    expect((await store.getItem(a.id))?.excludedIds).toEqual([])
  })
})

describe('createIndexedDbStore: verwijderen', () => {
  it('verwijdert het item en alle verwijzingen in uitsluitingen en outfits van alle kinderen', async () => {
    const store = freshStore()
    const k1 = await store.addChild(newChild())
    const k2 = await store.addChild(newChild({ name: 'Sam' }))
    const a = await store.addItem(newItem())
    const b = await store.addItem(newItem({ category: 'bottom' }))
    const c = await store.addItem(newItem({ category: 'shoes' }))
    await store.setExcluded(a.id, b.id, true)
    await store.setExcluded(c.id, b.id, true)
    await store.setExcluded(a.id, c.id, true)
    await store.saveOutfit(k1.id, '2026-01-01', { top: a.id, bottom: b.id, shoes: c.id })
    await store.saveOutfit(k1.id, '2026-01-02', { bottom: b.id })
    await store.saveOutfit(k1.id, '2026-01-03', { top: a.id })
    await store.saveOutfit(k2.id, '2026-01-01', { bottom: b.id, shoes: c.id })

    await store.deleteItem(b.id)

    expect(await store.getItem(b.id)).toBeUndefined()
    expect((await store.getItem(a.id))?.excludedIds).toEqual([c.id])
    expect((await store.getItem(c.id))?.excludedIds).toEqual([a.id])
    expect(await store.getOutfit(k1.id, '2026-01-01')).toEqual({
      childId: k1.id,
      date: '2026-01-01',
      outfit: { top: a.id, shoes: c.id },
    })
    expect(await store.getOutfit(k1.id, '2026-01-02')).toEqual({ childId: k1.id, date: '2026-01-02', outfit: {} })
    expect(await store.getOutfit(k1.id, '2026-01-03')).toEqual({
      childId: k1.id,
      date: '2026-01-03',
      outfit: { top: a.id },
    })
    expect(await store.getOutfit(k2.id, '2026-01-01')).toEqual({
      childId: k2.id,
      date: '2026-01-01',
      outfit: { shoes: c.id },
    })
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
    await store.saveSettings({ ...DEFAULT_SETTINGS, currentSeason: 'winter', soundEnabled: true })
    expect(await store.getSettings()).toEqual({ ...DEFAULT_SETTINGS, currentSeason: 'winter', soundEnabled: true })
  })

  it('slaat outfits per kind en datum op en overschrijft ze', async () => {
    const store = freshStore()
    const k1 = await store.addChild(newChild())
    const k2 = await store.addChild(newChild({ name: 'Sam' }))
    expect(await store.getOutfit(k1.id, '2026-03-01')).toBeUndefined()
    await store.saveOutfit(k1.id, '2026-03-01', { top: 'x', bottom: 'y' })
    await store.saveOutfit(k1.id, '2026-03-01', { dress: 'z' })
    await store.saveOutfit(k2.id, '2026-03-01', { top: 'q' })
    expect(await store.getOutfit(k1.id, '2026-03-01')).toEqual({
      childId: k1.id,
      date: '2026-03-01',
      outfit: { dress: 'z' },
    })
    expect(await store.getOutfit(k2.id, '2026-03-01')).toEqual({
      childId: k2.id,
      date: '2026-03-01',
      outfit: { top: 'q' },
    })
    expect(await store.getOutfit(k2.id, '2026-03-02')).toBeUndefined()
  })

  it('laat lege en ongeldige waarden uit een outfit weg', async () => {
    const store = freshStore()
    const k = await store.addChild(newChild())
    await store.saveOutfit(k.id, '2026-03-01', { top: '', bottom: 'y', ...({ hoed: 'z' } as object) })
    expect((await store.getOutfit(k.id, '2026-03-01'))?.outfit).toEqual({ bottom: 'y' })
  })

  it('weigert een outfit voor een onbekend kind', async () => {
    const store = freshStore()
    await expect(failure(store.saveOutfit('weg', '2026-03-01', { top: 'x' }))).resolves.toMatch('Dit kind bestaat niet (meer).')
    expect(await store.getOutfit('weg', '2026-03-01')).toBeUndefined()
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
    const a = await store.addItem(newItem({ name: 'Shirt', size: '110', photo: photo([255, 0, 128]) }))
    const blob = await store.exportBackup()
    expect(blob.type).toBe('application/json')
    const json = await backupJson(store)
    expect(json).toMatchObject({ app: 'dress-kid', version: 1, settings: DEFAULT_SETTINGS, children: [], outfits: [] })
    expect(typeof json.exportedAt).toBe('string')
    expect(json.items).toEqual([
      {
        id: a.id,
        category: 'top',
        name: 'Shirt',
        season: 'all',
        available: true,
        excludedIds: [],
        size: '110',
        createdAt: a.createdAt,
        photo: 'data:image/jpeg;base64,/wCA',
      },
    ])
  })

  it('exporteert kinderen en hun outfits, maar nooit de PIN', async () => {
    const store = freshStore()
    const k = await store.addChild(newChild({ sizes: { top: ['110'] } }))
    const a = await store.addItem(newItem())
    await store.saveOutfit(k.id, '2026-02-02', { top: a.id })
    await store.setParentPin(PIN)
    const json = await backupJson(store)
    expect(json.children).toEqual([
      { id: k.id, name: 'Noor', color: '#ff8800', sizes: { top: ['110'] }, createdAt: k.createdAt },
    ])
    expect(json.outfits).toEqual([{ childId: k.id, date: '2026-02-02', outfit: { top: a.id }, laundryProcessed: false }])
    expect(json).not.toHaveProperty('pin')
    const text = await (await store.exportBackup()).text()
    expect(text).not.toContain(PIN.salt)
    expect(text).not.toContain(PIN.hash)
  })

  it('round-trip: export en import in een andere database geven dezelfde data', async () => {
    const source = freshStore()
    const bigPhoto = Array.from({ length: 70_000 }, (_, i) => (i * 7) % 256)
    const a = await source.addItem(newItem({ name: 'Shirt', photo: photo(bigPhoto, 'image/webp') }))
    const b = await source.addItem(newItem({ category: 'bottom', season: 'winter', size: '116' }))
    await source.updateItem(b.id, { available: false })
    await source.setExcluded(a.id, b.id, true)
    await source.saveSettings({ ...DEFAULT_SETTINGS, currentSeason: 'winter', soundEnabled: false })
    const k1 = await source.addChild(newChild({ sizes: { top: ['110', '116'], bottom: ['116'] } }))
    const k2 = await source.addChild(newChild({ name: 'Sam', color: '#0af' }))
    await source.saveOutfit(k1.id, '2026-02-02', { top: a.id, bottom: b.id })
    await source.saveOutfit(k2.id, '2026-02-02', { top: a.id })

    const target = freshStore()
    const old = await target.addChild(newChild({ name: 'Oud' }))
    await target.addItem(newItem({ name: 'wordt vervangen' }))
    await target.saveOutfit(old.id, '2025-12-31', { top: 'oud' })
    await target.setParentPin(PIN)
    await target.importBackup(await source.exportBackup())

    const items = await target.listItems()
    const withoutPhoto = (list: ClothingItem[]) => list.map((i) => ({ ...i, photo: undefined }))
    expect(withoutPhoto(items)).toEqual(withoutPhoto(await source.listItems()))
    expect(items[1]?.size).toBe('116')
    expect(items[0]?.photo.type).toBe('image/webp')
    expect(await bytesOf(items[0]!.photo)).toEqual(bigPhoto)
    expect(await target.getSettings()).toEqual({ ...DEFAULT_SETTINGS, currentSeason: 'winter', soundEnabled: false })
    expect(await target.listChildren()).toEqual(await source.listChildren())
    expect(await target.getOutfit(k1.id, '2026-02-02')).toEqual({
      childId: k1.id,
      date: '2026-02-02',
      outfit: { top: a.id, bottom: b.id },
    })
    expect(await target.getOutfit(k2.id, '2026-02-02')).toEqual({
      childId: k2.id,
      date: '2026-02-02',
      outfit: { top: a.id },
    })
    expect(await target.getOutfit(old.id, '2025-12-31')).toBeUndefined()
    // The PIN of the target device stays.
    expect(await target.getParentPin()).toEqual(PIN)

    // New items and children after an import go at the end.
    const c = await target.addItem(newItem())
    expect((await target.listItems()).at(-1)?.id).toBe(c.id)
    const k3 = await target.addChild(newChild({ name: 'Nieuw' }))
    expect((await target.listChildren()).at(-1)?.id).toBe(k3.id)
  })

  it('import zonder PIN op het apparaat zet ook geen PIN', async () => {
    const source = freshStore()
    await source.setParentPin(PIN)
    const target = freshStore()
    await target.importBackup(await source.exportBackup())
    expect(await target.getParentPin()).toBeUndefined()
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
          outfits: [{ childId: 'k1', date: '2026-01-01', outfit: { top: 'a', bottom: 'weg', shoes: 'b' } }],
        }),
      ),
    )
    expect((await store.getItem('a'))?.excludedIds).toEqual(['b'])
    expect((await store.getItem('b'))?.excludedIds).toEqual(['a'])
    expect(await store.getItem('b')).not.toHaveProperty('name')
    expect(await store.getOutfit('k1', '2026-01-01')).toEqual({
      childId: 'k1',
      date: '2026-01-01',
      outfit: { top: 'a' },
      laundryProcessed: true,
    })
    expect(await store.getSettings()).toEqual({ ...DEFAULT_SETTINGS, currentSeason: 'summer', soundEnabled: true })
    expect(await bytesOf((await store.getItem('a'))!.photo)).toEqual([1, 2, 3])
  })

  it('accepteert een back-up zonder kinderen, outfits en instellingen', async () => {
    const store = freshStore()
    await store.addChild(newChild())
    const backup = validBackup()
    delete backup.children
    delete backup.outfits
    delete backup.settings
    await store.importBackup(jsonBlob(backup))
    expect(await store.listItems()).toHaveLength(1)
    expect(await store.listChildren()).toEqual([])
    expect(await store.getSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('importeert een kind zonder maten met lege maten en vouwt korte kleuren uit', async () => {
    const store = freshStore()
    await store.importBackup(
      jsonBlob(validBackup({ children: [{ id: 'k1', name: 'Noor', color: '#F80', createdAt: 1 }] })),
    )
    expect(await store.listChildren()).toEqual([{ id: 'k1', name: 'Noor', color: '#ff8800', sizes: {}, createdAt: 1 }])
  })

  it('schoont kinderen, maten en dubbele outfits op bij importeren', async () => {
    const store = freshStore()
    await store.importBackup(
      jsonBlob(
        validBackup({
          children: [
            {
              id: 'k1',
              name: '  Noor  ',
              color: '#FF8800',
              sizes: { top: [' 110 ', '', '110', '116'], shoes: ['  '] },
              createdAt: 5,
            },
          ],
          items: [item({ size: '  110 ' }), item({ id: 'b', size: '' }), item({ id: 'c', size: null })],
          outfits: [
            { childId: 'k1', date: '2026-01-01', outfit: { top: 'a' } },
            { childId: 'k1', date: '2026-01-01', outfit: { top: 'b' } },
          ],
        }),
      ),
    )
    expect(await store.listChildren()).toEqual([
      { id: 'k1', name: 'Noor', color: '#ff8800', sizes: { top: ['110', '116'] }, createdAt: 5 },
    ])
    expect((await store.getItem('a'))?.size).toBe('110')
    expect(await store.getItem('b')).not.toHaveProperty('size')
    expect(await store.getItem('c')).not.toHaveProperty('size')
    expect((await store.getOutfit('k1', '2026-01-01'))?.outfit).toEqual({ top: 'b' })
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

  const child = (overrides: Record<string, unknown>) => ({
    id: 'k1',
    name: 'Noor',
    color: '#ff8800',
    sizes: {},
    createdAt: 1,
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
    ['outfit met ongeldige datum', jsonBlob(validBackup({ outfits: [{ childId: 'k1', date: 'gisteren', outfit: {} }] }))],
    [
      'outfit met onbekende categorie',
      jsonBlob(validBackup({ outfits: [{ childId: 'k1', date: '2026-01-01', outfit: { hoed: 'a' } }] })),
    ],
    ['outfit zonder kind', jsonBlob(validBackup({ outfits: [{ date: '2026-01-01', outfit: {} }] }))],
    ['outfit van onbekend kind', jsonBlob(validBackup({ outfits: [{ childId: 'weg', date: '2026-01-01', outfit: {} }] }))],
    ['maat geen tekst', jsonBlob(validBackup({ items: [item({ size: 110 })] }))],
    ['maat te lang', jsonBlob(validBackup({ items: [item({ size: 'x'.repeat(21) })] }))],
    ['kinderen geen array', jsonBlob(validBackup({ children: {} }))],
    ['kind geen object', jsonBlob(validBackup({ children: ['x'] }))],
    ['kind zonder id', jsonBlob(validBackup({ children: [child({ id: '' })] }))],
    ['dubbel kind', jsonBlob(validBackup({ children: [child({}), child({})] }))],
    ['kind zonder naam', jsonBlob(validBackup({ children: [child({ name: '  ' })] }))],
    ['kind met te lange naam', jsonBlob(validBackup({ children: [child({ name: 'x'.repeat(41) })] }))],
    ['kind met ongeldige kleur', jsonBlob(validBackup({ children: [child({ color: 'red' })] }))],
    ['kind met onbekende maatcategorie', jsonBlob(validBackup({ children: [child({ sizes: { hoed: ['1'] } })] }))],
    ['kind met maten geen array', jsonBlob(validBackup({ children: [child({ sizes: { top: '110' } })] }))],
    ['kind met te lange maat', jsonBlob(validBackup({ children: [child({ sizes: { top: ['x'.repeat(21)] } })] }))],
    ['kind zonder createdAt', jsonBlob(validBackup({ children: [child({ createdAt: undefined })] }))],
  ]

  it.each(invalidCases)('weigert een ongeldige back-up (%s) en laat bestaande data staan', async (_label, file) => {
    const store = freshStore()
    const existing = await store.addItem(newItem({ name: 'Blijft' }))
    const kid = await store.addChild(newChild({ name: 'Blijft' }))
    await store.saveSettings({ ...DEFAULT_SETTINGS, currentSeason: 'winter', soundEnabled: false })
    await store.saveOutfit(kid.id, '2026-05-05', { top: existing.id })

    await expect(failure(store.importBackup(file))).resolves.toMatch(/geen geldig Dress Kid back-upbestand/)

    const items = await store.listItems()
    expect(items.map((i) => i.name)).toEqual(['Blijft'])
    expect(await bytesOf(items[0]!.photo)).toEqual([1, 2, 3, 250])
    expect(await store.getSettings()).toEqual({ ...DEFAULT_SETTINGS, currentSeason: 'winter', soundEnabled: false })
    expect(await store.listChildren()).toEqual([kid])
    expect(await store.getOutfit(kid.id, '2026-05-05')).toEqual({
      childId: kid.id,
      date: '2026-05-05',
      outfit: { top: existing.id },
    })
  })

  it('geeft een aparte melding bij een back-up van een nieuwere versie', async () => {
    const store = freshStore()
    await expect(failure(store.importBackup(jsonBlob(validBackup({ version: 2 }))))).resolves.toMatch(/nieuwere versie/)
  })
})

describe('createIndexedDbStore: foto-cache', () => {
  it('geeft dezelfde Blob terug zolang de foto niet verandert', async () => {
    const store = freshStore()
    const a = await store.addItem(newItem({ name: 'A' }))
    await store.addItem(newItem({ name: 'B' }))
    const first = await store.listItems()
    const second = await store.listItems()
    expect(second[0]!.photo).toBe(first[0]!.photo)
    expect(second[1]!.photo).toBe(first[1]!.photo)
    expect((await store.getItem(a.id))!.photo).toBe(first[0]!.photo)
    // Other changes keep the Blob.
    await store.updateItem(a.id, { name: 'Nieuw', available: false })
    await store.setExcluded(a.id, first[1]!.id, true)
    expect((await store.listItems())[0]!.photo).toBe(first[0]!.photo)
  })

  it('geeft een nieuwe Blob na het vervangen van de foto', async () => {
    const store = freshStore()
    const a = await store.addItem(newItem())
    const before = (await store.listItems())[0]!.photo
    // Same size and type: must still be recognised as a new photo.
    const updated = await store.updateItem(a.id, { photo: photo([9, 9, 9, 9]) })
    const after = (await store.listItems())[0]!.photo
    expect(after).not.toBe(before)
    expect(after).toBe(updated.photo)
    expect(await bytesOf(after)).toEqual([9, 9, 9, 9])
  })

  it('geeft geen interne velden mee', async () => {
    const store = freshStore()
    const a = await store.addItem(newItem())
    expect(a).not.toHaveProperty('photoRev')
    expect((await store.listItems())[0]).not.toHaveProperty('photoRev')
  })

  it('maakt de cache leeg bij importeren', async () => {
    const store = freshStore()
    await store.addItem(newItem())
    const before = (await store.listItems())[0]!.photo
    await store.importBackup(jsonBlob(validBackup({ items: [{ ...(validBackup().items as object[])[0]!, id: 'x' }] })))
    const imported = (await store.listItems())[0]!
    expect(imported.photo).not.toBe(before)
    expect(await bytesOf(imported.photo)).toEqual([1, 2, 3])
    // Importing the same id again with a different photo: new Blob.
    await store.importBackup(
      jsonBlob(validBackup({ items: [{ ...(validBackup().items as object[])[0]!, id: 'x', photo: 'data:image/png;base64,BAUG' }] })),
    )
    const again = (await store.listItems())[0]!
    expect(again.photo).not.toBe(imported.photo)
    expect(await bytesOf(again.photo)).toEqual([4, 5, 6])
  })

  it('werkt met records zonder photoRev', async () => {
    const name = `dress-kid-legacy-${Math.random().toString(36).slice(2)}`
    // Open via the store first, so the schema of the current version exists.
    const store = createIndexedDbStore(name)
    expect(await store.listItems()).toEqual([])
    const { openDB } = await import('idb')
    const raw = await openDB(name)
    await raw.put('items', {
      id: 'oud',
      category: 'top',
      season: 'all',
      available: true,
      excludedIds: [],
      createdAt: 1,
      photo: { type: 'image/jpeg', data: new Uint8Array([7, 8]).buffer },
    })
    raw.close()
    const first = await store.listItems()
    expect(await bytesOf(first[0]!.photo)).toEqual([7, 8])
    expect((await store.listItems())[0]!.photo).toBe(first[0]!.photo)
  })
})

describe('createIndexedDbStore: database-upgrade', () => {
  it('gooit bij een upgrade vanaf versie 1 alle oude data weg', async () => {
    const name = `dress-kid-v1-${Math.random().toString(36).slice(2)}`
    const { openDB } = await import('idb')
    const raw = await openDB(name, 1, {
      upgrade(database) {
        database.createObjectStore('items', { keyPath: 'id' })
        database.createObjectStore('settings')
        database.createObjectStore('outfits', { keyPath: 'date' })
      },
    })
    await raw.put('items', {
      id: 'oud',
      category: 'top',
      season: 'all',
      available: true,
      excludedIds: [],
      createdAt: 1,
      photo: { type: 'image/jpeg', data: new Uint8Array([7, 8]).buffer },
    })
    await raw.put('settings', { currentSeason: 'winter' }, 'settings')
    await raw.put('outfits', { date: '2026-01-01', outfit: { top: 'oud' } })
    raw.close()

    const store = createIndexedDbStore(name)
    expect(await store.listItems()).toEqual([])
    expect(await store.getSettings()).toEqual(DEFAULT_SETTINGS)
    expect(await store.listChildren()).toEqual([])
    expect(await store.getParentPin()).toBeUndefined()

    // The new stores work.
    const k = await store.addChild(newChild())
    await store.saveOutfit(k.id, '2026-01-01', { top: 'x' })
    expect((await store.getOutfit(k.id, '2026-01-01'))?.outfit).toEqual({ top: 'x' })
  })
})

describe('createIndexedDbStore: import-grenzen', () => {
  it('weigert een te groot bestand meteen', async () => {
    const store = freshStore()
    const big = new Blob(['{}'])
    Object.defineProperty(big, 'size', { value: 201 * 1024 * 1024 })
    const text = vi.spyOn(big, 'text')
    await expect(failure(store.importBackup(big))).resolves.toMatch(/te groot/)
    expect(text).not.toHaveBeenCalled()
  })

  it('kapt te lange namen af op 60 tekens', async () => {
    const store = freshStore()
    const item = { ...(validBackup().items as object[])[0]!, name: 'x'.repeat(100) }
    await store.importBackup(jsonBlob(validBackup({ items: [item] })))
    expect((await store.listItems())[0]!.name).toBe('x'.repeat(60))
  })

  it('weigert een foto groter dan 10 MB en laat bestaande data staan', async () => {
    const store = freshStore()
    await store.addItem(newItem({ name: 'Blijft' }))
    const huge = `data:image/png;base64,${'A'.repeat(Math.ceil(((10 * 1024 * 1024 + 10) * 4) / 3 / 4) * 4)}`
    const item = { ...(validBackup().items as object[])[0]!, photo: huge }
    await expect(failure(store.importBackup(jsonBlob(validBackup({ items: [item] }))))).resolves.toMatch(/te grote foto/)
    expect((await store.listItems()).map((i) => i.name)).toEqual(['Blijft'])
  })

  it('accepteert een foto net onder de grens', async () => {
    const store = freshStore()
    const ok = `data:image/png;base64,${'A'.repeat(Math.floor((9 * 1024 * 1024) / 3) * 4)}`
    const item = { ...(validBackup().items as object[])[0]!, photo: ok }
    await store.importBackup(jsonBlob(validBackup({ items: [item] })))
    expect((await store.listItems())[0]!.photo.size).toBe(Math.floor((9 * 1024 * 1024) / 3) * 3)
  })
})

describe('createIndexedDbStore: stickers per kind', () => {
  it('slaat stickersEnabled op en laat het weg als het niet is opgegeven', async () => {
    const store = freshStore()
    const a = await store.addChild(newChild({ stickersEnabled: false }))
    const b = await store.addChild(newChild({ name: 'Sam' }))
    expect(a.stickersEnabled).toBe(false)
    expect(b).not.toHaveProperty('stickersEnabled')
    const updated = await store.updateChild(b.id, { stickersEnabled: false })
    expect(updated.stickersEnabled).toBe(false)
    expect((await store.updateChild(b.id, { name: 'Sam2' })).stickersEnabled).toBe(false)
    expect((await store.updateChild(b.id, { stickersEnabled: true })).stickersEnabled).toBe(true)
  })

  it('back-up round-trip behoudt stickersEnabled', async () => {
    const source = freshStore()
    await source.addChild(newChild({ stickersEnabled: false }))
    await source.addChild(newChild({ name: 'Sam', stickersEnabled: true }))
    await source.addChild(newChild({ name: 'Mo' }))
    const target = freshStore()
    await target.importBackup(await source.exportBackup())
    expect((await target.listChildren()).map((c) => c.stickersEnabled)).toEqual([false, true, undefined])
  })

  it('een back-up zonder stickersEnabled importeert als stickers aan; een ongeldige waarde ook', async () => {
    const store = freshStore()
    await store.importBackup(
      jsonBlob(
        validBackup({
          children: [
            { id: 'k1', name: 'Noor', color: '#ff8800', sizes: {}, createdAt: 1 },
            { id: 'k2', name: 'Sam', color: '#ff8800', sizes: {}, createdAt: 2, stickersEnabled: 'nee' },
          ],
        }),
      ),
    )
    const children = await store.listChildren()
    expect(children.map((c) => stickersOn(c))).toEqual([true, true])
    expect(children.every((c) => !('stickersEnabled' in c))).toBe(true)
  })
})

describe('createIndexedDbStore: avatar van een kind', () => {
  it('addChild slaat een geldige avatar op en laat hem weg als er geen is', async () => {
    const store = freshStore()
    const a = await store.addChild(newChild({ avatar: 'fox' }))
    const b = await store.addChild(newChild({ name: 'Sam' }))
    expect(a.avatar).toBe('fox')
    expect(b).not.toHaveProperty('avatar')
    expect(await store.listChildren()).toEqual([a, b])
  })

  it('addChild negeert een onbekende avatar', async () => {
    const store = freshStore()
    const a = await store.addChild(newChild({ avatar: 'draak' as AvatarId }))
    const b = await store.addChild(newChild({ avatar: 5 as unknown as AvatarId }))
    expect(a).not.toHaveProperty('avatar')
    expect(b).not.toHaveProperty('avatar')
    expect((await store.listChildren()).every((child) => !('avatar' in child))).toBe(true)
  })

  it('updateChild zet, behoudt en wist de avatar', async () => {
    const store = freshStore()
    const a = await store.addChild(newChild())
    expect((await store.updateChild(a.id, { avatar: 'owl' })).avatar).toBe('owl')
    // Other changes leave the avatar in place.
    expect((await store.updateChild(a.id, { name: 'Noortje' })).avatar).toBe('owl')
    expect((await store.updateChild(a.id, { avatar: 'dino' })).avatar).toBe('dino')
    // An unknown value is ignored: the existing avatar stays.
    expect((await store.updateChild(a.id, { avatar: 'draak' as AvatarId })).avatar).toBe('dino')
    // `avatar: undefined` (or null) clears it.
    const cleared = await store.updateChild(a.id, { avatar: undefined })
    expect(cleared).not.toHaveProperty('avatar')
    expect(cleared.name).toBe('Noortje')
    await store.updateChild(a.id, { avatar: 'cat' })
    expect(await store.updateChild(a.id, { avatar: null as unknown as AvatarId })).not.toHaveProperty('avatar')
    expect(await store.listChildren()).toEqual([{ ...a, name: 'Noortje' }])
  })

  it('round-trip: de avatar gaat mee in de back-up, alleen als hij gezet is', async () => {
    const source = freshStore()
    const k1 = await source.addChild(newChild({ avatar: 'unicorn' }))
    const k2 = await source.addChild(newChild({ name: 'Sam' }))
    const json = await backupJson(source)
    expect(json.children).toEqual([
      { id: k1.id, name: 'Noor', color: '#ff8800', avatar: 'unicorn', sizes: {}, createdAt: k1.createdAt },
      { id: k2.id, name: 'Sam', color: '#ff8800', sizes: {}, createdAt: k2.createdAt },
    ])
    const target = freshStore()
    await target.importBackup(await source.exportBackup())
    expect(await target.listChildren()).toEqual([k1, k2])
  })

  it('import laat een onbekende of ongeldige avatar stil vallen', async () => {
    const store = freshStore()
    await store.importBackup(
      jsonBlob(
        validBackup({
          children: [
            { id: 'k1', name: 'Noor', color: '#ff8800', sizes: {}, createdAt: 1, avatar: 'draak' },
            { id: 'k2', name: 'Sam', color: '#ff8800', sizes: {}, createdAt: 2, avatar: 42 },
            { id: 'k3', name: 'Lot', color: '#ff8800', sizes: {}, createdAt: 3, avatar: 'bear' },
          ],
        }),
      ),
    )
    const children = await store.listChildren()
    expect(children.map((child) => child.id)).toEqual(['k1', 'k2', 'k3'])
    expect(children[0]).not.toHaveProperty('avatar')
    expect(children[1]).not.toHaveProperty('avatar')
    expect(children[2]?.avatar).toBe('bear')
  })
})

describe('createIndexedDbStore: geluid en voorlezen', () => {
  it('staat standaard aan en kan uit', async () => {
    const store = freshStore()
    expect((await store.getSettings()).soundEnabled).toBe(true)
    await store.saveSettings({ ...DEFAULT_SETTINGS, currentSeason: 'summer', soundEnabled: false })
    expect(await store.getSettings()).toEqual({ ...DEFAULT_SETTINGS, currentSeason: 'summer', soundEnabled: false })
    await store.saveSettings({ ...DEFAULT_SETTINGS, currentSeason: 'summer', soundEnabled: true })
    expect((await store.getSettings()).soundEnabled).toBe(true)
  })

  it('saveSettings maakt van een ongeldige waarde de standaard en gooit nog steeds bij een onbekend seizoen', async () => {
    const store = freshStore()
    await store.saveSettings({ ...DEFAULT_SETTINGS, currentSeason: 'winter', soundEnabled: 'nee' as unknown as boolean })
    expect(await store.getSettings()).toEqual({ ...DEFAULT_SETTINGS, currentSeason: 'winter', soundEnabled: true })
    await store.saveSettings({ ...DEFAULT_SETTINGS, currentSeason: 'winter', soundEnabled: false })
    await expect(
      failure(store.saveSettings({ ...DEFAULT_SETTINGS, currentSeason: 'lente', soundEnabled: true } as unknown as Settings)),
    ).resolves.toMatch('Onbekend seizoen.')
    expect(await store.getSettings()).toEqual({ ...DEFAULT_SETTINGS, currentSeason: 'winter', soundEnabled: false })
  })

  it('oude opgeslagen instellingen zonder soundEnabled krijgen true', async () => {
    const name = `dress-kid-settings-${Math.random().toString(36).slice(2)}`
    const store = createIndexedDbStore(name)
    expect(await store.listItems()).toEqual([])
    const { openDB } = await import('idb')
    const raw = await openDB(name)
    await raw.put('settings', { currentSeason: 'winter' }, 'settings')
    raw.close()
    expect(await store.getSettings()).toEqual({ ...DEFAULT_SETTINGS, currentSeason: 'winter', soundEnabled: true })
  })

  it('round-trip via de back-up, en een ongeldige waarde bij import wordt true', async () => {
    const source = freshStore()
    await source.saveSettings({ ...DEFAULT_SETTINGS, currentSeason: 'all', soundEnabled: false })
    expect((await backupJson(source)).settings).toEqual({ ...DEFAULT_SETTINGS, currentSeason: 'all', soundEnabled: false })
    const target = freshStore()
    await target.importBackup(await source.exportBackup())
    expect(await target.getSettings()).toEqual({ ...DEFAULT_SETTINGS, currentSeason: 'all', soundEnabled: false })

    await target.importBackup(jsonBlob(validBackup({ settings: { currentSeason: 'winter', soundEnabled: 'uit' } })))
    expect(await target.getSettings()).toEqual({ ...DEFAULT_SETTINGS, currentSeason: 'winter', soundEnabled: true })
  })
})

describe('createIndexedDbStore: stickerboek', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('markOutfitCompleted zet completedAt en is idempotent', async () => {
    const store = freshStore()
    const k = await store.addChild(newChild())
    await store.saveOutfit(k.id, '2026-04-01', { top: 'x' })
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    expect(await store.markOutfitCompleted(k.id, '2026-04-01')).toBe(true)
    vi.spyOn(Date, 'now').mockReturnValue(2_000)
    expect(await store.markOutfitCompleted(k.id, '2026-04-01')).toBe(false)
    expect(await store.getOutfit(k.id, '2026-04-01')).toEqual({
      childId: k.id,
      date: '2026-04-01',
      outfit: { top: 'x' },
      completedAt: 1_000,
    })
    expect(await store.countCompletedDays(k.id)).toBe(1)
  })

  it('markOutfitCompleted maakt een lege outfit aan als er nog niets is', async () => {
    const store = freshStore()
    const k = await store.addChild(newChild())
    vi.spyOn(Date, 'now').mockReturnValue(5_000)
    await store.markOutfitCompleted(k.id, '2026-04-02')
    expect(await store.getOutfit(k.id, '2026-04-02')).toEqual({
      childId: k.id,
      date: '2026-04-02',
      outfit: {},
      completedAt: 5_000,
    })
  })

  it('markOutfitCompleted weigert een onbekend kind', async () => {
    const store = freshStore()
    await expect(failure(store.markOutfitCompleted('weg', '2026-04-02'))).resolves.toMatch('Dit kind bestaat niet (meer).')
    expect(await store.getOutfit('weg', '2026-04-02')).toBeUndefined()
  })

  it('saveOutfit behoudt een verdiende sticker; een niet-afgeronde dag heeft geen completedAt', async () => {
    const store = freshStore()
    const k = await store.addChild(newChild())
    await store.saveOutfit(k.id, '2026-04-03', { top: 'x' })
    expect(await store.getOutfit(k.id, '2026-04-03')).not.toHaveProperty('completedAt')
    vi.spyOn(Date, 'now').mockReturnValue(7_000)
    await store.markOutfitCompleted(k.id, '2026-04-03')
    await store.saveOutfit(k.id, '2026-04-03', { dress: 'y' })
    expect(await store.getOutfit(k.id, '2026-04-03')).toEqual({
      childId: k.id,
      date: '2026-04-03',
      outfit: { dress: 'y' },
      completedAt: 7_000,
    })
    // Another day does not get the sticker.
    await store.saveOutfit(k.id, '2026-04-04', { top: 'x' })
    expect(await store.getOutfit(k.id, '2026-04-04')).not.toHaveProperty('completedAt')
  })

  it('countCompletedDays telt alleen afgeronde dagen van dat kind', async () => {
    const store = freshStore()
    const a = await store.addChild(newChild())
    const b = await store.addChild(newChild({ name: 'Sam' }))
    expect(await store.countCompletedDays(a.id)).toBe(0)
    await store.markOutfitCompleted(a.id, '2026-04-01')
    await store.markOutfitCompleted(a.id, '2026-04-02')
    await store.saveOutfit(a.id, '2026-04-03', { top: 'x' })
    await store.markOutfitCompleted(b.id, '2026-04-01')
    expect(await store.countCompletedDays(a.id)).toBe(2)
    expect(await store.countCompletedDays(b.id)).toBe(1)
    expect(await store.countCompletedDays('onbekend')).toBe(0)
    // Child gone: stickers gone too.
    await store.deleteChild(a.id)
    expect(await store.countCompletedDays(a.id)).toBe(0)
    expect(await store.countCompletedDays(b.id)).toBe(1)
  })

  it('round-trip: completedAt gaat mee in de back-up, alleen als hij gezet is', async () => {
    const source = freshStore()
    const k = await source.addChild(newChild())
    vi.spyOn(Date, 'now').mockReturnValue(9_000)
    await source.markOutfitCompleted(k.id, '2026-04-01')
    await source.saveOutfit(k.id, '2026-04-02', {})
    const json = await backupJson(source)
    expect(json.outfits).toEqual(
      expect.arrayContaining([
        { childId: k.id, date: '2026-04-01', outfit: {}, completedAt: 9_000, laundryProcessed: false },
        { childId: k.id, date: '2026-04-02', outfit: {}, laundryProcessed: false },
      ]),
    )
    const target = freshStore()
    await target.importBackup(await source.exportBackup())
    expect((await target.getOutfit(k.id, '2026-04-01'))?.completedAt).toBe(9_000)
    expect(await target.getOutfit(k.id, '2026-04-02')).not.toHaveProperty('completedAt')
    expect(await target.countCompletedDays(k.id)).toBe(1)
  })

  it.each<[string, unknown]>([
    ['tekst', '2026-04-01'],
    ['nul', 0],
    ['negatief', -5],
    ['NaN (als null in JSON)', Number.NaN],
    ['oneindig (als null in JSON)', Number.POSITIVE_INFINITY],
    ['boolean', true],
  ])('import laat een ongeldige completedAt (%s) stil vallen', async (_label, completedAt) => {
    const store = freshStore()
    await store.importBackup(
      jsonBlob(
        validBackup({
          outfits: [
            { childId: 'k1', date: '2026-01-01', outfit: { top: 'a' }, completedAt },
            { childId: 'k1', date: '2026-01-02', outfit: {}, completedAt: 1_700_000_000_000 },
          ],
        }),
      ),
    )
    expect(await store.getOutfit('k1', '2026-01-01')).toEqual({
      childId: 'k1',
      date: '2026-01-01',
      outfit: { top: 'a' },
      laundryProcessed: true,
    })
    expect((await store.getOutfit('k1', '2026-01-02'))?.completedAt).toBe(1_700_000_000_000)
    expect(await store.countCompletedDays('k1')).toBe(1)
  })
})

describe('createIndexedDbStore: oude back-ups', () => {
  it('een back-up zonder avatar, soundEnabled en completedAt laadt met standaardwaarden', async () => {
    const store = freshStore()
    await store.importBackup(
      jsonBlob(
        validBackup({
          settings: { currentSeason: 'winter' },
          outfits: [{ childId: 'k1', date: '2026-01-01', outfit: { top: 'a' } }],
        }),
      ),
    )
    expect(await store.getSettings()).toEqual({ ...DEFAULT_SETTINGS, currentSeason: 'winter', soundEnabled: true })
    expect(await store.listChildren()).toEqual([{ id: 'k1', name: 'Noor', color: '#ff8800', sizes: {}, createdAt: 1 }])
    expect(await store.getOutfit('k1', '2026-01-01')).toEqual({
      childId: 'k1',
      date: '2026-01-01',
      outfit: { top: 'a' },
      laundryProcessed: true,
    })
    expect(await store.countCompletedDays('k1')).toBe(0)
  })

  it('verdraagt ongeldige avatar, soundEnabled en completedAt tegelijk', async () => {
    const store = freshStore()
    await store.importBackup(
      jsonBlob(
        validBackup({
          settings: { currentSeason: 'summer', soundEnabled: null },
          children: [{ id: 'k1', name: 'Noor', color: '#ff8800', sizes: {}, createdAt: 1, avatar: ['fox'] }],
          outfits: [{ childId: 'k1', date: '2026-01-01', outfit: {}, completedAt: 'gisteren' }],
        }),
      ),
    )
    expect(await store.getSettings()).toEqual({ ...DEFAULT_SETTINGS, currentSeason: 'summer', soundEnabled: true })
    expect((await store.listChildren())[0]).not.toHaveProperty('avatar')
    expect(await store.getOutfit('k1', '2026-01-01')).not.toHaveProperty('completedAt')
  })
})

describe('createIndexedDbStore: was', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const DAY = 86_400_000

  it('updateItem houdt washedAt bij: gezet bij in de was, behouden, gewist bij terug', async () => {
    const store = freshStore()
    const a = await store.addItem(newItem())
    expect(a).not.toHaveProperty('washedAt')
    vi.spyOn(Date, 'now').mockReturnValue(5_000)
    expect(await store.updateItem(a.id, { available: false })).toMatchObject({ available: false, washedAt: 5_000 })
    vi.spyOn(Date, 'now').mockReturnValue(9_000)
    // Still in the wash (and other edits): the original moment stays.
    expect(await store.updateItem(a.id, { available: false, name: 'Shirt' })).toMatchObject({ washedAt: 5_000 })
    expect(await store.updateItem(a.id, { season: 'winter' })).toMatchObject({ washedAt: 5_000 })
    const back = await store.updateItem(a.id, { available: true })
    expect(back.available).toBe(true)
    expect(back).not.toHaveProperty('washedAt')
    expect(await store.getItem(a.id)).not.toHaveProperty('washedAt')
  })

  it('setItemsAvailable zet meerdere kledingstukken in en uit de was en negeert onbekende ids', async () => {
    const store = freshStore()
    const a = await store.addItem(newItem())
    const b = await store.addItem(newItem({ category: 'bottom' }))
    const c = await store.addItem(newItem({ category: 'socks' }))
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    await store.updateItem(b.id, { available: false })
    vi.spyOn(Date, 'now').mockReturnValue(2_000)
    await store.setItemsAvailable([a.id, b.id, a.id, 'weg'], false)
    expect(await store.getItem(a.id)).toMatchObject({ available: false, washedAt: 2_000 })
    // Was already in the wash: keeps its moment.
    expect(await store.getItem(b.id)).toMatchObject({ available: false, washedAt: 1_000 })
    expect(await store.getItem(c.id)).toMatchObject({ available: true })
    expect(await store.getItem('weg')).toBeUndefined()

    await store.setItemsAvailable([a.id, b.id], true)
    for (const id of [a.id, b.id]) {
      const item = await store.getItem(id)
      expect(item?.available).toBe(true)
      expect(item).not.toHaveProperty('washedAt')
    }
    await store.setItemsAvailable([], false)
  })

  it('processLaundry stopt de kleding van eerdere dagen in de was, één keer', async () => {
    const store = freshStore()
    const k = await store.addChild(newChild())
    const top = await store.addItem(newItem())
    const bottom = await store.addItem(newItem({ category: 'bottom' }))
    const jacket = await store.addItem(newItem({ category: 'jacket' }))
    const todayTop = await store.addItem(newItem())
    await store.saveOutfit(k.id, '2026-03-08', { top: top.id, bottom: bottom.id, jacket: jacket.id })
    await store.markOutfitCompleted(k.id, '2026-03-09')
    await store.saveOutfit(k.id, '2026-03-10', { top: todayTop.id })

    expect(await store.processLaundry('2026-03-10', 7_000)).toEqual({ washed: 2, returned: 0 })
    expect(await store.getItem(top.id)).toMatchObject({ available: false, washedAt: 7_000 })
    expect(await store.getItem(bottom.id)).toMatchObject({ available: false, washedAt: 7_000 })
    expect(await store.getItem(jacket.id)).toMatchObject({ available: true })
    expect(await store.getItem(todayTop.id)).toMatchObject({ available: true })
    expect((await store.getOutfit(k.id, '2026-03-08'))?.laundryProcessed).toBe(true)
    expect(await store.getOutfit(k.id, '2026-03-09')).toMatchObject({ laundryProcessed: true, completedAt: expect.any(Number) })
    expect(await store.getOutfit(k.id, '2026-03-10')).not.toHaveProperty('laundryProcessed')

    // Back from the wash by hand: the same day is not washed again.
    await store.setItemsAvailable([top.id, bottom.id], true)
    expect(await store.processLaundry('2026-03-10', 8_000)).toEqual({ washed: 0, returned: 0 })
    expect((await store.getItem(top.id))?.available).toBe(true)

    // Saving or completing a processed day keeps the mark.
    await store.saveOutfit(k.id, '2026-03-08', { top: top.id })
    await store.markOutfitCompleted(k.id, '2026-03-08')
    expect((await store.getOutfit(k.id, '2026-03-08'))?.laundryProcessed).toBe(true)
    expect(await store.processLaundry('2026-03-10', 8_000)).toEqual({ washed: 0, returned: 0 })

    // The next day, today's outfit is handled.
    expect(await store.processLaundry('2026-03-11', 9_000)).toEqual({ washed: 1, returned: 0 })
    expect(await store.getItem(todayTop.id)).toMatchObject({ available: false, washedAt: 9_000 })
  })

  it('processLaundry volgt de ingestelde categorieën en negeert verwijderde kledingstukken', async () => {
    const store = freshStore()
    const k = await store.addChild(newChild())
    const top = await store.addItem(newItem())
    const shoes = await store.addItem(newItem({ category: 'shoes' }))
    const gone = await store.addItem(newItem({ category: 'shoes' }))
    await store.saveOutfit(k.id, '2026-03-09', { top: top.id, shoes: gone.id })
    await store.saveOutfit(k.id, '2026-03-08', { shoes: shoes.id })
    await store.deleteItem(gone.id)
    await store.saveSettings({ ...DEFAULT_SETTINGS, autoWashCategories: ['shoes'] })
    expect(await store.processLaundry('2026-03-10', 7_000)).toEqual({ washed: 1, returned: 0 })
    expect((await store.getItem(top.id))?.available).toBe(true)
    expect((await store.getItem(shoes.id))?.available).toBe(false)
    expect((await store.getOutfit(k.id, '2026-03-09'))?.laundryProcessed).toBe(true)
  })

  it('processLaundry haalt kleding automatisch terug na autoReturnDays', async () => {
    const name = `dress-kid-return-${Math.random().toString(36).slice(2)}`
    const store = createIndexedDbStore(name)
    const now = 100 * DAY
    const old = await store.addItem(newItem())
    const recent = await store.addItem(newItem({ category: 'bottom' }))
    vi.spyOn(Date, 'now').mockReturnValue(now - 3 * DAY)
    await store.setItemsAvailable([old.id], false)
    vi.spyOn(Date, 'now').mockReturnValue(now - 3 * DAY + 1)
    await store.setItemsAvailable([recent.id], false)
    vi.restoreAllMocks()
    // Put away by hand before laundry tracking existed: no washedAt.
    const { openDB } = await import('idb')
    const raw = await openDB(name)
    await raw.put('items', {
      id: 'handmatig',
      category: 'socks',
      season: 'all',
      available: false,
      excludedIds: [],
      createdAt: 1,
      photo: { type: 'image/jpeg', data: new Uint8Array([7, 8]).buffer },
    })
    raw.close()

    // Off by default.
    expect(await store.processLaundry('2026-03-10', now)).toEqual({ washed: 0, returned: 0 })
    await store.saveSettings({ ...DEFAULT_SETTINGS, autoReturnDays: 3 })
    expect(await store.processLaundry('2026-03-10', now)).toEqual({ washed: 0, returned: 1 })
    const back = await store.getItem(old.id)
    expect(back?.available).toBe(true)
    expect(back).not.toHaveProperty('washedAt')
    expect((await store.getItem(recent.id))?.available).toBe(false)
    expect(await store.processLaundry('2026-03-10', now + 1)).toEqual({ washed: 0, returned: 1 })
    expect((await store.getItem(recent.id))?.available).toBe(true)
    expect(await store.processLaundry('2026-03-10', now + 1000 * DAY)).toEqual({ washed: 0, returned: 0 })
    expect((await store.getItem('handmatig'))?.available).toBe(false)
  })

  it('processLaundry weigert een ongeldige datum', async () => {
    const store = freshStore()
    await expect(store.processLaundry('morgen')).rejects.toThrow()
  })

  it('instellingen: standaardwaarden en opschonen van autoWashCategories en autoReturnDays', async () => {
    const store = freshStore()
    expect(await store.getSettings()).toMatchObject({
      autoWashCategories: ['top', 'bottom', 'dress', 'socks'],
      autoReturnDays: 0,
    })
    await store.saveSettings({ ...DEFAULT_SETTINGS, autoWashCategories: ['socks', 'jacket', 'socks'], autoReturnDays: 4.7 })
    expect(await store.getSettings()).toMatchObject({ autoWashCategories: ['socks', 'jacket'], autoReturnDays: 4 })
    await store.saveSettings({
      ...DEFAULT_SETTINGS,
      autoWashCategories: 'top' as unknown as Category[],
      autoReturnDays: -2,
    })
    expect(await store.getSettings()).toEqual(DEFAULT_SETTINGS)
    await store.saveSettings({ ...DEFAULT_SETTINGS, autoWashCategories: [], autoReturnDays: 9999 })
    expect(await store.getSettings()).toMatchObject({ autoWashCategories: [], autoReturnDays: 365 })
    // Returned arrays are copies.
    const settings = await store.getSettings()
    settings.autoWashCategories.push('top')
    expect((await store.getSettings()).autoWashCategories).toEqual([])
    expect(DEFAULT_SETTINGS.autoWashCategories).toEqual(['top', 'bottom', 'dress', 'socks'])
  })

  it('back-up: washedAt, laundryProcessed en de wasinstellingen gaan mee', async () => {
    const source = freshStore()
    const k = await source.addChild(newChild())
    const a = await source.addItem(newItem())
    const b = await source.addItem(newItem({ category: 'bottom' }))
    await source.saveSettings({ ...DEFAULT_SETTINGS, autoWashCategories: ['bottom'], autoReturnDays: 2 })
    await source.saveOutfit(k.id, '2026-03-08', { bottom: b.id })
    await source.saveOutfit(k.id, '2026-03-09', { top: a.id })
    await source.processLaundry('2026-03-09', 4_000)

    const json = await backupJson(source)
    expect(json.settings).toEqual({ ...DEFAULT_SETTINGS, autoWashCategories: ['bottom'], autoReturnDays: 2 })
    expect(json.items).toEqual([
      expect.not.objectContaining({ washedAt: expect.anything() }),
      expect.objectContaining({ id: b.id, available: false, washedAt: 4_000 }),
    ])
    expect(json.outfits).toEqual(
      expect.arrayContaining([
        { childId: k.id, date: '2026-03-08', outfit: { bottom: b.id }, laundryProcessed: true },
        { childId: k.id, date: '2026-03-09', outfit: { top: a.id }, laundryProcessed: false },
      ]),
    )

    const target = freshStore()
    await target.importBackup(await source.exportBackup())
    expect(await target.getSettings()).toEqual(await source.getSettings())
    expect((await target.getItem(b.id))?.washedAt).toBe(4_000)
    expect(await target.getOutfit(k.id, '2026-03-08')).toMatchObject({ laundryProcessed: true })
    // An unprocessed day stays unprocessed.
    expect(await target.getOutfit(k.id, '2026-03-09')).not.toHaveProperty('laundryProcessed')
  })

  it('een oude back-up zonder wasvelden: alle dagen verwerkt, standaardinstellingen, niets in de was', async () => {
    const store = freshStore()
    await store.importBackup(
      jsonBlob(
        validBackup({
          settings: { currentSeason: 'winter', soundEnabled: false },
          items: [
            { id: 'a', category: 'top', season: 'all', available: true, excludedIds: [], createdAt: 1, photo: PNG_DATA_URL },
            { id: 'b', category: 'bottom', season: 'all', available: false, excludedIds: [], createdAt: 2, photo: PNG_DATA_URL },
          ],
          outfits: [{ childId: 'k1', date: '2026-01-01', outfit: { top: 'a' } }],
        }),
      ),
    )
    expect(await store.getSettings()).toEqual({ ...DEFAULT_SETTINGS, currentSeason: 'winter', soundEnabled: false })
    expect((await store.getOutfit('k1', '2026-01-01'))?.laundryProcessed).toBe(true)
    expect(await store.getItem('b')).not.toHaveProperty('washedAt')
    await store.saveSettings({ ...DEFAULT_SETTINGS, autoReturnDays: 1 })
    expect(await store.processLaundry('2026-03-10')).toEqual({ washed: 0, returned: 0 })
    expect((await store.getItem('a'))?.available).toBe(true)
    expect((await store.getItem('b'))?.available).toBe(false)
  })

  it('import verdraagt ongeldige wasvelden', async () => {
    const store = freshStore()
    await store.importBackup(
      jsonBlob(
        validBackup({
          settings: { currentSeason: 'summer', autoWashCategories: ['top', 'hoed', 7], autoReturnDays: 'drie' },
          items: [
            { id: 'a', category: 'top', season: 'all', available: false, washedAt: 'gisteren', excludedIds: [], createdAt: 1, photo: PNG_DATA_URL },
            { id: 'b', category: 'bottom', season: 'all', available: true, washedAt: 5_000, excludedIds: [], createdAt: 2, photo: PNG_DATA_URL },
            { id: 'c', category: 'socks', season: 'all', available: false, washedAt: 6_000, excludedIds: [], createdAt: 3, photo: PNG_DATA_URL },
          ],
          outfits: [
            { childId: 'k1', date: '2026-01-01', outfit: { top: 'a' }, laundryProcessed: 'ja' },
            { childId: 'k1', date: '2026-01-02', outfit: { bottom: 'b' }, laundryProcessed: false },
          ],
        }),
      ),
    )
    expect(await store.getSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      currentSeason: 'summer',
      autoWashCategories: ['top'],
      autoReturnDays: 0,
    })
    expect(await store.getItem('a')).not.toHaveProperty('washedAt')
    expect(await store.getItem('b')).not.toHaveProperty('washedAt')
    expect((await store.getItem('c'))?.washedAt).toBe(6_000)
    expect((await store.getOutfit('k1', '2026-01-01'))?.laundryProcessed).toBe(true)
    expect(await store.getOutfit('k1', '2026-01-02')).not.toHaveProperty('laundryProcessed')
  })
})

describe('createIndexedDbStore: database-upgrade naar versie 3', () => {
  it('markeert bestaande outfits als verwerkt en behoudt de data', async () => {
    const name = `dress-kid-v2-${Math.random().toString(36).slice(2)}`
    const { openDB } = await import('idb')
    const raw = await openDB(name, 2, {
      upgrade(database) {
        database.createObjectStore('items', { keyPath: 'id' })
        database.createObjectStore('settings')
        database.createObjectStore('children', { keyPath: 'id' })
        const outfits = database.createObjectStore('outfits', { keyPath: ['childId', 'date'] })
        outfits.createIndex('childId', 'childId')
        database.createObjectStore('pin')
      },
    })
    await raw.put('items', {
      id: 'oud',
      category: 'top',
      season: 'all',
      available: true,
      excludedIds: [],
      createdAt: 1,
      photo: { type: 'image/jpeg', data: new Uint8Array([7, 8]).buffer },
    })
    await raw.put('settings', { currentSeason: 'winter', soundEnabled: false }, 'settings')
    await raw.put('children', { id: 'k1', name: 'Noor', color: '#ff8800', sizes: {}, createdAt: 1 })
    await raw.put('outfits', { childId: 'k1', date: '2026-01-01', outfit: { top: 'oud' }, completedAt: 3 })
    await raw.put('outfits', { childId: 'k1', date: '2026-01-02', outfit: { top: 'oud' } })
    raw.close()

    const store = createIndexedDbStore(name)
    expect(await store.getOutfit('k1', '2026-01-01')).toEqual({
      childId: 'k1',
      date: '2026-01-01',
      outfit: { top: 'oud' },
      completedAt: 3,
      laundryProcessed: true,
    })
    expect((await store.getOutfit('k1', '2026-01-02'))?.laundryProcessed).toBe(true)
    expect(await store.getSettings()).toEqual({ ...DEFAULT_SETTINGS, currentSeason: 'winter', soundEnabled: false })
    expect(await store.processLaundry('2026-03-10')).toEqual({ washed: 0, returned: 0 })
    expect((await store.getItem('oud'))?.available).toBe(true)
  })
})
