import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
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
  /** Photos to process right away (e.g. shared from another app); they wait for a chosen category. */
  initialFiles?: File[]
  /** Shared link without a photo: ends up in the link field. */
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
  const { t } = useTranslation('parent')
  const [category, setCategory] = useState<Category | undefined>()
  const [season, setSeason] = useState<ItemSeason>('all')
  const [size, setSize] = useState('')
  const [added, setAdded] = useState<Added[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [progress, setProgress] = useState<{ done: number; total: number } | undefined>()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<File[]>(initialFiles ?? [])
  /** A single photo waits for cropping (or "Whole photo"). */
  const [cropping, setCropping] = useState<{ file: File; category: Category } | undefined>()
  const busy = progress !== undefined

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const files = Array.from(input.files ?? [])
    input.value = ''
    void processFiles(files)
  }

  /**
   * Common entry point: gallery, camera, paste, drag, link and shared files.
   * A single photo may be cropped first; with several photos at once we skip that
   * (cropping can happen later per item).
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
        const reason = errorMessage(error, t('addFlow.saveFailed'))
        failures.push(files.length > 1 ? t('addFlow.photoFailure', { number: index + 1, file: file.name, reason }) : reason)
      }
      setProgress({ done: index + 1, total: files.length })
    }
    setErrors(failures)
    setProgress(undefined)
    await reload()
  }

  /** Process photos from the queue, with the choices (type, season, size) as they currently are. */
  function addPending() {
    if (pending.length === 0 || !category) return
    const files = pending
    setPending([])
    void processFiles(files, category)
  }

  function leave() {
    if (pending.length > 0 && !window.confirm(t('addFlow.leaveConfirm', { count: pending.length }))) return
    onDone()
  }

  const ready = category !== undefined && !busy

  return (
    <section aria-labelledby="parent-add-title">
      <div className="parent-title-row">
        <h2 id="parent-add-title">{t('addFlow.title')}</h2>
      </div>
      <div className="parent-card parent-form">
        <ChoiceGroup legend={t('addFlow.whatIsIt')} value={category} options={CATEGORY_OPTIONS} onChange={setCategory} variant="cards" />
        <ChoiceGroup
          legend={t('addFlow.whenWorn')}
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
          {t('addFlow.takePhoto')}
        </button>
        <button type="button" className="secondary" disabled={!ready} onClick={() => galleryRef.current?.click()}>
          <IconImage size={24} />
          {t('addFlow.pickFromGallery')}
        </button>
      </div>
      {category === undefined ? (
        <p className="parent-hint">
          {pending.length > 0 ? t('addFlow.pickFirstPending', { count: pending.length }) : t('addFlow.pickFirst')}
        </p>
      ) : pending.length > 0 ? (
        <div className="parent-card">
          <p className="parent-hint">
            {t('addFlow.checkPending', { count: pending.length })}
          </p>
          <div className="parent-stack">
            <button type="button" disabled={busy || cropping !== undefined} onClick={addPending}>
              {t('addFlow.addPending', { count: pending.length })}
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setPending([])}>
              {t('addFlow.discard')}
            </button>
          </div>
        </div>
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
        aria-label={t('addFlow.takePhoto')}
        tabIndex={-1}
        onChange={handleInput}
      />
      <input
        ref={galleryRef}
        className="parent-file"
        type="file"
        accept="image/*"
        multiple
        aria-label={t('addFlow.galleryLabel')}
        tabIndex={-1}
        onChange={handleInput}
      />

      {progress ? (
        <p role="status" className="parent-progress">
          {t('addFlow.progress', { current: Math.min(progress.done + 1, progress.total), total: progress.total })}
        </p>
      ) : null}
      {errors.length > 0 ? (
        <div role="alert" className="parent-error">
          <p>{t('addFlow.failuresTitle')}</p>
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
            {t('addFlow.recentTitle', { count: added.length })}
          </h3>
          <ul className="parent-recent">
            {added.map((entry) => (
              <li key={entry.id}>
                <Thumb photo={entry.photo} />
                <span>{CATEGORY_LABELS[entry.category]}</span>
              </li>
            ))}
          </ul>
          <p className="parent-hint">{t('addFlow.recentHint')}</p>
        </div>
      ) : null}

      <button type="button" className="secondary parent-done" onClick={leave} disabled={busy}>
        {t('addFlow.done')}
      </button>
    </section>
  )
}
