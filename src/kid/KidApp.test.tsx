import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { todayKey } from '../domain/compat'
import type { Category, ClothingItem } from '../domain/types'
import { createIndexedDbStore } from '../storage'
import type { WardrobeStore } from '../storage'
import KidApp from './KidApp'

let counter = 0
function newStore(): WardrobeStore {
  counter += 1
  return createIndexedDbStore(`kid-test-${counter}-${Math.random()}`)
}

async function add(store: WardrobeStore, category: Category, name: string): Promise<ClothingItem> {
  return store.addItem({ category, name, season: 'all', photo: new Blob([name], { type: 'image/jpeg' }) })
}

function renderKid(store: WardrobeStore) {
  return render(
    <MemoryRouter>
      <KidApp store={store} />
    </MemoryRouter>,
  )
}

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:test')
  URL.revokeObjectURL = vi.fn()
})

const click = (el: HTMLElement) => fireEvent.click(el)

describe('KidApp', () => {
  it('toont een lege-kast-melding met link naar de ouders', async () => {
    renderKid(newStore())
    expect(await screen.findByText('De kleerkast is nog leeg.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Naar de ouders' })).toHaveAttribute('href', '/ouder')
    expect(screen.getByRole('link', { name: 'Voor ouders' })).toHaveAttribute('href', '/ouder')
  })

  it('toont kleding per categorie', async () => {
    const store = newStore()
    await add(store, 'top', 'Rood shirt')
    await add(store, 'bottom', 'Blauwe broek')
    renderKid(store)
    expect(await screen.findByRole('button', { name: 'Rood shirt' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Blauwe broek' })).not.toBeInTheDocument()
    click(screen.getByRole('button', { name: 'Broek of rok' }))
    expect(screen.getByRole('button', { name: 'Blauwe broek' })).toBeInTheDocument()
  })

  it('verbergt uitgesloten kleding in een andere categorie', async () => {
    const store = newStore()
    const top = await add(store, 'top', 'Rood shirt')
    const bad = await add(store, 'bottom', 'Rok')
    await add(store, 'bottom', 'Broek')
    await store.setExcluded(top.id, bad.id, true)
    renderKid(store)
    click(await screen.findByRole('button', { name: 'Rood shirt' }))
    // automatisch doorgeschakeld naar broek of rok
    expect(await screen.findByRole('button', { name: 'Broek' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rok' })).not.toBeInTheDocument()
  })

  it('een jurk haalt shirt en broek weg', async () => {
    const store = newStore()
    await add(store, 'top', 'Gele trui')
    await add(store, 'bottom', 'Broek')
    await add(store, 'dress', 'Jurkje')
    renderKid(store)
    click(await screen.findByRole('button', { name: 'Gele trui' }))
    click(await screen.findByRole('button', { name: 'Broek' }))
    const list = screen.getByRole('list', { name: 'Jouw outfit' })
    expect(list).toHaveTextContent('Gele trui')
    expect(list).toHaveTextContent('Broek')
    click(screen.getByRole('button', { name: 'Jurk' }))
    click(screen.getByRole('button', { name: 'Jurkje' }))
    expect(list).toHaveTextContent('Jurkje')
    expect(list).not.toHaveTextContent('Gele trui')
    expect(list).not.toHaveTextContent('Broek')
    expect(screen.getByRole('button', { name: 'Shirt' })).toHaveClass('kid-tab--dimmed')
    click(screen.getByRole('button', { name: 'Shirt' }))
    expect(screen.getByRole('button', { name: 'Gele trui' })).toBeInTheDocument()
  })

  it('toont Klaar alleen als de outfit compleet is en opent het feestscherm', async () => {
    const store = newStore()
    await add(store, 'top', 'Gele trui')
    await add(store, 'bottom', 'Broek')
    renderKid(store)
    click(await screen.findByRole('button', { name: 'Gele trui' }))
    expect(screen.queryByRole('button', { name: /Klaar/ })).not.toBeInTheDocument()
    click(await screen.findByRole('button', { name: 'Broek' }))
    click(screen.getByRole('button', { name: /Klaar/ }))
    expect(screen.getByRole('heading', { name: 'Dit trek ik vandaag aan!' })).toBeInTheDocument()
    click(screen.getByRole('button', { name: /Veranderen/ }))
    expect(screen.getByRole('heading', { name: 'Wat trek je vandaag aan?' })).toBeInTheDocument()
  })

  it('bewaart de outfit en herstelt hem', async () => {
    const store = newStore()
    const top = await add(store, 'top', 'Gele trui')
    const bottom = await add(store, 'bottom', 'Broek')
    const first = renderKid(store)
    click(await screen.findByRole('button', { name: 'Gele trui' }))
    click(await screen.findByRole('button', { name: 'Broek' }))
    await waitFor(async () => {
      expect((await store.getOutfit(todayKey()))?.outfit).toEqual({ top: top.id, bottom: bottom.id })
    })
    first.unmount()
    renderKid(store)
    expect(await screen.findByRole('heading', { name: 'Dit trek ik vandaag aan!' })).toBeInTheDocument()

    click(screen.getByRole('button', { name: 'Opnieuw beginnen' }))
    await waitFor(async () => {
      expect((await store.getOutfit(todayKey()))?.outfit).toEqual({})
    })
  })
})
