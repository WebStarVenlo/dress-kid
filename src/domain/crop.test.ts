import { adjustCropRect, clampCropRect } from './crop'

describe('clampCropRect', () => {
  it('rekent fracties om naar pixels', () => {
    expect(clampCropRect({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 }, 1000, 500)).toEqual({ sx: 100, sy: 100, sw: 500, sh: 250 })
  })
  it('accepteert pixels', () => {
    expect(clampCropRect({ x: 10, y: 20, w: 30, h: 40, unit: 'px' }, 100, 100)).toEqual({ sx: 10, sy: 20, sw: 30, sh: 40 })
  })
  it('houdt het kader binnen de foto', () => {
    expect(clampCropRect({ x: -0.2, y: 0.5, w: 0.5, h: 2 }, 100, 200)).toEqual({ sx: 0, sy: 100, sw: 30, sh: 100 })
    expect(clampCropRect({ x: 80, y: -10, w: 50, h: 50, unit: 'px' }, 100, 100)).toEqual({ sx: 80, sy: 0, sw: 20, sh: 40 })
  })
  it('geeft null bij een leeg of ongeldig kader', () => {
    expect(clampCropRect({ x: 0, y: 0, w: 0, h: 0.5 }, 100, 100)).toBeNull()
    expect(clampCropRect({ x: 0.2, y: 0.2, w: -0.1, h: 0.5 }, 100, 100)).toBeNull()
    expect(clampCropRect({ x: 1.2, y: 0, w: 0.5, h: 0.5 }, 100, 100)).toBeNull()
    expect(clampCropRect({ x: Number.NaN, y: 0, w: 0.5, h: 0.5 }, 100, 100)).toBeNull()
    expect(clampCropRect({ x: 0, y: 0, w: 1, h: 1 }, 0, 100)).toBeNull()
  })
})

describe('adjustCropRect', () => {
  const start = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }
  it('verplaatst binnen de foto', () => {
    expect(adjustCropRect(start, 'move', -0.5, 0.05)).toMatchObject({ x: 0, w: 0.8, h: 0.8 })
    expect(adjustCropRect(start, 'move', -0.5, 0.05).y).toBeCloseTo(0.15)
  })
  it('vergroot/verkleint vanuit een hoek en blijft minimaal groot', () => {
    const nw = adjustCropRect(start, 'nw', 0.2, 0.2)
    expect(nw.x).toBeCloseTo(0.3)
    expect(nw.w).toBeCloseTo(0.6)
    const tiny = adjustCropRect(start, 'se', -2, -2, 0.1)
    expect(tiny.w).toBeCloseTo(0.1)
    expect(tiny.h).toBeCloseTo(0.1)
    const big = adjustCropRect(start, 'ne', 1, -1)
    expect(big).toMatchObject({ y: 0 })
    expect(big.x + big.w).toBeCloseTo(1)
  })
})
