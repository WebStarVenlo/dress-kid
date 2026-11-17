import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { createIndexedDbStore } from '../storage'
import type { WardrobeStore } from '../storage'
import AddFlow from './AddFlow'

vi.mock('../domain/image', () => ({
  resizePhoto: vi.fn(async () => new Blob(['resized'], { type: 'image/jpeg' })),
}))

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
})

describe('AddFlow van webshop', () => {
  it('voegt een geplakte foto toe via dezelfde route als de galerij', async () => {
    renderFlow()
    fireEvent.click(screen.getByRole('radio', { name: /Shirt/ }))
    paste([new File(['a'], 'plak.png', { type: 'image/png' })])
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
    await screen.findByText('Zojuist toegevoegd (1)')
  })

  it('verwerkt initialFiles zodra een categorie gekozen is', async () => {
    renderFlow([new File(['a'], 'gedeeld.png', { type: 'image/png' })])
    expect(screen.getByText(/staan klaar/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /Shirt/ }))
    await screen.findByText('Zojuist toegevoegd (1)')
  })
})
