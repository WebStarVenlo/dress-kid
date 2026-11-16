import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { CATEGORIES, CATEGORY_EMOJI, CATEGORY_LABELS, SEASON_LABELS } from '../domain/types'
import type { Category, ClothingItem, ItemSeason } from '../domain/types'
import { resizePhoto } from '../domain/image'
import { usePhotoUrl } from '../shared/hooks'
import type { WardrobeStore } from '../storage'
import { ChoiceGroup, Thumb, errorMessage, itemLabel } from './shared'

interface Props {
  store: WardrobeStore
  item: ClothingItem
  items: ClothingItem[]
  reload: () => Promise<void>
  onBack: () => void
}

const CATEGORY_OPTIONS = CATEGORIES.map((value) => ({
  value,
  label: CATEGORY_LABELS[value],
  emoji: CATEGORY_EMOJI[value],
}))
const SEASONS: ItemSeason[] = ['summer', 'winter', 'all']
const SEASON_OPTIONS = SEASONS.map((value) => ({ value, label: SEASON_LABELS[value] }))

export default function ItemDetail({ store, item, items, reload, onBack }: Props) {
  const [error, setError] = useState<string | undefined>()
  const [name, setName] = useState(item.name ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  /** Optimistische uitsluitingen: id van ander kledingstuk -> verwachte stand. */
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({})
  const photoRef = useRef<HTMLInputElement>(null)
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

  async function replacePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      setError(undefined)
      const photo = await resizePhoto(file)
      await update({ photo })
    } catch (e) {
      console.error(e)
      setError(errorMessage(e, 'De foto kon niet worden vervangen.'))
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
      <button type="button" className="secondary parent-back" onClick={onBack}>
        ← Terug naar de kast
      </button>
      <h2 id="parent-item-title">{itemLabel(item)}</h2>

      <div className="parent-detail-photo">
        {photoUrl ? <img src={photoUrl} alt={`Foto van ${itemLabel(item)}`} /> : null}
      </div>
      <input
        ref={photoRef}
        className="parent-file"
        type="file"
        accept="image/*"
        aria-label="Nieuwe foto kiezen"
        tabIndex={-1}
        onChange={(event) => void replacePhoto(event)}
      />
      <button type="button" className="secondary" disabled={busy} onClick={() => photoRef.current?.click()}>
        📷 Andere foto
      </button>

      {error ? (
        <p role="alert" className="parent-error">
          {error}
        </p>
      ) : null}

      <div className="parent-field">
        <label htmlFor="parent-item-name" className="parent-field-label">
          Naam (mag leeg blijven)
        </label>
        <input
          id="parent-item-name"
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

      <ChoiceGroup
        legend="Categorie"
        value={item.category}
        options={CATEGORY_OPTIONS}
        onChange={(category: Category) => void update({ category })}
      />
      <ChoiceGroup
        legend="Seizoen"
        value={item.season}
        options={SEASON_OPTIONS}
        onChange={(season: ItemSeason) => void update({ season })}
      />

      <button
        type="button"
        className={`parent-wash${item.available ? '' : ' is-on'}`}
        aria-pressed={!item.available}
        onClick={() => void update({ available: !item.available })}
      >
        🧺 In de was
        <span className="parent-wash-state">{item.available ? 'Nee' : 'Ja, niet beschikbaar'}</span>
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
                <ul className="parent-grid parent-grid-small">
                  {inCategory.map((other) => {
                    const excluded =
                      optimistic[other.id] ?? (item.excludedIds.includes(other.id) || other.excludedIds.includes(item.id))
                    return (
                      <li key={other.id}>
                        <button
                          type="button"
                          className={`parent-tile${excluded ? ' is-excluded' : ''}`}
                          aria-pressed={excluded}
                          aria-label={`${itemLabel(other)}, past niet bij dit kledingstuk`}
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
          🗑️ Verwijderen
        </button>
      )}
    </section>
  )
}
