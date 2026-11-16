import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, vi } from 'vitest'
import type { Category, ClothingItem } from '../domain/types'
import { createIndexedDbStore } from '../storage'
import type { WardrobeStore } from '../storage'
import ParentApp from './ParentApp'
import { UNLOCK_KEY, UNLOCK_TTL_MS } from './unlock'

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
  vi.unstubAllGlobals()
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
    expect(Number(sessionStorage.getItem(UNLOCK_KEY))).toBeGreaterThan(0)
  })

  it('blijft ontgrendeld bij herladen binnen de tijd', async () => {
    sessionStorage.setItem(UNLOCK_KEY, String(Date.now() - 60_000))
    renderParent()
    expect(await screen.findByRole('button', { name: /Kleding toevoegen/ })).toBeInTheDocument()
  })

  it('is weer op slot als de ontgrendeling te oud is', () => {
    sessionStorage.setItem(UNLOCK_KEY, String(Date.now() - UNLOCK_TTL_MS - 1000))
    renderParent()
    expect(screen.getByLabelText(/Hoeveel is 7 × 6/)).toBeInTheDocument()
  })

  it('negeert de oude waarde "1" uit een eerdere versie', () => {
    sessionStorage.setItem(UNLOCK_KEY, '1')
    renderParent()
    expect(screen.getByLabelText(/Hoeveel is 7 × 6/)).toBeInTheDocument()
  })

  it('vergrendelt weer via de link naar de kinderomgeving', async () => {
    renderParent()
    await unlock()
    fireEvent.click(screen.getByRole('link', { name: /Naar de kledingkast van je kind/ }))
    expect(await screen.findByText('kind')).toBeInTheDocument()
    await waitFor(() => expect(sessionStorage.getItem(UNLOCK_KEY)).toBeNull())
  })

  it('vergrendelt niet bij een gewijzigde klik (nieuw tabblad) op de link', async () => {
    renderParent()
    await unlock()
    fireEvent.click(screen.getByRole('link', { name: /Naar de kledingkast van je kind/ }), { ctrlKey: true })
    expect(screen.getByRole('button', { name: 'Kleding toevoegen' })).toBeInTheDocument()
    expect(Number(sessionStorage.getItem(UNLOCK_KEY))).toBeGreaterThan(0)
  })

  it('vergrendelt weer als de route wordt verlaten, maar niet in StrictMode-remount', async () => {
    const { unmount } = render(
      <StrictMode>
        <MemoryRouter initialEntries={['/ouder']}>
          <ParentApp store={store} makeSum={() => ({ a: 7, b: 6 })} />
        </MemoryRouter>
      </StrictMode>,
    )
    await unlock()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(sessionStorage.getItem(UNLOCK_KEY)).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Kleding toevoegen' })).toBeInTheDocument()
    unmount()
    await waitFor(() => expect(sessionStorage.getItem(UNLOCK_KEY)).toBeNull())
  })

  it('vergrendelt na te lange tijd met een verborgen pagina', async () => {
    renderParent()
    await unlock()
    sessionStorage.setItem(UNLOCK_KEY, String(Date.now() - UNLOCK_TTL_MS - 1000))
    fireEvent(document, new Event('visibilitychange'))
    expect(await screen.findByLabelText(/Hoeveel is 7 × 6/)).toBeInTheDocument()
    expect(sessionStorage.getItem(UNLOCK_KEY)).toBeNull()
  })

  it('vergrendelt bij activiteit na te lange inactiviteit', async () => {
    renderParent()
    await unlock()
    sessionStorage.setItem(UNLOCK_KEY, String(Date.now() - UNLOCK_TTL_MS - 1000))
    fireEvent.pointerDown(document.body)
    expect(await screen.findByLabelText(/Hoeveel is 7 × 6/)).toBeInTheDocument()
  })

  it('vergrendelt via de periodieke controle', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    try {
      renderParent()
      await unlock()
      act(() => {
        vi.advanceTimersByTime(UNLOCK_TTL_MS + 20_000)
      })
      expect(await screen.findByLabelText(/Hoeveel is 7 × 6/)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('verlengt de ontgrendeling bij activiteit', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      renderParent()
      await unlock()
      const before = Number(sessionStorage.getItem(UNLOCK_KEY))
      vi.setSystemTime(Date.now() + 60_000)
      fireEvent.pointerDown(document.body)
      expect(Number(sessionStorage.getItem(UNLOCK_KEY))).toBe(before + 60_000)
    } finally {
      vi.useRealTimers()
    }
  })

  it('vraagt persistente opslag aan bij het ontgrendelen', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('navigator', { ...navigator, storage: { persist } })
    renderParent()
    await unlock()
    await waitFor(() => expect(persist).toHaveBeenCalled())
    vi.unstubAllGlobals()
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
    expect(screen.queryByRole('button', { name: /Past niet bij: Ander shirt/ })).not.toBeInTheDocument()
    const jeans = screen.getByRole('button', { name: /Past niet bij: Jeans/ })
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

  async function openBackup() {
    renderParent()
    await unlock()
    fireEvent.click(screen.getByRole('button', { name: 'Back-up' }))
    await screen.findByRole('button', { name: 'Back-up maken' })
  }

  it('toont de opslagstatus als de opslag beschermd is', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      storage: {
        persisted: vi.fn().mockResolvedValue(true),
        persist: vi.fn().mockResolvedValue(true),
        estimate: vi.fn().mockResolvedValue({ usage: 5 * 1024 * 1024, quota: 1e9 }),
      },
    })
    await openBackup()
    expect(await screen.findByText('Opslag is beschermd tegen automatisch opruimen.')).toBeInTheDocument()
    expect(screen.getByText(/Ongeveer 5,0 MB in gebruik/)).toBeInTheDocument()
  })

  it('waarschuwt als de opslag niet beschermd is', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      storage: { persisted: vi.fn().mockResolvedValue(false), persist: vi.fn().mockResolvedValue(false) },
    })
    await openBackup()
    expect(await screen.findByText(/kan de kledingkast opruimen/)).toBeInTheDocument()
  })

  it('toont niets over opslag als de browser dat niet ondersteunt', async () => {
    await openBackup()
    expect(screen.queryByText(/beschermd|opruimen als/)).not.toBeInTheDocument()
  })

  function stubPointer(coarse: boolean) {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: coarse && query === '(pointer: coarse)',
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }))
  }

  it('deelt de back-up via het deelmenu op een apparaat met touch als dat bestanden ondersteunt', async () => {
    stubPointer(true)
    const share = vi.fn().mockResolvedValue(undefined)
    const canShare = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { ...navigator, share, canShare })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    await openBackup()
    fireEvent.click(screen.getByRole('button', { name: 'Back-up maken' }))
    expect(await screen.findByText(/De back-up is gemaakt/)).toBeInTheDocument()
    expect(share).toHaveBeenCalledTimes(1)
    const shared = share.mock.calls[0]![0] as { files: File[] }
    expect(shared.files[0]!.name).toMatch(/^dress-kid-backup-\d{4}-\d{2}-\d{2}\.json$/)
    expect(click).not.toHaveBeenCalled()
  })

  it('downloadt op desktop ook als de browser bestanden kan delen', async () => {
    stubPointer(false)
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, share, canShare: () => true })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    await openBackup()
    fireEvent.click(screen.getByRole('button', { name: 'Back-up maken' }))
    expect(await screen.findByText(/De back-up is gemaakt/)).toBeInTheDocument()
    expect(share).not.toHaveBeenCalled()
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('meldt niets als de gebruiker het deelmenu annuleert', async () => {
    stubPointer(true)
    const share = vi.fn().mockRejectedValue(new DOMException('geannuleerd', 'AbortError'))
    vi.stubGlobal('navigator', { ...navigator, share, canShare: () => true })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    await openBackup()
    fireEvent.click(screen.getByRole('button', { name: 'Back-up maken' }))
    await waitFor(() => expect(share).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(screen.queryByText(/De back-up is gemaakt/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(click).not.toHaveBeenCalled()
  })

  it('valt terug op downloaden als delen niet kan of mislukt', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    // Geen share-ondersteuning
    await openBackup()
    fireEvent.click(screen.getByRole('button', { name: 'Back-up maken' }))
    expect(await screen.findByText(/De back-up is gemaakt/)).toBeInTheDocument()
    expect(click).toHaveBeenCalledTimes(1)

    // share() gooit een andere fout
    stubPointer(true)
    const share = vi.fn().mockRejectedValue(new Error('niet toegestaan'))
    vi.stubGlobal('navigator', { ...navigator, share, canShare: () => true })
    fireEvent.click(screen.getByRole('button', { name: 'Back-up maken' }))
    await waitFor(() => expect(click).toHaveBeenCalledTimes(2))
    expect(share).toHaveBeenCalled()
  })
})

describe('persistente opslag bij toevoegen', () => {
  it('vraagt persistente opslag aan na de eerste geslaagde toevoeging', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('navigator', { ...navigator, storage: { persist } })
    renderParent()
    await unlock()
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: /Kleding toevoegen/ }))
    fireEvent.click(screen.getByRole('radio', { name: /Shirt/ }))
    fireEvent.change(screen.getByLabelText("Foto's kiezen uit galerij"), {
      target: { files: [new File(['a'], 'a.png', { type: 'image/png' })] },
    })
    await screen.findByText('Zojuist toegevoegd (1)')
    expect(persist).toHaveBeenCalledTimes(2)
  })
})
