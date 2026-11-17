/** Fetching photos from a web shop: paste, drag or via an image link. */
import { AppError, translateError } from '../i18n/AppError'

/** Maximum size of a single photo (equal to the limit in the backup). */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024

export type PhotoImportErrorCode = 'invalid-url' | 'blocked' | 'not-image' | 'too-large' | 'http' | 'timeout'

export class PhotoImportError extends Error {
  readonly code: PhotoImportErrorCode
  readonly status?: number

  constructor(code: PhotoImportErrorCode, status?: number) {
    super(`Photo import failed: ${code}`)
    this.name = 'PhotoImportError'
    this.code = code
    this.status = status
  }
}

const isImage = (type: string) => type.toLowerCase().startsWith('image/')

/** Image files from a paste or drag action (items and files, without duplicates). */
export function imageFilesFromDataTransfer(dt: DataTransfer | null): File[] {
  if (!dt) return []
  const found: File[] = []
  const add = (file: File | null) => {
    if (!file || !isImage(file.type)) return
    const duplicate = found.some(
      (other) => other === file || (other.name === file.name && other.size === file.size && other.lastModified === file.lastModified && other.type === file.type),
    )
    if (!duplicate) found.push(file)
  }
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === 'file') add(item.getAsFile())
  }
  for (const file of Array.from(dt.files ?? [])) add(file)
  return found
}

function parseHttpUrl(text: string): URL | null {
  try {
    const url = new URL(text.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** Extracts an image link from a paste or drag action if there are no files. */
export function imageUrlFromDataTransfer(dt: DataTransfer | null): string | null {
  if (!dt || imageFilesFromDataTransfer(dt).length > 0) return null

  // Web shop photos are often inside an <a href=product page>: the <img src> takes precedence then.
  const html = dt.getData('text/html')
  if (html) {
    const src = new DOMParser().parseFromString(html, 'text/html').querySelector('img[src]')?.getAttribute('src')
    // Only absolute http(s) links; relative links and data: links are ignored.
    const url = src ? parseHttpUrl(src) : null
    if (url) return url.href
  }

  const uriList = dt.getData('text/uri-list')
  for (const line of uriList.split(/\r?\n/)) {
    if (line.startsWith('#')) continue
    const url = parseHttpUrl(line)
    if (url) return url.href
  }

  const plain = dt.getData('text/plain').trim()
  if (plain && !/\s/.test(plain)) {
    const url = parseHttpUrl(plain)
    if (url) return url.href
  }
  return null
}

/** Maximum duration of fetching a single photo. */
export const FETCH_TIMEOUT_MS = 15_000

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

/** Reads the body in chunks and stops as soon as the limit is exceeded. */
async function readLimited(response: Response, type: string): Promise<Blob> {
  const body = response.body
  if (!body) return response.blob()
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_IMPORT_BYTES) {
      void reader.cancel().catch(() => undefined)
      throw new PhotoImportError('too-large')
    }
    chunks.push(value)
  }
  return new Blob(chunks as BlobPart[], { type })
}

/** Fetches an image from an http(s) link. Throws a PhotoImportError (or an AbortError on cancel). */
export async function fetchImageFromUrl(url: string, signal?: AbortSignal): Promise<Blob> {
  const parsed = parseHttpUrl(url)
  if (!parsed) throw new PhotoImportError('invalid-url')

  // AbortSignal.any is missing in older browsers and jsdom: own controller with timeout and passed-through signal.
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, FETCH_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', onAbort, { once: true })

  try {
    let response: Response
    try {
      response = await fetch(parsed.href, { mode: 'cors', signal: controller.signal, referrerPolicy: 'no-referrer' })
    } catch (error) {
      if (timedOut) throw new PhotoImportError('timeout')
      if (isAbortError(error) || signal?.aborted) throw error instanceof Error ? error : new DOMException('Aborted', 'AbortError')
      // CORS block or no connection: the browser makes no distinction here.
      throw new PhotoImportError('blocked')
    }
    if (!response.ok) throw new PhotoImportError('http', response.status)

    const declared = response.headers.get('content-type') ?? ''
    const lengthHeader = response.headers.get('content-length')
    const length = lengthHeader === null ? NaN : Number(lengthHeader)
    if (Number.isFinite(length) && length > MAX_IMPORT_BYTES) throw new PhotoImportError('too-large')

    let blob: Blob
    try {
      blob = await readLimited(response, declared.split(';')[0]?.trim() ?? '')
    } catch (error) {
      if (error instanceof PhotoImportError) throw error
      if (timedOut) throw new PhotoImportError('timeout')
      if (isAbortError(error)) throw error
      throw new PhotoImportError('blocked')
    }
    if (!isImage(declared) && !isImage(blob.type)) throw new PhotoImportError('not-image')
    if (blob.size > MAX_IMPORT_BYTES) throw new PhotoImportError('too-large')
    return isImage(blob.type) ? blob : new Blob([blob], { type: (declared.split(';')[0] ?? '').trim() })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** Reads an image from the clipboard; null if that is not possible or there is no image on it. */
export async function readClipboardImage(): Promise<File | null> {
  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.read !== 'function') return null
  const items = await navigator.clipboard.read()
  for (const item of items) {
    const type = item.types.find(isImage)
    if (type) {
      const blob = await item.getType(type)
      return new File([blob], `clipboard.${type.split('/')[1] ?? 'png'}`, { type })
    }
  }
  return null
}

/** Can the "Paste photo" button work in this browser? */
export const canReadClipboardImage = () =>
  typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function'

/** Translated message for a failed import. */
export function photoImportMessage(error: unknown): string {
  if (error instanceof PhotoImportError) {
    switch (error.code) {
      case 'invalid-url':
        return translateError(new AppError('photoImportInvalidUrl'))
      case 'blocked':
        return translateError(new AppError('photoImportBlocked'))
      case 'not-image':
        return translateError(new AppError('photoImportNotImage'))
      case 'too-large':
        return translateError(new AppError('photoImportTooLarge'))
      case 'timeout':
        return translateError(new AppError('photoImportTimeout'))
      case 'http':
        return error.status
          ? translateError(new AppError('photoImportHttpStatus', { status: error.status }))
          : translateError(new AppError('photoImportHttp'))
    }
  }
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return translateError(new AppError('photoImportClipboardDenied'))
  }
  return translateError(new AppError('photoImportFailed'))
}
