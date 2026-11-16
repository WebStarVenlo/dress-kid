import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  chooseItem,
  conflictingCategories,
  isOutfitReady,
  pruneOutfit,
  selectableItems,
  todayKey,
  visibleCategories,
} from '../domain/compat'
import { itemFitsChild } from '../domain/sizes'
import { CATEGORY_EMOJI, CATEGORY_LABELS } from '../domain/types'
import type { Category, Child, ClothingItem, Outfit } from '../domain/types'
import { useChildren, usePhotoUrl, useWardrobe } from '../shared/hooks'
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

/** Hoe lang het kind de "ongedaan maken"-knop na Opnieuw beginnen krijgt. */
const UNDO_MS = 5000
/** Hoe vaak we controleren of het inmiddels een nieuwe dag is. */
const DAY_CHECK_MS = 60_000
/** Sleutel in localStorage waaronder het gekozen kind onthouden wordt. */
export const ACTIVE_CHILD_KEY = 'dress-kid-active-child'

function readActiveChild(): string | undefined {
  try {
    return window.localStorage.getItem(ACTIVE_CHILD_KEY) ?? undefined
  } catch {
    return undefined
  }
}

function writeActiveChild(id: string | undefined): void {
  try {
    if (id === undefined) window.localStorage.removeItem(ACTIVE_CHILD_KEY)
    else window.localStorage.setItem(ACTIVE_CHILD_KEY, id)
  } catch {
    // Opslag niet beschikbaar: dan onthouden we de keuze gewoon niet.
  }
}

function initial(child: Child): string {
  return (Array.from(child.name.trim())[0] ?? '?').toUpperCase()
}

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

function Avatar({ child, className }: { child: Child; className: string }) {
  return (
    <span className={className} style={{ backgroundColor: child.color }} aria-hidden="true">
      {initial(child)}
    </span>
  )
}

function SimpleHeader({ title }: { title: string }) {
  return (
    <header className="kid-header">
      <h1 className="kid-title">{title}</h1>
      <div className="kid-header__actions">
        <Link className="kid-parent-link" to="/ouder" aria-label="Voor ouders" title="Voor ouders">
          <span aria-hidden="true">⚙️</span>
        </Link>
      </div>
    </header>
  )
}

