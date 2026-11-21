import { addDaysToKey, daysBetweenKeys, isTimestamp, localDateKey, normalizeAutoReturnDays, normalizeAutoWashCategories, planLaundry } from './laundry'
import type { LaundryInput, LaundryItem } from './laundry'
import { DEFAULT_SETTINGS } from './types'
import type { Category, SavedOutfit } from './types'

const TODAY = '2026-03-10'
const NOW = new Date(2026, 2, 10, 8, 0, 0).getTime()

function item(id: string, category: Category, extra: Partial<LaundryItem> = {}): LaundryItem {
  return { id, category, available: true, ...extra }
}

function outfit(date: string, chosen: SavedOutfit['outfit'], extra: Partial<SavedOutfit> = {}): SavedOutfit {
  return { childId: 'k1', date, outfit: chosen, ...extra }
}

function plan(overrides: Partial<LaundryInput> = {}) {
  return planLaundry({
    outfits: [],
    items: [],
    settings: { autoWashCategories: DEFAULT_SETTINGS.autoWashCategories, autoReturnDays: 0 },
    today: TODAY,
    now: NOW,
    ...overrides,
  })
}

describe('planLaundry: in de was', () => {
  it('stopt gedragen kleding van gisteren in de was en markeert de outfit als verwerkt', () => {
    const items = [item('t', 'top'), item('b', 'bottom'), item('s', 'socks')]
    const result = plan({ items, outfits: [outfit('2026-03-09', { top: 't', bottom: 'b', socks: 's' })] })
    expect(result.toWash).toEqual(['t', 'b', 's'])
    expect(result.processedOutfitKeys).toEqual([['k1', '2026-03-09']])
    expect(result.toReturn).toEqual([])
  })

  it('telt ook een niet-afgeronde outfit mee', () => {
    const result = plan({
      items: [item('t', 'top')],
      outfits: [outfit('2026-03-09', { top: 't' }, { completedAt: 5 }), outfit('2026-03-08', { top: 't' })],
    })
    expect(result.toWash).toEqual(['t'])
    expect(result.processedOutfitKeys).toEqual([
      ['k1', '2026-03-09'],
      ['k1', '2026-03-08'],
    ])
  })

  it('laat de outfit van vandaag (en later) ongemoeid', () => {
    const result = plan({
      items: [item('t', 'top'), item('b', 'bottom')],
      outfits: [outfit(TODAY, { top: 't' }), outfit('2026-03-11', { bottom: 'b' })],
    })
    expect(result).toEqual({ toWash: [], processedOutfitKeys: [], toReturn: [] })
  })

  it('slaat al verwerkte outfits over', () => {
    const result = plan({
      items: [item('t', 'top')],
      outfits: [outfit('2026-03-09', { top: 't' }, { laundryProcessed: true })],
    })
    expect(result).toEqual({ toWash: [], processedOutfitKeys: [], toReturn: [] })
  })

  it('neemt alleen categorieën uit autoWashCategories mee, maar verwerkt de outfit wel', () => {
    const items = [item('t', 'top'), item('j', 'jacket'), item('sh', 'shoes')]
    const outfits = [outfit('2026-03-09', { top: 't', jacket: 'j', shoes: 'sh' })]
    expect(plan({ items, outfits }).toWash).toEqual(['t'])

    const onlyJackets = plan({ items, outfits, settings: { autoWashCategories: ['jacket'], autoReturnDays: 0 } })
    expect(onlyJackets.toWash).toEqual(['j'])

    const nothing = plan({ items, outfits, settings: { autoWashCategories: [], autoReturnDays: 0 } })
    expect(nothing.toWash).toEqual([])
    expect(nothing.processedOutfitKeys).toEqual([['k1', '2026-03-09']])
  })

  it('gebruikt de huidige categorie van het kledingstuk', () => {
    // Worn as a top, since then re-filed as a jacket (not auto-washed).
    const result = plan({ items: [item('t', 'jacket')], outfits: [outfit('2026-03-09', { top: 't' })] })
    expect(result.toWash).toEqual([])
  })

  it('negeert verwijderde kledingstukken', () => {
    const result = plan({ items: [item('t', 'top')], outfits: [outfit('2026-03-09', { top: 't', bottom: 'weg' })] })
    expect(result.toWash).toEqual(['t'])
    expect(result.processedOutfitKeys).toEqual([['k1', '2026-03-09']])
  })

  it('stopt een kledingstuk dat al in de was zit niet nog eens in de was', () => {
    const result = plan({
      items: [item('t', 'top', { available: false, washedAt: NOW - 1000 }), item('b', 'bottom', { available: false })],
      outfits: [outfit('2026-03-09', { top: 't', bottom: 'b' })],
    })
    expect(result.toWash).toEqual([])
    expect(result.processedOutfitKeys).toEqual([['k1', '2026-03-09']])
  })

  it('geeft elk kledingstuk één keer, ook over meerdere dagen en kinderen', () => {
    const result = plan({
      items: [item('t', 'top'), item('b', 'bottom')],
      outfits: [
        outfit('2026-03-07', { top: 't' }),
        outfit('2026-03-08', { top: 't', bottom: 'b' }),
        outfit('2026-03-08', { bottom: 'b' }, { childId: 'k2' }),
      ],
    })
    expect(result.toWash).toEqual(['t', 'b'])
    expect(result.processedOutfitKeys).toHaveLength(3)
  })
})

