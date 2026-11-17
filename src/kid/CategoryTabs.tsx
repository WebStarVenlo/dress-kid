import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { CATEGORY_EMOJI, CATEGORY_LABELS } from '../domain/types'
import type { Category, Outfit } from '../domain/types'
import { IconCheck } from '../shared/icons'

/**
 * The tabs for the kinds of clothing: big square tiles showing only the picture. The name is the
 * accessible name. If not everything fits, the edge fades on the side where there is more.
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
  const { t } = useTranslation('kid')
  const listRef = useRef<HTMLDivElement>(null)

  // Track the faded edges without React state: only data attributes on the list.
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

  // Scroll the active tab into view, leaving some room so its neighbours stay visible.
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
    <div className="kid-tabs" role="tablist" aria-label={t('tabs.label')} ref={listRef}>
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
            aria-label={has ? t('tabs.chosen', { label: CATEGORY_LABELS[category] }) : CATEGORY_LABELS[category]}
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