export default function KidApp({ store }: { store?: WardrobeStore }) {
  const activeStore = store ?? getStore()
  const { children, loading, error, reload } = useChildren(activeStore)
  const [chosenId, setChosenId] = useState<string | undefined>(readActiveChild)

  if (loading) {
    return (
      <main className="kid-app">
        <SimpleHeader title="Wat trek je vandaag aan?" />
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
        <SimpleHeader title="Wat trek je vandaag aan?" />
        <div className="kid-status" role="alert">
          <p>{error}</p>
          <button type="button" className="kid-big-btn" onClick={() => void reload()}>
            <span aria-hidden="true">🔄</span> Opnieuw proberen
          </button>
        </div>
      </main>
    )
  }

  if (children.length === 0) {
    return (
      <main className="kid-app">
        <SimpleHeader title="Wat trek je vandaag aan?" />
        <div className="kid-status kid-empty">
          <div className="kid-empty__emoji" aria-hidden="true">
            👋
          </div>
          <p>Hoi! Er is nog niemand om aan te kleden.</p>
          <p>Een grote mens moet eerst een kind toevoegen.</p>
          <Link className="button kid-big-btn" to="/ouder">
            <span aria-hidden="true">⚙️</span> Naar de ouders
          </Link>
        </div>
      </main>
    )
  }

  // Een onthouden id die niet meer bestaat telt niet mee; met één kind is er niets te kiezen.
  const child = children.length === 1 ? children[0] : children.find((c) => c.id === chosenId)

  if (!child) {
    return (
      <main className="kid-app">
        <SimpleHeader title="Wie ben jij?" />
        <ul className="kid-profiles">
          {children.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="kid-profile"
                style={{ borderColor: c.color }}
                onClick={() => {
                  writeActiveChild(c.id)
                  setChosenId(c.id)
                }}
              >
                <Avatar child={c} className="kid-profile__avatar" />
                <span className="kid-profile__name">{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </main>
    )
  }

  return (
    <KidDay
      key={child.id}
      store={activeStore}
      child={child}
      onSwitch={
        children.length > 1
          ? () => {
              writeActiveChild(undefined)
              setChosenId(undefined)
            }
          : undefined
      }
    />
  )
}

function KidDay({
  store: activeStore,
  child,
  onSwitch,
}: {
  store: WardrobeStore
  child: Child
  onSwitch: (() => void) | undefined
}) {
  const { items: allItems, settings, loading, error, reload } = useWardrobe(activeStore)
  // Alleen kleding die dit kind past (op maat); de rest van de regels staat in compat.ts.
  const items = useMemo(() => allItems.filter((item) => itemFitsChild(item, child)), [allItems, child])
  const [outfit, setOutfit] = useState<Outfit>({})
  const [outfitReady, setOutfitReady] = useState(false)
  const [screen, setScreen] = useState<Screen>('choose')
  const [active, setActive] = useState<Category | undefined>(undefined)
  // De dag (YYYY-MM-DD) waarvoor de outfit geladen is of wordt.
  const [day, setDay] = useState(() => todayKey())
  // De outfit van vóór "Opnieuw beginnen", een paar seconden lang terug te halen.
  const [undoOutfit, setUndoOutfit] = useState<Outfit | undefined>(undefined)
  const loadedDayRef = useRef<string | undefined>(undefined)

  // De opgeslagen outfit van `day` ophalen en opruimen; opnieuw als de dag verandert.
  useEffect(() => {
    if (loading || error !== undefined || loadedDayRef.current === day) return undefined
    let cancelled = false
    void (async () => {
      let saved: Outfit = {}
      try {
        saved = (await activeStore.getOutfit(child.id, day))?.outfit ?? {}
      } catch (e) {
        console.error(e)
      }
      if (cancelled) return
      loadedDayRef.current = day
      const pruned = pruneOutfit(items, settings, saved)
      setOutfit(pruned)
      setScreen(isOutfitReady(items, settings, pruned) ? 'done' : 'choose')
      setActive(undefined)
      setUndoOutfit(undefined)
      setOutfitReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [loading, error, items, settings, activeStore, child.id, day])

  // Is het inmiddels een nieuwe dag? Zo ja, begin opnieuw met een lege outfit en meld dat terug.
  const rollOverIfNeeded = useCallback((): boolean => {
    const now = todayKey()
    if (now === day) return false
    setOutfitReady(false)
    setDay(now)
    return true
  }, [day])

  // Blijft de app overnacht open, dan beginnen we de nieuwe dag met een lege outfit.
  useEffect(() => {
    const check = () => {
      rollOverIfNeeded()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', check)
    const timer = window.setInterval(check, DAY_CHECK_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', check)
      window.clearInterval(timer)
    }
  }, [rollOverIfNeeded])

  // De ongedaan-maken-knop verdwijnt na een paar seconden.
  useEffect(() => {
    if (undoOutfit === undefined) return undefined
    const timer = window.setTimeout(() => setUndoOutfit(undefined), UNDO_MS)
    return () => window.clearTimeout(timer)
  }, [undoOutfit])

  const update = useCallback(
    (next: Outfit) => {
      setOutfit(next)
      activeStore.saveOutfit(child.id, day, next).catch((e: unknown) => console.error(e))
    },
    [activeStore, child.id, day],
  )

  const categories = visibleCategories(items, settings)
  const current: Category | undefined =
    active !== undefined && categories.includes(active) ? active : categories[0]
  const complete = isOutfitReady(items, settings, outfit)

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
    // Een tik na middernacht rolt eerst de dag om, en wordt niet onder de oude dag bewaard.
    if (rollOverIfNeeded()) return
    const wasChosen = outfit[item.category] === item.id
    setUndoOutfit(undefined)
    const next = chooseItem(items, settings, outfit, item)
    update(next)
    if (!wasChosen && next[item.category] === item.id) {
      const target = nextCategory(item.category, next)
      if (target) setActive(target)
    }
  }

  function restart() {
    if (rollOverIfNeeded()) return
    setUndoOutfit(outfit)
    update({})
    setScreen('choose')
    setActive(categories[0])
  }

  function undoRestart() {
    if (undoOutfit === undefined) return
    update(undoOutfit)
    setUndoOutfit(undefined)
  }

  const header = (title: string) => (
    <header className="kid-header">
      <h1 className="kid-title">{title}</h1>
      <div className="kid-header__actions">
        {onSwitch ? (
          <button
            type="button"
            className="kid-switch"
            style={{ borderColor: child.color }}
            aria-label={`Wie ben jij? Nu: ${child.name}`}
            title="Ander kind kiezen"
            onClick={onSwitch}
          >
            <Avatar child={child} className="kid-switch__avatar" />
          </button>
        ) : null}
        {outfitReady && undoOutfit !== undefined ? (
          <button
            type="button"
            className="kid-icon-btn kid-icon-btn--undo"
            aria-label="Ongedaan maken"
            title="Ongedaan maken"
            onClick={undoRestart}
          >
            <span aria-hidden="true">↩️</span>
          </button>
        ) : null}
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
          {allItems.length === 0 ? (
            <>
              <p>De kleerkast is nog leeg.</p>
              <p>Een grote mens kan er kleren in doen.</p>
            </>
          ) : (
            <>
              <p>Er zijn nu geen kleren om uit te kiezen.</p>
              <p>Een grote mens kan kijken naar het seizoen of naar kleren die in de was zijn.</p>
              {items.length === 0 ? (
                <p>Er is geen kleding in jouw maat. Vraag een grote mens om je maten na te kijken.</p>
              ) : null}
            </>
          )}
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

      <div className="kid-tabs" role="tablist" aria-label="Soort kleding">
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
              id={`kid-tab-${category}`}
              role="tab"
              className={cls}
              aria-selected={category === current}
              aria-controls="kid-panel"
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
      </div>

      <section
        className="kid-choices"
        id="kid-panel"
        role="tabpanel"
        aria-labelledby={current ? `kid-tab-${current}` : undefined}
      >
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
