import {
  chooseItem,
  conflictingCategories,
  isCompatible,
  isInSeason,
  isOutfitComplete,
  pruneOutfit,
  selectableItems,
  todayKey,
  visibleCategories,
  wearableItems,
} from './compat'
import type { Category, ClothingItem, Settings } from './types'

let counter = 0
function item(id: string, category: Category, extra: Partial<ClothingItem> = {}): ClothingItem {
  counter += 1
  return {
    id,
    category,
    season: 'all',
    available: true,
    excludedIds: [],
    photo: new Blob(['x'], { type: 'image/jpeg' }),
    createdAt: counter,
    ...extra,
  }
}

const ALL: Settings = { currentSeason: 'all' }
const SUMMER: Settings = { currentSeason: 'summer' }
const WINTER: Settings = { currentSeason: 'winter' }

describe('isInSeason', () => {
  it('altijd waar als er geen seizoensfilter is', () => {
    expect(isInSeason({ season: 'summer' }, 'all')).toBe(true)
    expect(isInSeason({ season: 'winter' }, 'all')).toBe(true)
  })
  it('kledingstukken voor het hele jaar passen altijd', () => {
    expect(isInSeason({ season: 'all' }, 'summer')).toBe(true)
    expect(isInSeason({ season: 'all' }, 'winter')).toBe(true)
  })
  it('anders moet het seizoen gelijk zijn', () => {
    expect(isInSeason({ season: 'summer' }, 'summer')).toBe(true)
    expect(isInSeason({ season: 'summer' }, 'winter')).toBe(false)
    expect(isInSeason({ season: 'winter' }, 'summer')).toBe(false)
  })
})

describe('isCompatible', () => {
  it('past standaard', () => {
    expect(isCompatible(item('a', 'top'), item('b', 'bottom'))).toBe(true)
  })
  it('symmetrisch, ook als maar één kant de uitsluiting heeft', () => {
    const a = item('a', 'top', { excludedIds: ['b'] })
    const b = item('b', 'bottom')
    expect(isCompatible(a, b)).toBe(false)
    expect(isCompatible(b, a)).toBe(false)
  })
})

describe('conflictingCategories', () => {
  it('jurk botst met shirt en broek en omgekeerd', () => {
    expect(conflictingCategories('dress').sort()).toEqual(['bottom', 'top'])
    expect(conflictingCategories('top')).toEqual(['dress'])
    expect(conflictingCategories('bottom')).toEqual(['dress'])
  })
  it('overige categorieën botsen nergens mee', () => {
    for (const c of ['sweater', 'socks', 'shoes', 'jacket', 'accessory'] as const) {
      expect(conflictingCategories(c)).toEqual([])
    }
  })
  it('geeft een kopie terug', () => {
    conflictingCategories('dress').push('socks')
    expect(conflictingCategories('dress')).toHaveLength(2)
  })
})

describe('wearableItems', () => {
  it('filtert op beschikbaarheid en seizoen', () => {
    const items = [
      item('a', 'top'),
      item('b', 'top', { available: false }),
      item('c', 'top', { season: 'winter' }),
      item('d', 'top', { season: 'summer' }),
    ]
    expect(wearableItems(items, SUMMER).map((i) => i.id)).toEqual(['a', 'd'])
    expect(wearableItems(items, WINTER).map((i) => i.id)).toEqual(['a', 'c'])
    expect(wearableItems(items, ALL).map((i) => i.id)).toEqual(['a', 'c', 'd'])
  })
})

