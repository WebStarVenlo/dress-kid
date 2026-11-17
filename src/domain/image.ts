/** Resizing and cropping photos before they are stored. */
import { AppError } from '../i18n/AppError'
import { clampCropRect } from './crop'
import type { CropRect, PixelRect } from './crop'

export type { CropRect } from './crop'


/**
 * Computes the dimensions so the longest side is at most `maxSize`, keeping the
 * aspect ratio. Never enlarges. The result is rounded and at least 1×1.
 */
export function fitWithin(width: number, height: number, maxSize: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return { width: 1, height: 1 }
  }
  const longest = Math.max(width, height)
  const scale = maxSize > 0 && longest > maxSize ? maxSize / longest : 1
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

interface Decoded {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

async function decodeWithBitmap(file: Blob): Promise<Decoded> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
}

function decodeWithImageElement(file: Blob): Promise<Decoded> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new AppError('photoDecodeFailed'))
    }
    img.src = url
  })
}

async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await decodeWithBitmap(file)
    } catch {
      // Falls back to <img>, e.g. if imageOrientation is not supported.
    }
  }
  return decodeWithImageElement(file)
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new AppError('photoResizeFailed'))),
      'image/jpeg',
      quality,
    )
  })
}

/** Draws (part of) the decoded photo on white, scaled down to `maxSize`, as JPEG. */
async function renderJpeg(decoded: Decoded, src: PixelRect, maxSize: number, quality: number): Promise<Blob> {
  const size = fitWithin(src.sw, src.sh, maxSize)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new AppError('photoResizeFailed')
  // JPEG has no transparency: white instead of black behind transparent PNGs.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size.width, size.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(decoded.source, src.sx, src.sy, src.sw, src.sh, 0, 0, size.width, size.height)
  return canvasToJpeg(canvas, quality)
}

/**
 * Decodes a photo (with EXIF orientation), scales it down so the longest side is at most
 * `maxSize` pixels and exports it as JPEG.
 */
export async function resizePhoto(file: Blob, maxSize = 800, quality = 0.8): Promise<Blob> {
  const decoded = await decode(file)
  try {
    if (!(decoded.width > 0) || !(decoded.height > 0)) throw new AppError('photoDecodeFailed')
    return await renderJpeg(decoded, { sx: 0, sy: 0, sw: decoded.width, sh: decoded.height }, maxSize, quality)
  } finally {
    decoded.release()
  }
}

/**
 * Crops a photo to `rect` (fractions 0..1, or pixels with `unit: 'px'`), scales it to
 * `maxSize` and exports it as JPEG. The frame is kept within the photo; if nothing
 * is left, an error follows.
 */
export async function cropPhoto(file: Blob, rect: CropRect, maxSize = 800, quality = 0.8): Promise<Blob> {
  if (!(rect.w > 0) || !(rect.h > 0)) throw new AppError('cropEmpty')
  const decoded = await decode(file)
  try {
    if (!(decoded.width > 0) || !(decoded.height > 0)) throw new AppError('photoDecodeFailed')
    const src = clampCropRect(rect, decoded.width, decoded.height)
    if (!src) throw new AppError('cropEmpty')
    return await renderJpeg(decoded, src, maxSize, quality)
  } finally {
    decoded.release()
  }
}
