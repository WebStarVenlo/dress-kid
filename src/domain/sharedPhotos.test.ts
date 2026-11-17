import { openDB } from 'idb'
import { afterEach, beforeEach } from 'vitest'
import swSource from '../../public/share-target-sw.js?raw'
import { SHARE_DB_NAME, SHARE_DB_VERSION, SHARE_MAX_AGE_MS, SHARE_STORE, takeShared, takeSharedPhotos } from './sharedPhotos'

interface ShareTargetApi {
  DB_NAME: string
  STORE: string
  MAX_FILES: number
  MAX_BYTES: number
  isShareTarget: (method: string, url: string, scope: string) => boolean
  collectShare: (formData: FormData) => { files: File[]; link?: string }
  savePending: (idb: IDBFactory, share: { files: File[]; link?: string }, now?: number) => Promise<number>
  handleShare: (request: { formData: () => Promise<FormData> }, scope: string, idb: IDBFactory) => Promise<Response>
}

/** Loads the service worker script the way importScripts does, but without a fetch listener. */
function loadServiceWorkerScript(): ShareTargetApi {
  const fakeSelf: Record<string, unknown> = {}
  new Function('self', swSource)(fakeSelf)
  return fakeSelf.dressKidShareTarget as ShareTargetApi
}

const sw = loadServiceWorkerScript()
const SCOPE = 'https://webstarvenlo.github.io/dress-kid/'

function image(name: string, content = name, type = 'image/png') {
  return new File([content], name, { type })
}

async function textOf(file: File) {
  return new TextDecoder().decode(await file.arrayBuffer())
}

beforeEach(async () => {
  await takeShared()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('takeShared', () => {
  it('geeft de klaargezette foto\'s terug en leegt de wachtrij', async () => {
    await sw.savePending(indexedDB, { files: [image('a.png', 'aaa'), image('b.jpg', 'bb', 'image/jpeg')] })

    const files = await takeSharedPhotos()
    expect(files.map((f) => [f.name, f.type, f.size])).toEqual([
      ['a.png', 'image/png', 3],
      ['b.jpg', 'image/jpeg', 2],
    ])
    expect(await textOf(files[0]!)).toBe('aaa')
    expect(await takeSharedPhotos()).toEqual([])
  })

  it('leest ook records die rechtstreeks in de store staan', async () => {
    const db = await openDB(SHARE_DB_NAME, SHARE_DB_VERSION)
    await db.add(SHARE_STORE, { kind: 'photo', name: 'x.webp', type: 'image/webp', data: new TextEncoder().encode('xy').buffer, sharedAt: Date.now() })
    db.close()
    const { files, url } = await takeShared()
    expect(files).toHaveLength(1)
    expect(files[0]!.type).toBe('image/webp')
    expect(url).toBeUndefined()
  })

  it('geeft niets en geen fout als de database nog niet bestaat', async () => {
    await expect(takeShared({ dbName: 'bestaat-niet' })).resolves.toEqual({ files: [] })
  })

  it('gooit verouderde delingen weg', async () => {
    const now = Date.now()
    await sw.savePending(indexedDB, { files: [image('oud.png')] }, now - SHARE_MAX_AGE_MS - 1000)
    expect(await takeShared({ now })).toEqual({ files: [] })
    expect(await takeShared()).toEqual({ files: [] })
  })

  it('geeft een gedeelde link door als er geen foto bij zat', async () => {
    await sw.savePending(indexedDB, { files: [], link: 'https://shop.nl/jurk' })
    expect(await takeShared()).toEqual({ files: [], url: 'https://shop.nl/jurk' })
  })

  it('vervangt een eerdere, nog niet opgehaalde deling', async () => {
    await sw.savePending(indexedDB, { files: [image('eerst.png')] })
    await sw.savePending(indexedDB, { files: [image('daarna.png')] })
    expect((await takeSharedPhotos()).map((f) => f.name)).toEqual(['daarna.png'])
  })
})

describe('service worker (share-target-sw.js)', () => {
  it('gebruikt dezelfde database als de app', () => {
    expect(sw.DB_NAME).toBe(SHARE_DB_NAME)
    expect(sw.STORE).toBe(SHARE_STORE)
  })

  it('herkent alleen de POST naar share-target binnen de scope', () => {
    expect(sw.isShareTarget('POST', `${SCOPE}share-target`, SCOPE)).toBe(true)
    expect(sw.isShareTarget('POST', `${SCOPE}share-target?x=1`, SCOPE)).toBe(true)
    expect(sw.isShareTarget('GET', `${SCOPE}share-target`, SCOPE)).toBe(false)
    expect(sw.isShareTarget('POST', 'https://webstarvenlo.github.io/share-target', SCOPE)).toBe(false)
    expect(sw.isShareTarget('POST', `${SCOPE}index.html`, SCOPE)).toBe(false)
  })

  it('bewaart alleen afbeeldingen, hooguit 10 en niet te groot', () => {
    const form = new FormData()
    form.append('photos', image('ok.png'))
    form.append('photos', new File(['tekst'], 'notitie.txt', { type: 'text/plain' }))
    form.append('photos', new File([], 'leeg.png', { type: 'image/png' }))
    form.append('photos', 'geen bestand')
    for (let i = 0; i < 12; i++) form.append('photos', image(`extra-${i}.jpg`, 'x', 'image/jpeg'))
    const share = sw.collectShare(form)
    expect(share.files).toHaveLength(sw.MAX_FILES)
    expect(share.files[0]!.name).toBe('ok.png')
    expect(share.files.some((f) => f.name === 'notitie.txt' || f.name === 'leeg.png')).toBe(false)
    expect(share.link).toBeUndefined()

    const big = { name: 'groot.png', type: 'image/png', size: sw.MAX_BYTES + 1 }
    const fake = { getAll: () => [big], get: () => null } as unknown as FormData
    expect(sw.collectShare(fake).files).toEqual([])
  })

  it('onthoudt zonder foto de link uit url of tekst', () => {
    const viaUrl = new FormData()
    viaUrl.append('url', 'https://shop.nl/a')
    viaUrl.append('text', 'Kijk https://shop.nl/b')
    expect(sw.collectShare(viaUrl)).toEqual({ files: [], link: 'https://shop.nl/a' })

    const viaText = new FormData()
    viaText.append('text', 'Mooie jurk! https://shop.nl/jurk?id=3')
    expect(sw.collectShare(viaText).link).toBe('https://shop.nl/jurk?id=3')

    const none = new FormData()
    none.append('text', 'alleen tekst javascript:alert(1)')
    expect(sw.collectShare(none).link).toBeUndefined()
  })

  it('stuurt na het delen door naar het ouderscherm binnen de scope', async () => {
    const form = new FormData()
    form.append('photos', image('gedeeld.png'))
    const response = await sw.handleShare({ formData: async () => form }, SCOPE, indexedDB)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(`${SCOPE}#/parent?shared=1`)
    expect((await takeSharedPhotos()).map((f) => f.name)).toEqual(['gedeeld.png'])
  })

  it('stuurt ook door als het formulier niet gelezen kan worden', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await sw.handleShare({ formData: () => Promise.reject(new Error('kapot')) }, SCOPE, indexedDB)
    expect(response.status).toBe(303)
    expect(await takeShared()).toEqual({ files: [] })
  })
})