describe('selectableItems', () => {
  it('geeft draagbare items van de categorie, gesorteerd op createdAt', () => {
    const items = [
      item('late', 'top', { createdAt: 300 }),
      item('broek', 'bottom'),
      item('early', 'top', { createdAt: 100 }),
      item('same1', 'top', { createdAt: 200 }),
      item('same2', 'top', { createdAt: 200 }),
      item('weg', 'top', { available: false }),
    ]
    expect(selectableItems(items, ALL, {}, 'top').map((i) => i.id)).toEqual(['early', 'same1', 'same2', 'late'])
  })

  it('laat items weg die niet passen bij keuzes in andere categorieën', () => {
    const items = [
      item('t1', 'top'),
      item('t2', 'top', { excludedIds: ['b1'] }),
      item('b1', 'bottom'),
      item('s1', 'shoes', { excludedIds: ['t1'] }),
    ]
    expect(selectableItems(items, ALL, { bottom: 'b1' }, 'top').map((i) => i.id)).toEqual(['t1'])
    expect(selectableItems(items, ALL, { bottom: 'b1', shoes: 's1' }, 'top')).toEqual([])
  })

  it('negeert de keuze in de eigen categorie', () => {
    const items = [item('t1', 'top', { excludedIds: ['t2'] }), item('t2', 'top')]
    expect(selectableItems(items, ALL, { top: 't1' }, 'top').map((i) => i.id)).toEqual(['t1', 't2'])
  })

  it('negeert verouderde of niet-draagbare id’s in de outfit', () => {
    const items = [
      item('t1', 'top', { excludedIds: ['b-was', 'jas-zomer'] }),
      item('b-was', 'bottom', { available: false }),
      item('jas-zomer', 'jacket', { season: 'summer' }),
    ]
    const outfit = { bottom: 'b-was', jacket: 'jas-zomer', socks: 'bestaat-niet' }
    expect(selectableItems(items, WINTER, outfit, 'top').map((i) => i.id)).toEqual(['t1'])
  })

  it('negeert een id die in het verkeerde vak staat', () => {
    const items = [item('t1', 'top', { excludedIds: ['s1'] }), item('s1', 'shoes')]
    // s1 staat als "bottom" in de outfit: geen geldige keuze, dus geen beperking.
    expect(selectableItems(items, ALL, { bottom: 's1' }, 'top').map((i) => i.id)).toEqual(['t1'])
  })
})

describe('chooseItem', () => {
  const top = item('top', 'top')
  const bottom = item('bottom', 'bottom')
  const dress = item('dress', 'dress')
  const socks = item('socks', 'socks')
  const items = [top, bottom, dress, socks]

  it('zet het item in zijn categorie zonder het origineel te wijzigen', () => {
    const outfit = { socks: 'socks' }
    const next = chooseItem(items, ALL, outfit, top)
    expect(next).toEqual({ socks: 'socks', top: 'top' })
    expect(outfit).toEqual({ socks: 'socks' })
  })

  it('vervangt het vorige item in dezelfde categorie', () => {
    const top2 = item('top2', 'top')
    expect(chooseItem([...items, top2], ALL, { top: 'top' }, top2)).toEqual({ top: 'top2' })
  })

  it('een jurk kiezen haalt shirt en broek weg', () => {
    expect(chooseItem(items, ALL, { top: 'top', bottom: 'bottom', socks: 'socks' }, dress)).toEqual({
      dress: 'dress',
      socks: 'socks',
    })
  })

  it('een shirt of broek kiezen haalt de jurk weg', () => {
    expect(chooseItem(items, ALL, { dress: 'dress', socks: 'socks' }, top)).toEqual({ top: 'top', socks: 'socks' })
    expect(chooseItem(items, ALL, { dress: 'dress' }, bottom)).toEqual({ bottom: 'bottom' })
  })

  it('nogmaals kiezen zet het item weer uit', () => {
    expect(chooseItem(items, ALL, { top: 'top', socks: 'socks' }, top)).toEqual({ socks: 'socks' })
  })

  it('haalt items weg die niet bij het nieuwe item passen (ook bij eenzijdige uitsluiting)', () => {
    const shoes = item('shoes', 'shoes', { excludedIds: ['top2'] })
    const top2 = item('top2', 'top')
    const all = [...items, shoes, top2]
    expect(chooseItem(all, ALL, { shoes: 'shoes', socks: 'socks', bottom: 'bottom' }, top2)).toEqual({
      top: 'top2',
      socks: 'socks',
      bottom: 'bottom',
    })
  })

  it('ruimt verouderde id’s op', () => {
    expect(chooseItem(items, ALL, { socks: 'weg', jacket: 'ook-weg' }, top)).toEqual({ top: 'top' })
  })

  it('kiest geen niet-draagbaar item', () => {
    const summer = item('summer', 'dress', { season: 'summer' })
    const outfit = { top: 'top', bottom: 'bottom' }
    expect(chooseItem([...items, summer], WINTER, outfit, summer)).toEqual(outfit)
  })
})

