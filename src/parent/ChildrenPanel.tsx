import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CATEGORIES, CATEGORY_EMOJI, CATEGORY_LABELS, stickersOn } from '../domain/types'
import { AVATAR_IDS, AVATAR_LABELS } from '../domain/avatars'
import type { AvatarId } from '../domain/avatars'
import type { Category, Child, ChildSizes } from '../domain/types'
import { AppError, translateError } from '../i18n/AppError'
import { AnimalAvatar, AVATAR_COLORS } from '../shared/AnimalAvatar'
import { IconCheck, IconPlus, IconSticker, IconTrash } from '../shared/icons'
import type { WardrobeStore } from '../storage'
import { ChildAvatar } from './shared'

interface Props {
  store: WardrobeStore
  children: Child[]
  reload: () => Promise<void>
}

const PRESET_COLORS = ['#e8590c', '#f59f00', '#2f9e44', '#1c7ed6', '#7048e8', '#d6336c']
const DEFAULT_COLOR = '#1c7ed6'

type SizeTexts = Partial<Record<Category, string>>

interface FormState {
  /** Absent for a new child. */
  id?: string
  name: string
  color: string
  /** Chosen animal figure; absent = none (the UI then shows the initial). */
  avatar?: AvatarId
  sizes: SizeTexts
  stickersEnabled: boolean
}

