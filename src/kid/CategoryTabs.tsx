import { useEffect, useRef } from 'react'
import { CATEGORY_EMOJI, CATEGORY_LABELS } from '../domain/types'
import type { Category, Outfit } from '../domain/types'
import { IconCheck } from '../shared/icons'

/**
 * De tabbladen met soorten kleding: grote vierkante tegels met alleen het plaatje. De naam is de
 * toegankelijke naam. Past niet alles, dan vervaagt de rand aan de kant waar nog meer zit.
 */
export function CategoryTabs({
  categories,
  current,
  outfit,
  isDimmed,
  onSelect,
}: {
  categories: readonly Category[]
  current: Category | undefined
  outfit: Outfit
  isDimmed: (category: Category) => boolean
  onSelect: (category: Category) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)

  // Vervaagde randen bijhouden zonder React-state: alleen data-attributen op de lijst.
  useEffect(() => {
    const list = listRef.current
    if (!list) return undefined
    const update = () => {
      const max = list.scrollWidth - list.clientWidth
      list.dataset.fadeStart = String(list.scrollLeft > 4)
      list.dataset.fadeEnd = String(list.scrollLeft < max - 4)
    }
    update()
    list.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : undefined
    observer?.observe(list)
    return () => {
      list.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      observer?.disconnect()
    }
  }, [categories.length])

  // Het actieve tabblad in beeld schuiven, met wat ruimte zodat de buren zichtbaar blijven.
  useEffect(() => {
    const list = listRef.current
    const tab = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!list || !tab) return
    const margin = 56
    const start = tab.offsetLeft
    const end = start + tab.offsetWidth
    if (start - margin < list.scrollLeft) list.scrollLeft = Math.max(0, start - margin)
    else if (end + margin > list.scrollLeft + list.clientWidth) list.scrollLeft = end + margin - list.clientWidth
  }, [current])

  return (
    <div className="kid-tabs" role="tablist" aria-label="Soort kleding" ref={listRef}>
      {categories.map((category) => {
        const has = outfit[category] !== undefined
        const dimmed = isDimmed(category)
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
            onClick={() => onSelect(category)}
          >
            <span className="kid-tab__emoji" aria-hidden="true">
              {CATEGORY_EMOJI[category]}
            </span>
            {has ? (
              <span className="kid-tab__check" aria-hidden="true">
                <IconCheck size={14} />
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
