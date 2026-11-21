#!/usr/bin/env node
/**
 * Generates a demo backup for Dress Kid: two children (Anna, size 110, and Tom, size 68)
 * with a realistic wardrobe, a few items in the wash and two past outfits per child.
 *
 * Usage:   node scripts/generate-demo-backup.mjs [--now=2026-11-21T10:00:00Z] [--out=path]
 * Output:  demo/dress-kid-backup-demo.json  (import it in the parent area, tab "Backup")
 *
 * Everything is deterministic except the time-dependent fields (`washedAt`, outfit dates,
 * `exportedAt`), which are relative to the generation time (or to `--now`), so that the
 * Wasmand has content right after importing. Run the script again shortly before a demo.
 *
 * Photos are small PNGs (data URLs): the importer deliberately rejects SVG. They are drawn
 * with a tiny built-in rasteriser and PNG encoder (zlib from Node); no dependencies.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=')
    return [k, v.join('=')]
  }),
)
const now = args.now ? Date.parse(args.now) : Date.now()
if (Number.isNaN(now)) throw new Error('Invalid --now value')
const outPath = resolve(root, args.out || 'demo/dress-kid-backup-demo.json')

const HOUR = 3600_000
const DAY = 24 * HOUR
const BASE_CREATED = Date.UTC(2026, 0, 10, 9, 0, 0)

// ---------------------------------------------------------------------------
// Tiny PNG encoder

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}
function encodePng(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0 // filter: none
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------------------
// Garment silhouettes in a 100x100 coordinate space

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const shade = (hex, f) => '#' + hexToRgb(hex).map((v) => Math.round(Math.max(0, Math.min(255, v * f))).toString(16).padStart(2, '0')).join('')

const SHIRT = [[30, 15], [42, 15], [50, 23], [58, 15], [70, 15], [92, 32], [82, 46], [72, 40], [72, 88], [28, 88], [28, 40], [18, 46], [8, 32]]
const LONG = [[30, 14], [42, 14], [50, 21], [58, 14], [70, 14], [92, 72], [80, 78], [72, 46], [72, 88], [28, 88], [28, 46], [20, 78], [8, 72]]
const PANTS = [[28, 10], [72, 10], [77, 92], [55, 92], [50, 42], [45, 92], [23, 92]]
const SHORTS = [[26, 22], [74, 22], [80, 66], [54, 66], [50, 44], [46, 66], [20, 66]]
const SKIRT = [[30, 18], [70, 18], [88, 84], [12, 84]]
const DRESS = [[38, 8], [44, 8], [50, 16], [56, 8], [62, 8], [64, 30], [80, 90], [20, 90], [36, 30]]
const ROMPER = [[34, 12], [42, 12], [50, 19], [58, 12], [66, 12], [88, 26], [80, 38], [72, 34], [72, 62], [66, 90], [54, 90], [50, 70], [46, 90], [34, 90], [28, 62], [28, 34], [20, 38], [12, 26]]
const SOCK = [[36, 8], [62, 8], [62, 58], [88, 72], [88, 92], [46, 92], [36, 70]]
const SHOE = [[8, 38], [38, 38], [48, 56], [90, 62], [95, 82], [8, 82]]
const BOOT = [[24, 10], [52, 10], [52, 54], [90, 62], [95, 84], [24, 84]]
const SANDAL = [[8, 56], [50, 56], [90, 64], [94, 82], [8, 82]]

/** A shape = { poly | ellipse, color } painted in order; `pattern` tints the first shape. */
function shapes(kind, c) {
  const dark = shade(c, 0.72)
  switch (kind) {
    case 'tshirt': return [{ poly: SHIRT, color: c, main: true }, { poly: [[42, 15], [50, 23], [58, 15], [58, 18], [50, 27], [42, 18]], color: dark }]
    case 'longsleeve': return [{ poly: LONG, color: c, main: true }, { poly: [[42, 14], [50, 21], [58, 14], [58, 17], [50, 25], [42, 17]], color: dark }]
    case 'sweater': return [{ poly: LONG, color: c, main: true }, { rect: [28, 80, 72, 88], color: dark }, { poly: [[42, 14], [50, 21], [58, 14], [58, 18], [50, 26], [42, 18]], color: dark }]
    case 'hoodie': return [{ poly: LONG, color: c, main: true }, { ellipse: [50, 20, 13, 9], color: dark }, { rect: [28, 76, 72, 88], color: dark }, { rect: [49, 28, 51, 50], color: shade(c, 1.25) }]
    case 'cardigan': return [{ poly: LONG, color: c, main: true }, { rect: [49, 21, 51, 88], color: dark }, { circle: [46, 40, 2.2], color: dark }, { circle: [46, 56, 2.2], color: dark }, { circle: [46, 72, 2.2], color: dark }]
    case 'pants': return [{ poly: PANTS, color: c, main: true }, { rect: [28, 10, 72, 17], color: dark }]
    case 'shorts': return [{ poly: SHORTS, color: c, main: true }, { rect: [26, 22, 74, 28], color: dark }]
    case 'skirt': return [{ poly: SKIRT, color: c, main: true }, { rect: [30, 18, 70, 25], color: dark }]
    case 'dress': return [{ poly: DRESS, color: c, main: true }, { rect: [37, 32, 63, 36], color: dark }]
    case 'romper': return [{ poly: ROMPER, color: c, main: true }, { circle: [50, 50, 2], color: dark }, { circle: [50, 58, 2], color: dark }]
    case 'jacket': return [{ poly: LONG, color: c, main: true }, { rect: [49, 21, 51, 88], color: shade(c, 0.55) }, { rect: [28, 80, 72, 88], color: dark }, { poly: [[40, 14], [50, 21], [60, 14], [60, 22], [50, 30], [40, 22]], color: dark }]
    case 'rainjacket': return [{ poly: LONG, color: c, main: true }, { ellipse: [50, 20, 15, 10], color: dark }, { rect: [49, 28, 51, 88], color: shade(c, 0.55) }, { rect: [34, 58, 46, 62], color: dark }, { rect: [54, 58, 66, 62], color: dark }]
    case 'sock': return [{ poly: SOCK, color: c, main: true }, { rect: [36, 8, 62, 20], color: dark }, { poly: [[62, 58], [88, 72], [88, 92], [70, 92], [70, 66]], color: shade(c, 1.2) }]
    case 'shoe': return [{ poly: SHOE, color: c, main: true }, { rect: [8, 80, 95, 88], color: '#f5f5f5' }, { rect: [18, 44, 36, 47], color: '#f5f5f5' }, { rect: [20, 52, 40, 55], color: '#f5f5f5' }]
    case 'boot': return [{ poly: BOOT, color: c, main: true }, { rect: [24, 82, 95, 90], color: dark }, { rect: [24, 10, 52, 18], color: dark }]
    case 'sandal': return [{ poly: SANDAL, color: c, main: true }, { rect: [8, 80, 94, 88], color: dark }, { rect: [30, 56, 36, 72], color: dark }]
    case 'cap': return [{ ellipse: [44, 66, 30, 36], color: c, main: true, clipOut: [[0, 66, 100, 100]] }, { rect: [14, 62, 74, 68], color: dark }, { poly: [[60, 62], [94, 70], [94, 78], [58, 74]], color: dark }, { circle: [44, 32, 3], color: dark }]
    case 'beanie': return [{ ellipse: [50, 58, 30, 30], color: c, main: true }, { rect: [20, 64, 80, 84], color: dark }, { circle: [50, 22, 10], color: shade(c, 1.3) }]
    case 'sunhat': return [{ ellipse: [50, 56, 22, 22], color: c, main: true }, { ellipse: [50, 72, 44, 11], color: shade(c, 1.1) }, { rect: [28, 62, 72, 68], color: dark }]
    case 'scarf': return [{ rect: [12, 26, 88, 46], color: c, main: true }, { rect: [62, 46, 78, 88], color: c }, { rect: [62, 76, 78, 80], color: dark }, { rect: [62, 84, 78, 88], color: dark }, { rect: [12, 34, 88, 38], color: dark }]
    default: throw new Error('Unknown kind ' + kind)
  }
}

