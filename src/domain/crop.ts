/** Rekenwerk voor het bijsnijkader (los van React, dus makkelijk te testen). */

/**
 * Een uitsnede van een foto. Standaard in fracties (0..1) van de breedte/hoogte;
 * met `unit: 'px'` in pixels van de oorspronkelijke foto.
 */
export interface CropRect {
  x: number
  y: number
  w: number
  h: number
  unit?: 'fraction' | 'px'
}

/** Uitsnede in pixels, binnen de foto. */
export interface PixelRect {
  sx: number
  sy: number
  sw: number
  sh: number
}

/** Beginkader: gecentreerd, 80% van de foto. */
export const DEFAULT_CROP: CropRect = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }

/** Kleinste kader (als fractie), zodat de hoeken niet over elkaar heen schuiven. */
export const MIN_CROP = 0.1

export type CropMode = 'move' | 'nw' | 'ne' | 'sw' | 'se'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * Zet een uitsnede om naar pixels en houdt hem binnen de foto.
 * Geeft `null` als er (na het inperken) niets overblijft.
 */
export function clampCropRect(rect: CropRect, width: number, height: number): PixelRect | null {
  if (![rect.x, rect.y, rect.w, rect.h, width, height].every(Number.isFinite)) return null
  if (!(width > 0) || !(height > 0) || !(rect.w > 0) || !(rect.h > 0)) return null
  const fx = rect.unit === 'px' ? 1 : width
  const fy = rect.unit === 'px' ? 1 : height
  const left = clamp(rect.x * fx, 0, width)
  const top = clamp(rect.y * fy, 0, height)
  const right = clamp((rect.x + rect.w) * fx, 0, width)
  const bottom = clamp((rect.y + rect.h) * fy, 0, height)
  const sw = right - left
  const sh = bottom - top
  if (sw < 1 || sh < 1) return null
  return { sx: left, sy: top, sw, sh }
}

/**
 * Verplaatst of vergroot/verkleint het kader (alles in fracties) met een verschuiving
 * `dx`/`dy`. Blijft binnen 0..1 en minimaal `min` groot.
 */
export function adjustCropRect(start: CropRect, mode: CropMode, dx: number, dy: number, min = MIN_CROP): CropRect {
  if (mode === 'move') {
    return {
      x: clamp(start.x + dx, 0, 1 - start.w),
      y: clamp(start.y + dy, 0, 1 - start.h),
      w: start.w,
      h: start.h,
    }
  }
  let left = start.x
  let top = start.y
  let right = start.x + start.w
  let bottom = start.y + start.h
  if (mode === 'nw' || mode === 'sw') left = clamp(left + dx, 0, right - min)
  else right = clamp(right + dx, left + min, 1)
  if (mode === 'nw' || mode === 'ne') top = clamp(top + dy, 0, bottom - min)
  else bottom = clamp(bottom + dy, top + min, 1)
  return { x: left, y: top, w: right - left, h: bottom - top }
}
