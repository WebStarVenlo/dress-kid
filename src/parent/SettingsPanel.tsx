import { useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CATEGORIES, CATEGORY_EMOJI, CATEGORY_LABELS } from '../domain/types'
import type { Category, CurrentSeason, Settings } from '../domain/types'
import { IconSnowflake, IconSparkle, IconSpeaker, IconSun } from '../shared/icons'
import { resetLaundryRun } from '../shared/hooks'
import type { WardrobeStore } from '../storage'
import PinSettings from './PinSettings'
import { ChoiceGroup, errorMessage } from './shared'

const OPTION_ICONS = {
  summer: <IconSun size={20} />,
  winter: <IconSnowflake size={20} />,
  all: <IconSparkle size={20} />,
} as const satisfies Record<CurrentSeason, ReactNode>

function toggleCategory(current: Category[], category: Category): Category[] {
  return CATEGORIES.filter((c) => (c === category ? !current.includes(c) : current.includes(c)))
}

interface Props {
  store: WardrobeStore
  settings: Settings
  reload: () => Promise<void>
}

export default function SettingsPanel({ store, settings, reload }: Props) {
  const { t } = useTranslation('settings')
  const options = [
    { value: 'summer', label: t('settings.seasonSummer'), icon: OPTION_ICONS.summer },
    { value: 'winter', label: t('settings.seasonWinter'), icon: OPTION_ICONS.winter },
    { value: 'all', label: t('settings.seasonAll'), icon: OPTION_ICONS.all },
  ] as const satisfies ReadonlyArray<{ value: CurrentSeason; label: string; icon: ReactNode }>
  const RETURN_DAYS = [0, 1, 2, 3, 7]
  // A value outside the standard choices (e.g. restored from a backup) stays visible.
  const returnDays = RETURN_DAYS.includes(settings.autoReturnDays)
    ? RETURN_DAYS
    : [...RETURN_DAYS, settings.autoReturnDays].sort((a, b) => a - b)
  const returnOptions = returnDays.map((days) => ({
    value: String(days),
    label: days === 0 ? t('settings.returnOff') : t('settings.returnDaysOption', { count: days }),
  }))
  const [error, setError] = useState<string | undefined>()
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const savingRef = useRef(false)
  const soundTitleId = useId()
  const soundHelpId = useId()

  /** Saves a change; for settings the whole object is always replaced. */
  async function save(changes: Partial<Settings>) {
    // No second change while saving: `settings` has not been reloaded yet.
    if (savingRef.current) return
    savingRef.current = true
    setBusy(true)
    setError(undefined)
    setSaved(false)
    try {
      await store.saveSettings({ ...settings, ...changes })
      // The laundry settings may change today's outcome: let the next load run it again.
      resetLaundryRun(store)
      await reload()
      setSaved(true)
    } catch (e) {
      console.error(e)
      setError(errorMessage(e, t('settings.saveFailed')))
    } finally {
      savingRef.current = false
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="parent-settings-title">
      <div className="parent-title-row">
        <h2 id="parent-settings-title">{t('settings.title')}</h2>
      </div>
      <div className="parent-card parent-form">
        <ChoiceGroup
          legend={t('settings.season')}
          value={settings.currentSeason}
          options={options}
          onChange={(currentSeason) => void save({ currentSeason })}
          variant="segmented"
        />
        <p className="parent-hint">{t('settings.seasonHint')}</p>
      </div>
      <div className="parent-card parent-form">
        <button
          type="button"
          role="switch"
          aria-checked={settings.soundEnabled}
          aria-labelledby={soundTitleId}
          aria-describedby={soundHelpId}
          disabled={busy}
          className={`parent-switch-row${settings.soundEnabled ? ' is-on' : ''}`}
          onClick={() => void save({ soundEnabled: !settings.soundEnabled })}
        >
          <span className="parent-switch-icon" aria-hidden="true">
            <IconSpeaker size={24} />
          </span>
          <span className="parent-switch-text">
            <span id={soundTitleId} className="parent-switch-title">{t('settings.soundTitle')}</span>
            <span id={soundHelpId} className="parent-switch-help">
              {t('settings.soundHelp')}
            </span>
          </span>
          <span className="parent-switch" aria-hidden="true" />
        </button>
      </div>
      <section className="parent-card parent-form" aria-labelledby="parent-wash-title">
        <h3 id="parent-wash-title">{t('settings.washTitle')}</h3>
        <div className="parent-field" role="group" aria-label={t('settings.washCategories')}>
          <p className="parent-field-label" aria-hidden="true">
            {t('settings.washCategories')}
          </p>
          <div className="parent-choices parent-choices-chips">
            {CATEGORIES.map((category) => {
              const on = settings.autoWashCategories.includes(category)
              return (
                <button
                  key={category}
                  type="button"
                  aria-pressed={on}
                  disabled={busy}
                  className={`parent-choice${on ? ' is-selected' : ''}`}
                  onClick={() => void save({ autoWashCategories: toggleCategory(settings.autoWashCategories, category) })}
                >
                  <span className="parent-choice-emoji" aria-hidden="true">
                    {CATEGORY_EMOJI[category]}
                  </span>
                  <span className="parent-choice-label">{CATEGORY_LABELS[category]}</span>
                </button>
              )
            })}
          </div>
        </div>
        <p className="parent-hint">{t('settings.washCategoriesHint')}</p>
        <ChoiceGroup
          legend={t('settings.returnDays')}
          value={String(settings.autoReturnDays)}
          options={returnOptions}
          onChange={(value) => void save({ autoReturnDays: Number(value) })}
          variant="segmented"
        />
        <p className="parent-hint">{t('settings.returnHint')}</p>
      </section>
      {saved ? (
        <p role="status" className="parent-ok">
          {t('settings.saved')}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="parent-error">
          {error}
        </p>
      ) : null}
      <PinSettings store={store} />
    </section>
  )
}
