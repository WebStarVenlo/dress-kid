import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { CATEGORIES, CATEGORY_EMOJI, CATEGORY_LABELS } from '../domain/types'
import type { Category, Child, ItemSeason } from '../domain/types'
import { cropPhoto, resizePhoto } from '../domain/image'
import type { CropRect } from '../domain/image'
import { IconCamera, IconCheck, IconImage } from '../shared/icons'
import CropDialog from './CropDialog'
import PhotoImport from './PhotoImport'
import { requestPersistentStorage } from '../storage'
import type { WardrobeStore } from '../storage'
import { ITEM_SEASON_OPTIONS, ChoiceGroup, SizeField, Thumb, errorMessage, sizeSuggestions } from './shared'

interface AddFlowProps {
  store: WardrobeStore
  children: Child[]
  reload: () => Promise<void>
  onDone: () => void
  /** Foto's die direct verwerkt worden (bv. gedeeld vanuit een andere app); wachten op een gekozen categorie. */
  initialFiles?: File[]
  /** Gedeelde link zonder foto: komt in het linkveld te staan. */
  initialUrl?: string
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

export default function AddFlow({ store, children, reload, onDone, initialFiles, initialUrl }: AddFlowProps) {
  const [category, setCategory] = useState<Category | undefined>()
  const [season, setSeason] = useState<ItemSeason>('all')
  const [size, setSize] = useState('')
  const [added, setAdded] = useState<Added[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [progress, setProgress] = useState<{ done: number; total: number } | undefined>()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<File[]>(initialFiles ?? [])
  /** Eén losse foto wacht op bijsnijden (of "Hele foto"). */
  const [cropping, setCropping] = useState<{ file: File; category: Category } | undefined>()
  const busy = progress !== undefined

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const files = Array.from(input.files ?? [])
    input.value = ''
    void processFiles(files)
  }

  /**
   * Gemeenschappelijke ingang: galerij, camera, plakken, slepen, link en gedeelde bestanden.
   * Eén foto mag eerst bijgesneden worden; bij meerdere foto's tegelijk slaan we dat over
   * (bijsnijden kan later per kledingstuk).
   */
  async function processFiles(files: File[], chosen: Category | undefined = category) {
    if (files.length === 0 || busy || cropping) return
    if (!chosen) {
      setPending((prev) => [...prev, ...files])
      return
    }
    if (files.length === 1) {
      setCropping({ file: files[0]!, category: chosen })
      return
    }
    await saveFiles(files, chosen)
  }

  function finishCrop(crop: CropRect | undefined) {
    if (!cropping) return
    setCropping(undefined)
    void saveFiles([cropping.file], cropping.category, crop)
  }

  async function saveFiles(files: File[], chosen: Category, crop?: CropRect) {
    setErrors([])
    setProgress({ done: 0, total: files.length })
    const failures: string[] = []
    let requestedPersist = false
    for (const [index, file] of files.entries()) {
      try {
        const photo = crop ? await cropPhoto(file, crop) : await resizePhoto(file)
        const item = await store.addItem({ category: chosen, season, size: size.trim() || undefined, photo })
        if (!requestedPersist) {
          requestedPersist = true
          void requestPersistentStorage()
        }
        setAdded((prev) => [{ id: item.id, category: chosen, photo: item.photo }, ...prev])
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

  function chooseCategory(next: Category) {
    setCategory(next)
    if (pending.length > 0) {
      const files = pending
      setPending([])
      void processFiles(files, next)
    }
  }

  const ready = category !== undefined && !busy

  return (
    <section aria-labelledby="parent-add-title">
      <div className="parent-title-row">
        <h2 id="parent-add-title">Kleding toevoegen</h2>
      </div>
      <div className="parent-card parent-form">
        <ChoiceGroup legend="Wat is het?" value={category} options={CATEGORY_OPTIONS} onChange={chooseCategory} variant="cards" />
        <ChoiceGroup
          legend="Wanneer draagt je kind het?"
          value={season}
          options={ITEM_SEASON_OPTIONS}
          onChange={setSeason}
          variant="segmented"
        />
        <SizeField value={size} suggestions={sizeSuggestions(children, category)} onChange={setSize} />
      </div>

      <div className="parent-photo-actions">
        <button type="button" disabled={!ready} onClick={() => cameraRef.current?.click()}>
          <IconCamera size={24} />
          Foto maken
        </button>
        <button type="button" className="secondary" disabled={!ready} onClick={() => galleryRef.current?.click()}>
          <IconImage size={24} />
          Kies uit galerij
        </button>
      </div>
      {category === undefined ? (
        <p className="parent-hint">
          {pending.length === 1
            ? '1 foto staat klaar. Kies eerst wat het is.'
            : pending.length > 1
              ? `${pending.length} foto's staan klaar. Kies eerst wat het is.`
              : 'Kies eerst wat het is.'}
        </p>
      ) : null}
      <PhotoImport onFiles={processFiles} disabled={busy || cropping !== undefined} initialUrl={initialUrl} />
      {cropping ? (
        <CropDialog
          photo={cropping.file}
          onCrop={(rect) => finishCrop(rect)}
          onWholePhoto={() => finishCrop(undefined)}
          onCancel={() => setCropping(undefined)}
        />
      ) : null}
      <input
        ref={cameraRef}
        className="parent-file"
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Foto maken"
        tabIndex={-1}
        onChange={handleInput}
      />
      <input
        ref={galleryRef}
        className="parent-file"
        type="file"
        accept="image/*"
        multiple
        aria-label="Foto's kiezen uit galerij"
        tabIndex={-1}
        onChange={handleInput}
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
        <div className="parent-card parent-recent-card">
          <h3>
            <span className="parent-recent-check" aria-hidden="true">
              <IconCheck size={16} />
            </span>
            Zojuist toegevoegd ({added.length})
          </h3>
          <ul className="parent-recent">
            {added.map((entry) => (
              <li key={entry.id}>
                <Thumb photo={entry.photo} />
                <span>{CATEGORY_LABELS[entry.category]}</span>
              </li>
            ))}
          </ul>
          <p className="parent-hint">Nog een? Kies hierboven opnieuw een foto, de keuzes blijven staan. Bijsnijden kan later ook nog, bij het kledingstuk in de kast.</p>
        </div>
      ) : null}

      <button type="button" className="secondary parent-done" onClick={onDone} disabled={busy}>
        Klaar
      </button>
    </section>
  )
}
