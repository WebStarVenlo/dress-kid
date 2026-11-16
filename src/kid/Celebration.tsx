import { useEffect } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { Child, ClothingItem } from '../domain/types'
import { AnimalAvatar, AVATAR_COLORS } from '../shared/AnimalAvatar'
import { playSound } from '../shared/feedback'
import { IconArrowLeft, IconSticker, IconStar } from '../shared/icons'
import { Confetti } from './Decor'
import { ChildAvatar, PartyStar, Photo } from './KidArt'
import { itemLabel, prefersReducedMotion } from './kidUtils'

/** Zoveel stickers passen op één bladzijde van het stickerboek. */
const PAGE = 7
const MAX_SHOWN = PAGE * 2
/** Wanneer de nieuwe sticker op de bladzijde ploft (zie .kid-sticker--new in kid.css). */
const STICKER_DELAY_MS = 1300

const TILTS = [-6, 4, -3, 6, -5, 3]

/**
 * Het feestscherm: confetti, het dier van het kind dat stuitert, drie sterren, de gekozen kleding
 * als stickers en het stickerboek met het aantal afgeronde dagen.
 */
export function Celebration({
  child,
  chosen,
  stickers,
  fresh,
  extraAction,
  onChange,
}: {
  child: Child
  chosen: readonly ClothingItem[]
  /** Aantal verdiende stickers; undefined zolang het nog geladen wordt. */
  stickers: number | undefined
  /** True als de sticker zojuist (met Klaar) verdiend is: die komt dan met een sprongetje. */
  fresh: boolean
  /** Bijv. de (bescheiden) knop Opnieuw beginnen, naast Veranderen. */
  extraAction?: ReactNode
  onChange: () => void
}) {
  // Het "pling" van de nieuwe sticker valt samen met de animatie.
  useEffect(() => {
    if (!fresh || stickers === undefined || stickers === 0) return undefined
    const timer = window.setTimeout(() => playSound('sticker'), prefersReducedMotion() ? 0 : STICKER_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [fresh, stickers])

  return (
    <section className="kid-party">
      <Confetti />
      <div className="kid-party__hero">
        <div className="kid-party__avatar">
          <ChildAvatar child={child} className="kid-avatar--huge" />
        </div>
        <p className="kid-party__cheer">Super, {child.name}!</p>
        <div className="kid-stars" aria-hidden="true">
          <PartyStar className="kid-star" />
          <PartyStar className="kid-star kid-star--big" />
          <PartyStar className="kid-star" />
        </div>
      </div>

      <div className="kid-party__side">
        <ul className="kid-done-list">
          {chosen.map((item, i) => (
            <li
              key={item.id}
              className="kid-done-item"
              style={{ '--tilt': `${TILTS[i % TILTS.length]}deg`, '--i': i } as CSSProperties}
            >
              <Photo item={item} className="kid-done-item__photo" />
              <span className="visually-hidden">{itemLabel(item)}</span>
            </li>
          ))}
        </ul>
        {stickers !== undefined && stickers > 0 ? <StickerBook child={child} count={stickers} fresh={fresh} /> : null}
      </div>

      <div className="kid-party__actions">
        <button type="button" className="kid-big-btn kid-party__change" onClick={onChange}>
          <IconArrowLeft size={30} />
          Veranderen
        </button>
        {extraAction}
      </div>
    </section>
  )
}

function StickerBook({ child, count, fresh }: { child: Child; count: number; fresh: boolean }) {
  const shown = Math.min(count, MAX_SHOWN)
  const spots = count > PAGE ? MAX_SHOWN : PAGE
  return (
    <section className="kid-book">
      <p className="kid-book__title">
        <IconSticker size={30} className="kid-book__icon" />
        <span>{`Je hebt ${count} ${count === 1 ? 'sticker' : 'stickers'}!`}</span>
      </p>
      <ol className="kid-book__page" aria-hidden="true">
        {Array.from({ length: spots }, (_, i) => {
          const filled = i < shown
          const isNew = fresh && i === shown - 1
          const style = {
            '--tilt': `${((i * 37) % 17) - 8}deg`,
            backgroundColor: filled && child.avatar ? AVATAR_COLORS[child.avatar] : undefined,
          } as CSSProperties
          if (!filled) return <li key={i} className="kid-sticker kid-sticker--empty" />
          return (
            <li key={i} className={`kid-sticker${isNew ? ' kid-sticker--new' : ''}`} style={style}>
              {child.avatar ? (
                <AnimalAvatar id={child.avatar} className="kid-sticker__art" />
              ) : (
                <IconStar filled size={26} className="kid-sticker__star" />
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
