import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  chooseItem,
  conflictingCategories,
  isOutfitComplete,
  pruneOutfit,
  selectableItems,
  todayKey,
  visibleCategories,
} from '../domain/compat'
import { CATEGORY_EMOJI, CATEGORY_LABELS } from '../domain/types'
import type { Category, ClothingItem, Outfit } from '../domain/types'
import { usePhotoUrl, useWardrobe } from '../shared/hooks'
import { getStore } from '../storage'
import type { WardrobeStore } from '../storage'
import './kid.css'

/** Volgorde waarin de gekozen kleding op het "lichaam" getoond wordt. */
const BODY_ORDER: readonly Category[] = [
  'jacket',
  'sweater',
  'top',
  'dress',
  'bottom',
  'socks',
  'shoes',
  'accessory',
]

type Screen = 'choose' | 'done'

function itemLabel(item: ClothingItem): string {
  return item.name ?? CATEGORY_LABELS[item.category]
}

function Photo({ item, className }: { item: ClothingItem; className?: string }) {
  const url = usePhotoUrl(item.photo)
  return <img className={className} src={url} alt="" draggable={false} />
}

function ItemTile({
  item,
  selected,
  onChoose,
}: {
  item: ClothingItem
  selected: boolean
  onChoose: (item: ClothingItem) => void
}) {
  return (
    <button
      type="button"
      className={`kid-tile${selected ? ' kid-tile--selected' : ''}`}
      aria-pressed={selected}
      aria-label={itemLabel(item)}
      onClick={() => onChoose(item)}
    >
      <Photo item={item} className="kid-tile__photo" />
      {selected ? (
        <span className="kid-tile__check" aria-hidden="true">
          ✓
        </span>
      ) : null}
    </button>
  )
}