function inside(shape, x, y) {
  if (shape.poly) {
    let hit = false
    const p = shape.poly
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, yi] = p[i]
      const [xj, yj] = p[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
    }
    return hit
  }
  if (shape.rect) return x >= shape.rect[0] && x <= shape.rect[2] && y >= shape.rect[1] && y <= shape.rect[3]
  if (shape.ellipse) {
    const [cx, cy, rx, ry] = shape.ellipse
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
  }
  return (x - shape.circle[0]) ** 2 + (y - shape.circle[1]) ** 2 <= shape.circle[2] ** 2
}

/** Pattern predicate in 100x100 space; true = use the accent colour. */
function patternHit(pattern, x, y) {
  if (pattern === 'stripes') return Math.floor(y / 8) % 2 === 1
  if (pattern === 'dots') return ((x % 14) - 7) ** 2 + ((y % 14) - 7) ** 2 < 6
  if (pattern === 'stars') return Math.abs(((x % 18) - 9) * ((y % 18) - 9)) < 4 && Math.abs((x % 18) - 9) + Math.abs((y % 18) - 9) < 8
  if (pattern === 'flowers') return ((x % 20) - 10) ** 2 + ((y % 20) - 10) ** 2 < 9
  return false
}

const SIZE = 120
const SS = 3 // supersampling per axis
function renderPhoto(def) {
  const layers = shapes(def.kind, def.color)
  const bgTop = hexToRgb('#d9e2ec')
  const rgb = Buffer.alloc(SIZE * SIZE * 3)
  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      const acc = [0, 0, 0]
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) / SIZE) * 100
          const y = ((py + (sy + 0.5) / SS) / SIZE) * 100
          let col = bgTop
          for (const layer of layers) {
            if (!inside(layer, x, y)) continue
            if (layer.clipOut && layer.clipOut.some((r) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3])) continue
            col = hexToRgb(layer.color)
            if (layer.main && def.pattern && patternHit(def.pattern, x, y)) col = hexToRgb(def.accent)
          }
          for (let i = 0; i < 3; i++) acc[i] += col[i]
        }
      }
      for (let i = 0; i < 3; i++) rgb[(py * SIZE + px) * 3 + i] = Math.round(acc[i] / (SS * SS))
    }
  }
  return 'data:image/png;base64,' + encodePng(SIZE, SIZE, rgb).toString('base64')
}

