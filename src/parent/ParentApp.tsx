import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { SHARED_FLAG, takeShared } from '../domain/sharedPhotos'
import { EMPTY_WARDROBE_FILTER } from '../domain/sizes'
import type { WardrobeFilter } from '../domain/sizes'
import { useChildren, useWardrobe } from '../shared/hooks'
import { IconArrowRight, IconBackup, IconChildren, IconSettings, IconWardrobe, IconWash } from '../shared/icons'
import { getStore, requestPersistentStorage } from '../storage'
import type { WardrobeStore } from '../storage'
import AddFlow from './AddFlow'
import BackupPanel from './BackupPanel'
import ChildrenPanel from './ChildrenPanel'
import Gate, { randomSum } from './Gate'
import type { Sum } from './Gate'
import ItemDetail from './ItemDetail'
import Laundry from './Laundry'
import SettingsPanel from './SettingsPanel'
import Wardrobe from './Wardrobe'
import { isUnlocked, lock, touchUnlock } from './unlock'
import './parent.css'

/** How often we check whether the lock has expired while the page is open. */
const CHECK_INTERVAL_MS = 15_000
/** Activity extends the validity at most this often (avoids writing on every movement). */
const TOUCH_THROTTLE_MS = 5_000

/**
 * Deferred re-lock on unmount. React StrictMode (dev) runs effects as
 * mount → cleanup → mount; the second mount cancels the deferred lock.
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
      // The parent screen goes away (back to child, other route): lock, unless remounted right away.
      pendingLock = setTimeout(() => {
        pendingLock = undefined
        lock()
      }, 0)
    }
  }, [active, onExpire])
}

export interface ParentAppProps {
  /** Storage; defaults to the app's shared storage. */
  store?: WardrobeStore
  /** Creates the sum for the parent gate; injectable for tests. */
  makeSum?: () => Sum
}

type View =
  | { name: 'wardrobe' }
  /** files/url: shared via "Share → Dress Kid"; shareId makes it a fresh add screen. */
  | { name: 'add'; files?: File[]; url?: string; shareId?: number }
  | { name: 'item'; id: string } | { name: 'laundry' } | { name: 'settings' } | { name: 'backup' } | { name: 'children' }

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

/**
 * Shared via the share menu (Android): the service worker has staged the photos and redirected
 * to `#/parent?shared=1`. This only runs after the parent gate (ParentMain), so the photos wait
 * until the parent has unlocked. With the flag the add screen always opens, even if nothing
 * usable came along; without the flag only if photos or a link are still waiting.
 */
function useSharedPhotos(setView: (view: View) => void) {
  const location = useLocation()
  const navigate = useNavigate()
  const flagged = new URLSearchParams(location.search).has(SHARED_FLAG)
  // Once per mount; a ref survives the double effects of StrictMode.
  const checked = useRef(false)
  const latest = useRef({ flagged, location, navigate, setView })
  useEffect(() => {
    latest.current = { flagged, location, navigate, setView }
  })

  useEffect(() => {
    if (checked.current) return
    checked.current = true
    const { flagged: wasFlagged, location: at, navigate: go } = latest.current
    if (wasFlagged) {
      // Remove the flag from the URL so reloading doesn't reopen the add screen.
      const params = new URLSearchParams(at.search)
      params.delete(SHARED_FLAG)
      const search = params.toString()
      void go({ pathname: at.pathname, search: search ? `?${search}` : '', hash: at.hash }, { replace: true })
    }
    void takeShared().then(({ files, url }) => {
      if (!wasFlagged && files.length === 0 && url === undefined) return
      latest.current.setView({
        name: 'add',
        files: files.length > 0 ? files : undefined,
        url,
        shareId: Date.now(),
      })
    })
  }, [])
}

