import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useChildren, useWardrobe } from '../shared/hooks'
import { IconArrowRight, IconBackup, IconChildren, IconSettings, IconWardrobe } from '../shared/icons'
import { getStore, requestPersistentStorage } from '../storage'
import type { WardrobeStore } from '../storage'
import AddFlow from './AddFlow'
import BackupPanel from './BackupPanel'
import ChildrenPanel from './ChildrenPanel'
import Gate, { randomSum } from './Gate'
import type { Sum } from './Gate'
import ItemDetail from './ItemDetail'
import SettingsPanel from './SettingsPanel'
import Wardrobe from './Wardrobe'
import { isUnlocked, lock, touchUnlock } from './unlock'
import './parent.css'

/** Hoe vaak we controleren of het slot is verlopen terwijl de pagina open staat. */
const CHECK_INTERVAL_MS = 15_000
/** Activiteit verlengt de geldigheid hooguit zo vaak (voorkomt schrijven bij elke beweging). */
const TOUCH_THROTTLE_MS = 5_000

/**
 * Uitstel voor het opnieuw vergrendelen bij unmount. React StrictMode (dev) voert effecten uit als
 * mount → cleanup → mount; de tweede mount annuleert het uitgestelde vergrendelen.
 */
let pendingLock: ReturnType<typeof setTimeout> | undefined

