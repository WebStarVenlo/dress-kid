/** Math for the crop frame (independent of React, so easy to test). */

/**
 * A crop of a photo. By default in fractions (0..1) of the width/height;
 * with `unit: 'px'` in pixels of the original photo.
 */
export interface CropRect {
  x: number
  y: number
  w: number
  h: number
  unit?: 'fraction' | 'px'
}

/** Crop in pixels, within the photo. */
export interface PixelRect {
  sx: number
  sy: number
  sw: number
  sh: number
}

/** Initial frame: centred, 80% of the photo. */
export const DEFAULT_CROP: CropRect = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }

/** Smallest frame (as a fraction), so the corners cannot slide over each other. */
export const MIN_CROP = 0.1

export type CropMode = 'move' | 'nw' | 'ne' | 'sw' | 'se'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * Converts a crop to pixels and keeps it within the photo.
 * Returns `null` if nothing is left (after clamping).
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
 * Moves or resizes the frame (everything in fractions) by an offset
 * `dx`/`dy`. Stays within 0..1 and at least `min` in size.
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
