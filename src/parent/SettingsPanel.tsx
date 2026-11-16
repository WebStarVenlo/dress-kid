import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import type { CurrentSeason, Settings } from '../domain/types'
import { IconSnowflake, IconSparkle, IconSpeaker, IconSun } from '../shared/icons'
import type { WardrobeStore } from '../storage'
import PinSettings from './PinSettings'
import { ChoiceGroup, errorMessage } from './shared'

const OPTIONS = [
  { value: 'summer', label: 'Zomer', icon: <IconSun size={20} /> },
  { value: 'winter', label: 'Winter', icon: <IconSnowflake size={20} /> },
  { value: 'all', label: 'Alles tonen', icon: <IconSparkle size={20} /> },
] as const satisfies ReadonlyArray<{ value: CurrentSeason; label: string; icon: ReactNode }>

interface Props {
  store: WardrobeStore
  settings: Settings
  reload: () => Promise<void>
}

export default function SettingsPanel({ store, settings, reload }: Props) {
  const [error, setError] = useState<string | undefined>()
  const [saved, setSaved] = useState(false)
  const soundTitleId = useId()
  const soundHelpId = useId()

  /** Bewaart een wijziging; bij settings wordt altijd het hele object vervangen. */
  async function save(changes: Partial<Settings>) {
    setError(undefined)
    setSaved(false)
    try {
      await store.saveSettings({ ...settings, ...changes })
      await reload()
      setSaved(true)
    } catch (e) {
      console.error(e)
      setError(errorMessage(e, 'Opslaan is niet gelukt.'))
    }
  }

  return (
    <section aria-labelledby="parent-settings-title">
      <div className="parent-title-row">
        <h2 id="parent-settings-title">Instellingen</h2>
      </div>
      <div className="parent-card parent-form">
        <ChoiceGroup
          legend="Huidig seizoen"
          value={settings.currentSeason}
          options={OPTIONS}
          onChange={(currentSeason) => void save({ currentSeason })}
          variant="segmented"
        />
        <p className="parent-hint">
          Je kind ziet alleen kleding van dit seizoen, plus de stukken die je op &ldquo;Altijd&rdquo; hebt gezet. Bij
          &ldquo;Alles tonen&rdquo; ziet je kind alles.
        </p>
      </div>
      <div className="parent-card parent-form">
        <button
          type="button"
          role="switch"
          aria-checked={settings.soundEnabled}
          aria-labelledby={soundTitleId}
          aria-describedby={soundHelpId}
          className={`parent-switch-row${settings.soundEnabled ? ' is-on' : ''}`}
          onClick={() => void save({ soundEnabled: !settings.soundEnabled })}
        >
          <span className="parent-switch-icon" aria-hidden="true">
            <IconSpeaker size={24} />
          </span>
          <span className="parent-switch-text">
            <span id={soundTitleId} className="parent-switch-title">Geluid en voorlezen</span>
            <span id={soundHelpId} className="parent-switch-help">
              Geluidjes en voorlezen van de vragen in de kindmodus.
            </span>
          </span>
          <span className="parent-switch" aria-hidden="true" />
        </button>
      </div>
      {saved ? (
        <p role="status" className="parent-ok">
          Opgeslagen.
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
