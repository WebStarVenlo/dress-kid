import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, afterEach, vi } from 'vitest'
import type { ClothingItem } from '../domain/types'
import { createIndexedDbStore } from '../storage'
import type { WardrobeStore } from '../storage'
import Laundry from './Laundry'
import Wardrobe from './Wardrobe'

let dbCounter = 0
let store: WardrobeStore

/** Live wrapper like ParentMain: bulk change in the store, then reload the items. */
function Live({ initial, view }: { initial: ClothingItem[]; view: 'laundry' | 'wardrobe' }) {
  const [items, setItems] = useState(initial)
  const setAvailable = async (ids: string[], available: boolean) => {
    await store.setItemsAvailable(ids, available)
    setItems(await store.listItems())
  }
  return view === 'laundry' ? (
    <Laundry items={items} onSetAvailable={setAvailable} />
  ) : (
    <Wardrobe items={items} hasChildren onAdd={() => undefined} onOpen={() => undefined} onOpenChildren={() => undefined} onSetAvailable={setAvailable} />
  )
}

async function seed(name: string, category: ClothingItem['category'] = 'top') {
  return store.addItem({ category, name, season: 'all', photo: new Blob([name]) })
}

beforeEach(() => {
  store = createIndexedDbStore(`laundry-test-${++dbCounter}`)
  let n = 0
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:test/${++n}`, revokeObjectURL: () => undefined }))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('wasmand', () => {
  it('toont alleen kleding die in de was zit, met het aantal dagen', async () => {
    const a = await seed('Rood shirt')
    await seed('Blauwe broek', 'bottom')
    await store.setItemsAvailable([a.id], false)
    const washed = (await store.listItems()).find((i) => i.id === a.id)!
    // Pretend it has been in the wash for 3 days.
    await store.updateItem(a.id, { available: true })
    await store.setItemsAvailable([a.id], false)
    const items = await store.listItems()
    items.find((i) => i.id === a.id)!.washedAt = Date.now() - 3 * 24 * 60 * 60 * 1000 - 1000
    expect(washed.available).toBe(false)
    render(<Live initial={items} view="laundry" />)
    expect(screen.getByRole('button', { name: 'Rood shirt, uit de was halen' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Blauwe broek/ })).not.toBeInTheDocument()
    expect(screen.getByText('Sinds 3 dagen')).toBeInTheDocument()
  })

  it('haalt één kledingstuk uit de was', async () => {
    const a = await seed('Rood shirt')
    const b = await seed('Groene trui', 'sweater')
    await store.setItemsAvailable([a.id, b.id], false)
    render(<Live initial={await store.listItems()} view="laundry" />)
    fireEvent.click(screen.getByRole('button', { name: 'Rood shirt, uit de was halen' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Rood shirt/ })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Groene trui, uit de was halen' })).toBeInTheDocument()
    const stored = await store.listItems()
    expect(stored.find((i) => i.id === a.id)?.available).toBe(true)
    expect(stored.find((i) => i.id === b.id)?.available).toBe(false)
  })

  it('haalt alles uit de was en toont dan de lege staat', async () => {
    const a = await seed('Rood shirt')
    const b = await seed('Blauwe broek', 'bottom')
    await store.setItemsAvailable([a.id, b.id], false)
    render(<Live initial={await store.listItems()} view="laundry" />)
    fireEvent.click(screen.getByRole('button', { name: 'Alles uit de was' }))
    expect(await screen.findByText('De wasmand is leeg')).toBeInTheDocument()
    expect((await store.listItems()).every((i) => i.available)).toBe(true)
    expect(screen.queryByRole('button', { name: 'Alles uit de was' })).not.toBeInTheDocument()
  })

  it('toont de lege staat als er niets in de was zit', async () => {
    await seed('Rood shirt')
    render(<Live initial={await store.listItems()} view="laundry" />)
    expect(screen.getByText('De wasmand is leeg')).toBeInTheDocument()
  })
})

describe('kast: selecteren', () => {
  it('opent buiten selectiemodus het kledingstuk', async () => {
    await seed('Rood shirt')
    const onOpen = vi.fn()
    const items = await store.listItems()
    render(
      <Wardrobe items={items} hasChildren onAdd={() => undefined} onOpen={onOpen} onOpenChildren={() => undefined} onSetAvailable={async () => undefined} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Rood shirt, bekijk of wijzig' }))
    expect(onOpen).toHaveBeenCalledWith(items[0]!.id)
  })

  it('selecteert kleding en stopt die in de was', async () => {
    await seed('Rood shirt')
    await seed('Blauwe broek', 'bottom')
    await seed('Groene trui', 'sweater')
    render(<Live initial={await store.listItems()} view="wardrobe" />)
    fireEvent.click(screen.getByRole('button', { name: 'Selecteren' }))
    expect(screen.getByRole('button', { name: 'In de was (0)' })).toBeDisabled()
    const shirt = screen.getByRole('button', { name: 'Rood shirt, selecteren' })
    expect(shirt).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(shirt)
    fireEvent.click(screen.getByRole('button', { name: 'Blauwe broek, selecteren' }))
    expect(screen.getByRole('button', { name: 'Rood shirt, selecteren' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'In de was (2)' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Selecteren' })).toBeInTheDocument())
    const stored = await store.listItems()
    expect(stored.filter((i) => !i.available).map((i) => i.name).sort()).toEqual(['Blauwe broek', 'Rood shirt'])
    expect(screen.getAllByText('In de was')).toHaveLength(2)
  })

  it('haalt geselecteerde kleding uit de was', async () => {
    const a = await seed('Rood shirt')
    await store.setItemsAvailable([a.id], false)
    render(<Live initial={await store.listItems()} view="wardrobe" />)
    fireEvent.click(screen.getByRole('button', { name: 'Selecteren' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rood shirt, selecteren' }))
    fireEvent.click(screen.getByRole('button', { name: 'Uit de was (1)' }))
    await waitFor(async () => expect((await store.listItems())[0]?.available).toBe(true))
  })

  it('annuleert de selectie zonder iets te wijzigen', async () => {
    await seed('Rood shirt')
    render(<Live initial={await store.listItems()} view="wardrobe" />)
    fireEvent.click(screen.getByRole('button', { name: 'Selecteren' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rood shirt, selecteren' }))
    fireEvent.click(screen.getByRole('button', { name: 'Annuleren' }))
    expect(screen.getByRole('button', { name: 'Rood shirt, bekijk of wijzig' })).not.toHaveAttribute('aria-pressed')
    expect((await store.listItems())[0]?.available).toBe(true)
  })
})
