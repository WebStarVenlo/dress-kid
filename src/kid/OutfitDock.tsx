import type { CSSProperties, Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { CATEGORY_EMOJI } from '../domain/types'
import type { Category, ClothingItem, Outfit } from '../domain/types'
import { IconCheck } from '../shared/icons'
import { Doll, Photo } from './KidArt'
import { itemLabel } from './kidUtils'

/** Progress bar: one segment per kind of clothing that still counts, mint when chosen. */
export function ProgressBar({ slots, outfit }: { slots: readonly Category[]; outfit: Outfit }) {
  if (slots.length === 0) return null
  const filled = slots.filter((category) => outfit[category] !== undefined).length
  return (
    <div className="kid-progress" aria-hidden="true">
      {slots.map((_, i) => (
        <i key={i} className={i < filled ? 'kid-progress__seg kid-progress__seg--on' : 'kid-progress__seg'} />
      ))}
    </div>
  )
}

/**
 * The dress-up doll at the bottom (or as a column on wide screens): the figure, a slot per kind
 * of clothing and the Ready button. The button only exists once the outfit is complete; before
 * that there is a grey check mark (decoration only).
 */
export function OutfitDock({
  slots,
  outfit,
  byId,
  complete,
  onReady,
  ref,
}: {
  slots: readonly Category[]
  outfit: Outfit
  byId: ReadonlyMap<string, ClothingItem>
  complete: boolean
  onReady: () => void
  ref?: Ref<HTMLDivElement>
}) {
  const { t } = useTranslation('kid')
  return (
    <div className={`kid-dock${complete ? ' kid-dock--complete' : ''}`} ref={ref}>
      <div className="kid-dock__doll">
        <Doll outfit={outfit} slots={slots} />
      </div>
      <ul className="kid-slots" aria-label={t('dock.outfit')}>
        {slots.map((category, i) => {
          const id = outfit[category]
          const item = id === undefined ? undefined : byId.get(id)
          const style = { '--i': i } as CSSProperties
          return item ? (
            <li key={category} className="kid-slot kid-slot--full" data-slot={category} style={style}>
              <Photo item={item} className="kid-slot__photo" />
              <span className="visually-hidden">{itemLabel(item)}</span>
            </li>
          ) : (
            <li key={category} className="kid-slot" data-slot={category} style={style} aria-hidden="true">
              <span className="kid-slot__emoji">{CATEGORY_EMOJI[category]}</span>
            </li>
          )
        })}
      </ul>
      {complete ? (
        <button type="button" className="kid-go kid-go--ready" onClick={onReady}>
          <IconCheck className="kid-go__icon" size={34} />
          <span className="kid-go__label">{t('dock.ready')}</span>
        </button>
      ) : (
        <span className="kid-go kid-go--waiting" aria-hidden="true">
          <IconCheck className="kid-go__icon" size={34} />
        </span>
      )}
    </div>
  )
}
