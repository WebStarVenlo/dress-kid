/** Foto's uit een webshop binnenhalen: plakken, slepen of via een afbeeldingslink. */

/** Maximale grootte van één foto (gelijk aan de limiet in de back-up). */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024

export type PhotoImportErrorCode = 'invalid-url' | 'blocked' | 'not-image' | 'too-large' | 'http'

export class PhotoImportError extends Error {
  readonly code: PhotoImportErrorCode
  readonly status?: number

  constructor(code: PhotoImportErrorCode, status?: number) {
    super(`Foto ophalen mislukt: ${code}`)
    this.name = 'PhotoImportError'
    this.code = code
    this.status = status
  }
}

const isImage = (type: string) => type.toLowerCase().startsWith('image/')

/** Afbeeldingsbestanden uit een plak- of sleepactie (items en files, zonder dubbelen). */
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

/** Haalt een afbeeldingslink uit een plak- of sleepactie als er geen bestanden zijn. */
export function imageUrlFromDataTransfer(dt: DataTransfer | null): string | null {
  if (!dt || imageFilesFromDataTransfer(dt).length > 0) return null

  const uriList = dt.getData('text/uri-list')
  for (const line of uriList.split(/\r?\n/)) {
    if (line.startsWith('#')) continue
    const url = parseHttpUrl(line)
    if (url) return url.href
  }

  const html = dt.getData('text/html')
  if (html) {
    const src = new DOMParser().parseFromString(html, 'text/html').querySelector('img[src]')?.getAttribute('src')
    const url = src ? parseHttpUrl(src) : null
    if (url) return url.href
  }

  const plain = dt.getData('text/plain').trim()
  if (plain && !/\s/.test(plain)) {
    const url = parseHttpUrl(plain)
    if (url) return url.href
  }
  return null
}

/** Haalt een afbeelding op van een http(s)-link. Gooit een PhotoImportError. */
export async function fetchImageFromUrl(url: string, signal?: AbortSignal): Promise<Blob> {
  const parsed = parseHttpUrl(url)
  if (!parsed) throw new PhotoImportError('invalid-url')

  let response: Response
  try {
    response = await fetch(parsed.href, { mode: 'cors', signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    // CORS-blokkade of geen verbinding: de browser maakt hier geen verschil tussen.
    throw new PhotoImportError('blocked')
  }
  if (!response.ok) throw new PhotoImportError('http', response.status)

  const declared = response.headers.get('content-type') ?? ''
  const length = Number(response.headers.get('content-length'))
  if (Number.isFinite(length) && length > MAX_IMPORT_BYTES) throw new PhotoImportError('too-large')

  let blob: Blob
  try {
    blob = await response.blob()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new PhotoImportError('blocked')
  }
  if (!isImage(declared) && !isImage(blob.type)) throw new PhotoImportError('not-image')
  if (blob.size > MAX_IMPORT_BYTES) throw new PhotoImportError('too-large')
  return isImage(blob.type) ? blob : new Blob([blob], { type: (declared.split(';')[0] ?? '').trim() })
}

/** Leest een afbeelding van het klembord; null als dat niet kan of er geen afbeelding op staat. */
export async function readClipboardImage(): Promise<File | null> {
  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.read !== 'function') return null
  const items = await navigator.clipboard.read()
  for (const item of items) {
    const type = item.types.find(isImage)
    if (type) {
      const blob = await item.getType(type)
      return new File([blob], `klembord.${type.split('/')[1] ?? 'png'}`, { type })
    }
  }
  return null
}

/** Kan de "Plak foto"-knop werken in deze browser? */
export const canReadClipboardImage = () =>
  typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function'

/** Nederlandse melding bij een mislukte import. */
export function photoImportMessage(error: unknown): string {
  if (error instanceof PhotoImportError) {
    switch (error.code) {
      case 'invalid-url':
        return 'Dit is geen geldige afbeeldingslink. Een link begint met http:// of https://.'
      case 'blocked':
        return 'De webshop blokkeert het ophalen van deze foto. Rechtsklik (of druk lang) op de foto, kies "Afbeelding kopiëren" en plak hier (Ctrl+V). Of sla de foto op en kies hem via "Kies uit galerij".'
      case 'not-image':
        return 'Deze link is geen foto. Kopieer de link van de afbeelding zelf, of kopieer de afbeelding en plak hem hier.'
      case 'too-large':
        return 'Deze foto is te groot (maximaal 10 MB).'
      case 'http':
        return `De webshop gaf een foutmelding${error.status ? ` (${error.status})` : ''}. Probeer een andere link of kopieer de afbeelding zelf.`
    }
  }
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Plakken is niet toegestaan. Gebruik Ctrl+V (of lang drukken en Plakken).'
  }
  return 'De foto kon niet worden opgehaald.'
}