// ---------------------------------------------------------------------------
// Wardrobe definitions: [category, name, season, kind, colour, pattern?, accent?]

const ANNA = [
  ['top', 'Rood T-shirt', 'all', 'tshirt', '#e53935'],
  ['top', 'Wit T-shirt met stippen', 'summer', 'tshirt', '#f5f5f5', 'dots', '#ec407a'],
  ['top', 'Geel T-shirt', 'summer', 'tshirt', '#fdd835'],
  ['top', 'Roze gestreept shirt', 'all', 'tshirt', '#f48fb1', 'stripes', '#ffffff'],
  ['top', 'Blauw shirt lange mouw', 'winter', 'longsleeve', '#42a5f5'],
  ['top', 'Groen shirt lange mouw', 'winter', 'longsleeve', '#66bb6a'],
  ['bottom', 'Spijkerbroek', 'all', 'pants', '#3f6fb5'],
  ['bottom', 'Zwarte legging', 'all', 'pants', '#37383d'],
  ['bottom', 'Roze rok', 'summer', 'skirt', '#f06292'],
  ['bottom', 'Korte spijkerbroek', 'summer', 'shorts', '#5c8bd0'],
  ['bottom', 'Grijze joggingbroek', 'winter', 'pants', '#8d949c'],
  ['bottom', 'Gestreepte legging', 'winter', 'pants', '#7e57c2', 'stripes', '#d1c4e9'],
  ['dress', 'Jurk met bloemen', 'summer', 'dress', '#fff176', 'flowers', '#ef5350'],
  ['dress', 'Blauwe jurk', 'all', 'dress', '#29b6f6'],
  ['dress', 'Rode winterjurk', 'winter', 'dress', '#c62828'],
  ['dress', 'Gele zomerjurk', 'summer', 'dress', '#ffca28'],
  ['sweater', 'Grijze trui', 'winter', 'sweater', '#9e9e9e'],
  ['sweater', 'Roze vest', 'all', 'cardigan', '#f8bbd0'],
  ['sweater', 'Blauwe hoodie', 'all', 'hoodie', '#1e88e5'],
  ['sweater', 'Paarse trui met sterren', 'winter', 'sweater', '#8e24aa', 'stars', '#fff59d'],
  ['socks', 'Witte sokken', 'all', 'sock', '#f5f5f5'],
  ['socks', 'Roze sokken', 'all', 'sock', '#f48fb1'],
  ['socks', 'Gestreepte sokken', 'all', 'sock', '#4db6ac', 'stripes', '#ffffff'],
  ['socks', 'Warme grijze sokken', 'winter', 'sock', '#78909c'],
  ['shoes', 'Witte sneakers', 'all', 'shoe', '#eeeeee'],
  ['shoes', 'Roze sandalen', 'summer', 'sandal', '#f06292'],
  ['shoes', 'Bruine laarsjes', 'winter', 'boot', '#8d6e63'],
  ['shoes', 'Blauwe gymschoenen', 'all', 'shoe', '#1976d2'],
  ['jacket', 'Gele regenjas', 'all', 'rainjacket', '#fbc02d'],
  ['jacket', 'Blauwe winterjas', 'winter', 'jacket', '#1565c0'],
  ['jacket', 'Spijkerjasje', 'summer', 'jacket', '#6b94cc'],
  ['accessory', 'Roze pet', 'summer', 'cap', '#ec407a'],
  ['accessory', 'Rode muts', 'winter', 'beanie', '#d32f2f'],
  ['accessory', 'Gestreepte sjaal', 'winter', 'scarf', '#ff7043', 'stripes', '#ffe0b2'],
].map(([category, name, season, kind, color, pattern, accent]) => ({ category, name, season, kind, color, pattern, accent }))

