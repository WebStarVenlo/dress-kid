import {
  compareSizes,
  distinctSizes,
  EMPTY_WARDROBE_FILTER,
  filterWardrobe,
  isWardrobeFilterActive,
  itemFitsChild,
  matchesWardrobeFilter,
  normalizeSize,
} from './sizes'
import type { WardrobeFilter } from './sizes'
import type { ChildSizes } from './types'

const child = (sizes: ChildSizes) => ({ sizes })

describe('normalizeSize', () => {
  it('trimt en maakt kleine letters', () => {
    expect(normalizeSize('  XL ')).toBe('xl')
    expect(normalizeSize('110')).toBe('110')
    expect(normalizeSize('   ')).toBe('')
  })
})

describe('itemFitsChild', () => {
  it('past als de maat van het stuk bij de maten van het kind staat', () => {
    const kid = child({ top: ['104', '110'], shoes: ['28'] })
    expect(itemFitsChild({ category: 'top', size: '110' }, kid)).toBe(true)
    expect(itemFitsChild({ category: 'shoes', size: '28' }, kid)).toBe(true)
  })

  it('vergelijkt zonder op spaties en hoofdletters te letten', () => {
    expect(itemFitsChild({ category: 'top', size: ' m ' }, child({ top: ['M'] }))).toBe(true)
    expect(itemFitsChild({ category: 'top', size: 'S' }, child({ top: ['  s  '] }))).toBe(true)
  })

  it('past niet bij een andere maat', () => {
    const kid = child({ top: ['104', '110'] })
    expect(itemFitsChild({ category: 'top', size: '116' }, kid)).toBe(false)
    expect(itemFitsChild({ category: 'top', size: '1100' }, kid)).toBe(false)
  })

  it('een stuk zonder maat past bij iedereen', () => {
    const kid = child({ top: ['110'] })
    expect(itemFitsChild({ category: 'top' }, kid)).toBe(true)
    expect(itemFitsChild({ category: 'top', size: undefined }, kid)).toBe(true)
    expect(itemFitsChild({ category: 'top', size: '' }, kid)).toBe(true)
    expect(itemFitsChild({ category: 'top', size: '   ' }, kid)).toBe(true)
  })

  it('alles past als het kind geen maten heeft voor die categorie', () => {
    expect(itemFitsChild({ category: 'top', size: '110' }, child({}))).toBe(true)
    expect(itemFitsChild({ category: 'top', size: '110' }, child({ top: [] }))).toBe(true)
    expect(itemFitsChild({ category: 'top', size: '110' }, child({ top: ['', '  '] }))).toBe(true)
    // Sizes of another category do not count.
    expect(itemFitsChild({ category: 'top', size: '110' }, child({ shoes: ['28'] }))).toBe(true)
  })
})

describe('compareSizes', () => {
  it('sorteert numerieke maten oplopend als getal, niet als tekst', () => {
    expect(['110', '92', '104'].sort(compareSizes)).toEqual(['92', '104', '110'])
  })

  it('zet maten met een voorloopgetal na gelijke getallen en voor letters', () => {
    expect(['m', '110', '98/104', '98', 'S', '122-128'].sort(compareSizes)).toEqual([
      '98',
      '98/104',
      '110',
      '122-128',
      'm',
      'S',
    ])
  })

  it('negeert spaties en hoofdletters', () => {
    expect(compareSizes(' 92 ', '92')).toBe(0)
    expect(compareSizes('XL', 'xl')).toBe(0)
    expect(compareSizes('m', 'XL')).toBeLessThan(0)
  })
})

describe('distinctSizes', () => {
  it('geeft unieke maten gesorteerd, met de getrimde eerste schrijfwijze', () => {
    const items = [{ size: 'S' }, { size: '110' }, { size: '98/104' }, { size: '92' }, { size: 'm' }, { size: ' 92 ' }]
    expect(distinctSizes(items)).toEqual(['92', '98/104', '110', 'm', 'S'])
  })

  it('ontdubbelt hoofdletterongevoelig en bewaart de eerste variant', () => {
    expect(distinctSizes([{ size: ' XL ' }, { size: 'xl' }, { size: 'Xl' }])).toEqual(['XL'])
  })

  it('slaat lege en ontbrekende maten over', () => {
    expect(distinctSizes([{}, { size: undefined }, { size: '' }, { size: '   ' }])).toEqual([])
  })
})

describe('isWardrobeFilterActive', () => {
  it('is niet actief voor het lege filter', () => {
    expect(isWardrobeFilterActive(EMPTY_WARDROBE_FILTER)).toBe(false)
  })

  it('is actief bij maten, zonder maat of een kind', () => {
    expect(isWardrobeFilterActive({ sizes: ['92'], withoutSize: false })).toBe(true)
    expect(isWardrobeFilterActive({ sizes: [], withoutSize: true })).toBe(true)
    expect(isWardrobeFilterActive({ sizes: [], withoutSize: false, childId: 'a' })).toBe(true)
  })
})

