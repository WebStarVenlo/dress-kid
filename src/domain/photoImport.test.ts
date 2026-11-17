import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PhotoImportError,
  fetchImageFromUrl,
  imageFilesFromDataTransfer,
  imageUrlFromDataTransfer,
  photoImportMessage,
  readClipboardImage,
} from './photoImport'

function transfer(data: Record<string, string> = {}, files: File[] = []): DataTransfer {
  return {
    items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
    files,
    getData: (type: string) => data[type] ?? '',
  } as unknown as DataTransfer
}

const png = new File(['x'], 'a.png', { type: 'image/png' })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('imageFilesFromDataTransfer', () => {
  it('geeft afbeeldingen zonder dubbelen en negeert andere bestanden', () => {
    const txt = new File(['t'], 'a.txt', { type: 'text/plain' })
    expect(imageFilesFromDataTransfer(transfer({}, [png, txt]))).toEqual([png])
    expect(imageFilesFromDataTransfer(null)).toEqual([])
  })
})

describe('imageUrlFromDataTransfer', () => {
  it('leest text/uri-list en slaat commentaar over', () => {
    expect(imageUrlFromDataTransfer(transfer({ 'text/uri-list': '# c\r\nhttps://x.nl/a.jpg' }))).toBe('https://x.nl/a.jpg')
  })
  it('leest de eerste img uit html', () => {
    const html = '<div><a href="https://x.nl/p"><img src="https://x.nl/foto.jpg"></a></div>'
    expect(imageUrlFromDataTransfer(transfer({ 'text/html': html }))).toBe('https://x.nl/foto.jpg')
  })
  it('geeft de img-src voorrang op de link van de omringende a', () => {
    const html = '<a href="https://x.nl/product"><img src="https://x.nl/foto.jpg"></a>'
    expect(imageUrlFromDataTransfer(transfer({ 'text/html': html, 'text/uri-list': 'https://x.nl/product' }))).toBe('https://x.nl/foto.jpg')
  })
  it('valt terug op uri-list bij een relatieve of data-img', () => {
    for (const src of ['/foto.jpg', 'data:image/png;base64,AAAA']) {
      const html = `<img src="${src}">`
      expect(imageUrlFromDataTransfer(transfer({ 'text/html': html, 'text/uri-list': 'https://x.nl/a.jpg' }))).toBe('https://x.nl/a.jpg')
    }
  })
  it('leest platte tekst alleen als het een http(s)-link is', () => {
    expect(imageUrlFromDataTransfer(transfer({ 'text/plain': ' https://x.nl/a.png ' }))).toBe('https://x.nl/a.png')
    expect(imageUrlFromDataTransfer(transfer({ 'text/plain': 'hallo wereld' }))).toBeNull()
    expect(imageUrlFromDataTransfer(transfer({ 'text/plain': 'javascript:alert(1)' }))).toBeNull()
  })
  it('geeft niets terug als er bestanden zijn', () => {
    expect(imageUrlFromDataTransfer(transfer({ 'text/plain': 'https://x.nl/a.png' }, [png]))).toBeNull()
  })
})

describe('fetchImageFromUrl', () => {
  const respond = (body: BlobPart, init: ResponseInit & { type?: string } = {}) =>
    vi.fn().mockResolvedValue(new Response(body, { status: 200, headers: { 'content-type': init.type ?? 'image/jpeg' }, ...init }))

  it('weigert andere protocollen', async () => {
    await expect(fetchImageFromUrl('ftp://x.nl/a.jpg')).rejects.toMatchObject({ code: 'invalid-url' })
    await expect(fetchImageFromUrl('nonsens')).rejects.toMatchObject({ code: 'invalid-url' })
  })
  it('haalt een afbeelding op met cors', async () => {
    const fetchMock = respond('abc')
    vi.stubGlobal('fetch', fetchMock)
    const blob = await fetchImageFromUrl('https://x.nl/a.jpg')
    expect(blob.size).toBe(3)
    expect(fetchMock).toHaveBeenCalledWith('https://x.nl/a.jpg', expect.objectContaining({ mode: 'cors' }))
  })
  it('weigert niet-afbeeldingen', async () => {
    vi.stubGlobal('fetch', respond('<html>', { type: 'text/html' }))
    await expect(fetchImageFromUrl('https://x.nl/')).rejects.toMatchObject({ code: 'not-image' })
  })
  it('weigert te grote bestanden', async () => {
    vi.stubGlobal('fetch', respond(new Uint8Array(10 * 1024 * 1024 + 1)))
    await expect(fetchImageFromUrl('https://x.nl/a.jpg')).rejects.toMatchObject({ code: 'too-large' })
  })
  it('stuurt geen referrer mee', async () => {
    const fetchMock = respond('abc')
    vi.stubGlobal('fetch', fetchMock)
    await fetchImageFromUrl('https://x.nl/a.jpg')
    expect(fetchMock).toHaveBeenCalledWith('https://x.nl/a.jpg', expect.objectContaining({ referrerPolicy: 'no-referrer' }))
  })
  it('stopt met lezen als een gestreamde body te groot wordt', async () => {
    let pulls = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        controller.enqueue(new Uint8Array(4 * 1024 * 1024))
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: { 'content-type': 'image/jpeg' } })))
    await expect(fetchImageFromUrl('https://x.nl/a.jpg')).rejects.toMatchObject({ code: 'too-large' })
    expect(pulls).toBeLessThan(10)
  })
  it('geeft timeout na 15 seconden', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })),
      )
      const result = fetchImageFromUrl('https://x.nl/a.jpg')
      const assertion = expect(result).rejects.toMatchObject({ code: 'timeout' })
      await vi.advanceTimersByTimeAsync(15_000)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })
  it('gooit een AbortError als de aanroeper afbreekt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })),
    )
    const controller = new AbortController()
    const result = fetchImageFromUrl('https://x.nl/a.jpg', controller.signal)
    controller.abort()
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('meldt een http-fout', async () => {
    vi.stubGlobal('fetch', respond('nee', { status: 404 }))
    await expect(fetchImageFromUrl('https://x.nl/a.jpg')).rejects.toMatchObject({ code: 'http', status: 404 })
  })
  it('vertaalt een TypeError naar blocked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(fetchImageFromUrl('https://x.nl/a.jpg')).rejects.toMatchObject({ code: 'blocked' })
  })
})

describe('readClipboardImage', () => {
  it('geeft null zonder klembord-ondersteuning', async () => {
    vi.stubGlobal('navigator', {})
    expect(await readClipboardImage()).toBeNull()
  })
  it('geeft de afbeelding van het klembord', async () => {
    const item = { types: ['text/plain', 'image/png'], getType: async () => new Blob(['i'], { type: 'image/png' }) }
    vi.stubGlobal('navigator', { clipboard: { read: async () => [item] } })
    const file = await readClipboardImage()
    expect(file?.type).toBe('image/png')
  })
})

describe('photoImportMessage', () => {
  it('geeft een bruikbare tip bij blokkade', () => {
    expect(photoImportMessage(new PhotoImportError('blocked'))).toMatch(/Afbeelding kopiëren/)
    expect(photoImportMessage(new Error('x'))).toMatch(/niet worden opgehaald/)
  })
})
