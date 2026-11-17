import { cropPhoto, fitWithin, resizePhoto } from './image'

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

describe('cropPhoto', () => {
  function mockCanvas(width: number, height: number) {
    const bitmap = { width, height, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    const ctx = { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: '', imageSmoothingQuality: 'low' }
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation((() => ctx) as unknown as HTMLCanvasElement['getContext'])
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback, type?: string) {
        cb(new Blob([`${this.width}x${this.height}`], { type }))
      })
    return {
      bitmap,
      ctx,
      restore: () => {
        getContext.mockRestore()
        toBlob.mockRestore()
        vi.unstubAllGlobals()
      },
    }
  }

  it('snijdt bij en verkleint naar een JPEG op witte achtergrond', async () => {
    const m = mockCanvas(4000, 2000)
    try {
      const out = await cropPhoto(new Blob(['x']), { x: 0.25, y: 0, w: 0.5, h: 1 })
      expect(out.type).toBe('image/jpeg')
      expect(await out.text()).toBe('800x800')
      expect(m.ctx.fillStyle).toBe('#ffffff')
      expect(m.ctx.drawImage).toHaveBeenCalledWith(m.bitmap, 1000, 0, 2000, 2000, 0, 0, 800, 800)
      expect(m.bitmap.close).toHaveBeenCalled()
    } finally {
      m.restore()
    }
  })

  it('houdt een kader dat buiten de foto valt binnen de randen', async () => {
    const m = mockCanvas(400, 300)
    try {
      await cropPhoto(new Blob(['x']), { x: 300, y: -50, w: 500, h: 200, unit: 'px' })
      expect(m.ctx.drawImage).toHaveBeenCalledWith(m.bitmap, 300, 0, 100, 150, 0, 0, 100, 150)
    } finally {
      m.restore()
    }
  })

  it('weigert een leeg kader', async () => {
    const m = mockCanvas(400, 300)
    try {
      await expect(cropPhoto(new Blob(['x']), { x: 0.5, y: 0.5, w: 0, h: 0.2 })).rejects.toThrow(/bijsnijkader is leeg/)
      await expect(cropPhoto(new Blob(['x']), { x: 2, y: 0, w: 0.5, h: 0.5 })).rejects.toThrow(/bijsnijkader is leeg/)
      expect(m.ctx.drawImage).not.toHaveBeenCalled()
      expect(m.bitmap.close).toHaveBeenCalledTimes(1)
    } finally {
      m.restore()
    }
  })
})
