import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { cropPhoto, resizePhoto } from '../domain/image'
import { createIndexedDbStore } from '../storage'
import type { WardrobeStore } from '../storage'
import AddFlow from './AddFlow'

vi.mock('../domain/image', () => ({
  resizePhoto: vi.fn(async () => new Blob(['resized'], { type: 'image/jpeg' })),
  cropPhoto: vi.fn(async () => new Blob(['cropped'], { type: 'image/jpeg' })),
}))

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

function stubDevice(userAgent: string, maxTouchPoints = 0) {
  vi.stubGlobal('navigator', { ...navigator, userAgent, maxTouchPoints, clipboard: { read: vi.fn() } })
}

let counter = 0
let store: WardrobeStore

function renderFlow(initialFiles?: File[]) {
  return render(<AddFlow store={store} children={[]} reload={async () => undefined} onDone={() => undefined} initialFiles={initialFiles} />)
}

function paste(files: File[]) {
  const event = createEvent.paste(document.body)
  Object.defineProperty(event, 'clipboardData', {
    value: {
      items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
      files,
      getData: () => '',
    },
  })
  fireEvent(document.body, event)
}

beforeEach(() => {
  store = createIndexedDbStore(`addflow-test-${++counter}`)
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:test/1', revokeObjectURL: () => undefined }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.mocked(cropPhoto).mockClear()
  vi.mocked(resizePhoto).mockClear()
})

describe('AddFlow van webshop', () => {
  it('voegt een geplakte foto toe via dezelfde route als de galerij', async () => {
    renderFlow()
    fireEvent.click(screen.getByRole('radio', { name: /Shirt/ }))
    paste([new File(['a'], 'plak.png', { type: 'image/png' })])
    fireEvent.click(await screen.findByRole('button', { name: 'Hele foto' }))
    await screen.findByText('Zojuist toegevoegd (1)')
    expect(await store.listItems()).toHaveLength(1)
  })

  it('toont een melding als de webshop het ophalen blokkeert', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    renderFlow()
    fireEvent.click(screen.getByRole('radio', { name: /Shirt/ }))
    fireEvent.change(screen.getByLabelText('Afbeeldingslink plakken'), { target: { value: 'https://shop.nl/a.jpg' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ophalen' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Afbeelding kopiëren'))
    expect(await store.listItems()).toHaveLength(0)
  })

  it('haalt een foto op via een link', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('abc', { headers: { 'content-type': 'image/jpeg' } })))
    renderFlow()
    fireEvent.click(screen.getByRole('radio', { name: /Shirt/ }))
    fireEvent.change(screen.getByLabelText('Afbeeldingslink plakken'), { target: { value: 'https://shop.nl/a.jpg' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ophalen' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Hele foto' }))
    await screen.findByText('Zojuist toegevoegd (1)')
  })

  it('verwerkt initialFiles zodra een categorie gekozen is', async () => {
    renderFlow([new File(['a'], 'gedeeld.png', { type: 'image/png' })])
    expect(screen.getByText('1 foto staat klaar. Kies eerst wat het is.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /Shirt/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Hele foto' }))
    await screen.findByText('Zojuist toegevoegd (1)')
  })
})

describe('AddFlow bijsnijden', () => {
  it('toont bij één foto eerst het bijsnijdvenster en snijdt bij met het kader', async () => {
    renderFlow()
    fireEvent.click(screen.getByRole('radio', { name: /Shirt/ }))
    paste([new File(['a'], 'scherm.png', { type: 'image/png' })])
    const dialog = await screen.findByRole('dialog', { name: 'Foto bijsnijden' })
    expect(dialog).toBeInTheDocument()
    expect(await store.listItems()).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Bijsnijden' }))
    await screen.findByText('Zojuist toegevoegd (1)')
    expect(cropPhoto).toHaveBeenCalledWith(expect.any(File), { x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
    expect(resizePhoto).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('voegt niets toe bij Annuleren', async () => {
    renderFlow()
    fireEvent.click(screen.getByRole('radio', { name: /Shirt/ }))
    paste([new File(['a'], 'scherm.png', { type: 'image/png' })])
    fireEvent.click(await screen.findByRole('button', { name: 'Annuleren' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await store.listItems()).toHaveLength(0)
  })

  it('slaat bijsnijden over bij meerdere foto’s tegelijk', async () => {
    renderFlow()
    fireEvent.click(screen.getByRole('radio', { name: /Shirt/ }))
    fireEvent.change(screen.getByLabelText("Foto's kiezen uit galerij"), {
      target: {
        files: [new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.png', { type: 'image/png' })],
      },
    })
    await screen.findByText('Zojuist toegevoegd (2)')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(cropPhoto).not.toHaveBeenCalled()
  })
})

describe('AddFlow uitleg per apparaat', () => {
  it('iPhone: Safari-stappen, schermafbeelding als uitweg en een opvallende plakknop', () => {
    stubDevice(IPHONE_UA)
    renderFlow()
    expect(screen.getByText(/Druk in Safari lang op de foto → Kopieer/)).toBeInTheDocument()
    expect(screen.getByText(/Maak een schermafbeelding/)).toBeInTheDocument()
    expect(screen.getByText('Delen naar Dress Kid kan op iPhone niet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Plak foto' })).toHaveClass('parent-paste-main')
    expect(screen.getByText('Andere apparaten')).toBeInTheDocument()
  })

  it('iPad (doet zich voor als Mac) krijgt ook de iPhone-uitleg', () => {
    stubDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 5)
    renderFlow()
    expect(screen.getByText(/Druk in Safari lang op de foto/)).toBeInTheDocument()
  })

  it('Android: Delen → Dress Kid', () => {
    stubDevice(ANDROID_UA)
    renderFlow()
    const help = document.querySelector('.parent-import-help')!
    expect(help).toHaveAttribute('data-platform', 'android')
    expect(screen.getAllByText(/Delen → Dress Kid/)[0]).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Plak foto' })).toHaveClass('secondary')
  })

  it('computer: rechtsklik en Ctrl+V, de rest onder Andere apparaten', () => {
    stubDevice(WINDOWS_UA)
    renderFlow()
    const help = document.querySelector('.parent-import-help')!
    expect(help).toHaveAttribute('data-platform', 'desktop')
    const main = help.querySelector(':scope > ol')!
    expect(main).toHaveTextContent('Rechtsklik op de foto → Afbeelding kopiëren → Ctrl+V')
    const other = help.querySelector('details')!
    expect(other).toHaveTextContent('iPhone en iPad')
    expect(other).toHaveTextContent('Android')
    expect(other).not.toHaveTextContent('Rechtsklik')
  })
})
