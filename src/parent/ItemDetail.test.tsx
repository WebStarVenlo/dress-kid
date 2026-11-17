import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { cropPhoto, resizePhoto } from '../domain/image'
import type { ClothingItem } from '../domain/types'
import { createIndexedDbStore } from '../storage'
import type { WardrobeStore } from '../storage'
import ItemDetail from './ItemDetail'

vi.mock('../domain/image', () => ({
  resizePhoto: vi.fn(async () => new Blob(['resized'], { type: 'image/jpeg' })),
  cropPhoto: vi.fn(async () => new Blob(['cropped'], { type: 'image/jpeg' })),
}))

let counter = 0
let store: WardrobeStore
let item: ClothingItem

beforeEach(async () => {
  store = createIndexedDbStore(`itemdetail-test-${++counter}`)
  item = await store.addItem({ category: 'top', season: 'all', photo: new Blob(['origineel'], { type: 'image/jpeg' }) })
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:test/1', revokeObjectURL: () => undefined }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.mocked(cropPhoto).mockClear()
  vi.mocked(resizePhoto).mockClear()
})

function renderDetail() {
  return render(
    <ItemDetail store={store} item={item} items={[item]} children={[]} reload={async () => undefined} onBack={() => undefined} />,
  )
}

async function storedPhotoText() {
  const [stored] = await store.listItems()
  return stored!.photo.text()
}

describe('ItemDetail bijsnijden', () => {
  it('snijdt de huidige foto bij en slaat hem op', async () => {
    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Bijsnijden' }))
    expect(screen.getByRole('dialog', { name: 'Foto bijsnijden' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hele foto' })).not.toBeInTheDocument()
    const confirm = screen.getAllByRole('button', { name: 'Bijsnijden' }).find((b) => b.closest('[role="dialog"]'))!
    fireEvent.click(confirm)
    await waitFor(async () => expect(await storedPhotoText()).toBe('cropped'))
    expect(vi.mocked(cropPhoto).mock.calls[0]![1]).toEqual({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('een nieuwe foto gaat eerst langs het bijsnijden; Hele foto vervangt zonder bijsnijden', async () => {
    renderDetail()
    fireEvent.change(screen.getByLabelText('Nieuwe foto kiezen'), {
      target: { files: [new File(['nieuw'], 'nieuw.png', { type: 'image/png' })] },
    })
    expect(screen.getByRole('dialog', { name: 'Nieuwe foto bijsnijden' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hele foto' }))
    await waitFor(async () => expect(await storedPhotoText()).toBe('resized'))
    expect(cropPhoto).not.toHaveBeenCalled()
  })

  it('Annuleren laat de foto ongemoeid', async () => {
    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: 'Bijsnijden' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await storedPhotoText()).toBe('origineel')
  })
})
