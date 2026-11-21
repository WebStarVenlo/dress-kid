import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { CATEGORIES, CATEGORY_EMOJI, CATEGORY_LABELS, SEASON_LABELS } from '../domain/types'
import type { ClothingItem } from '../domain/types'
import { IconCamera, IconCheck, IconChildren, IconWash } from '../shared/icons'
import { Thumb, itemLabel } from './shared'

interface WardrobeProps {
  items: ClothingItem[]
  /** False when it is certain no child has been created yet (not while loading or after a load error). */
  hasChildren: boolean
  onAdd: () => void
  onOpen: (id: string) => void
  onOpenChildren: () => void
  /** Puts items in or out of the wash in bulk and reloads; rejects on failure. */
  onSetAvailable: (ids: string[], available: boolean) => Promise<void>
}

export default function Wardrobe({ items, hasChildren, onAdd, onOpen, onOpenChildren, onSetAvailable }: WardrobeProps) {
  const { t } = useTranslation('parent')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  // Items that disappeared in the meantime (e.g. deleted) no longer count.
  const chosen = items.filter((item) => selected.has(item.id))

  function stopSelecting() {
    setSelecting(false)
    setSelected(new Set())
    setFailed(false)
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  async function apply(available: boolean) {
    if (busy || chosen.length === 0) return
    setBusy(true)
    setFailed(false)
    try {
      await onSetAvailable(chosen.map((item) => item.id), available)
      stopSelecting()
    } catch (e) {
      console.error(e)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="parent-wardrobe-title" className="parent-wardrobe">
      <div className="parent-title-row">
        <h2 id="parent-wardrobe-title">{t('wardrobe.title')}</h2>
        <span className="parent-count">
          {items.length}
        </span>
        {items.length > 0 && !selecting ? (
          <button type="button" className="parent-select-toggle" onClick={() => setSelecting(true)}>
            {t('wardrobe.select')}
          </button>
        ) : null}
      </div>
      {selecting ? (
        <div className="parent-card parent-selectbar" role="group" aria-label={t('wardrobe.selectedCount', { count: chosen.length })}>
          <p className="parent-hint" role="status">
            {chosen.length === 0 ? t('wardrobe.selectHint') : t('wardrobe.selectedCount', { count: chosen.length })}
          </p>
          <div className="parent-selectbar-actions">
            <button type="button" disabled={busy || chosen.length === 0} onClick={() => void apply(false)}>
              <IconWash size={18} />
              {t('wardrobe.toWash', { count: chosen.length })}
            </button>
            <button type="button" disabled={busy || chosen.length === 0} onClick={() => void apply(true)}>
              {t('wardrobe.fromWash', { count: chosen.length })}
            </button>
            <button type="button" disabled={busy} onClick={stopSelecting}>
              {t('wardrobe.cancelSelect')}
            </button>
          </div>
          {failed ? (
            <p role="alert" className="parent-error">
              {t('wardrobe.washFailed')}
            </p>
          ) : null}
        </div>
      ) : null}
      {hasChildren ? null : (
        <div className="parent-card parent-notice">
          <span className="parent-notice-icon" aria-hidden="true">
            <IconChildren size={26} />
          </span>
          <p>
            <strong>{t('wardrobe.noChildTitle')}</strong> {t('wardrobe.noChildBody')}
          </p>
          <button type="button" onClick={onOpenChildren}>
            {t('wardrobe.addChild')}
          </button>
        </div>
      )}
      {items.length === 0 ? (
        <div className="parent-card parent-empty">
          <span className="parent-empty-icon" aria-hidden="true">
            <IconCamera size={34} />
          </span>
          <p>
            <strong>{t('wardrobe.emptyTitle')}</strong>
          </p>
          <p>
            <Trans t={t} i18nKey="wardrobe.emptyHint" components={{ em: <em /> }} />
          </p>
        </div>
      ) : (
        CATEGORIES.map((category) => {
          const inCategory = items.filter((item) => item.category === category)
          if (inCategory.length === 0) return null
          return (
            <section key={category} className="parent-shelf" aria-label={CATEGORY_LABELS[category]}>
              <h3 className="parent-shelf-head">
                <span className="parent-shelf-emoji" aria-hidden="true">
                  {CATEGORY_EMOJI[category]}
                </span>
                {CATEGORY_LABELS[category]}
                <span className="parent-count">{inCategory.length}</span>
              </h3>
              <ul className="parent-shelf-row">
                {inCategory.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`parent-tile${item.available ? '' : ' is-away'}${selecting && selected.has(item.id) ? ' is-selected' : ''}`}
                      onClick={() => (selecting ? toggle(item.id) : onOpen(item.id))}
                      aria-label={t(selecting ? 'wardrobe.selectLabel' : 'wardrobe.tileLabel', { label: itemLabel(item) })}
                      aria-pressed={selecting ? selected.has(item.id) : undefined}
                    >
                      <Thumb photo={item.photo} />
                      {selecting ? (
                        <span className="parent-tile-check" aria-hidden="true">
                          {selected.has(item.id) ? <IconCheck size={14} /> : null}
                        </span>
                      ) : null}
                      <span className="parent-badges">
                        {item.size ? <span className="parent-badge">{t('wardrobe.size', { size: item.size })}</span> : null}
                        {item.season !== 'all' ? (
                          <span className="parent-badge">{SEASON_LABELS[item.season]}</span>
                        ) : null}
                        {!item.available ? (
                          <span className="parent-badge parent-badge-wash">
                            <IconWash size={11} />
                            {t('wardrobe.inWash')}
                          </span>
                        ) : null}
                        {item.excludedIds.length > 0 ? (
                          <span className="parent-badge parent-badge-no">🚫 {item.excludedIds.length}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      )}
      {selecting ? null : <button type="button" className="parent-fab" onClick={onAdd}>
        <span className="parent-fab-icon" aria-hidden="true">
          <IconCamera size={22} />
        </span>
        <span className="parent-fab-label">{t('wardrobe.add')}</span>
      </button>}
    </section>
  )
}