describe('pruneOutfit', () => {
  it('laat geldige outfits ongemoeid', () => {
    const items = [item('t', 'top'), item('b', 'bottom'), item('s', 'shoes')]
    expect(pruneOutfit(items, ALL, { top: 't', bottom: 'b', shoes: 's' })).toEqual({ top: 't', bottom: 'b', shoes: 's' })
  })

  it('verwijdert onbekende, niet-draagbare en verkeerd ingedeelde id’s', () => {
    const items = [
      item('t', 'top'),
      item('was', 'bottom', { available: false }),
      item('winterjas', 'jacket', { season: 'winter' }),
      item('schoen', 'shoes'),
    ]
    expect(
      pruneOutfit(items, SUMMER, { top: 't', bottom: 'was', jacket: 'winterjas', socks: 'schoen', shoes: 'weg' }),
    ).toEqual({ top: 't' })
  })

  it('houdt bij een botsing de eerdere categorie in CATEGORIES-volgorde', () => {
    // top komt vóór shoes; uitsluiting staat alleen bij de schoen.
    const items = [item('t', 'top'), item('s', 'shoes', { excludedIds: ['t'] }), item('j', 'jacket')]
    expect(pruneOutfit(items, ALL, { shoes: 's', top: 't', jacket: 'j' })).toEqual({ top: 't', jacket: 'j' })
  })

  it('houdt shirt/broek boven een jurk', () => {
    const items = [item('t', 'top'), item('d', 'dress')]
    expect(pruneOutfit(items, ALL, { dress: 'd', top: 't' })).toEqual({ top: 't' })
  })

  it('negeert onbekende sleutels', () => {
    const items = [item('t', 'top')]
    const outfit = { top: 't', hat: 't' } as unknown as Parameters<typeof pruneOutfit>[2]
    expect(pruneOutfit(items, ALL, outfit)).toEqual({ top: 't' })
  })
})

describe('visibleCategories', () => {
  it('geeft categorieën met draagbare items in vaste volgorde', () => {
    const items = [
      item('s', 'shoes'),
      item('t', 'top'),
      item('d', 'dress', { available: false }),
      item('j', 'jacket', { season: 'winter' }),
    ]
    expect(visibleCategories(items, SUMMER)).toEqual(['top', 'shoes'])
    expect(visibleCategories(items, WINTER)).toEqual(['top', 'shoes', 'jacket'])
    expect(visibleCategories([], ALL)).toEqual([])
  })
})

describe('isOutfitComplete', () => {
  it('compleet met shirt en broek, of met jurk', () => {
    expect(isOutfitComplete({ top: 'a', bottom: 'b' })).toBe(true)
    expect(isOutfitComplete({ dress: 'd' })).toBe(true)
    expect(isOutfitComplete({ top: 'a' })).toBe(false)
    expect(isOutfitComplete({ bottom: 'b', shoes: 's' })).toBe(false)
    expect(isOutfitComplete({})).toBe(false)
  })
})

describe('todayKey', () => {
  it('geeft de lokale datum als YYYY-MM-DD', () => {
    expect(todayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(todayKey(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31')
  })
  it('gebruikt standaard vandaag', () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
