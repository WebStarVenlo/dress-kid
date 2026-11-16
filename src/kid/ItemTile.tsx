import type { CSSProperties } from 'react'
import type { ClothingItem } from '../domain/types'
import { IconCheck } from '../shared/icons'
import { Photo } from './KidArt'
import { itemLabel } from './kidUtils'

/** Een kledingstuk als "sticker": witte kaart met foto; gekozen = mint rand, scheef en een vinkje. */
export function ItemTile({
  item,
  index,
  selected,
  onChoose,
}: {
  item: ClothingItem
  index: number
  selected: boolean
  onChoose: (item: ClothingItem, tile: HTMLElement) => void
}) {
  return (
    <button
      type="button"
      className={`kid-tile${selected ? ' kid-tile--selected' : ''}`}
      style={{ '--i': index } as CSSProperties}
      aria-pressed={selected}
      aria-label={itemLabel(item)}
      onClick={(event) => onChoose(item, event.currentTarget)}
    >
      <span className="kid-tile__frame">
        <Photo item={item} className="kid-tile__photo" />
      </span>
      {selected ? (
        <span className="kid-tile__check" aria-hidden="true">
          <IconCheck size={26} />
        </span>
      ) : null}
    </button>
  )
}
