import { fitWithin, resizePhoto } from './image'

describe('fitWithin', () => {
  it('verkleint liggende foto’s tot de maximale breedte', () => {
    expect(fitWithin(4000, 3000, 800)).toEqual({ width: 800, height: 600 })
  })
  it('verkleint staande foto’s tot de maximale hoogte', () => {
    expect(fitWithin(3000, 4000, 800)).toEqual({ width: 600, height: 800 })
  })
  it('verkleint vierkante foto’s', () => {
    expect(fitWithin(1000, 1000, 800)).toEqual({ width: 800, height: 800 })
  })
  it('vergroot nooit', () => {
    expect(fitWithin(640, 480, 800)).toEqual({ width: 640, height: 480 })
    expect(fitWithin(800, 200, 800)).toEqual({ width: 800, height: 200 })
  })
  it('rondt af en blijft minimaal 1 pixel', () => {
    expect(fitWithin(1001, 333, 800)).toEqual({ width: 800, height: 266 })
    expect(fitWithin(10000, 1, 800)).toEqual({ width: 800, height: 1 })
  })
  it('gaat veilig om met ongeldige afmetingen', () => {
    expect(fitWithin(0, 100, 800)).toEqual({ width: 1, height: 1 })
    expect(fitWithin(Number.NaN, 100, 800)).toEqual({ width: 1, height: 1 })
  })
})

describe('resizePhoto', () => {
  it('geeft een duidelijke Nederlandse fout als de foto niet te openen is', async () => {
    // jsdom kan geen afbeeldingen decoderen: <img> geeft onerror.
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:test')
    URL.revokeObjectURL = vi.fn()
    const imageSpy = vi.spyOn(window, 'Image').mockImplementation(function (this: HTMLImageElement) {
      const img = document.createElement('img')
      queueMicrotask(() => img.onerror?.(new Event('error')))
      return img
    } as unknown as () => HTMLImageElement)
    try {
      await expect(resizePhoto(new Blob(['geen foto'], { type: 'text/plain' }))).rejects.toThrow(
        /foto kan niet worden geopend/,
      )
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
    } finally {
      imageSpy.mockRestore()
      URL.createObjectURL = originalCreate
      URL.revokeObjectURL = originalRevoke
    }
  })
})