export default function KidApp({ store }: { store?: WardrobeStore }) {
  const activeStore = store ?? getStore()
  const { items, settings, loading, error, reload } = useWardrobe(activeStore)
  const [outfit, setOutfit] = useState<Outfit>({})
  const [outfitReady, setOutfitReady] = useState(false)
  const [screen, setScreen] = useState<Screen>('choose')
  const [active, setActive] = useState<Category | undefined>(undefined)
  const loadedRef = useRef(false)

  // Eenmalig: de opgeslagen outfit van vandaag ophalen en opruimen.
  useEffect(() => {
    if (loading || error !== undefined || loadedRef.current) return undefined
    let cancelled = false
    void (async () => {
      let saved: Outfit = {}
      try {
        saved = (await activeStore.getOutfit(todayKey()))?.outfit ?? {}
      } catch (e) {
        console.error(e)
      }
      if (cancelled) return
      loadedRef.current = true
      const pruned = pruneOutfit(items, settings, saved)
      setOutfit(pruned)
      if (isOutfitComplete(pruned)) setScreen('done')
      setOutfitReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [loading, error, items, settings, activeStore])

  const update = useCallback(
    (next: Outfit) => {
      setOutfit(next)
      activeStore.saveOutfit(todayKey(), next).catch((e: unknown) => console.error(e))
    },
    [activeStore],
  )

  const categories = visibleCategories(items, settings)
  const current: Category | undefined =
    active !== undefined && categories.includes(active) ? active : categories[0]
  const complete = isOutfitComplete(outfit)

  const byId = new Map(items.map((i) => [i.id, i]))
  const chosen: ClothingItem[] = BODY_ORDER.flatMap((category) => {
    const id = outfit[category]
    const item = id === undefined ? undefined : byId.get(id)
    return item ? [item] : []
  })

  function isDimmed(category: Category, o: Outfit): boolean {
    // Een jurk kiest shirt en broek weg: die tabbladen zijn dan "vol".
    return category !== 'dress' && conflictingCategories(category).some((c) => o[c] !== undefined)
  }

  function nextCategory(from: Category, o: Outfit): Category | undefined {
    const start = categories.indexOf(from)
    for (let step = 1; step < categories.length; step += 1) {
      const category = categories[(start + step) % categories.length]
      if (category === undefined || o[category] !== undefined || isDimmed(category, o)) continue
      if (selectableItems(items, settings, o, category).length > 0) return category
    }
    return undefined
  }

  function handleChoose(item: ClothingItem) {
    const wasChosen = outfit[item.category] === item.id
    const next = chooseItem(items, settings, outfit, item)
    update(next)
    if (!wasChosen && next[item.category] === item.id) {
      const target = nextCategory(item.category, next)
      if (target) setActive(target)
    }
  }

  function restart() {
    update({})
    setScreen('choose')
    setActive(categories[0])
  }

  const header = (title: string) => (
    <header className="kid-header">
      <h1 className="kid-title">{title}</h1>
      <div className="kid-header__actions">
        {outfitReady && Object.keys(outfit).length > 0 ? (
          <button
            type="button"
            className="kid-icon-btn"
            aria-label="Opnieuw beginnen"
            title="Opnieuw beginnen"
            onClick={restart}
          >
            <span aria-hidden="true">🔄</span>
          </button>
        ) : null}
        <Link className="kid-parent-link" to="/ouder" aria-label="Voor ouders" title="Voor ouders">
          <span aria-hidden="true">⚙️</span>
        </Link>
      </div>
    </header>
  )

  if (loading || (!error && !outfitReady)) {
    return (
      <main className="kid-app">
        {header('Wat trek je vandaag aan?')}
        <p className="kid-status" role="status">
          <span className="kid-bounce" aria-hidden="true">
            👕
          </span>
          Even wachten…
        </p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="kid-app">
        {header('Wat trek je vandaag aan?')}
        <div className="kid-status" role="alert">
          <p>{error}</p>
          <button type="button" className="kid-big-btn" onClick={() => void reload()}>
            <span aria-hidden="true">🔄</span> Opnieuw proberen
          </button>
        </div>
      </main>
    )
  }

  if (categories.length === 0) {
    return (
      <main className="kid-app">
        {header('Wat trek je vandaag aan?')}
        <div className="kid-status kid-empty">
          <div className="kid-empty__emoji" aria-hidden="true">
            🧺
          </div>
          <p>De kleerkast is nog leeg.</p>
          <p>Een grote mens kan er kleren in doen.</p>
          <Link className="button kid-big-btn" to="/ouder">
            <span aria-hidden="true">⚙️</span> Naar de ouders
          </Link>
        </div>
      </main>
    )
  }

  if (screen === 'done' && complete) {
    return (
      <main className="kid-app kid-app--done">
        {header('Dit trek ik vandaag aan!')}
        <div className="kid-party" aria-hidden="true">
          🎉
        </div>
        <ul className="kid-done-list">
          {chosen.map((item) => (
            <li key={item.id} className="kid-done-item">
              <Photo item={item} className="kid-done-item__photo" />
              <span className="visually-hidden">{itemLabel(item)}</span>
            </li>
          ))}
        </ul>
        <button type="button" className="kid-big-btn kid-big-btn--secondary" onClick={() => setScreen('choose')}>
          <span aria-hidden="true">↩️</span> Veranderen
        </button>
      </main>
    )
  }

  const shown = current ? selectableItems(items, settings, outfit, current) : []
  const dimmedCurrent = current !== undefined && isDimmed(current, outfit)

  return (
    <main className="kid-app">
      {header('Wat trek je vandaag aan?')}

      <nav className="kid-tabs" aria-label="Soort kleding">
        {categories.map((category) => {
          const has = outfit[category] !== undefined
          const dimmed = isDimmed(category, outfit)
          const cls = [
            'kid-tab',
            category === current ? 'kid-tab--active' : '',
            has ? 'kid-tab--done' : '',
            dimmed ? 'kid-tab--dimmed' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button
              key={category}
              type="button"
              className={cls}
              aria-pressed={category === current}
              aria-label={`${CATEGORY_LABELS[category]}${has ? ' (gekozen)' : ''}`}
              onClick={() => setActive(category)}
            >
              <span className="kid-tab__emoji" aria-hidden="true">
                {CATEGORY_EMOJI[category]}
              </span>
              <span className="kid-tab__label" aria-hidden="true">
                {CATEGORY_LABELS[category]}
              </span>
              {has ? (
                <span className="kid-tab__check" aria-hidden="true">
                  ✓
                </span>
              ) : null}
            </button>
          )
        })}
      </nav>

      <section className="kid-choices" aria-label={current ? CATEGORY_LABELS[current] : undefined}>
        {dimmedCurrent ? (
          <p className="kid-note">
            <span aria-hidden="true">👗</span> Je hebt een jurk gekozen. Kies hier iets om te wisselen.
          </p>
        ) : null}
        {shown.length === 0 ? (
          <p className="kid-note kid-note--empty">
            <span aria-hidden="true">🤷</span> Hier past niets bij.
          </p>
        ) : (
          <div className="kid-grid">
            {shown.map((item) => (
              <ItemTile
                key={item.id}
                item={item}
                selected={outfit[item.category] === item.id}
                onChoose={handleChoose}
              />
            ))}
          </div>
        )}
      </section>

      <footer className="kid-preview">
        <ul className="kid-preview__list" aria-label="Jouw outfit">
          {chosen.length === 0 ? (
            <li className="kid-preview__empty" aria-hidden="true">
              👕 👖 👟
            </li>
          ) : (
            chosen.map((item) => (
              <li key={item.id} className="kid-preview__item">
                <Photo item={item} className="kid-preview__photo" />
                <span className="visually-hidden">{itemLabel(item)}</span>
              </li>
            ))
          )}
        </ul>
        {complete ? (
          <button type="button" className="kid-big-btn kid-ready" onClick={() => setScreen('done')}>
            <span aria-hidden="true">✅</span> Klaar!
          </button>
        ) : null}
      </footer>
    </main>
  )
}
