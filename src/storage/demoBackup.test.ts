import demoBackup from '../../demo/dress-kid-backup-demo.json?raw'
import { itemFitsChild } from '../domain/sizes'
import type { Category } from '../domain/types'
import { createIndexedDbStore } from './indexedDbStore'

describe('demo backup (demo/dress-kid-backup-demo.json)', () => {
  it('imports through the real store with two children and a filled wardrobe', async () => {
    const store = createIndexedDbStore(`dress-kid-demo-${Math.random().toString(36).slice(2)}`)
    await store.importBackup(new Blob([demoBackup], { type: 'application/json' }))

    const children = await store.listChildren()
    expect(children.map((c) => c.name).sort()).toEqual(['Anna', 'Tom'])
    const anna = children.find((c) => c.name === 'Anna')!
    const tom = children.find((c) => c.name === 'Tom')!
    expect(anna.sizes.top).toEqual(['110'])
    expect(tom.sizes.top).toEqual(['68'])

    const items = await store.listItems()
    const perChild = (child: typeof anna) => items.filter((item) => itemFitsChild(item, child))
    const annaItems = perChild(anna)
    const tomItems = perChild(tom)
    // Every item belongs to exactly one child.
    expect(annaItems.length + tomItems.length).toBe(items.length)
    expect(annaItems.length).toBeGreaterThanOrEqual(25)
    expect(tomItems.length).toBeGreaterThanOrEqual(25)

    const categories: Category[] = ['top', 'bottom', 'sweater', 'socks', 'shoes', 'jacket', 'accessory']
    for (const list of [annaItems, tomItems]) {
      for (const category of categories) expect(list.some((i) => i.category === category)).toBe(true)
      for (const season of ['summer', 'winter', 'all'] as const) expect(list.some((i) => i.season === season)).toBe(true)
    }
    expect(annaItems.some((i) => i.category === 'dress')).toBe(true)

    for (const list of [annaItems, tomItems]) {
      const washing = list.filter((i) => !i.available)
      expect(washing.length).toBeGreaterThanOrEqual(2)
      expect(washing.every((i) => typeof i.washedAt === 'number')).toBe(true)
    }
    expect(items.some((i) => i.excludedIds.length > 0)).toBe(true)
    for (const item of items) {
      expect(item.photo.type).toBe('image/png')
      expect(item.photo.size).toBeGreaterThan(0)
    }

    const settings = await store.getSettings()
    expect(settings.autoReturnDays).toBe(2)
    expect(settings.autoWashCategories).toEqual(['top', 'bottom', 'dress', 'socks'])
  })
})