/** "104, 110" -> ['104', '110']; commas and semicolons separate sizes. */
function parseSizes(text: string): string[] {
  return text
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

function toSizes(texts: SizeTexts): ChildSizes {
  const sizes: ChildSizes = {}
  for (const category of CATEGORIES) {
    const parsed = parseSizes(texts[category] ?? '')
    if (parsed.length > 0) sizes[category] = parsed
  }
  return sizes
}

function toTexts(sizes: ChildSizes): SizeTexts {
  const texts: SizeTexts = {}
  for (const category of CATEGORIES) {
    const list = sizes[category]
    if (list && list.length > 0) texts[category] = list.join(', ')
  }
  return texts
}

/** Short summary, e.g. "Shirt 104, 110 · Broek 104". */
export function summarizeSizes(sizes: ChildSizes): string {
  return CATEGORIES.filter((category) => (sizes[category] ?? []).length > 0)
    .map((category) => `${CATEGORY_LABELS[category]} ${(sizes[category] ?? []).join(', ')}`)
    .join(' · ')
}

export default function ChildrenPanel({ store, children, reload }: Props) {
  const { t } = useTranslation('settings')
  const failure = (e: unknown, fallback: string) =>
    e instanceof AppError ? translateError(e) : e instanceof Error && e.message ? e.message : fallback
  const [form, setForm] = useState<FormState | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [confirmId, setConfirmId] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const nameId = useId()
  const colorId = useId()
  const errorId = useId()
  const sizesPrefix = useId()
  const stickersTitleId = useId()
  const stickersHelpId = useId()

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!form) return
    setBusy(true)
    setError(undefined)
    try {
      // `avatar: undefined` clears a previously chosen animal figure ("Geen") when editing.
      const input = {
        name: form.name,
        color: form.color,
        avatar: form.avatar,
        stickersEnabled: form.stickersEnabled,
        sizes: toSizes(form.sizes),
      }
      if (form.id) await store.updateChild(form.id, input)
      else await store.addChild(input)
      await reload()
      setForm(undefined)
    } catch (e) {
      console.error(e)
      setError(failure(e, t('children.saveFailed')))
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    setBusy(true)
    setError(undefined)
    try {
      await store.deleteChild(id)
      await reload()
      setConfirmId(undefined)
    } catch (e) {
      console.error(e)
      setError(failure(e, t('children.deleteFailed')))
    } finally {
      setBusy(false)
    }
  }

  function startAdd() {
    setError(undefined)
    setConfirmId(undefined)
    setForm({ name: '', color: DEFAULT_COLOR, stickersEnabled: true, sizes: {} })
  }

  function startEdit(child: Child) {
    setError(undefined)
    setConfirmId(undefined)
    setForm({
      id: child.id,
      name: child.name,
      color: child.color,
      avatar: child.avatar,
      stickersEnabled: stickersOn(child),
      sizes: toTexts(child.sizes),
    })
  }

  const confirming = children.find((child) => child.id === confirmId)

  return (
    <section aria-labelledby="parent-children-title">
      <div className="parent-title-row">
        <h2 id="parent-children-title">{t('children.title')}</h2>
      </div>
      <p className="parent-lead">{t('children.lead')}</p>
      <p className="parent-hint">{t('children.hint')}</p>

      {error && !form && !confirming ? (
        <p role="alert" className="parent-error">
          {error}
        </p>
      ) : null}

      {children.length === 0 && !form ? (
        <div className="parent-card parent-empty">
          <p>
            <strong>{t('children.emptyTitle')}</strong>
          </p>
          <p>{t('children.emptyBody')}</p>
        </div>
      ) : (
        <ul className="parent-children">
          {children.map((child) => {
            const summary = summarizeSizes(child.sizes)
            return (
              <li key={child.id} className="parent-card parent-child">
                <ChildAvatar child={child} size={56} />
                <div className="parent-child-info">
                  <strong>{child.name}</strong>
                  <span className="parent-hint">{summary || t('children.noSizes')}</span>
                </div>
                <div className="parent-stack">
                  <button
                    type="button"
                    className="secondary"
                    aria-label={t('children.editAria', { name: child.name })}
                    onClick={() => startEdit(child)}
                  >
                    {t('children.edit')}
                  </button>
                  <button
                    type="button"
                    className="danger"
                    aria-label={t('children.deleteAria', { name: child.name })}
                    onClick={() => {
                      setForm(undefined)
                      setError(undefined)
                      setConfirmId(child.id)
                    }}
                  >
                    <IconTrash size={22} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {confirming ? (
        <div className="parent-card parent-confirm" role="alertdialog" aria-label={t('children.confirm.label')}>
          <p>{t('children.confirm.text', { name: confirming.name })}</p>
          {error ? (
            <p role="alert" className="parent-error">
              {error}
            </p>
          ) : null}
          <div className="parent-stack">
            <button type="button" className="danger" disabled={busy} onClick={() => void remove(confirming.id)}>
              {t('children.confirm.yes')}
            </button>
            <button type="button" className="secondary" onClick={() => setConfirmId(undefined)}>
              {t('children.confirm.cancel')}
            </button>
          </div>
        </div>
      ) : null}

      {form ? (
        <form className="parent-card" onSubmit={(event) => void save(event)} aria-labelledby="parent-child-form-title">
          <h3 id="parent-child-form-title">{form.id ? t('children.form.editTitle') : t('children.form.addTitle')}</h3>
          {error ? (
            <p role="alert" id={errorId} className="parent-error">
              {error}
            </p>
          ) : null}
          <div className="parent-field">
            <label htmlFor={nameId} className="parent-field-label">
              {t('children.form.name')}
            </label>
            <input
              id={nameId}
              type="text"
              value={form.name}
              maxLength={40}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </div>
          <div className="parent-field">
            <label htmlFor={colorId} className="parent-field-label">
              {t('children.form.color')}
            </label>
            <div className="parent-swatches">
              <input
                id={colorId}
                type="color"
                value={form.color}
                onChange={(event) => setForm({ ...form, color: event.target.value })}
              />
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`parent-swatch${form.color.toLowerCase() === color ? ' is-selected' : ''}`}
                  style={{ background: color }}
                  aria-label={t('children.form.colorAria', { color })}
                  aria-pressed={form.color.toLowerCase() === color}
                  onClick={() => setForm({ ...form, color })}
                />
              ))}
            </div>
          </div>
          <div className="parent-field" role="radiogroup" aria-label={t('children.form.avatar')}>
            <p className="parent-field-label" aria-hidden="true">
              {t('children.form.avatar')}
            </p>
            <div className="parent-avatars">
              {AVATAR_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={form.avatar === id}
                  aria-label={AVATAR_LABELS[id]}
                  className={`parent-avatar-option${form.avatar === id ? ' is-selected' : ''}`}
                  style={{ background: AVATAR_COLORS[id] }}
                  onClick={() => setForm({ ...form, avatar: id })}
                >
                  <AnimalAvatar id={id} />
                  {form.avatar === id ? (
                    <span className="parent-avatar-check" aria-hidden="true">
                      <IconCheck size={13} />
                    </span>
                  ) : null}
                </button>
              ))}
              <button
                type="button"
                role="radio"
                aria-checked={form.avatar === undefined}
                className={`parent-avatar-option parent-avatar-none${form.avatar === undefined ? ' is-selected' : ''}`}
                onClick={() => setForm({ ...form, avatar: undefined })}
              >
                {t('children.form.noAvatar')}
                {form.avatar === undefined ? (
                  <span className="parent-avatar-check" aria-hidden="true">
                    <IconCheck size={13} />
                  </span>
                ) : null}
              </button>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={form.stickersEnabled}
            aria-labelledby={stickersTitleId}
            aria-describedby={stickersHelpId}
            className={`parent-switch-row${form.stickersEnabled ? ' is-on' : ''}`}
            onClick={() => setForm({ ...form, stickersEnabled: !form.stickersEnabled })}
          >
            <span className="parent-switch-icon" aria-hidden="true">
              <IconSticker size={24} />
            </span>
            <span className="parent-switch-text">
              <span id={stickersTitleId} className="parent-switch-title">{t('children.form.stickersTitle')}</span>
              <span id={stickersHelpId} className="parent-switch-help">
                {t('children.form.stickersHelp')}
              </span>
            </span>
            <span className="parent-switch" aria-hidden="true" />
          </button>
          <fieldset className="parent-sizes">
            <legend className="parent-field-label">{t('children.form.sizesLegend')}</legend>
            {CATEGORIES.map((category) => (
              <div key={category} className="parent-field parent-size-row">
                <label htmlFor={`${sizesPrefix}-${category}`}>
                  <span aria-hidden="true">{CATEGORY_EMOJI[category]}</span> {CATEGORY_LABELS[category]}
                </label>
                <input
                  id={`${sizesPrefix}-${category}`}
                  type="text"
                  placeholder={t('children.form.sizePlaceholder')}
                  value={form.sizes[category] ?? ''}
                  onChange={(event) => setForm({ ...form, sizes: { ...form.sizes, [category]: event.target.value } })}
                />
              </div>
            ))}
          </fieldset>
          <div className="parent-stack">
            <button type="submit" disabled={busy}>
              {t('children.form.save')}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setForm(undefined)
                setError(undefined)
              }}
            >
              {t('children.form.cancel')}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="parent-add-button" onClick={startAdd}>
          <IconPlus size={22} />
          {t('children.add')}
        </button>
      )}
    </section>
  )
}
