import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { CATEGORIES, CATEGORY_EMOJI, CATEGORY_LABELS, SEASON_LABELS } from '../domain/types'
import type { Category, ItemSeason } from '../domain/types'
import { resizePhoto } from '../domain/image'
import type { WardrobeStore } from '../storage'
import { ChoiceGroup, Thumb, errorMessage } from './shared'

interface AddFlowProps {
  store: WardrobeStore
  reload: () => Promise<void>
  onDone: () => void
}

interface Added {
  id: string
  category: Category
  photo: Blob
}

const CATEGORY_OPTIONS = CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
  emoji: CATEGORY_EMOJI[value],
}))
const SEASONS: ItemSeason[] = ['summer', 'winter', 'all']
const SEASON_OPTIONS = SEASONS.map((value) => ({ value, label: SEASON_LABELS[value] }))

export default function AddFlow({ store, reload, onDone }: AddFlowProps) {
  const [category, setCategory] = useState<Category | undefined>()
  const [season, setSeason] = useState<ItemSeason>('all')
  const [added, setAdded] = useState<Added[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [progress, setProgress] = useState<{ done: number; total: number } | undefined>()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const busy = progress !== undefined

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const files = Array.from(input.files ?? [])
    input.value = ''
    if (files.length === 0 || !category) return
    setErrors([])
    setProgress({ done: 0, total: files.length })
    const failures: string[] = []
    for (const [index, file] of files.entries()) {
      try {
        const photo = await resizePhoto(file)
        const item = await store.addItem({ category, season, photo })
        setAdded((prev) => [{ id: item.id, category, photo: item.photo }, ...prev])
      } catch (error) {
        console.error(error)
        const reason = errorMessage(error, 'Opslaan is niet gelukt.')
        failures.push(files.length > 1 ? `Foto ${index + 1} (${file.name}): ${reason}` : reason)
      }
      setProgress({ done: index + 1, total: files.length })
    }
    setErrors(failures)
    setProgress(undefined)
    await reload()
  }

  const ready = category !== undefined && !busy

  return (
    <section aria-labelledby="parent-add-title">
      <h2 id="parent-add-title">Kleding toevoegen</h2>
      <ChoiceGroup legend="Wat is het?" value={category} options={CATEGORY_OPTIONS} onChange={setCategory} big />
      <ChoiceGroup legend="Wanneer draagt je kind het?" value={season} options={SEASON_OPTIONS} onChange={setSeason} />

      <div className="parent-photo-actions">
        <button type="button" disabled={!ready} onClick={() => cameraRef.current?.click()}>
          📷 Foto maken
        </button>
        <button type="button" className="secondary" disabled={!ready} onClick={() => galleryRef.current?.click()}>
          🖼️ Kies uit galerij
        </button>
      </div>
      {category === undefined ? <p className="parent-hint">Kies eerst wat het is.</p> : null}
      <input
        ref={cameraRef}
        className="parent-file"
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Foto maken"
        tabIndex={-1}
        onChange={(event) => void handleFiles(event)}
      />
      <input
        ref={galleryRef}
        className="parent-file"
        type="file"
        accept="image/*"
        multiple
        aria-label="Foto's kiezen uit galerij"
        tabIndex={-1}
        onChange={(event) => void handleFiles(event)}
      />

      {progress ? (
        <p role="status" className="parent-progress">
          Bezig met foto {Math.min(progress.done + 1, progress.total)} van {progress.total}…
        </p>
      ) : null}
      {errors.length > 0 ? (
        <div role="alert" className="parent-error">
          <p>Niet alles is gelukt:</p>
          <ul>
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {added.length > 0 ? (
        <div className="parent-card">
          <h3>Zojuist toegevoegd ({added.length})</h3>
          <ul className="parent-recent">
            {added.map((entry) => (
              <li key={entry.id}>
                <Thumb photo={entry.photo} />
                <span>{CATEGORY_LABELS[entry.category]}</span>
              </li>
            ))}
          </ul>
          <p className="parent-hint">Nog een? Kies hierboven opnieuw een foto, de keuzes blijven staan.</p>
        </div>
      ) : null}

      <button type="button" className="secondary parent-done" onClick={onDone} disabled={busy}>
        Klaar
      </button>
    </section>
  )
}
