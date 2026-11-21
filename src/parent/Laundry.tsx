import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CATEGORY_LABELS } from '../domain/types'
import type { ClothingItem } from '../domain/types'
import { IconWash } from '../shared/icons'
import { Thumb, itemLabel } from './shared'

const DAY_MS = 24 * 60 * 60 * 1000

interface LaundryProps {
  items: ClothingItem[]
  /** Changes availability in bulk and reloads; rejects on failure. */
  onSetAvailable: (ids: string[], available: boolean) => Promise<void>
}

export default function Laundry({ items, onSetAvailable }: LaundryProps) {
  const { t } = useTranslation('parent')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [now] = useState(() => Date.now())
  const busyRef = useRef(false)
  // The longest in the wash first; items without a date at the end.
  const inWash = items
    .filter((item) => !item.available)
    .sort((a, b) => (a.washedAt ?? Number.MAX_SAFE_INTEGER) - (b.washedAt ?? Number.MAX_SAFE_INTEGER))

  async function takeOut(ids: string[]) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(false)
    try {
      await onSetAvailable(ids, true)
    } catch (e) {
      console.error(e)
      setError(true)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  function since(item: ClothingItem): string | undefined {
    if (item.washedAt === undefined) return undefined
    const days = Math.max(0, Math.floor((now - item.washedAt) / DAY_MS))
    return days === 0 ? t('laundry.sinceToday') : t('laundry.since', { count: days })
  }

  return (
    <section aria-labelledby="parent-laundry-title" className="parent-laundry">
      <div className="parent-title-row">
        <h2 id="parent-laundry-title">{t('laundry.title')}</h2>
        <span className="parent-count">{inWash.length}</span>
      </div>
      {inWash.length === 0 ? (
        <div className="parent-card parent-empty">
          <span className="parent-empty-icon" aria-hidden="true">
            <IconWash size={34} />
          </span>
          <p>
            <strong>{t('laundry.empty')}</strong>
          </p>
          <p>{t('laundry.emptyHint')}</p>
        </div>
      ) : (
        <>
          <p className="parent-hint">{t('laundry.hint')}</p>
          <ul className="parent-grid parent-laundry-grid">
            {inWash.map((item) => {
              const label = since(item)
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="parent-tile"
                    disabled={busy}
                    onClick={() => void takeOut([item.id])}
                    aria-label={t('laundry.itemLabel', { label: itemLabel(item) })}
                  >
                    <Thumb photo={item.photo} />
                    <span className="parent-badges">
                      <span className="parent-badge">{CATEGORY_LABELS[item.category]}</span>
                      {label ? <span className="parent-badge parent-badge-wash">{label}</span> : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <button type="button" className="parent-laundry-all" disabled={busy} onClick={() => void takeOut(inWash.map((i) => i.id))}>
            {t('laundry.allOut')}
          </button>
        </>
      )}
      {error ? (
        <p role="alert" className="parent-error">
          {t('laundry.failed')}
        </p>
      ) : null}
    </section>
  )
}
