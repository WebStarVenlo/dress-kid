import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { IconGear, IconSpeaker } from '../shared/icons'

/**
 * De kop van de kindmodus: een gids (dier of T-shirtje) met een spraakwolk. In de wolk staat de
 * titel en, tijdens het kiezen, groot de vraag van dit moment. De luidspreker leest voor.
 */
export function KidHeader({
  title,
  question,
  guide,
  actions,
  onSpeak,
}: {
  title: string
  /** De grote vraag ("Welk shirt wil je?"); zonder vraag is de titel zelf groot. */
  question?: string
  guide: ReactNode
  actions?: ReactNode
  /** Zonder `onSpeak` (geluid uit of geen spraak) is er geen luidspreker. */
  onSpeak?: () => void
}) {
  return (
    <header className={`kid-header${question ? ' kid-header--ask' : ''}`}>
      <div className="kid-header__guide">{guide}</div>
      <div className="kid-bubble">
        <div className="kid-bubble__text">
          <h1 className="kid-title">{title}</h1>
          {question ? (
            <p key={question} className="kid-question">
              {question}
            </p>
          ) : null}
        </div>
        {onSpeak ? (
          <button type="button" className="kid-speaker" aria-label="Voorlezen" title="Voorlezen" onClick={onSpeak}>
            <IconSpeaker size={30} />
          </button>
        ) : null}
      </div>
      <div className="kid-header__actions">
        {actions}
        <Link className="kid-parent-link" to="/ouder" aria-label="Voor ouders" title="Voor ouders">
          <IconGear size={26} />
        </Link>
      </div>
    </header>
  )
}
