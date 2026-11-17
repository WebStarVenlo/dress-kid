import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import CropDialog from './CropDialog'

const photo = new Blob(['foto'], { type: 'image/png' })
let revoke: ReturnType<typeof vi.fn>

beforeEach(() => {
  revoke = vi.fn()
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:crop/1', revokeObjectURL: revoke }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function setup() {
  const props = { onCrop: vi.fn(), onWholePhoto: vi.fn(), onCancel: vi.fn() }
  const view = render(<CropDialog photo={photo} {...props} />)
  return { ...props, ...view }
}

/** jsdom has no layout: give the photo area a fixed size. */
function sizeFrame(width: number, height: number) {
  const frame = document.querySelector('.parent-crop-frame') as HTMLElement
  frame.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width, height, right: width, bottom: height, toJSON: () => ({}) })
}

describe('CropDialog', () => {
  it('toont een gelabeld venster met de foto en zet de focus op Bijsnijden', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Foto bijsnijden' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Foto om bij te snijden' })).toHaveAttribute('src', 'blob:crop/1')
    expect(screen.getByRole('button', { name: 'Bijsnijden' })).toHaveFocus()
    const box = document.querySelector('.parent-crop-box') as HTMLElement
    expect(box.style.left).toBe('10%')
    expect(box.style.width).toBe('80%')
  })

  it('Hele foto: geen kader, de foto blijft zoals hij is', () => {
    const { onWholePhoto, onCrop } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Hele foto' }))
    expect(onWholePhoto).toHaveBeenCalledTimes(1)
    expect(onCrop).not.toHaveBeenCalled()
  })

  it('Bijsnijden geeft het standaardkader terug', () => {
    const { onCrop } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Bijsnijden' }))
    expect(onCrop).toHaveBeenCalledWith({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
  })

  it('verplaatst het kader met slepen (pointer events)', () => {
    const { onCrop } = setup()
    sizeFrame(200, 100)
    const box = document.querySelector('.parent-crop-box') as HTMLElement
    fireEvent.pointerDown(box, { pointerId: 1, clientX: 100, clientY: 50 })
    fireEvent.pointerMove(box, { pointerId: 1, clientX: 80, clientY: 40 })
    fireEvent.pointerUp(box, { pointerId: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Bijsnijden' }))
    const rect = onCrop.mock.calls[0]![0]
    expect(rect.x).toBeCloseTo(0)
    expect(rect.y).toBeCloseTo(0)
    expect(rect.w).toBeCloseTo(0.8)
  })

  it('maakt het kader kleiner met een hoekgreep', () => {
    const { onCrop } = setup()
    sizeFrame(200, 100)
    const handle = document.querySelector('.parent-crop-handle.is-se') as HTMLElement
    fireEvent.pointerDown(handle, { pointerId: 2, clientX: 180, clientY: 90 })
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: 140, clientY: 70 })
    fireEvent.pointerUp(handle, { pointerId: 2 })
    fireEvent.click(screen.getByRole('button', { name: 'Bijsnijden' }))
    const rect = onCrop.mock.calls[0]![0]
    expect(rect.x).toBeCloseTo(0.1)
    expect(rect.w).toBeCloseTo(0.6)
    expect(rect.h).toBeCloseTo(0.6)
  })

  it('Escape annuleert', () => {
    const { onCancel } = setup()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('Annuleren roept onCancel aan en de object-URL wordt vrijgegeven', async () => {
    const { onCancel, unmount } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Annuleren' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    unmount()
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:crop/1'))
  })

  it('zonder onWholePhoto geen knop Hele foto', () => {
    render(<CropDialog photo={photo} onCrop={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Hele foto' })).not.toBeInTheDocument()
  })
})

describe('CropDialog focusval', () => {
  it('Tab en Shift+Tab blijven binnen het venster', () => {
    setup()
    const first = document.querySelector('.parent-crop-box') as HTMLElement
    const last = screen.getByRole('button', { name: 'Annuleren' })
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(first).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
  })
})
