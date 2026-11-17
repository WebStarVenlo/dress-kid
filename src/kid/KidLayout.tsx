/** Bouwstenen voor de schermen van de kindmodus: pagina met achtergrond en vriendelijke meldingen. */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { IconGear, IconRestart } from '../shared/icons'
import { SeasonBackdrop } from './Decor'
import { Hanger, Mascot } from './KidArt'
import type { KidSeason } from './kidUtils'

/** De pagina zelf, met de seizoensachtergrond erachter. */
export function KidPage({
  season,
  className = '',
  children,
}: {
  season: KidSeason
  className?: string
  children: ReactNode
}) {
  return (
    <main className={`kid-app kid-app--${season} ${className}`.trim()}>
      <SeasonBackdrop season={season} />
      {children}
    </main>
  )
}

/** Een vriendelijk middenvlak voor laden, fouten en lege kasten. */
export function KidStatus({
  role,
  art = 'happy',
  children,
}: {
  role?: 'status' | 'alert'
  /** happy = stuiterend T-shirtje (laden), oops = verbaasd T-shirtje, empty = leeg hangertje. */
  art?: 'happy' | 'oops' | 'empty'
  children: ReactNode
}) {
  return (
    <div className="kid-status" role={role}>
      <div className={`kid-status__art kid-status__art--${art}`} aria-hidden="true">
        {art === 'empty' ? <Hanger /> : <Mascot mood={art} />}
      </div>
      <div className="kid-status__text">{children}</div>
    </div>
  )
}

export function ParentsButton() {
  return (
    <Link className="button kid-big-btn kid-big-btn--parents" to="/ouder">
      <IconGear size={28} /> Naar de ouders
    </Link>
  )
}

export function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button type="button" className="kid-big-btn" onClick={onRetry}>
      <IconRestart size={28} /> Opnieuw proberen
    </button>
  )
}

/** De gids als er (nog) geen kind gekozen is. */
export function MascotGuide() {
  return (
    <span className="kid-avatar kid-avatar--mascot" aria-hidden="true">
      <Mascot />
    </span>
  )
}
