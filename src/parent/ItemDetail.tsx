import { useId, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { CATEGORIES, CATEGORY_EMOJI, CATEGORY_LABELS } from '../domain/types'
import type { Category, Child, ClothingItem, ItemSeason } from '../domain/types'
import { cropPhoto, resizePhoto } from '../domain/image'
import type { CropRect } from '../domain/image'
import { itemFitsChild } from '../domain/sizes'
import { usePhotoUrl } from '../shared/hooks'
import { IconArrowLeft, IconCamera, IconCrop, IconTrash, IconWash } from '../shared/icons'
import CropDialog from './CropDialog'
import type { WardrobeStore } from '../storage'
import PhotoImport from './PhotoImport'
import { ITEM_SEASON_OPTIONS, ChildAvatar, ChoiceGroup, SizeField, Thumb, errorMessage, itemLabel, sizeSuggestions } from './shared'

interface Props {
  store: WardrobeStore
  item: ClothingItem
  items: ClothingItem[]
  children: Child[]
  reload: () => Promise<void>
  onBack: () => void
}

const CATEGORY_OPTIONS = CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
  emoji: CATEGORY_EMOJI[value],
}))

export default function ItemDetail({ store, item, items, children, reload, onBack }: Props) {
  const [error, setError] = useState<string | undefined>()
  const [name, setName] = useState(item.name ?? '')
  const [size, setSize] = useState(item.size ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  /** Optimistische uitsluitingen: id van ander kledingstuk -> verwachte stand. */
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({})
  /** Bijsnijden van de huidige foto ('current') of van een nieuwe foto die de huidige vervangt. */
  const [cropping, setCropping] = useState<{ kind: 'current' } | { kind: 'new'; file: File } | undefined>()
  const photoRef = useRef<HTMLInputElement>(null)
  const nameId = useId()
  const photoUrl = usePhotoUrl(item.photo)

  async function run(action: () => Promise<void>, fallback: string): Promise<boolean> {
    setError(undefined)
    try {
      await action()
      await reload()
      return true
    } catch (e) {
      console.error(e)
      setError(errorMessage(e, fallback))
      return false
    }
  }

  const update = (changes: Parameters<WardrobeStore['updateItem']>[1]) =>
    run(async () => void (await store.updateItem(item.id, changes)), 'Opslaan is niet gelukt.')

  async function saveName() {
    const trimmed = name.trim()
    if (trimmed === (item.name ?? '')) return
    await update({ name: trimmed === '' ? undefined : trimmed })
  }

  async function saveSize() {
    const trimmed = size.trim()
    if (trimmed === (item.size ?? '')) return
    await update({ size: trimmed })
  }

  function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void replacePhoto([file])
  }

  /** Een nieuwe foto gaat eerst langs het bijsnijden. */
  function replacePhoto(files: File[]) {
    const file = files[0]
    if (!file || busy || cropping) return
    setCropping({ kind: 'new', file })
  }

  async function savePhoto(source: Blob, crop: CropRect | undefined, fallback: string) {
    setCropping(undefined)
    setBusy(true)
    try {
      setError(undefined)
      const photo = crop ? await cropPhoto(source, crop) : await resizePhoto(source)
      await update({ photo })
    } catch (e) {
      console.error(e)
      setError(errorMessage(e, fallback))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    const ok = await run(() => store.deleteItem(item.id), 'Verwijderen is niet gelukt.')
    setBusy(false)
    if (ok) onBack()
  }

  async function toggleExcluded(other: ClothingItem, excluded: boolean) {
    setOptimistic((prev) => ({ ...prev, [other.id]: excluded }))
    await run(() => store.setExcluded(item.id, other.id, excluded), 'Opslaan is niet gelukt.')
    setOptimistic((prev) => {
      const next = { ...prev }
      delete next[other.id]
      return next
    })
  }

  const others = items.filter((other) => other.category !== item.category)

  return (
    <section aria-labelledby="parent-item-title">
      <button type="button" className="parent-back" onClick={onBack}>
        <IconArrowLeft size={18} />
        Terug naar de kast
      </button>
      <div className="parent-title-row">
        <h2 id="parent-item-title">{itemLabel(item)}</h2>
      </div>

      <PhotoImport compact disabled={busy || cropping !== undefined} onFiles={replacePhoto}>
        <div className="parent-detail-photo">
          {photoUrl ? <img src={photoUrl} alt={`Foto van ${itemLabel(item)}`} /> : null}
        </div>
      </PhotoImport>
      <input
        ref={photoRef}
        className="parent-file"
        type="file"
        accept="image/*"
        aria-label="Nieuwe foto kiezen"
        tabIndex={-1}
        onChange={pickPhoto}
      />
      <div className="parent-photo-tools">
        <button type="button" className="secondary" disabled={busy} onClick={() => setCropping({ kind: 'current' })}>
          <IconCrop size={22} />
          Bijsnijden
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={() => photoRef.current?.click()}>
          <IconCamera size={22} />
          Andere foto
        </button>
      </div>
      {cropping?.kind === 'current' ? (
        <CropDialog
          photo={item.photo}
          onCrop={(rect) => void savePhoto(item.photo, rect, 'Bijsnijden is niet gelukt.')}
          onCancel={() => setCropping(undefined)}
        />
      ) : null}
      {cropping?.kind === 'new' ? (
        <CropDialog
          photo={cropping.file}
          title="Nieuwe foto bijsnijden"
          onCrop={(rect) => void savePhoto(cropping.file, rect, 'De foto kon niet worden vervangen.')}
          onWholePhoto={() => void savePhoto(cropping.file, undefined, 'De foto kon niet worden vervangen.')}
          onCancel={() => setCropping(undefined)}
        />
      ) : null}

      {error ? (
        <p role="alert" className="parent-error">
          {error}
        </p>
      ) : null}

      <div className="parent-card parent-form">
        <div className="parent-field">
          <label htmlFor={nameId} className="parent-field-label">
            Naam (mag leeg blijven)
          </label>
          <input
            id={nameId}
            type="text"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => void saveName()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
          />
        </div>

        <SizeField
          value={size}
          suggestions={sizeSuggestions(children, item.category)}
          onChange={setSize}
          onBlur={() => void saveSize()}
        />
      </div>
      {children.length > 0 ? (
        <section className="parent-card" aria-labelledby="parent-fits-title">
          <h3 id="parent-fits-title">Past bij</h3>
          <ul className="parent-fits">
            {children.map((child) => (
              <li key={child.id}>
                <ChildAvatar child={child} size={28} />
                {child.name}: {itemFitsChild(item, child) ? 'ja' : 'nee'}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="parent-card parent-form">
        <ChoiceGroup
          legend="Categorie"
          value={item.category}
          options={CATEGORY_OPTIONS}
          onChange={(category: Category) => void update({ category })}
          variant="cards"
        />
        <ChoiceGroup
          legend="Seizoen"
          value={item.season}
          options={ITEM_SEASON_OPTIONS}
          onChange={(season: ItemSeason) => void update({ season })}
          variant="segmented"
        />
      </div>

      <button
        type="button"
        className={`parent-wash${item.available ? '' : ' is-on'}`}
        aria-pressed={!item.available}
        onClick={() => void update({ available: !item.available })}
      >
        <span className="parent-wash-icon" aria-hidden="true">
          <IconWash size={24} />
        </span>
        <span className="parent-wash-text">
          <span className="parent-wash-title">In de was</span>
          <span className="parent-wash-state">{item.available ? 'Nee' : 'Ja, niet beschikbaar'}</span>
        </span>
        <span className="parent-switch" aria-hidden="true" />
      </button>

      <section className="parent-card" aria-labelledby="parent-excl-title">
        <h3 id="parent-excl-title">Past niet bij</h3>
        <p>Tik aan wat hier níet bij past. Alles wat je niet aantikt, mag je kind combineren.</p>
        {others.length === 0 ? (
          <p className="parent-hint">Er zijn nog geen andere kledingstukken om uit te kiezen.</p>
        ) : (
          CATEGORIES.map((category) => {
            const inCategory = others.filter((other) => other.category === category)
            if (inCategory.length === 0) return null
            return (
              <div key={category} className="parent-group">
                <h4>
                  <span aria-hidden="true">{CATEGORY_EMOJI[category]}</span> {CATEGORY_LABELS[category]}
                </h4>
                <ul className="parent-grid">
                  {inCategory.map((other) => {
                    const excluded =
                      optimistic[other.id] ?? (item.excludedIds.includes(other.id) || other.excludedIds.includes(item.id))
                    return (
                      <li key={other.id}>
                        <button
                          type="button"
                          className={`parent-tile${excluded ? ' is-excluded' : ''}`}
                          aria-pressed={excluded}
                          aria-label={`Past niet bij: ${itemLabel(other)}`}
                          onClick={() => void toggleExcluded(other, !excluded)}
                        >
                          <Thumb photo={other.photo} />
                          {excluded ? (
                            <span className="parent-cross" aria-hidden="true">
                              ✕
                            </span>
                          ) : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })
        )}
      </section>

      {confirmDelete ? (
        <div className="parent-card parent-confirm" role="alertdialog" aria-label="Verwijderen bevestigen">
          <p>Weet je zeker dat je dit kledingstuk wilt verwijderen?</p>
          <div className="parent-stack">
            <button type="button" className="danger" disabled={busy} onClick={() => void remove()}>
              Ja, verwijderen
            </button>
            <button type="button" className="secondary" onClick={() => setConfirmDelete(false)}>
              Annuleren
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="danger parent-delete" onClick={() => setConfirmDelete(true)}>
          <IconTrash size={22} />
          Verwijderen
        </button>
      )}
    </section>
  )
}
