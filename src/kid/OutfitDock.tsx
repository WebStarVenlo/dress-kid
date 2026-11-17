import type { CSSProperties, Ref } from 'react'
import { CATEGORY_EMOJI } from '../domain/types'
import type { Category, ClothingItem, Outfit } from '../domain/types'
import { IconCheck } from '../shared/icons'
import { Doll, Photo } from './KidArt'
import { itemLabel } from './kidUtils'

/** Voortgangsbalk: één stukje per soort kleding die nog meetelt, mint als hij gekozen is. */
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
 * De paspop onderaan (of als kolom op brede schermen): het figuurtje, een vakje per soort kleding
 * en de Klaar-knop. Die knop bestaat pas als de outfit compleet is; daarvoor staat er een grijs
 * vinkje (alleen versiering).
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
  return (
    <div className={`kid-dock${complete ? ' kid-dock--complete' : ''}`} ref={ref}>
      <div className="kid-dock__doll">
        <Doll outfit={outfit} slots={slots} />
      </div>
      <ul className="kid-slots" aria-label="Jouw outfit">
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
          <span className="kid-go__label">Klaar!</span>
        </button>
      ) : (
        <span className="kid-go kid-go--waiting" aria-hidden="true">
          <IconCheck className="kid-go__icon" size={34} />
        </span>
      )}
    </div>
  )
}
