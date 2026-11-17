import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
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
import { stickersOn } from '../domain/types'
import type { Category, Child, ClothingItem, Outfit, Settings } from '../domain/types'
import { canSpeak, playSound, setFeedbackEnabled, speak, vibrate } from '../shared/feedback'
import { useChildren, useWardrobe } from '../shared/hooks'
import { IconRestart, IconUndo } from '../shared/icons'
import { getStore } from '../storage'
import type { WardrobeStore } from '../storage'
import { CategoryTabs } from './CategoryTabs'
import { Celebration } from './Celebration'
import { ItemTile } from './ItemTile'
import { ChildAvatar } from './KidArt'
import { KidHeader } from './KidHeader'
import { KidPage, KidStatus, MascotGuide, ParentsButton, RetryButton } from './KidLayout'
import { CATEGORY_QUESTIONS, flyPhoto, prefersReducedMotion, resolveSeason, slotCategories } from './kidUtils'
import type { FlightStart } from './kidUtils'
import { OutfitDock, ProgressBar } from './OutfitDock'
import './kid.css'

/** Volgorde waarin de gekozen kleding op het feestscherm getoond wordt (van boven naar beneden). */
const BODY_ORDER: readonly Category[] = [
  'accessory',
  'jacket',
  'sweater',
  'top',
  'dress',
  'bottom',
  'socks',
  'shoes',
]

type Screen = 'choose' | 'done'

/** Hoe lang het kind de "ongedaan maken"-knop na Opnieuw beginnen krijgt. */
const UNDO_MS = 5000
/** Hoe vaak we controleren of het inmiddels een nieuwe dag is. */
const DAY_CHECK_MS = 60_000
/** Even wachten na een keuze, zodat het kind het vinkje ziet, voordat de volgende soort komt. */
const ADVANCE_MS = 650
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

/** Kan en mag er voorgelezen worden? */
function talkable(settings: Settings | undefined): boolean {
  return settings !== undefined && settings.soundEnabled && canSpeak()
}

