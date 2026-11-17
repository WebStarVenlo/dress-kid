/** Small helpers for kid mode: season, questions, labels and motion. */
import { CATEGORY_LABELS } from '../domain/types'
import type { Category, Child, ClothingItem, CurrentSeason, Outfit } from '../domain/types'
import { t } from '../i18n'

export type KidSeason = 'summer' | 'winter'

/** Summer or winter for the background; for 'all' the month decides (April to September = summer). */
export function resolveSeason(current: CurrentSeason | undefined, now: Date = new Date()): KidSeason {
  if (current === 'summer' || current === 'winter') return current
  const month = now.getMonth()
  return month >= 3 && month <= 8 ? 'summer' : 'winter'
}

/** The question the guide asks (and reads aloud) for each kind of clothing. */
export function categoryQuestion(category: Category): string {
  return t(`kid:questions.${category}`)
}

export function initial(child: Child): string {
  return (Array.from(child.name.trim())[0] ?? '?').toUpperCase()
}

export function itemLabel(item: ClothingItem): string {
  return item.name ?? CATEGORY_LABELS[item.category]
}

/**
 * The slots of the doll (and the segments of the progress bar): only kinds that still count.
 * A dress replaces shirt and trousers; without a dress the dress does not count, unless there
 * are no shirts or trousers. Whatever is already chosen always gets a slot.
 */
export function slotCategories(categories: readonly Category[], outfit: Outfit): Category[] {
  const hasDress = outfit.dress !== undefined
  const hasTopOrBottom = categories.some((c) => c === 'top' || c === 'bottom')
  return categories.filter((category) => {
    if (outfit[category] !== undefined) return true
    if (category === 'dress') return !hasTopOrBottom
    if (category === 'top' || category === 'bottom') return !hasDress
    return true
  })
}

/** Does the user want less motion? Safe when matchMedia is missing (jsdom, old browsers). */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Deterministic "randomness" (0..1) for confetti and snow: same index, same value. */
export function noise(index: number, salt: number): number {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

export interface FlightStart {
  rect: DOMRect
  src: string
}

/**
 * Makes a copy of the tile's photo fly to the slot on the doll (Web Animations).
 * Does nothing without `Element.animate`, under reduced motion or if the target is invisible.
 */
export function flyPhoto(from: FlightStart, target: HTMLElement): void {
  if (prefersReducedMotion()) return
  const ghost = document.createElement('img')
  if (typeof ghost.animate !== 'function' || typeof target.animate !== 'function') return
  const to = target.getBoundingClientRect()
  if (to.width === 0 || from.rect.width === 0) return

  ghost.src = from.src
  ghost.alt = ''
  ghost.setAttribute('aria-hidden', 'true')
  ghost.className = 'kid-fly'
  Object.assign(ghost.style, {
    left: `${from.rect.left}px`,
    top: `${from.rect.top}px`,
    width: `${from.rect.width}px`,
    height: `${from.rect.height}px`,
  })
  document.body.appendChild(ghost)

  const dx = to.left + to.width / 2 - (from.rect.left + from.rect.width / 2)
  const dy = to.top + to.height / 2 - (from.rect.top + from.rect.height / 2)
  const scale = Math.max(0.15, to.width / from.rect.width)
  const duration = 620
  const flight = ghost.animate(
    [
      { transform: 'translate(0, 0) scale(1) rotate(0deg)' },
      {
        transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 70}px) scale(${(1 + scale) / 1.7}) rotate(-10deg)`,
        offset: 0.4,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(6deg)`, opacity: 0.85 },
    ],
    { duration, easing: 'cubic-bezier(0.45, 0, 0.3, 1)' },
  )
  const cleanup = () => ghost.remove()
  flight.onfinish = cleanup
  flight.oncancel = cleanup
  window.setTimeout(cleanup, duration + 400)

  // The slot stays empty until the photo "plops" in.
  const landing = target.querySelector('img') ?? target
  landing.animate(
    [
      { transform: 'scale(0.4)', opacity: 0 },
      { transform: 'scale(1.25)', opacity: 1, offset: 0.55 },
      { transform: 'scale(1)', opacity: 1 },
    ],
    { duration: 380, delay: duration - 60, fill: 'backwards', easing: 'ease-out' },
  )
}