describe('planLaundry: automatisch terug', () => {
  // Local moment on the day `days` before TODAY (default: late evening).
  const washedDaysAgo = (days: number, hour = 23) => new Date(2026, 2, 10 - days, hour, 59).getTime()

  it('doet niets als autoReturnDays 0 is', () => {
    const result = plan({ items: [item('t', 'top', { available: false, washedAt: washedDaysAgo(100) })] })
    expect(result.toReturn).toEqual([])
  })

  it('haalt kleding terug na het ingestelde aantal dagen, precies op de grens', () => {
    const items = [
      item('oud', 'top', { available: false, washedAt: washedDaysAgo(3) }),
      item('net-niet', 'bottom', { available: false, washedAt: washedDaysAgo(2, 0) }),
      item('ouder', 'socks', { available: false, washedAt: washedDaysAgo(10) }),
      item('schoon', 'dress', { washedAt: washedDaysAgo(10) }),
    ]
    const result = plan({ items, settings: { autoWashCategories: [], autoReturnDays: 3 } })
    expect(result.toReturn).toEqual(['oud', 'ouder'])
  })

  it('telt kalenderdagen: gisteravond gewassen en 1 dag ingesteld is vandaag terug, ook al is het minder dan 24 uur', () => {
    const result = plan({
      items: [item('t', 'top', { available: false, washedAt: new Date(2026, 2, 9, 23, 30).getTime() })],
      settings: { autoWashCategories: [], autoReturnDays: 1 },
      now: new Date(2026, 2, 10, 0, 5).getTime(),
    })
    expect(result.toReturn).toEqual(['t'])
  })

  it('haalt kleding die vandaag in de was ging niet terug', () => {
    const result = plan({
      items: [item('t', 'top', { available: false, washedAt: new Date(2026, 2, 10, 0, 1).getTime() })],
      settings: { autoWashCategories: [], autoReturnDays: 1 },
    })
    expect(result.toReturn).toEqual([])
  })

  it('haalt kleding zonder washedAt (handmatig weggelegd) nooit terug', () => {
    const result = plan({
      items: [item('t', 'top', { available: false }), item('b', 'bottom', { available: false, washedAt: Number.NaN })],
      settings: { autoWashCategories: [], autoReturnDays: 1 },
    })
    expect(result.toReturn).toEqual([])
  })

  it('haalt iets dat in deze ronde de was in gaat niet meteen terug', () => {
    const result = plan({
      items: [item('t', 'top'), item('b', 'bottom', { available: false, washedAt: washedDaysAgo(2) })],
      outfits: [outfit('2026-03-09', { top: 't' })],
      settings: { autoWashCategories: ['top'], autoReturnDays: 1 },
    })
    expect(result.toWash).toEqual(['t'])
    expect(result.toReturn).toEqual(['b'])
  })
})

describe('laundry-hulpfuncties', () => {
  it('normalizeAutoWashCategories houdt alleen bekende categorieën over, op volgorde', () => {
    expect(normalizeAutoWashCategories(['socks', 'top', 'socks', 'hoed', 3])).toEqual(['top', 'socks'])
    expect(normalizeAutoWashCategories([])).toEqual([])
    expect(normalizeAutoWashCategories(undefined)).toEqual(['top', 'bottom', 'dress', 'socks'])
    expect(normalizeAutoWashCategories('top')).toEqual(['top', 'bottom', 'dress', 'socks'])
  })

  it('normalizeAutoReturnDays: hele dagen van 0 tot 365, anders 0', () => {
    expect(normalizeAutoReturnDays(3)).toBe(3)
    expect(normalizeAutoReturnDays(2.9)).toBe(2)
    expect(normalizeAutoReturnDays(1000)).toBe(365)
    expect(normalizeAutoReturnDays(-1)).toBe(0)
    expect(normalizeAutoReturnDays(Number.NaN)).toBe(0)
    expect(normalizeAutoReturnDays('3')).toBe(0)
    expect(normalizeAutoReturnDays(undefined)).toBe(0)
  })

  it('isTimestamp accepteert alleen eindige, positieve getallen', () => {
    expect(isTimestamp(1)).toBe(true)
    expect(isTimestamp(0)).toBe(false)
    expect(isTimestamp(Number.POSITIVE_INFINITY)).toBe(false)
    expect(isTimestamp('1')).toBe(false)
  })
})

describe('datumsleutels', () => {
  it('addDaysToKey telt kalenderdagen, ook over maand- en jaargrenzen', () => {
    expect(addDaysToKey('2026-03-10', 3)).toBe('2026-03-13')
    expect(addDaysToKey('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDaysToKey('2026-03-29', 1)).toBe('2026-03-30')
    expect(addDaysToKey('kapot', 1)).toBeUndefined()
  })

  it('daysBetweenKeys telt hele kalenderdagen, ook over een zomertijdwissel', () => {
    expect(daysBetweenKeys('2026-03-10', '2026-03-10')).toBe(0)
    expect(daysBetweenKeys('2026-03-25', '2026-04-01')).toBe(7)
    expect(daysBetweenKeys('2026-03-12', '2026-03-10')).toBe(-2)
    expect(daysBetweenKeys('x', '2026-03-10')).toBeNaN()
  })

  it('localDateKey geeft de lokale datum', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05')
    expect(localDateKey(new Date(2026, 0, 6, 0, 0).getTime())).toBe('2026-01-06')
  })
})
