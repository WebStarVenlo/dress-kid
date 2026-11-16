/** Kleine hulpjes voor de kindmodus: seizoen, vragen, labels en beweging. */
import { CATEGORY_LABELS } from '../domain/types'
import type { Category, Child, ClothingItem, CurrentSeason, Outfit } from '../domain/types'

export type KidSeason = 'summer' | 'winter'

/** Zomer of winter voor de achtergrond; bij 'all' bepaalt de maand het (april t/m september = zomer). */
export function resolveSeason(current: CurrentSeason | undefined, now: Date = new Date()): KidSeason {
  if (current === 'summer' || current === 'winter') return current
  const month = now.getMonth()
  return month >= 3 && month <= 8 ? 'summer' : 'winter'
}

/** De vraag die de gids per soort kleding stelt (en voorleest). */
export const CATEGORY_QUESTIONS: Record<Category, string> = {
  top: 'Welk shirt wil je?',
  bottom: 'Welke broek of rok?',
  dress: 'Welke jurk?',
  sweater: 'Welke trui of welk vest?',
  socks: 'Welke sokken?',
  shoes: 'Welke schoenen?',
  jacket: 'Welke jas?',
  accessory: 'Wil je een extraatje?',
}

export function initial(child: Child): string {
  return (Array.from(child.name.trim())[0] ?? '?').toUpperCase()
}

export function itemLabel(item: ClothingItem): string {
  return item.name ?? CATEGORY_LABELS[item.category]
}

/**
 * De vakjes van de paspop (en de stukjes van de voortgangsbalk): alleen soorten die nu nog
 * meetellen. Een jurk vervangt shirt en broek; zonder jurk telt de jurk niet mee, tenzij er
 * geen shirts of broeken zijn. Wat al gekozen is, krijgt altijd een vakje.
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

/** Wil de gebruiker minder beweging? Veilig als matchMedia ontbreekt (jsdom, oude browsers). */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Deterministisch "toeval" (0..1) voor confetti en sneeuw: zelfde index, zelfde waarde. */
export function noise(index: number, salt: number): number {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

export interface FlightStart {
  rect: DOMRect
  src: string
}

/**
 * Laat een kopie van de foto van de tegel naar het vakje op de paspop vliegen (Web Animations).
 * Doet niets zonder `Element.animate`, bij minder beweging of als het doel onzichtbaar is.
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

  // Het vakje blijft leeg tot de foto er "inploft".
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
