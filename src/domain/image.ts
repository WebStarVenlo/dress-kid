/** Verkleinen en bijsnijden van foto's voordat ze worden opgeslagen. */
import { clampCropRect } from './crop'
import type { CropRect, PixelRect } from './crop'

export type { CropRect } from './crop'

const DECODE_ERROR = 'Deze foto kan niet worden geopend. Kies een andere foto (bijvoorbeeld JPG of PNG).'
const EMPTY_CROP_ERROR = 'Het bijsnijkader is leeg. Kies een groter stuk van de foto.'

/**
 * Berekent de afmetingen zodat de langste zijde maximaal `maxSize` is, met behoud van
 * verhouding. Vergroot nooit. Resultaat is afgerond en minimaal 1×1.
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
      reject(new Error(DECODE_ERROR))
    }
    img.src = url
  })
}

async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await decodeWithBitmap(file)
    } catch {
      // Valt terug op <img>, bijv. als imageOrientation niet ondersteund wordt.
    }
  }
  return decodeWithImageElement(file)
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('De foto kon niet worden verkleind.'))),
      'image/jpeg',
      quality,
    )
  })
}

/** Tekent (een deel van) de gedecodeerde foto op wit, verkleind tot `maxSize`, als JPEG. */
async function renderJpeg(decoded: Decoded, src: PixelRect, maxSize: number, quality: number): Promise<Blob> {
  const size = fitWithin(src.sw, src.sh, maxSize)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('De foto kon niet worden verkleind.')
  // JPEG kent geen transparantie: wit in plaats van zwart achter doorzichtige PNG's.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size.width, size.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(decoded.source, src.sx, src.sy, src.sw, src.sh, 0, 0, size.width, size.height)
  return canvasToJpeg(canvas, quality)
}

/**
 * Decodeert een foto (met EXIF-oriëntatie), verkleint zodat de langste zijde maximaal
 * `maxSize` pixels is en exporteert als JPEG.
 */
export async function resizePhoto(file: Blob, maxSize = 800, quality = 0.8): Promise<Blob> {
  const decoded = await decode(file)
  try {
    if (!(decoded.width > 0) || !(decoded.height > 0)) throw new Error(DECODE_ERROR)
    return await renderJpeg(decoded, { sx: 0, sy: 0, sw: decoded.width, sh: decoded.height }, maxSize, quality)
  } finally {
    decoded.release()
  }
}

/**
 * Snijdt een foto bij tot `rect` (fracties 0..1, of pixels met `unit: 'px'`), verkleint tot
 * `maxSize` en exporteert als JPEG. Het kader wordt binnen de foto gehouden; blijft er niets
 * over, dan volgt een fout.
 */
export async function cropPhoto(file: Blob, rect: CropRect, maxSize = 800, quality = 0.8): Promise<Blob> {
  if (!(rect.w > 0) || !(rect.h > 0)) throw new Error(EMPTY_CROP_ERROR)
  const decoded = await decode(file)
  try {
    if (!(decoded.width > 0) || !(decoded.height > 0)) throw new Error(DECODE_ERROR)
    const src = clampCropRect(rect, decoded.width, decoded.height)
    if (!src) throw new Error(EMPTY_CROP_ERROR)
    return await renderJpeg(decoded, src, maxSize, quality)
  } finally {
    decoded.release()
  }
}
