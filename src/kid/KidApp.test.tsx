import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { todayKey } from '../domain/compat'
import { DEFAULT_SETTINGS } from '../domain/types'
import type { Category, ClothingItem } from '../domain/types'
import { createIndexedDbStore } from '../storage'
import type { WardrobeStore } from '../storage'
import KidApp from './KidApp'

let counter = 0
function emptyStore(): WardrobeStore {
  counter += 1
  return createIndexedDbStore(`kid-test-${counter}-${Math.random()}`)
}

/** A store with one child (Sam), who is chosen automatically. */
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
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

const click = (el: HTMLElement) => fireEvent.click(el)

describe('KidApp', () => {
  it('toont een lege-kast-melding met link naar de ouders', async () => {
    renderKid(await newStore())
    expect(await screen.findByText('De kleerkast is nog leeg.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Naar de ouders' })).toHaveAttribute('href', '/parent')
    expect(screen.getByRole('link', { name: 'Voor ouders' })).toHaveAttribute('href', '/parent')
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

  it('legt uit dat er niets in de maat van het kind is, maar alleen dan', async () => {
    const store = emptyStore()
    await store.addChild({ name: 'Sam', color: '#3366ff', sizes: { top: ['104'] } })
    await store.addItem({ category: 'top', name: 'Maat 116', size: '116', season: 'all', photo: new Blob(['b']) })
    renderKid(store)
    expect(await screen.findByText('Er zijn nu geen kleren om uit te kiezen.')).toBeInTheDocument()
    expect(screen.getByText(/Er is geen kleding in jouw maat/)).toBeInTheDocument()
  })

  it('toont de maat-hint niet als kleding alleen in de was ligt', async () => {
    const store = await newStore()
    const item = await add(store, 'top', 'Rood shirt')
    await store.updateItem(item.id, { available: false })
    renderKid(store)
    await screen.findByText('Er zijn nu geen kleren om uit te kiezen.')
    expect(screen.queryByText(/in jouw maat/)).not.toBeInTheDocument()
  })

  it('toont als beginletter van het kind een hele emoji', async () => {
    const store = emptyStore()
    await store.addChild({ name: '🦊 Vos', color: '#3366ff', sizes: {} })
    await store.addChild({ name: 'Noor', color: '#ff6699', sizes: {} })
    renderKid(store)
    const button = await screen.findByRole('button', { name: /Vos/ })
    expect(button.querySelector('[aria-hidden="true"]')?.textContent).toBe('🦊')
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
    // automatically advanced to trousers or skirt
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

  describe('doorschuiven naar de volgende soort', () => {
    async function setup() {
      const store = await newStore()
      await add(store, 'top', 'Rood shirt')
      await add(store, 'bottom', 'Blauwe broek')
      renderKid(store)
      const shirt = await screen.findByRole('button', { name: 'Rood shirt' })
      return { shirt }
    }
    // After a choice the tab gets a check mark in its name, so search on part of the name.
    const selected = (name: string) => screen.getByRole('tab', { name: new RegExp(name) }).getAttribute('aria-selected')

    it('schuift pas na 650 ms door', async () => {
      const { shirt } = await setup()
      // Only now fake the timers: loading (IndexedDB) is already done by then.
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      click(shirt)
      expect(selected('Shirt')).toBe('true')
      act(() => {
        vi.advanceTimersByTime(649)
      })
      expect(selected('Shirt')).toBe('true')
      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(selected('Broek of rok')).toBe('true')
      expect(selected('Shirt')).toBe('false')
    })

    it('schuift meteen door bij verminderde beweging', async () => {
      const { shirt } = await setup()
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
      click(shirt)
      expect(selected('Broek of rok')).toBe('true')
    })

    it('een tik op een tab tijdens het wachten annuleert het doorschuiven', async () => {
      const { shirt } = await setup()
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      click(shirt)
      click(screen.getByRole('tab', { name: /Shirt/ }))
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      expect(selected('Shirt')).toBe('true')
      expect(selected('Broek of rok')).toBe('false')
    })
  })

  describe('stickerboek', () => {
    it('Klaar rondt de dag af en toont het aantal stickers', async () => {
      const store = await newStore()
      const sam = await childId(store, 'Sam')
      await add(store, 'top', 'Gele trui')
      await add(store, 'bottom', 'Broek')
      renderKid(store)
      click(await screen.findByRole('button', { name: 'Gele trui' }))
      click(await screen.findByRole('button', { name: 'Broek' }))
      click(screen.getByRole('button', { name: /Klaar/ }))
      expect(await screen.findByText('Je hebt 1 sticker!')).toBeInTheDocument()
      expect((await store.getOutfit(sam, todayKey()))?.completedAt).toEqual(expect.any(Number))
      expect(await store.countCompletedDays(sam)).toBe(1)
    })

    it('telt eerdere dagen mee (meervoud)', async () => {
      const store = await newStore()
      const sam = await childId(store, 'Sam')
      await store.markOutfitCompleted(sam, '2026-01-02')
      await add(store, 'top', 'Gele trui')
      renderKid(store)
      click(await screen.findByRole('button', { name: 'Gele trui' }))
      click(screen.getByRole('button', { name: /Klaar/ }))
      expect(await screen.findByText('Je hebt 2 stickers!')).toBeInTheDocument()
    })

    it('toont het aantal ook bij het heropenen van een afgeronde dag', async () => {
      const store = await newStore()
      await add(store, 'top', 'Gele trui')
      const first = renderKid(store)
      click(await screen.findByRole('button', { name: 'Gele trui' }))
      click(screen.getByRole('button', { name: /Klaar/ }))
      expect(await screen.findByText('Je hebt 1 sticker!')).toBeInTheDocument()
      first.unmount()
      renderKid(store)
      expect(await screen.findByRole('heading', { name: 'Dit trek ik vandaag aan!' })).toBeInTheDocument()
      expect(await screen.findByText('Je hebt 1 sticker!')).toBeInTheDocument()
    })

    it('toont geen stickerboek maar rondt de dag wel af als stickers uit staan', async () => {
      const store = emptyStore()
      const noor = await store.addChild({ name: 'Noor', color: '#3366ff', stickersEnabled: false, sizes: {} })
      await add(store, 'top', 'Gele trui')
      const countSpy = vi.spyOn(store, 'countCompletedDays')
      renderKid(store)
      click(await screen.findByRole('button', { name: 'Gele trui' }))
      click(screen.getByRole('button', { name: /Klaar/ }))
      expect(await screen.findByRole('heading', { name: 'Dit trek ik vandaag aan!' })).toBeInTheDocument()
      expect(countSpy).not.toHaveBeenCalled()
      await waitFor(async () => expect(await store.countCompletedDays(noor.id)).toBe(1))
      expect(screen.queryByText(/Je hebt/)).not.toBeInTheDocument()
      expect(document.querySelector('.kid-book')).toBeNull()
    })

    it('toont het stickerboek als stickersEnabled expliciet aan staat', async () => {
      const store = emptyStore()
      await store.addChild({ name: 'Noor', color: '#3366ff', stickersEnabled: true, sizes: {} })
      await add(store, 'top', 'Gele trui')
      renderKid(store)
      click(await screen.findByRole('button', { name: 'Gele trui' }))
      click(screen.getByRole('button', { name: /Klaar/ }))
      expect(await screen.findByText('Je hebt 1 sticker!')).toBeInTheDocument()
    })

    it('toont geen stickerboek als er nog niets verdiend is', async () => {
      const store = await newStore()
      const sam = await childId(store, 'Sam')
      const top = await add(store, 'top', 'Gele trui')
      await store.saveOutfit(sam, todayKey(), { top: top.id })
      const countSpy = vi.spyOn(store, 'countCompletedDays')
      renderKid(store)
      expect(await screen.findByRole('heading', { name: 'Dit trek ik vandaag aan!' })).toBeInTheDocument()
      await waitFor(() => expect(countSpy).toHaveBeenCalled())
      expect(screen.queryByText(/Je hebt/)).not.toBeInTheDocument()
    })
  })

  describe('seizoen', () => {
    async function seasonOf(season: 'summer' | 'winter' | 'all') {
      const store = await newStore()
      await store.saveSettings({ ...DEFAULT_SETTINGS, currentSeason: season, soundEnabled: true })
      await add(store, 'top', 'Gele trui')
      const { container } = renderKid(store)
      await screen.findByRole('button', { name: 'Gele trui' })
      return container.querySelector('main')
    }

    it('volgt het ingestelde seizoen', async () => {
      expect(await seasonOf('winter')).toHaveClass('kid-app--winter')
      cleanup()
      expect(await seasonOf('summer')).toHaveClass('kid-app--summer')
    })

    it('kiest bij "altijd" op basis van de maand', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 6, 15))
      expect(await seasonOf('all')).toHaveClass('kid-app--summer')
      cleanup()
      vi.setSystemTime(new Date(2026, 0, 15))
      expect(await seasonOf('all')).toHaveClass('kid-app--winter')
    })
  })

  describe('kinderen', () => {
    async function twoChildren() {
      const store = emptyStore()
      await store.addChild({ name: 'Sam', color: '#3366ff', sizes: {} })
      await store.addChild({ name: 'Noor', color: '#ff6699', sizes: {} })
      return store
    }

    it('toont het dier van een kind op de profielkeuze en in de kop', async () => {
      const store = emptyStore()
      await store.addChild({ name: 'Sam', color: '#3366ff', avatar: 'dino', sizes: {} })
      await store.addChild({ name: 'Noor', color: '#ff6699', sizes: {} })
      renderKid(store)
      const sam = await screen.findByRole('button', { name: /Sam/ })
      expect(sam.querySelector('svg')).toBeInTheDocument()
      expect(sam).toHaveTextContent(/^Sam$/)
      // Without an animal the initial remains.
      const noor = screen.getByRole('button', { name: /Noor/ })
      expect(noor.querySelector('svg')).not.toBeInTheDocument()
      expect(noor.querySelector('[aria-hidden="true"]')?.textContent).toBe('N')
      click(sam)
      const switcher = await screen.findByRole('button', { name: 'Wie ben jij? Nu: Sam' })
      expect(switcher.querySelector('svg')).toBeInTheDocument()
    })

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
      expect(screen.getByRole('link', { name: 'Naar de ouders' })).toHaveAttribute('href', '/parent')
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
      // Noor has no sizes for shirts: everything fits.
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
      // Noor starts empty.
      expect(await screen.findByRole('list', { name: 'Jouw outfit' })).not.toHaveTextContent('Rood shirt')
      click(screen.getByRole('button', { name: 'Blauw shirt' }))
      await waitFor(async () => {
        expect((await store.getOutfit(noor, todayKey()))?.outfit).toEqual({ top: blue.id })
      })
      expect((await store.getOutfit(sam, todayKey()))?.outfit).toEqual({ top: red.id })
      // Back to Sam: his choice is still there.
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
      // These tests are about the day rollover; keep yesterday's clothes out of the automatic wash.
      await store.saveSettings({ ...DEFAULT_SETTINGS, autoWashCategories: [] })
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

    it('stopt gisteren gedragen kleding bij de dagwisseling in de was', async () => {
      const { store } = await setup()
      await store.saveSettings({ ...DEFAULT_SETTINGS })
      vi.setSystemTime(new Date(2026, 5, 11, 7, 0, 0))
      act(() => {
        window.dispatchEvent(new Event('focus'))
      })
      await waitFor(async () => {
        const items = await store.listItems()
        expect(items.find((item) => item.name === 'Gele trui')?.available).toBe(false)
      })
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
