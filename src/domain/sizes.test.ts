import { itemFitsChild, normalizeSize } from './sizes'
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
    // Maten van een andere categorie tellen niet mee.
    expect(itemFitsChild({ category: 'top', size: '110' }, child({ shoes: ['28'] }))).toBe(true)
  })
})
