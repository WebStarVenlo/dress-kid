import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { todayKey } from '../domain/compat'
import type { Category, ClothingItem } from '../domain/types'
import { createIndexedDbStore } from '../storage'
import type { WardrobeStore } from '../storage'
import KidApp from './KidApp'

let counter = 0
function emptyStore(): WardrobeStore {
  counter += 1
  return createIndexedDbStore(`kid-test-${counter}-${Math.random()}`)
}

/** Een winkel met één kind (Sam), dat automatisch gekozen wordt. */
async function newStore(): Promise<WardrobeStore> {
  const store = emptyStore()
  await store.addChild({ name: 'Sam', color: '#3366ff', sizes: {} })
  return store
}

async function childId(store: WardrobeStore, name: string): Promise<string> {
  const child = (await store.listChildren()).find((c) => c.name === name)
  if (!child) throw new Error(`geen kind ${name}`)
  return child.id
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

afterEach(() => {
  vi.useRealTimers()
  window.localStorage.clear()
})

const click = (el: HTMLElement) => fireEvent.click(el)

describe('KidApp', () => {
  it('toont een lege-kast-melding met link naar de ouders', async () => {
    renderKid(await newStore())
    expect(await screen.findByText('De kleerkast is nog leeg.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Naar de ouders' })).toHaveAttribute('href', '/ouder')
    expect(screen.getByRole('link', { name: 'Voor ouders' })).toHaveAttribute('href', '/ouder')
  })

  it('maakt onderscheid tussen een lege kast en niets draagbaars', async () => {
    const store = await newStore()
    const item = await add(store, 'top', 'Rood shirt')
    await store.updateItem(item.id, { available: false })
    renderKid(store)
    expect(await screen.findByText('Er zijn nu geen kleren om uit te kiezen.')).toBeInTheDocument()
    expect(screen.getByText(/seizoen/)).toBeInTheDocument()
    expect(screen.queryByText('De kleerkast is nog leeg.')).not.toBeInTheDocument()
  })

  it('gebruikt tabs met aria-selected', async () => {
    const store = await newStore()
    await add(store, 'top', 'Rood shirt')
    await add(store, 'bottom', 'Blauwe broek')
    renderKid(store)
    expect(await screen.findByRole('tablist', { name: 'Soort kleding' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Shirt' })).toHaveAttribute('aria-selected', 'true')
    click(screen.getByRole('tab', { name: 'Broek of rok' }))
    expect(screen.getByRole('tab', { name: 'Broek of rok' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Shirt' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tabpanel', { name: 'Broek of rok' })).toBeInTheDocument()
  })

  it('biedt bij een gekozen jurk ook shirts aan die niet bij de jurk passen en wisselt', async () => {
    const store = await newStore()
    const sam = await childId(store, 'Sam')
    const dress = await add(store, 'dress', 'Jurkje')
    const top = await add(store, 'top', 'Streepshirt')
    await store.setExcluded(top.id, dress.id, true)
    renderKid(store)
    click(await screen.findByRole('tab', { name: 'Jurk' }))
    click(screen.getByRole('button', { name: 'Jurkje' }))
    click(screen.getByRole('tab', { name: 'Shirt' }))
    expect(screen.getByRole('tab', { name: 'Shirt' })).toHaveClass('kid-tab--dimmed')
    click(screen.getByRole('button', { name: 'Streepshirt' }))
    const list = screen.getByRole('list', { name: 'Jouw outfit' })
    expect(list).toHaveTextContent('Streepshirt')
    expect(list).not.toHaveTextContent('Jurkje')
    await waitFor(async () => {
      expect((await store.getOutfit(sam, todayKey()))?.outfit).toEqual({ top: top.id })
    })
  })

  it('toont Klaar als er geen broek draagbaar is', async () => {
    const store = await newStore()
    await add(store, 'top', 'Gele trui')
    const wash = await add(store, 'bottom', 'Broek')
    await store.updateItem(wash.id, { available: false })
    renderKid(store)
    click(await screen.findByRole('button', { name: 'Gele trui' }))
    click(screen.getByRole('button', { name: /Klaar/ }))
    expect(screen.getByRole('heading', { name: 'Dit trek ik vandaag aan!' })).toBeInTheDocument()
  })

  it('toont kleding per categorie', async () => {
    const store = await newStore()
    await add(store, 'top', 'Rood shirt')
    await add(store, 'bottom', 'Blauwe broek')
    renderKid(store)
    expect(await screen.findByRole('button', { name: 'Rood shirt' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Blauwe broek' })).not.toBeInTheDocument()
    click(screen.getByRole('tab', { name: 'Broek of rok' }))
    expect(screen.getByRole('button', { name: 'Blauwe broek' })).toBeInTheDocument()
  })

  it('verbergt uitgesloten kleding in een andere categorie', async () => {
    const store = await newStore()
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
    const store = await newStore()
    await add(store, 'top', 'Gele trui')
    await add(store, 'bottom', 'Broek')
    await add(store, 'dress', 'Jurkje')
    renderKid(store)
    click(await screen.findByRole('button', { name: 'Gele trui' }))
    click(await screen.findByRole('button', { name: 'Broek' }))
    const list = screen.getByRole('list', { name: 'Jouw outfit' })
    expect(list).toHaveTextContent('Gele trui')
    expect(list).toHaveTextContent('Broek')
    click(screen.getByRole('tab', { name: 'Jurk' }))
    click(screen.getByRole('button', { name: 'Jurkje' }))
    expect(list).toHaveTextContent('Jurkje')
    expect(list).not.toHaveTextContent('Gele trui')
    expect(list).not.toHaveTextContent('Broek')
    expect(screen.getByRole('tab', { name: 'Shirt' })).toHaveClass('kid-tab--dimmed')
    click(screen.getByRole('tab', { name: 'Shirt' }))
    expect(screen.getByRole('button', { name: 'Gele trui' })).toBeInTheDocument()
  })

  it('toont Klaar alleen als de outfit compleet is en opent het feestscherm', async () => {
    const store = await newStore()
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
    const store = await newStore()
    const sam = await childId(store, 'Sam')
    const top = await add(store, 'top', 'Gele trui')
    const bottom = await add(store, 'bottom', 'Broek')
    const first = renderKid(store)
    click(await screen.findByRole('button', { name: 'Gele trui' }))
    click(await screen.findByRole('button', { name: 'Broek' }))
    await waitFor(async () => {
      expect((await store.getOutfit(sam, todayKey()))?.outfit).toEqual({ top: top.id, bottom: bottom.id })
    })
    first.unmount()
    renderKid(store)
    expect(await screen.findByRole('heading', { name: 'Dit trek ik vandaag aan!' })).toBeInTheDocument()

    click(screen.getByRole('button', { name: 'Opnieuw beginnen' }))
    await waitFor(async () => {
      expect((await store.getOutfit(sam, todayKey()))?.outfit).toEqual({})
    })
  })

  it('Opnieuw beginnen kan kort ongedaan gemaakt worden', async () => {
    const store = await newStore()
    const sam = await childId(store, 'Sam')
    const top = await add(store, 'top', 'Gele trui')
    await add(store, 'bottom', 'Broek')
    renderKid(store)
    click(await screen.findByRole('button', { name: 'Gele trui' }))
    await waitFor(async () => {
      expect((await store.getOutfit(sam, todayKey()))?.outfit).toEqual({ top: top.id })
    })
    click(screen.getByRole('button', { name: 'Opnieuw beginnen' }))
    expect(screen.getByRole('list', { name: 'Jouw outfit' })).not.toHaveTextContent('Gele trui')
    click(screen.getByRole('button', { name: 'Ongedaan maken' }))
    expect(screen.getByRole('list', { name: 'Jouw outfit' })).toHaveTextContent('Gele trui')
    expect(screen.queryByRole('button', { name: 'Ongedaan maken' })).not.toBeInTheDocument()
    await waitFor(async () => {
      expect((await store.getOutfit(sam, todayKey()))?.outfit).toEqual({ top: top.id })
    })
  })

  it('de ongedaan-maken-knop verdwijnt na 5 seconden', async () => {
    const store = await newStore()
    await add(store, 'top', 'Gele trui')
    renderKid(store)
    click(await screen.findByRole('button', { name: 'Gele trui' }))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    click(screen.getByRole('button', { name: 'Opnieuw beginnen' }))
    expect(screen.getByRole('button', { name: 'Ongedaan maken' })).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.queryByRole('button', { name: 'Ongedaan maken' })).not.toBeInTheDocument()
  })

  describe('kinderen', () => {
    async function twoChildren() {
      const store = emptyStore()
      await store.addChild({ name: 'Sam', color: '#3366ff', sizes: {} })
      await store.addChild({ name: 'Noor', color: '#ff6699', sizes: {} })
      return store
    }

    it('toont een profielkeuze bij meerdere kinderen', async () => {
      renderKid(await twoChildren())
      expect(await screen.findByRole('heading', { name: 'Wie ben jij?' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Sam/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Noor/ })).toBeInTheDocument()
    })

    it('kiest bij één kind automatisch', async () => {
      renderKid(await newStore())
      expect(await screen.findByText('De kleerkast is nog leeg.')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Wie ben jij?' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Wie ben jij/ })).not.toBeInTheDocument()
    })

    it('onthoudt de keuze en negeert een onbekend id', async () => {
      const store = await twoChildren()
      const first = renderKid(store)
      click(await screen.findByRole('button', { name: /Noor/ }))
      expect(await screen.findByText('De kleerkast is nog leeg.')).toBeInTheDocument()
      expect(window.localStorage.getItem('dress-kid-active-child')).toBe(await childId(store, 'Noor'))
      first.unmount()
      renderKid(store)
      expect(await screen.findByRole('button', { name: 'Wie ben jij? Nu: Noor' })).toBeInTheDocument()
      cleanup()
      window.localStorage.setItem('dress-kid-active-child', 'bestaat-niet')
      renderKid(store)
      expect(await screen.findByRole('heading', { name: 'Wie ben jij?' })).toBeInTheDocument()
    })

    it('wisselt van kind via de knop in de kop', async () => {
      const store = await twoChildren()
      renderKid(store)
      click(await screen.findByRole('button', { name: /Sam/ }))
      click(await screen.findByRole('button', { name: 'Wie ben jij? Nu: Sam' }))
      expect(screen.getByRole('heading', { name: 'Wie ben jij?' })).toBeInTheDocument()
      expect(window.localStorage.getItem('dress-kid-active-child')).toBeNull()
      click(screen.getByRole('button', { name: /Noor/ }))
      expect(await screen.findByRole('button', { name: 'Wie ben jij? Nu: Noor' })).toBeInTheDocument()
    })

    it('toont een vriendelijk scherm zonder kinderen', async () => {
      renderKid(emptyStore())
      expect(await screen.findByText('Een grote mens moet eerst een kind toevoegen.')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Naar de ouders' })).toHaveAttribute('href', '/ouder')
    })

    it('filtert kleding op maat van het kind', async () => {
      const store = emptyStore()
      await store.addChild({ name: 'Sam', color: '#3366ff', sizes: { top: ['104'] } })
      await store.addChild({ name: 'Noor', color: '#ff6699', sizes: {} })
      await store.addItem({ category: 'top', name: 'Maat 104', size: '104', season: 'all', photo: new Blob(['a']) })
      await store.addItem({ category: 'top', name: 'Maat 116', size: '116', season: 'all', photo: new Blob(['b']) })
      await store.addItem({ category: 'top', name: 'Zonder maat', season: 'all', photo: new Blob(['c']) })
      renderKid(store)
      click(await screen.findByRole('button', { name: /Sam/ }))
      expect(await screen.findByRole('button', { name: 'Maat 104' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Zonder maat' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Maat 116' })).not.toBeInTheDocument()
      // Noor heeft geen maten voor shirts: alles past.
      click(screen.getByRole('button', { name: 'Wie ben jij? Nu: Sam' }))
      click(screen.getByRole('button', { name: /Noor/ }))
      expect(await screen.findByRole('button', { name: 'Maat 116' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Maat 104' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Zonder maat' })).toBeInTheDocument()
    })

    it('bewaart de outfit per kind apart', async () => {
      const store = await twoChildren()
      const sam = await childId(store, 'Sam')
      const noor = await childId(store, 'Noor')
      const red = await add(store, 'top', 'Rood shirt')
      const blue = await add(store, 'top', 'Blauw shirt')
      renderKid(store)
      click(await screen.findByRole('button', { name: /Sam/ }))
      click(await screen.findByRole('button', { name: 'Rood shirt' }))
      await waitFor(async () => {
        expect((await store.getOutfit(sam, todayKey()))?.outfit).toEqual({ top: red.id })
      })
      click(screen.getByRole('button', { name: 'Wie ben jij? Nu: Sam' }))
      click(screen.getByRole('button', { name: /Noor/ }))
      // Noor begint leeg.
      expect(await screen.findByRole('list', { name: 'Jouw outfit' })).not.toHaveTextContent('Rood shirt')
      click(screen.getByRole('button', { name: 'Blauw shirt' }))
      await waitFor(async () => {
        expect((await store.getOutfit(noor, todayKey()))?.outfit).toEqual({ top: blue.id })
      })
      expect((await store.getOutfit(sam, todayKey()))?.outfit).toEqual({ top: red.id })
      // Terug naar Sam: zijn keuze is er nog.
      click(screen.getByRole('button', { name: 'Wie ben jij? Nu: Noor' }))
      click(screen.getByRole('button', { name: /Sam/ }))
      expect(await screen.findByRole('heading', { name: 'Dit trek ik vandaag aan!' })).toBeInTheDocument()
      expect(screen.getByText('Rood shirt')).toBeInTheDocument()
    })
  })

  describe('dagwisseling', () => {
    async function setup() {
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
      vi.setSystemTime(new Date(2026, 5, 10, 22, 0, 0))
      const store = await newStore()
    const sam = await childId(store, 'Sam')
      const top = await add(store, 'top', 'Gele trui')
      const bottom = await add(store, 'bottom', 'Broek')
      await store.saveOutfit(sam, '2026-06-10', { top: top.id, bottom: bottom.id })
      renderKid(store)
      expect(await screen.findByRole('heading', { name: 'Dit trek ik vandaag aan!' })).toBeInTheDocument()
      return { store, sam }
    }

    async function expectFreshDay(store: WardrobeStore, sam: string) {
      expect(await screen.findByRole('list', { name: 'Jouw outfit' })).not.toHaveTextContent('Gele trui')
      click(await screen.findByRole('button', { name: 'Gele trui' }))
      await waitFor(async () => {
        expect(Object.keys((await store.getOutfit(sam, '2026-06-11'))?.outfit ?? {})).toEqual(['top'])
      })
      expect((await store.getOutfit(sam, '2026-06-10'))?.outfit).toEqual(
        expect.objectContaining({ top: expect.any(String), bottom: expect.any(String) }),
      )
    }

    it('bewaart een tik na middernacht niet onder de oude dag', async () => {
      const { store, sam } = await setup()
      click(screen.getByRole('button', { name: 'Veranderen' }))
      vi.setSystemTime(new Date(2026, 5, 11, 0, 0, 5))
      click(await screen.findByRole('button', { name: 'Gele trui' }))
      await expectFreshDay(store, sam)
    })

    it('begint een nieuwe dag leeg na visibilitychange', async () => {
      const { store, sam } = await setup()
      vi.setSystemTime(new Date(2026, 5, 11, 7, 0, 0))
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await expectFreshDay(store, sam)
    })

    it('begint een nieuwe dag leeg na focus', async () => {
      const { store, sam } = await setup()
      vi.setSystemTime(new Date(2026, 5, 11, 7, 0, 0))
      act(() => {
        window.dispatchEvent(new Event('focus'))
      })
      await expectFreshDay(store, sam)
    })

    it('begint een nieuwe dag leeg via het interval', async () => {
      const { store, sam } = await setup()
      vi.setSystemTime(new Date(2026, 5, 11, 0, 0, 30))
      act(() => {
        vi.advanceTimersByTime(60_000)
      })
      await expectFreshDay(store, sam)
    })

    it('verandert niets zolang het dezelfde dag is', async () => {
      await setup()
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
        window.dispatchEvent(new Event('focus'))
        vi.advanceTimersByTime(60_000)
      })
      expect(screen.getByRole('heading', { name: 'Dit trek ik vandaag aan!' })).toBeInTheDocument()
    })
  })
})
