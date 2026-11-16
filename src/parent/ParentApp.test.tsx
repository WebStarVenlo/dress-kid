import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, vi } from 'vitest'
import type { Category, ClothingItem } from '../domain/types'
import { createIndexedDbStore } from '../storage'
import type { WardrobeStore } from '../storage'
import ParentApp from './ParentApp'

vi.mock('../domain/image', () => ({
  resizePhoto: vi.fn(async (file: Blob) => {
    if ((file as File).name === 'kapot.png') throw new Error('Deze foto kan niet worden geopend.')
    return new Blob(['resized'], { type: 'image/jpeg' })
  }),
}))

let dbCounter = 0
let store: WardrobeStore

function renderParent() {
  return render(
    <MemoryRouter initialEntries={['/ouder']}>
      <Routes>
        <Route path="/ouder/*" element={<ParentApp store={store} makeSum={() => ({ a: 7, b: 6 })} />} />
        <Route path="/" element={<p>kind</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function seed(category: Category, name: string, extra?: { season?: 'summer' | 'winter' | 'all' }) {
  return store.addItem({ category, name, season: extra?.season ?? 'all', photo: new Blob([name]) })
}

async function unlock() {
  fireEvent.change(screen.getByLabelText(/Hoeveel is 7 × 6/), { target: { value: '42' } })
  fireEvent.click(screen.getByRole('button', { name: 'Openen' }))
  await screen.findByRole('button', { name: 'Kleding toevoegen' })
}

beforeEach(() => {
  sessionStorage.clear()
  store = createIndexedDbStore(`parent-test-${++dbCounter}`)
  let n = 0
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:test/${++n}`, revokeObjectURL: () => undefined }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ouderslot', () => {
  it('blokkeert tot het juiste antwoord is gegeven', async () => {
    renderParent()
    expect(screen.getByRole('heading', { name: 'Ouderbeheer' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Kleding toevoegen/ })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Hoeveel is 7 × 6/), { target: { value: '41' } })
    fireEvent.click(screen.getByRole('button', { name: 'Openen' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Dat klopt niet')
    expect(screen.queryByRole('button', { name: /Kleding toevoegen/ })).not.toBeInTheDocument()

    await unlock()
    expect(sessionStorage.getItem('dress-kid-parent-unlocked')).toBe('1')
  })

  it('blijft ontgrendeld binnen dezelfde sessie', async () => {
    sessionStorage.setItem('dress-kid-parent-unlocked', '1')
    renderParent()
    expect(await screen.findByRole('button', { name: /Kleding toevoegen/ })).toBeInTheDocument()
  })
})

describe('kledingkast', () => {
  it('toont een lege staat', async () => {
    renderParent()
    await unlock()
    expect(screen.getByText('Nog niets in de kledingkast.')).toBeInTheDocument()
  })

  it('toont kleding per categorie met badges', async () => {
    const shirt = await seed('top', 'Blauw shirt', { season: 'summer' })
    await seed('shoes', 'Gympen')
    await store.updateItem(shirt.id, { available: false })
    renderParent()
    await unlock()
    const tops = await screen.findByRole('region', { name: 'Shirt' })
    expect(within(tops).getByRole('button', { name: /Blauw shirt/ })).toBeInTheDocument()
    expect(within(tops).getByText('Zomer')).toBeInTheDocument()
    expect(within(tops).getByText('In de was')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Schoenen' })).getByRole('button', { name: /Gympen/ })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Jurk' })).not.toBeInTheDocument()
  })
})

describe('toevoegen', () => {
  it('verwerkt een batch en meldt mislukte foto\'s zonder de rest te verliezen', async () => {
    renderParent()
    await unlock()
    fireEvent.click(screen.getByRole('button', { name: /Kleding toevoegen/ }))
    expect(screen.getByRole('button', { name: /Foto maken/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: /Shirt/ }))
    fireEvent.click(screen.getByRole('radio', { name: 'Zomer' }))
    const input = screen.getByLabelText("Foto's kiezen uit galerij")
    fireEvent.change(input, {
      target: {
        files: [
          new File(['a'], 'a.png', { type: 'image/png' }),
          new File(['x'], 'kapot.png', { type: 'image/png' }),
          new File(['b'], 'b.png', { type: 'image/png' }),
        ],
      },
    })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('kapot.png'))
    const items = await store.listItems()
    expect(items).toHaveLength(2)
    expect(items.every((i) => i.category === 'top' && i.season === 'summer')).toBe(true)
    expect(screen.getByText('Zojuist toegevoegd (2)')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Shirt/ })).toHaveAttribute('aria-checked', 'true')
  })
})

describe('kledingstuk', () => {
  let shirt: ClothingItem
  let pants: ClothingItem

  async function openShirt() {
    shirt = await seed('top', 'Rood shirt')
    pants = await seed('bottom', 'Jeans')
    await seed('top', 'Ander shirt')
    renderParent()
    await unlock()
    fireEvent.click(await screen.findByRole('button', { name: /Rood shirt/ }))
    await screen.findByRole('heading', { name: 'Past niet bij' })
  }

  it('slaat een uitsluiting symmetrisch op en toont alleen andere categorieën', async () => {
    await openShirt()
    expect(screen.queryByRole('button', { name: /Ander shirt, past niet/ })).not.toBeInTheDocument()
    const jeans = screen.getByRole('button', { name: /Jeans, past niet/ })
    fireEvent.click(jeans)
    expect(jeans).toHaveAttribute('aria-pressed', 'true')
    await waitFor(async () => {
      expect((await store.getItem(shirt.id))?.excludedIds).toEqual([pants.id])
      expect((await store.getItem(pants.id))?.excludedIds).toEqual([shirt.id])
    })
    fireEvent.click(jeans)
    await waitFor(async () => expect((await store.getItem(pants.id))?.excludedIds).toEqual([]))
  })

  it('zet een kledingstuk in de was', async () => {
    await openShirt()
    const toggle = screen.getByRole('button', { name: /In de was/ })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    await waitFor(async () => expect((await store.getItem(shirt.id))?.available).toBe(false))
    await waitFor(() => expect(screen.getByRole('button', { name: /In de was/ })).toHaveAttribute('aria-pressed', 'true'))
  })

  it('verwijdert pas na bevestiging', async () => {
    await openShirt()
    fireEvent.click(screen.getByRole('button', { name: /Verwijderen/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Annuleren' }))
    expect(await store.getItem(shirt.id)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /Verwijderen/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Ja, verwijderen' }))
    await waitFor(async () => expect(await store.getItem(shirt.id)).toBeUndefined())
    await screen.findByRole('button', { name: /Kleding toevoegen/ })
    expect(screen.queryByRole('button', { name: /Rood shirt/ })).not.toBeInTheDocument()
  })
})

describe('instellingen en back-up', () => {
  it('slaat het seizoen op', async () => {
    renderParent()
    await unlock()
    fireEvent.click(screen.getByRole('button', { name: 'Seizoen' }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Winter' }))
    await waitFor(async () => expect((await store.getSettings()).currentSeason).toBe('winter'))
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Winter' })).toHaveAttribute('aria-checked', 'true'))
  })

  it('toont een foutmelding bij een ongeldig back-upbestand', async () => {
    await seed('top', 'Blijft staan')
    renderParent()
    await unlock()
    fireEvent.click(screen.getByRole('button', { name: 'Back-up' }))
    fireEvent.change(await screen.findByLabelText('Back-upbestand kiezen'), {
      target: { files: [new File(['dit is geen json'], 'kapot.json', { type: 'application/json' })] },
    })
    expect(screen.getByRole('alertdialog')).toHaveTextContent('vervangt')
    fireEvent.click(screen.getByRole('button', { name: 'Ja, alles vervangen' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent?.length).toBeGreaterThan(5)
    expect(await store.listItems()).toHaveLength(1)
  })
})