const TOM = [
  ['top', 'Romper met sterren', 'all', 'romper', '#fff9c4', 'stars', '#fbc02d'],
  ['top', 'Blauwe romper', 'all', 'romper', '#64b5f6'],
  ['top', 'Witte romper met beertjes', 'summer', 'romper', '#fafafa', 'dots', '#a1887f'],
  ['top', 'Groen T-shirt', 'summer', 'tshirt', '#66bb6a'],
  ['top', 'Gestreept shirt', 'all', 'tshirt', '#e0e0e0', 'stripes', '#1e88e5'],
  ['top', 'Oranje shirt lange mouw', 'winter', 'longsleeve', '#fb8c00'],
  ['top', 'Grijs shirt lange mouw', 'winter', 'longsleeve', '#90a4ae'],
  ['bottom', 'Blauwe joggingbroekje', 'all', 'pants', '#3949ab'],
  ['bottom', 'Gestreept broekje', 'all', 'pants', '#bdbdbd', 'stripes', '#ffffff'],
  ['bottom', 'Spijkerbroekje', 'all', 'pants', '#4f7cc1'],
  ['bottom', 'Korte broek', 'summer', 'shorts', '#26a69a'],
  ['bottom', 'Warme grijze broek', 'winter', 'pants', '#757575'],
  ['sweater', 'Blauwe trui', 'winter', 'sweater', '#1e88e5'],
  ['sweater', 'Groen vestje', 'all', 'cardigan', '#81c784'],
  ['sweater', 'Rode hoodie', 'all', 'hoodie', '#e53935'],
  ['sweater', 'Beige trui', 'winter', 'sweater', '#d7ccc8'],
  ['socks', 'Witte sokjes', 'all', 'sock', '#f5f5f5'],
  ['socks', 'Blauwe sokjes', 'all', 'sock', '#64b5f6'],
  ['socks', 'Sokjes met stipjes', 'all', 'sock', '#fff59d', 'dots', '#ef6c00'],
  ['socks', 'Warme sokjes', 'winter', 'sock', '#a1887f'],
  ['shoes', 'Eerste schoentjes', 'all', 'shoe', '#ffffff'],
  ['shoes', 'Blauwe sneakertjes', 'all', 'shoe', '#42a5f5'],
  ['shoes', 'Gevoerde laarsjes', 'winter', 'boot', '#8d6e63'],
  ['jacket', 'Gele regenjas', 'all', 'rainjacket', '#fdd835'],
  ['jacket', 'Winterpak groen', 'winter', 'jacket', '#2e7d32'],
  ['jacket', 'Dun zomerjasje', 'summer', 'jacket', '#80cbc4'],
  ['accessory', 'Zonnehoedje', 'summer', 'sunhat', '#ffe082'],
  ['accessory', 'Blauwe muts', 'winter', 'beanie', '#1976d2'],
  ['accessory', 'Zachte sjaal', 'winter', 'scarf', '#bcaaa4'],
].map(([category, name, season, kind, color, pattern, accent]) => ({ category, name, season, kind, color, pattern, accent }))

