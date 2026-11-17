/** Building blocks for the kid-mode screens: page with background and friendly messages. */
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { IconGear, IconRestart } from '../shared/icons'
import { SeasonBackdrop } from './Decor'
import { Hanger, Mascot } from './KidArt'
import type { KidSeason } from './kidUtils'

/** The page itself, with the seasonal background behind it. */
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

/** A friendly central panel for loading, errors and empty wardrobes. */
export function KidStatus({
  role,
  art = 'happy',
  children,
}: {
  role?: 'status' | 'alert'
  /** happy = bouncing T-shirt (loading), oops = surprised T-shirt, empty = empty hanger. */
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
  const { t } = useTranslation('kid')
  return (
    <Link className="button kid-big-btn kid-big-btn--parents" to="/parent">
      <IconGear size={28} /> {t('layout.toParents')}
    </Link>
  )
}

export function RetryButton({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation('kid')
  return (
    <button type="button" className="kid-big-btn" onClick={onRetry}>
      <IconRestart size={28} /> {t('layout.retry')}
    </button>
  )
}

/** The guide when no child has been chosen (yet). */
export function MascotGuide() {
  return (
    <span className="kid-avatar kid-avatar--mascot" aria-hidden="true">
      <Mascot />
    </span>
  )
}