export default function KidApp({ store }: { store?: WardrobeStore }) {
  const activeStore = store ?? getStore()
  const { children, loading, error, reload } = useChildren(activeStore)
  const [chosenId, setChosenId] = useState<string | undefined>(readActiveChild)
  // Instellingen alvast ophalen: voor het seizoen en het geluid op het profielscherm.
  const [settings, setSettings] = useState<Settings | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    activeStore.getSettings().then(
      (loaded) => {
        if (cancelled) return
        setFeedbackEnabled(loaded.soundEnabled)
        setSettings(loaded)
      },
      (e: unknown) => console.error(e),
    )
    return () => {
      cancelled = true
    }
  }, [activeStore])

  const season = resolveSeason(settings?.currentSeason)
  const guide = <MascotGuide />

  if (loading) {
    return (
      <KidPage season={season}>
        <KidHeader title="Wat trek je vandaag aan?" guide={guide} />
        <KidStatus role="status">
          <p>Even wachten…</p>
        </KidStatus>
      </KidPage>
    )
  }

  if (error) {
    return (
      <KidPage season={season}>
        <KidHeader title="Wat trek je vandaag aan?" guide={guide} />
        <KidStatus role="alert" art="oops">
          <p>{error}</p>
          <RetryButton onRetry={() => void reload()} />
        </KidStatus>
      </KidPage>
    )
  }

  if (children.length === 0) {
    return (
      <KidPage season={season}>
        <KidHeader title="Wat trek je vandaag aan?" guide={guide} />
        <KidStatus art="empty">
          <p className="kid-status__lead">Hoi! Er is nog niemand om aan te kleden.</p>
          <p>Een grote mens moet eerst een kind toevoegen.</p>
          <ParentsButton />
        </KidStatus>
      </KidPage>
    )
  }

  // Een onthouden id die niet meer bestaat telt niet mee; met één kind is er niets te kiezen.
  const child = children.length === 1 ? children[0] : children.find((c) => c.id === chosenId)

  if (!child) {
    return (
      <KidPage season={season}>
        <KidHeader
          title="Wie ben jij?"
          guide={guide}
          onSpeak={talkable(settings) ? () => speak('Hoi! Wie ben jij?') : undefined}
        />
        <ul className="kid-profiles">
          {children.map((c, i) => (
            <li key={c.id} style={{ '--i': i } as CSSProperties}>
              <button
                type="button"
                className="kid-profile"
                style={{ '--kid-color': c.color } as CSSProperties}
                onClick={() => {
                  // Zolang de geluidsinstelling van de ouder nog niet geladen is, blijft het stil.
                  if (settings !== undefined) {
                    playSound('pick')
                    vibrate()
                    speak(`Hoi ${c.name}! Wat trek je vandaag aan?`)
                  }
                  writeActiveChild(c.id)
                  setChosenId(c.id)
                }}
              >
                <ChildAvatar child={c} className="kid-avatar--profile" />
                <span className="kid-profile__name">{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </KidPage>
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
              playSound('tap')
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
  // Stickerboek: aantal afgeronde dagen (undefined = nog niet geteld) en of er net één bij kwam.
  const [stickers, setStickers] = useState<number | undefined>(undefined)
  const [freshSticker, setFreshSticker] = useState(false)
  const [marking, setMarking] = useState(false)
  const loadedDayRef = useRef<string | undefined>(undefined)
  const advanceRef = useRef<number | undefined>(undefined)
  const flightRef = useRef<(FlightStart & { category: Category }) | undefined>(undefined)
  const dockRef = useRef<HTMLDivElement>(null)

  // Geluid en voorlezen volgen de instelling van de ouder.
  useEffect(() => {
    if (!loading) setFeedbackEnabled(settings.soundEnabled)
  }, [loading, settings.soundEnabled])

  const clearAdvance = useCallback(() => {
    if (advanceRef.current !== undefined) window.clearTimeout(advanceRef.current)
    advanceRef.current = undefined
  }, [])

  useEffect(() => clearAdvance, [clearAdvance])

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
      clearAdvance()
      setOutfit(pruned)
      setScreen(isOutfitReady(items, settings, pruned) ? 'done' : 'choose')
      setActive(undefined)
      setUndoOutfit(undefined)
      setStickers(undefined)
      setFreshSticker(false)
      setOutfitReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [loading, error, items, settings, activeStore, child.id, day, clearAdvance])

  // Op het feestscherm het stickerboek tellen (ook als de dag al eerder klaar was).
  const stickersEnabled = stickersOn(child)
  useEffect(() => {
    if (screen !== 'done' || marking || stickers !== undefined || !stickersEnabled) return undefined
    let cancelled = false
    activeStore.countCompletedDays(child.id).then(
      (count) => {
        if (!cancelled) setStickers(count)
      },
      (e: unknown) => console.error(e),
    )
    return () => {
      cancelled = true
    }
  }, [screen, marking, stickers, stickersEnabled, activeStore, child.id])

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

  // Na een keuze vliegt de foto naar zijn vakje op de paspop (pas nu bestaat dat vakje).
  useLayoutEffect(() => {
    const flight = flightRef.current
    flightRef.current = undefined
    if (!flight) return
    const slot = dockRef.current?.querySelector<HTMLElement>(`[data-slot="${flight.category}"]`)
    if (slot) flyPhoto(flight, slot)
  }, [outfit])

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
  const slots = slotCategories(categories, outfit)
  const canTalk = talkable(loading ? undefined : settings)

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
    // Alleen soorten die nog meetellen: na shirt of broek bieden we geen jurk meer aan.
    const open = slotCategories(categories, o)
    const start = categories.indexOf(from)
    for (let step = 1; step < categories.length; step += 1) {
      const category = categories[(start + step) % categories.length]
      if (category === undefined || o[category] !== undefined || !open.includes(category)) continue
      if (isDimmed(category, o)) continue
      if (selectableItems(items, settings, o, category).length > 0) return category
    }
    return undefined
  }

  function selectTab(category: Category) {
    clearAdvance()
    if (category !== current) playSound('tap')
    setActive(category)
  }

  function handleChoose(item: ClothingItem, tile: HTMLElement) {
    // Een tik na middernacht rolt eerst de dag om, en wordt niet onder de oude dag bewaard.
    if (rollOverIfNeeded()) return
    clearAdvance()
    const wasChosen = outfit[item.category] === item.id
    setUndoOutfit(undefined)
    const next = chooseItem(items, settings, outfit, item)
    update(next)
    if (wasChosen || next[item.category] !== item.id) {
      playSound('unpick')
      return
    }

    playSound('pick')
    vibrate()
    const photo = tile.querySelector('img')
    if (photo?.src) flightRef.current = { rect: photo.getBoundingClientRect(), src: photo.src, category: item.category }

    const target = nextCategory(item.category, next)
    if (target) {
      speak(CATEGORY_QUESTIONS[target])
      // Eerst het vinkje laten zien, dan pas door naar de volgende soort.
      if (prefersReducedMotion()) setActive(target)
      else advanceRef.current = window.setTimeout(() => setActive(target), ADVANCE_MS)
    } else if (isOutfitReady(items, settings, next)) {
      speak('Goed zo! Tik op klaar.')
    }
  }

  function handleReady() {
    if (rollOverIfNeeded()) return
    clearAdvance()
    playSound('done')
    vibrate(40)
    speak(`Super, ${child.name}!`)
    setScreen('done')
    setFreshSticker(false)
    setStickers(undefined)
    setMarking(true)
    activeStore
      .markOutfitCompleted(child.id, day)
      // Alleen een echt nieuwe sticker (eerste Klaar van de dag) komt met animatie en geluid.
      .then((isNew) => setFreshSticker(isNew))
      .catch((e: unknown) => console.error(e))
      .finally(() => setMarking(false))
  }

  function restart() {
    if (rollOverIfNeeded()) return
    clearAdvance()
    playSound('unpick')
    setUndoOutfit(outfit)
    update({})
    setScreen('choose')
    setActive(categories[0])
  }

  function undoRestart() {
    if (undoOutfit === undefined) return
    playSound('pick')
    update(undoOutfit)
    setUndoOutfit(undefined)
  }

  const guide = onSwitch ? (
    <button
      type="button"
      className="kid-switch"
      aria-label={`Wie ben jij? Nu: ${child.name}`}
      title="Ander kind kiezen"
      onClick={onSwitch}
    >
      <ChildAvatar child={child} />
    </button>
  ) : (
    <ChildAvatar child={child} />
  )

  const restartButton =
    outfitReady && Object.keys(outfit).length > 0 ? (
      <button
        type="button"
        className="kid-icon-btn"
        aria-label="Opnieuw beginnen"
        title="Opnieuw beginnen"
        onClick={restart}
      >
        <IconRestart size={26} />
      </button>
    ) : null

  const undoButton =
    outfitReady && undoOutfit !== undefined ? (
      <button
        type="button"
        className="kid-icon-btn kid-icon-btn--undo"
        aria-label="Ongedaan maken"
        title="Ongedaan maken"
        onClick={undoRestart}
      >
        <svg className="kid-undo-ring" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <circle cx={32} cy={32} r={28} />
        </svg>
        <IconUndo size={28} />
      </button>
    ) : null

  const header = (title: string, question?: string, actions: ReactNode = undoButton) => {
    const spoken = question ?? title
    return (
      <KidHeader
        title={title}
        question={question}
        guide={guide}
        actions={actions}
        onSpeak={canTalk ? () => speak(spoken) : undefined}
      />
    )
  }

  const season = resolveSeason(loading ? undefined : settings.currentSeason)

  if (loading || (!error && !outfitReady)) {
    return (
      <KidPage season={season}>
        {header('Wat trek je vandaag aan?')}
        <KidStatus role="status">
          <p>Even wachten…</p>
        </KidStatus>
      </KidPage>
    )
  }

  if (error) {
    return (
      <KidPage season={season}>
        {header('Wat trek je vandaag aan?')}
        <KidStatus role="alert" art="oops">
          <p>{error}</p>
          <RetryButton onRetry={() => void reload()} />
        </KidStatus>
      </KidPage>
    )
  }

  if (categories.length === 0) {
    return (
      <KidPage season={season}>
        {header('Wat trek je vandaag aan?')}
        <KidStatus art="empty">
          {allItems.length === 0 ? (
            <>
              <p className="kid-status__lead">De kleerkast is nog leeg.</p>
              <p>Een grote mens kan er kleren in doen.</p>
            </>
          ) : (
            <>
              <p className="kid-status__lead">Er zijn nu geen kleren om uit te kiezen.</p>
              <p>Een grote mens kan kijken naar het seizoen of naar kleren die in de was zijn.</p>
              {items.length === 0 ? (
                <p>Er is geen kleding in jouw maat. Vraag een grote mens om je maten na te kijken.</p>
              ) : null}
            </>
          )}
          <ParentsButton />
        </KidStatus>
      </KidPage>
    )
  }

  if (screen === 'done' && complete) {
    return (
      <KidPage season={season} className="kid-app--done">
        {header('Dit trek ik vandaag aan!', undefined, null)}
        <Celebration
          child={child}
          chosen={chosen}
          stickers={stickers}
          fresh={freshSticker}
          extraAction={restartButton}
          onChange={() => {
            playSound('tap')
            setScreen('choose')
          }}
        />
      </KidPage>
    )
  }

  const shown = current ? selectableItems(items, settings, outfit, current) : []
  const dimmedCurrent = current !== undefined && isDimmed(current, outfit)

  return (
    <KidPage season={season}>
      {header(
        'Wat trek je vandaag aan?',
        current ? CATEGORY_QUESTIONS[current] : undefined,
        <>
          {undoButton}
          {restartButton}
        </>,
      )}

      <div className="kid-play">
        <div className="kid-play__main">
          <ProgressBar slots={slots} outfit={outfit} />
          <CategoryTabs
            categories={categories}
            current={current}
            outfit={outfit}
            isDimmed={(category) => isDimmed(category, outfit)}
            onSelect={selectTab}
          />

          <section
            className="kid-choices"
            id="kid-panel"
            role="tabpanel"
            aria-labelledby={current ? `kid-tab-${current}` : undefined}
          >
            {dimmedCurrent ? (
              <p className="kid-note">
                <span className="kid-note__emoji" aria-hidden="true">
                  👗
                </span>
                Je hebt een jurk gekozen. Kies hier iets om te wisselen.
              </p>
            ) : null}
            {shown.length === 0 ? (
              <p className="kid-note kid-note--empty">
                <span className="kid-note__emoji" aria-hidden="true">
                  🤷
                </span>
                Hier past niets bij.
              </p>
            ) : (
              <div className="kid-grid" key={current}>
                {shown.map((item, i) => (
                  <ItemTile
                    key={item.id}
                    item={item}
                    index={i}
                    selected={outfit[item.category] === item.id}
                    onChoose={handleChoose}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <OutfitDock
          ref={dockRef}
          slots={slots}
          outfit={outfit}
          byId={byId}
          complete={complete}
          onReady={handleReady}
        />
      </div>
    </KidPage>
  )
}
