import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useWardrobe } from '../shared/hooks'
import { getStore } from '../storage'
import type { WardrobeStore } from '../storage'
import AddFlow from './AddFlow'
import BackupPanel from './BackupPanel'
import Gate, { randomSum } from './Gate'
import type { Sum } from './Gate'
import ItemDetail from './ItemDetail'
import SettingsPanel from './SettingsPanel'
import Wardrobe from './Wardrobe'
import './parent.css'

const UNLOCK_KEY = 'dress-kid-parent-unlocked'

function readUnlocked(): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === '1'
  } catch {
    return false
  }
}

function writeUnlocked(): void {
  try {
    sessionStorage.setItem(UNLOCK_KEY, '1')
  } catch {
    // Zonder sessionStorage moet de ouder opnieuw de som maken; geen probleem.
  }
}

export interface ParentAppProps {
  /** Opslag; standaard de gedeelde opslag van de app. */
  store?: WardrobeStore
  /** Maakt de som voor het ouderslot; injecteerbaar voor tests. */
  makeSum?: () => Sum
}

type View = { name: 'wardrobe' } | { name: 'add' } | { name: 'item'; id: string } | { name: 'settings' } | { name: 'backup' }

export default function ParentApp({ store, makeSum = randomSum }: ParentAppProps) {
  const [unlocked, setUnlocked] = useState(readUnlocked)
  const [sum] = useState(makeSum)

  if (!unlocked) {
    return (
      <Gate
        sum={sum}
        onUnlock={() => {
          writeUnlocked()
          setUnlocked(true)
        }}
      />
    )
  }
  return <ParentMain store={store ?? getStore()} />
}

function ParentMain({ store }: { store: WardrobeStore }) {
  const { items, settings, loading, error, reload } = useWardrobe(store)
  const [view, setView] = useState<View>({ name: 'wardrobe' })

  const open = view.name === 'item' ? items.find((item) => item.id === view.id) : undefined
  const tab = view.name === 'settings' || view.name === 'backup' ? view.name : 'wardrobe'
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
    content = <AddFlow store={store} reload={reload} onDone={goHome} />
  } else if (view.name === 'item') {
    content = open ? (
      <ItemDetail key={open.id} store={store} item={open} items={items} reload={reload} onBack={goHome} />
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
  } else if (view.name === 'backup') {
    content = <BackupPanel store={store} reload={reload} />
  } else {
    content = (
      <Wardrobe items={items} onAdd={() => setView({ name: 'add' })} onOpen={(id) => setView({ name: 'item', id })} />
    )
  }

  return (
    <main className="page parent">
      <header className="parent-header">
        <h1>Ouderbeheer</h1>
        <Link className="parent-link" to="/">
          Naar de kledingkast van je kind →
        </Link>
      </header>
      <nav className="parent-nav" aria-label="Ouderbeheer">
        {(
          [
            ['wardrobe', 'Kast'],
            ['settings', 'Seizoen'],
            ['backup', 'Back-up'],
          ] as const
        ).map(([name, label]) => (
          <button
            key={name}
            type="button"
            className={`parent-tab${tab === name ? ' is-active' : ''}`}
            aria-current={tab === name ? 'page' : undefined}
            onClick={() => setView({ name } as View)}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && !(items.length === 0 && view.name === 'wardrobe') ? (
        <p role="alert" className="parent-error">
          {error}
        </p>
      ) : null}
      {content}
    </main>
  )
}
