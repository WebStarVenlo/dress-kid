import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
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
import { categoryQuestion, flyPhoto, prefersReducedMotion, resolveSeason, slotCategories } from './kidUtils'
import type { FlightStart } from './kidUtils'
import { OutfitDock, ProgressBar } from './OutfitDock'
import './kid.css'

/** Order in which the chosen clothes are shown on the celebration screen (top to bottom). */
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

/** How long the child gets the "undo" button after Start over. */
const UNDO_MS = 5000
/** How often we check whether it has become a new day. */
const DAY_CHECK_MS = 60_000
/** Wait briefly after a choice, so the child sees the check mark, before the next kind appears. */
const ADVANCE_MS = 650
/** localStorage key under which the chosen child is remembered. */
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
    // Storage unavailable: then we simply do not remember the choice.
  }
}

/** Can and may we read aloud? */
function talkable(settings: Settings | undefined): boolean {
  return settings !== undefined && settings.soundEnabled && canSpeak()
}

export default function KidApp({ store }: { store?: WardrobeStore }) {
  const { t } = useTranslation('kid')
  const activeStore = store ?? getStore()
  const { children, loading, error, reload } = useChildren(activeStore)
  const [chosenId, setChosenId] = useState<string | undefined>(readActiveChild)
  // Fetch the settings early: for the season and the sound on the profile screen.
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
        <KidHeader title={t('app.title')} guide={guide} />
        <KidStatus role="status">
          <p>{t('app.loading')}</p>
        </KidStatus>
      </KidPage>
    )
  }

  if (error) {
    return (
      <KidPage season={season}>
        <KidHeader title={t('app.title')} guide={guide} />
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
        <KidHeader title={t('app.title')} guide={guide} />
        <KidStatus art="empty">
          <p className="kid-status__lead">{t('app.noChildrenLead')}</p>
          <p>{t('app.noChildrenHint')}</p>
          <ParentsButton />
        </KidStatus>
      </KidPage>
    )
  }

  // A remembered id that no longer exists does not count; with one child there is nothing to choose.
  const child = children.length === 1 ? children[0] : children.find((c) => c.id === chosenId)

  if (!child) {
    return (
      <KidPage season={season}>
        <KidHeader
          title={t('app.whoAreYou')}
          guide={guide}
          onSpeak={talkable(settings) ? () => speak(t('app.speakWhoAreYou')) : undefined}
        />
        <ul className="kid-profiles">
          {children.map((c, i) => (
            <li key={c.id} style={{ '--i': i } as CSSProperties}>
              <button
                type="button"
                className="kid-profile"
                style={{ '--kid-color': c.color } as CSSProperties}
                onClick={() => {
                  // As long as the parent's sound setting has not loaded yet, stay silent.
                  if (settings !== undefined) {
                    playSound('pick')
                    vibrate()
                    speak(t('app.speakGreeting', { name: c.name }))
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
  const { t } = useTranslation('kid')
  const { items: allItems, settings, loading, error, reload } = useWardrobe(activeStore)
  // Only clothes that fit this child (by size); the other rules live in compat.ts.
  const items = useMemo(() => allItems.filter((item) => itemFitsChild(item, child)), [allItems, child])
  const [outfit, setOutfit] = useState<Outfit>({})
  const [outfitReady, setOutfitReady] = useState(false)
  const [screen, setScreen] = useState<Screen>('choose')
  const [active, setActive] = useState<Category | undefined>(undefined)
  // The day (YYYY-MM-DD) for which the outfit is or is being loaded.
  const [day, setDay] = useState(() => todayKey())
  // The outfit from before "Start over", restorable for a few seconds.
  const [undoOutfit, setUndoOutfit] = useState<Outfit | undefined>(undefined)
  // Sticker book: number of completed days (undefined = not counted yet) and whether one was just added.
  const [stickers, setStickers] = useState<number | undefined>(undefined)
  const [freshSticker, setFreshSticker] = useState(false)
  const [marking, setMarking] = useState(false)
  const loadedDayRef = useRef<string | undefined>(undefined)
  const advanceRef = useRef<number | undefined>(undefined)
  const flightRef = useRef<(FlightStart & { category: Category }) | undefined>(undefined)
  const dockRef = useRef<HTMLDivElement>(null)

  // Sound and reading aloud follow the parent's setting.
  useEffect(() => {
    if (!loading) setFeedbackEnabled(settings.soundEnabled)
  }, [loading, settings.soundEnabled])

  const clearAdvance = useCallback(() => {
    if (advanceRef.current !== undefined) window.clearTimeout(advanceRef.current)
    advanceRef.current = undefined
  }, [])

  useEffect(() => clearAdvance, [clearAdvance])

  // Fetch and prune the saved outfit of `day`; again when the day changes.
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

  // On the celebration screen, count the sticker book (also if the day was already done earlier).
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

  // Has it become a new day? If so, start over with an empty outfit and report that back.
  const rollOverIfNeeded = useCallback((): boolean => {
    const now = todayKey()
    if (now === day) return false
    setOutfitReady(false)
    setDay(now)
    // A new day: the laundry run (worn clothes go into the wash) happens while loading.
    void reload()
    return true
  }, [day, reload])

  // If the app stays open overnight, we start the new day with an empty outfit.
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

  // The undo button disappears after a few seconds.
  useEffect(() => {
    if (undoOutfit === undefined) return undefined
    const timer = window.setTimeout(() => setUndoOutfit(undefined), UNDO_MS)
    return () => window.clearTimeout(timer)
  }, [undoOutfit])

  // After a choice the photo flies to its slot on the doll (only now does that slot exist).
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
    // A dress crowds out shirt and trousers: those tabs are then "full".
    return category !== 'dress' && conflictingCategories(category).some((c) => o[c] !== undefined)
  }

  function nextCategory(from: Category, o: Outfit): Category | undefined {
    // Only kinds that still count: after a shirt or trousers we no longer offer a dress.
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
    // A tap after midnight first rolls the day over, and is not saved under the old day.
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
      speak(categoryQuestion(target))
      // First show the check mark, only then move on to the next kind.
      if (prefersReducedMotion()) setActive(target)
      else advanceRef.current = window.setTimeout(() => setActive(target), ADVANCE_MS)
    } else if (isOutfitReady(items, settings, next)) {
      speak(t('app.speakAllChosen'))
    }
  }

  function handleReady() {
    if (rollOverIfNeeded()) return
    clearAdvance()
    playSound('done')
    vibrate(40)
    speak(t('app.speakDone', { name: child.name }))
    setScreen('done')
    setFreshSticker(false)
    setStickers(undefined)
    setMarking(true)
    activeStore
      .markOutfitCompleted(child.id, day)
      // Only a genuinely new sticker (first Ready of the day) comes with animation and sound.
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
      aria-label={t('app.switchLabel', { name: child.name })}
      title={t('app.switchTitle')}
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
        aria-label={t('app.restart')}
        title={t('app.restart')}
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
        aria-label={t('app.undo')}
        title={t('app.undo')}
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
        {header(t('app.title'))}
        <KidStatus role="status">
          <p>{t('app.loading')}</p>
        </KidStatus>
      </KidPage>
    )
  }

  if (error) {
    return (
      <KidPage season={season}>
        {header(t('app.title'))}
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
        {header(t('app.title'))}
        <KidStatus art="empty">
          {allItems.length === 0 ? (
            <>
              <p className="kid-status__lead">{t('app.wardrobeEmptyLead')}</p>
              <p>{t('app.wardrobeEmptyHint')}</p>
            </>
          ) : (
            <>
              <p className="kid-status__lead">{t('app.nothingAvailableLead')}</p>
              <p>{t('app.nothingAvailableHint')}</p>
              {items.length === 0 ? <p>{t('app.noSizeMatch')}</p> : null}
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
        {header(t('app.doneTitle'), undefined, null)}
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
        t('app.title'),
        current ? categoryQuestion(current) : undefined,
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
                {t('app.dressChosen')}
              </p>
            ) : null}
            {shown.length === 0 ? (
              <p className="kid-note kid-note--empty">
                <span className="kid-note__emoji" aria-hidden="true">
                  🤷
                </span>
                {t('app.nothingFits')}
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
