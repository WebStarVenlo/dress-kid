import { useState } from 'react'
import type { CurrentSeason, Settings } from '../domain/types'
import type { WardrobeStore } from '../storage'
import PinSettings from './PinSettings'
import { ChoiceGroup, errorMessage } from './shared'

const OPTIONS: Array<{ value: CurrentSeason; label: string }> = [
  { value: 'summer', label: 'Zomer' },
  { value: 'winter', label: 'Winter' },
  { value: 'all', label: 'Alles tonen' },
]

interface Props {
  store: WardrobeStore
  settings: Settings
  reload: () => Promise<void>
}

export default function SettingsPanel({ store, settings, reload }: Props) {
  const [error, setError] = useState<string | undefined>()
  const [saved, setSaved] = useState(false)

  async function choose(currentSeason: CurrentSeason) {
    setError(undefined)
    setSaved(false)
    try {
      await store.saveSettings({ ...settings, currentSeason })
      await reload()
      setSaved(true)
    } catch (e) {
      console.error(e)
      setError(errorMessage(e, 'Opslaan is niet gelukt.'))
    }
  }

  return (
    <section aria-labelledby="parent-settings-title">
      <h2 id="parent-settings-title">Instellingen</h2>
      <ChoiceGroup
        legend="Huidig seizoen"
        value={settings.currentSeason}
        options={OPTIONS}
        onChange={(value) => void choose(value)}
      />
      <p>
        Je kind ziet alleen kleding van dit seizoen, plus de stukken die je op &ldquo;Altijd&rdquo; hebt gezet. Bij
        &ldquo;Alles tonen&rdquo; ziet je kind alles.
      </p>
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