describe('matchesWardrobeFilter', () => {
  const filter = (f: Partial<WardrobeFilter>): WardrobeFilter => ({ ...EMPTY_WARDROBE_FILTER, ...f })

  it('laat alles door zonder actieve maatfilter', () => {
    expect(matchesWardrobeFilter({ category: 'top', size: '110' }, EMPTY_WARDROBE_FILTER)).toBe(true)
    expect(matchesWardrobeFilter({ category: 'top' }, EMPTY_WARDROBE_FILTER)).toBe(true)
  })

  it('matcht op een geselecteerde maat, ook bij andere schrijfwijze', () => {
    expect(matchesWardrobeFilter({ category: 'top', size: ' XL ' }, filter({ sizes: ['xl'] }))).toBe(true)
    expect(matchesWardrobeFilter({ category: 'top', size: '116' }, filter({ sizes: ['110'] }))).toBe(false)
  })

  it('combineert meerdere maten met OF', () => {
    const f = filter({ sizes: ['92', '110'] })
    expect(matchesWardrobeFilter({ category: 'top', size: '92' }, f)).toBe(true)
    expect(matchesWardrobeFilter({ category: 'top', size: '110' }, f)).toBe(true)
    expect(matchesWardrobeFilter({ category: 'top', size: '104' }, f)).toBe(false)
  })

  it('stukken zonder of met lege maat vallen af tenzij zonder-maat aan staat', () => {
    const f = filter({ sizes: ['92'] })
    expect(matchesWardrobeFilter({ category: 'top' }, f)).toBe(false)
    expect(matchesWardrobeFilter({ category: 'top', size: '   ' }, f)).toBe(false)
    const g = filter({ sizes: ['92'], withoutSize: true })
    expect(matchesWardrobeFilter({ category: 'top' }, g)).toBe(true)
    expect(matchesWardrobeFilter({ category: 'top', size: '  ' }, g)).toBe(true)
    expect(matchesWardrobeFilter({ category: 'top', size: '92' }, g)).toBe(true)
    expect(matchesWardrobeFilter({ category: 'top', size: '98' }, g)).toBe(false)
  })

  it('met alleen zonder-maat blijven alleen stukken zonder maat over', () => {
    const f = filter({ withoutSize: true })
    expect(matchesWardrobeFilter({ category: 'top' }, f)).toBe(true)
    expect(matchesWardrobeFilter({ category: 'top', size: '92' }, f)).toBe(false)
  })

  it('vereist bij een kind ook dat het stuk past (EN)', () => {
    const kid = child({ top: ['110'] })
    const f = filter({ sizes: ['110', '116'] })
    expect(matchesWardrobeFilter({ category: 'top', size: '110' }, f, kid)).toBe(true)
    expect(matchesWardrobeFilter({ category: 'top', size: '116' }, f, kid)).toBe(false)
    expect(matchesWardrobeFilter({ category: 'top', size: '110' }, filter({ sizes: ['92'] }), kid)).toBe(false)
  })
})

describe('filterWardrobe', () => {
  const kids = [
    { id: 'a', sizes: { top: ['110'] } as ChildSizes },
    { id: 'b', sizes: { top: ['92'] } as ChildSizes },
  ]
  const items = [
    { id: 1, category: 'top' as const, size: '110' },
    { id: 2, category: 'top' as const, size: '92' },
    { id: 3, category: 'top' as const },
    { id: 4, category: 'top' as const, size: ' XL ' },
  ]
  const ids = (list: { id: number }[]) => list.map((i) => i.id)

  it('geeft alles terug bij het lege filter', () => {
    expect(ids(filterWardrobe(items, EMPTY_WARDROBE_FILTER, kids))).toEqual([1, 2, 3, 4])
  })

  it('filtert op maat hoofdletterongevoelig', () => {
    expect(ids(filterWardrobe(items, { sizes: ['xl', '92'], withoutSize: false }, kids))).toEqual([2, 4])
  })

  it('filtert alleen op stukken zonder maat', () => {
    expect(ids(filterWardrobe(items, { sizes: [], withoutSize: true }, kids))).toEqual([3])
  })

  it('combineert kind en maat', () => {
    expect(ids(filterWardrobe(items, { sizes: [], withoutSize: false, childId: 'a' }, kids))).toEqual([1, 3])
    expect(ids(filterWardrobe(items, { sizes: ['110'], withoutSize: false, childId: 'b' }, kids))).toEqual([])
  })

  it('negeert een onbekend kind-id', () => {
    expect(ids(filterWardrobe(items, { sizes: ['92'], withoutSize: false, childId: 'zzz' }, kids))).toEqual([2])
  })
})