const TABS = [
  { name: 'wardrobe', label: 'app.tabs.wardrobe', Icon: IconWardrobe },
  { name: 'laundry', label: 'app.tabs.laundry', Icon: IconWash },
  { name: 'children', label: 'app.tabs.children', Icon: IconChildren },
  { name: 'settings', label: 'app.tabs.settings', Icon: IconSettings },
  { name: 'backup', label: 'app.tabs.backup', Icon: IconBackup },
] as const

function ParentMain({ store }: { store: WardrobeStore }) {
  const { t } = useTranslation('parent')
  const { items, settings, loading, error, reload } = useWardrobe(store)
  const { children, loading: childrenLoading, error: childrenError, reload: reloadChildren } = useChildren(store)
  const [view, setView] = useState<View>({ name: 'wardrobe' })
  const [wardrobeFilter, setWardrobeFilter] = useState<WardrobeFilter>(EMPTY_WARDROBE_FILTER)
  useSharedPhotos(setView)

  // Ask the browser to protect the wardrobe from automatic cleanup.
  useEffect(() => {
    void requestPersistentStorage()
  }, [])

  const open = view.name === 'item' ? items.find((item) => item.id === view.id) : undefined
  const tab = view.name === 'settings' || view.name === 'backup' || view.name === 'children' || view.name === 'laundry'
      ? view.name : 'wardrobe'
  const goHome = () => setView({ name: 'wardrobe' })
  const washCount = items.filter((item) => !item.available).length
  const setAvailable = async (ids: string[], available: boolean) => {
    await store.setItemsAvailable(ids, available)
    await reload()
  }

  let content
  if (loading) {
    content = (
      <p role="status" className="parent-hint">
        {t('app.loading')}
      </p>
    )
  } else if (error && items.length === 0 && view.name === 'wardrobe') {
    content = (
      <div className="parent-card">
        <p role="alert" className="parent-error">
          {error}
        </p>
        <button type="button" onClick={() => void reload()}>
          {t('app.retry')}
        </button>
      </div>
    )
  } else if (view.name === 'add') {
    content = (
      <AddFlow
        key={view.shareId ?? 'add'}
        store={store}
        children={children}
        reload={reload}
        onDone={goHome}
        initialFiles={view.files}
        initialUrl={view.url}
      />
    )
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
        <p>{t('app.itemGone')}</p>
        <button type="button" onClick={goHome}>
          {t('app.backToWardrobe')}
        </button>
      </div>
    )
  } else if (view.name === 'laundry') {
    content = <Laundry items={items} onSetAvailable={setAvailable} />
  } else if (view.name === 'settings') {
    content = <SettingsPanel store={store} settings={settings} reload={reload} />
  } else if (view.name === 'children') {
    content = <ChildrenPanel store={store} children={children} reload={reloadChildren} />
  } else if (view.name === 'backup') {
    content = <BackupPanel
        store={store}
        reload={async () => {
          // A backup also contains children: refresh both.
          await Promise.all([reload(), reloadChildren()])
        }}
      />
  } else {
    content = (
      <Wardrobe
        items={items}
        children={children}
        filter={wardrobeFilter}
        onFilterChange={setWardrobeFilter}
        // Only show the 'no child yet' hint once it is certain there really are no children.
        hasChildren={childrenLoading || childrenError !== undefined || children.length > 0}
        onAdd={() => setView({ name: 'add' })}
        onOpen={(id) => setView({ name: 'item', id })}
        onOpenChildren={() => setView({ name: 'children' })}
        onSetAvailable={setAvailable}
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
            <h1>{t('app.title')}</h1>
          </div>
          <Link className="parent-link" to="/">
            {t('app.toKid')}
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
      <nav className="parent-nav" aria-label={t('app.navLabel')}>
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
              {name === 'laundry' && washCount > 0 ? (
                <span className="parent-tab-badge" aria-hidden="true">
                  {washCount}
                </span>
              ) : null}
            </span>
            <span className="parent-tab-label">{t(label)}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
