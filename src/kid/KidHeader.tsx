import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { IconGear, IconSpeaker } from '../shared/icons'

/**
 * The header of kid mode: a guide (animal or T-shirt) with a speech bubble. The bubble holds the
 * title and, while choosing, the current question in large type. The speaker reads aloud.
 */
export function KidHeader({
  title,
  question,
  guide,
  actions,
  onSpeak,
}: {
  title: string
  /** The big question; without a question the title itself is large. */
  question?: string
  guide: ReactNode
  actions?: ReactNode
  /** Without `onSpeak` (sound off or no speech) there is no speaker. */
  onSpeak?: () => void
}) {
  const { t } = useTranslation('kid')
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
          <button type="button" className="kid-speaker" aria-label={t('header.speak')} title={t('header.speak')} onClick={onSpeak}>
            <IconSpeaker size={30} />
          </button>
        ) : null}
      </div>
      <div className="kid-header__actions">
        {actions}
        <Link className="kid-parent-link" to="/parent" aria-label={t('header.parents')} title={t('header.parents')}>
          <IconGear size={26} />
        </Link>
      </div>
    </header>
  )
}