function useAutoLock(active: boolean, onExpire: () => void): void {
  useEffect(() => {
    if (!active) return undefined
    if (pendingLock !== undefined) {
      clearTimeout(pendingLock)
      pendingLock = undefined
    }
    touchUnlock()
    let lastTouch = Date.now()

    const expireIfNeeded = () => {
      if (!isUnlocked()) onExpire()
    }
    const onActivity = () => {
      const now = Date.now()
      if (!isUnlocked(now)) {
        onExpire()
        return
      }
      if (now - lastTouch >= TOUCH_THROTTLE_MS) {
        lastTouch = now
        touchUnlock(now)
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') expireIfNeeded()
    }
    const events = ['pointerdown', 'keydown', 'input'] as const
    for (const name of events) document.addEventListener(name, onActivity, true)
    document.addEventListener('visibilitychange', onVisibility)
    const timer = setInterval(expireIfNeeded, CHECK_INTERVAL_MS)

    return () => {
      for (const name of events) document.removeEventListener(name, onActivity, true)
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(timer)
      // Het ouderscherm verdwijnt (terug naar kind, andere route): vergrendel, tenzij direct opnieuw gemount.
      pendingLock = setTimeout(() => {
        pendingLock = undefined
        lock()
      }, 0)
    }
  }, [active, onExpire])
}

export interface ParentAppProps {
  /** Opslag; standaard de gedeelde opslag van de app. */
  store?: WardrobeStore
  /** Maakt de som voor het ouderslot; injecteerbaar voor tests. */
  makeSum?: () => Sum
}

type View = { name: 'wardrobe' } | { name: 'add' } | { name: 'item'; id: string } | { name: 'settings' } | { name: 'backup' } | { name: 'children' }

export default function ParentApp({ store, makeSum = randomSum }: ParentAppProps) {
  const [unlocked, setUnlocked] = useState(() => isUnlocked())
  const [sum] = useState(makeSum)
  const [expire] = useState(() => () => {
    lock()
    setUnlocked(false)
  })
  useAutoLock(unlocked, expire)

  if (!unlocked) {
    return (
      <Gate
        sum={sum}
        store={store}
        onUnlock={() => {
          touchUnlock()
          setUnlocked(true)
        }}
      />
    )
  }
  return <ParentMain store={store ?? getStore()} />
}

const TABS = [
  { name: 'wardrobe', label: 'Kast', Icon: IconWardrobe },
  { name: 'children', label: 'Kinderen', Icon: IconChildren },
  { name: 'settings', label: 'Instellingen', Icon: IconSettings },
  { name: 'backup', label: 'Back-up', Icon: IconBackup },
] as const

function ParentMain({ store }: { store: WardrobeStore }) {
  const { items, settings, loading, error, reload } = useWardrobe(store)
  const { children, loading: childrenLoading, error: childrenError, reload: reloadChildren } = useChildren(store)
  const [view, setView] = useState<View>({ name: 'wardrobe' })

  // Vraag de browser de kledingkast te beschermen tegen automatisch opruimen.
  useEffect(() => {
    void requestPersistentStorage()
  }, [])

  const open = view.name === 'item' ? items.find((item) => item.id === view.id) : undefined
  const tab = view.name === 'settings' || view.name === 'backup' || view.name === 'children' ? view.name : 'wardrobe'
  const goHome = () => setView({ name: 'wardrobe' })

  let content
  if (loading) {
    content = (
      <p role="status" className="parent-hint">
        Laden…
      </p>
    )
  } else if (error && items.length === 0 && view.name === 'wardrobe') {
    content = (
      <div className="parent-card">
        <p role="alert" className="parent-error">
          {error}
        </p>
        <button type="button" onClick={() => void reload()}>
          Opnieuw proberen
        </button>
      </div>
    )
  } else if (view.name === 'add') {
    content = <AddFlow store={store} children={children} reload={reload} onDone={goHome} />
  } else if (view.name === 'item') {
    content = open ? (
      <ItemDetail
        key={open.id}
        store={store}
        item={open}
        items={items}
        children={children}
        reload={reload}
        onBack={goHome}
      />
    ) : (
      <div className="parent-card">
        <p>Dit kledingstuk bestaat niet meer.</p>
        <button type="button" onClick={goHome}>
          Terug naar de kast
        </button>
      </div>
    )
  } else if (view.name === 'settings') {
    content = <SettingsPanel store={store} settings={settings} reload={reload} />
  } else if (view.name === 'children') {
    content = <ChildrenPanel store={store} children={children} reload={reloadChildren} />
  } else if (view.name === 'backup') {
    content = <BackupPanel
        store={store}
        reload={async () => {
          // Een back-up bevat ook kinderen: ververs beide.
          await Promise.all([reload(), reloadChildren()])
        }}
      />
  } else {
    content = (
      <Wardrobe
        items={items}
        // Toon de hint 'nog geen kind' pas als zeker is dat er echt geen kinderen zijn.
        hasChildren={childrenLoading || childrenError !== undefined || children.length > 0}
        onAdd={() => setView({ name: 'add' })}
        onOpen={(id) => setView({ name: 'item', id })}
        onOpenChildren={() => setView({ name: 'children' })}
      />
    )
  }

  return (
    <div className="parent-shell">
      <main className="page parent">
        <header className="parent-header">
          <div className="parent-brand">
            <span className="parent-brand-mark" aria-hidden="true">
              <IconWardrobe size={26} />
            </span>
            <h1>Ouderbeheer</h1>
          </div>
          <Link className="parent-link" to="/">
            Naar de kledingkast van je kind
            <IconArrowRight size={18} />
          </Link>
        </header>
        {error && !(items.length === 0 && view.name === 'wardrobe') ? (
          <p role="alert" className="parent-error">
            {error}
          </p>
        ) : null}
        {childrenError ? (
          <p role="alert" className="parent-error">
            {childrenError}
          </p>
        ) : null}
        {content}
      </main>
      <nav className="parent-nav" aria-label="Ouderbeheer">
        {TABS.map(({ name, label, Icon }) => (
          <button
            key={name}
            type="button"
            className={`parent-tab${tab === name ? ' is-active' : ''}`}
            aria-current={tab === name ? 'page' : undefined}
            onClick={() => setView({ name } as View)}
          >
            <span className="parent-tab-icon">
              <Icon size={22} />
            </span>
            <span className="parent-tab-label">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