const CHILDREN = [
  {
    key: 'anna',
    wardrobe: ANNA,
    child: {
      id: 'demo-child-anna',
      name: 'Anna',
      color: '#ec4899',
      avatar: 'unicorn',
      stickersEnabled: true,
      sizes: { top: ['110'], bottom: ['110'], dress: ['110'], sweater: ['110'], socks: ['27-30'], shoes: ['30'], jacket: ['110'], accessory: ['50-52'] },
    },
    sizeOf: { socks: '27-30', shoes: '30', accessory: '50-52' },
    defaultSize: '110',
    // In the wash (name -> hours ago).
    wash: { 'Rood T-shirt': 20, 'Spijkerbroek': 20, 'Witte sokken': 20 },
    // Past outfits: [days ago, {category: name}]
    outfits: [
      [1, { top: 'Rood T-shirt', bottom: 'Spijkerbroek', socks: 'Witte sokken', shoes: 'Witte sneakers', jacket: 'Gele regenjas' }],
      [2, { dress: 'Blauwe jurk', socks: 'Roze sokken', shoes: 'Blauwe gymschoenen', sweater: 'Roze vest' }],
    ],
    exclude: [['Rood T-shirt', 'Roze rok'], ['Jurk met bloemen', 'Gestreepte sokken'], ['Rode winterjurk', 'Roze sokken']],
  },
  {
    key: 'tom',
    wardrobe: TOM,
    child: {
      id: 'demo-child-tom',
      name: 'Tom',
      color: '#3b82f6',
      avatar: 'bear',
      stickersEnabled: true,
      sizes: { top: ['68'], bottom: ['68'], dress: ['68'], sweater: ['68'], socks: ['16-18'], shoes: ['17'], jacket: ['68'], accessory: ['44-46'] },
    },
    sizeOf: { socks: '16-18', shoes: '17', accessory: '44-46' },
    defaultSize: '68',
    wash: { 'Romper met sterren': 6, 'Blauwe joggingbroekje': 30, 'Witte sokjes': 30 },
    outfits: [
      [1, { top: 'Romper met sterren', bottom: 'Blauwe joggingbroekje', socks: 'Witte sokjes', shoes: 'Blauwe sneakertjes' }],
      [2, { top: 'Gestreept shirt', bottom: 'Spijkerbroekje', socks: 'Blauwe sokjes', sweater: 'Groen vestje' }],
    ],
    exclude: [['Romper met sterren', 'Gestreept broekje'], ['Oranje shirt lange mouw', 'Rode hoodie']],
  },
]

// ---------------------------------------------------------------------------
// Assemble

const pad = (n) => String(n).padStart(2, '0')
const localDate = (ms) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const children = []
const items = []
const outfits = []
let seq = 0

CHILDREN.forEach((entry, childIndex) => {
  const createdAt = BASE_CREATED + childIndex * 1000
  children.push({ ...entry.child, createdAt })
  const idByName = new Map()
  const rows = entry.wardrobe.map((def) => {
    seq += 1
    const id = `demo-${entry.key}-${String(idByName.size + 1).padStart(2, '0')}`
    idByName.set(def.name, id)
    return {
      id,
      category: def.category,
      name: def.name,
      season: def.season,
      available: true,
      excludedIds: [],
      size: entry.sizeOf[def.category] ?? entry.defaultSize,
      createdAt: BASE_CREATED + 60_000 * seq,
      photo: renderPhoto(def),
    }
  })
  const byName = (name) => {
    const id = idByName.get(name)
    if (!id) throw new Error(`Unknown item "${name}" for ${entry.key}`)
    return id
  }
  for (const [a, b] of entry.exclude) {
    rows.find((r) => r.id === byName(a)).excludedIds.push(byName(b))
    rows.find((r) => r.id === byName(b)).excludedIds.push(byName(a))
  }
  for (const [name, hoursAgo] of Object.entries(entry.wash)) {
    const row = rows.find((r) => r.id === byName(name))
    row.available = false
    row.washedAt = Math.round(now - hoursAgo * HOUR)
  }
  items.push(...rows)
  for (const [daysAgo, picks] of entry.outfits) {
    const when = now - daysAgo * DAY
    outfits.push({
      childId: entry.child.id,
      date: localDate(when),
      outfit: Object.fromEntries(Object.entries(picks).map(([cat, name]) => [cat, byName(name)])),
      completedAt: Math.round(when - 4 * HOUR),
      laundryProcessed: true,
    })
  }
})

const backup = {
  app: 'dress-kid',
  version: 1,
  exportedAt: new Date(now).toISOString(),
  settings: {
    currentSeason: 'all',
    soundEnabled: true,
    autoWashCategories: ['top', 'bottom', 'dress', 'socks'],
    autoReturnDays: 2,
  },
  children,
  items,
  outfits,
}

mkdirSync(dirname(outPath), { recursive: true })
const json = JSON.stringify(backup)
writeFileSync(outPath, json)
console.log(`Wrote ${outPath} (${(json.length / 1024).toFixed(0)} KB, ${children.length} children, ${items.length} items, ${outfits.length} outfits)`)
