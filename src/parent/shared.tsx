import { useId } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { normalizeSize } from '../domain/sizes'
import { CATEGORY_LABELS, SEASON_LABELS } from '../domain/types'
import type { Category, Child, ClothingItem, ItemSeason } from '../domain/types'
import { AnimalAvatar, AVATAR_COLORS } from '../shared/AnimalAvatar'
import { usePhotoUrl } from '../shared/hooks'
import { IconCheck, IconSnowflake, IconSparkle, IconSun } from '../shared/icons'

const ITEM_SEASONS: ItemSeason[] = ['summer', 'winter', 'all']
const ITEM_SEASON_ICONS: Record<ItemSeason, ReactNode> = {
  summer: <IconSun size={20} />,
  winter: <IconSnowflake size={20} />,
  all: <IconSparkle size={20} />,
}
/** Seizoenskeuze voor een kledingstuk (toevoegen en wijzigen). */
export const ITEM_SEASON_OPTIONS = ITEM_SEASONS.map((value) => ({
  value,
  label: SEASON_LABELS[value],
  icon: ITEM_SEASON_ICONS[value],
}))

export function itemLabel(item: Pick<ClothingItem, 'name' | 'category'>): string {
  const name = item.name?.trim()
  return name ? name : CATEGORY_LABELS[item.category]
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function Thumb({ photo, className = '' }: { photo: Blob; className?: string }) {
  const url = usePhotoUrl(photo)
  return <img className={`parent-thumb ${className}`} src={url} alt="" draggable={false} />
}

/** Hoe een ChoiceGroup eruitziet: losse chips, grote kaarten (met emoji) of een segmentbalk. */
type ChoiceVariant = 'chips' | 'cards' | 'segmented'

interface ChoiceGroupProps<T extends string> {
  legend: string
  value: T | undefined
  options: ReadonlyArray<{ value: T; label: string; emoji?: string; icon?: ReactNode }>
  onChange: (value: T) => void
  variant?: ChoiceVariant
}

/** Groep keuzeknoppen (radiogroep) voor categorie en seizoen. */
export function ChoiceGroup<T extends string>({ legend, value, options, onChange, variant = 'chips' }: ChoiceGroupProps<T>) {
  return (
    <div className="parent-field" role="radiogroup" aria-label={legend}>
      <p className="parent-field-label" aria-hidden="true">
        {legend}
      </p>
      <div className={`parent-choices parent-choices-${variant}`}>
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`parent-choice${selected ? ' is-selected' : ''}`}
              onClick={() => onChange(option.value)}
            >
              {option.emoji ? (
                <span className="parent-choice-emoji" aria-hidden="true">
                  {option.emoji}
                </span>
              ) : null}
              {option.icon ?? null}
              <span className="parent-choice-label">{option.label}</span>
              {selected && variant === 'cards' ? (
                <span className="parent-choice-check" aria-hidden="true">
                  <IconCheck size={14} />
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Is deze (hex)kleur zo licht dat witte tekst erop slecht leesbaar is? */
function isLight(color: string): boolean {
  const match = /^#([0-9a-f]{6})$/i.exec(color)
  if (!match) return false
  const n = parseInt(match[1] ?? '0', 16)
  const luma = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return luma > 170
}

/** Profielplaatje van een kind: het dierfiguur, of (zonder) een gekleurde cirkel met de beginletter. */
export function ChildAvatar({ child, size = 48 }: { child: Pick<Child, 'name' | 'color' | 'avatar'>; size?: number }) {
  const style = { width: size, height: size, '--child-color': child.color } as CSSProperties
  if (child.avatar) {
    return (
      <span className="parent-avatar" style={{ ...style, background: AVATAR_COLORS[child.avatar] }} aria-hidden="true">
        <AnimalAvatar id={child.avatar} />
      </span>
    )
  }
  return (
    <span
      className={`parent-avatar parent-avatar-initial${isLight(child.color) ? ' is-light' : ''}`}
      style={{ ...style, background: child.color, fontSize: size * 0.45 }}
      aria-hidden="true"
    >
      {Array.from(child.name.trim())[0]?.toUpperCase() ?? ''}
    </span>
  )
}

/** Alle maten die een kind voor deze categorie heeft, zonder dubbelen (hoofdletterongevoelig). */
export function sizeSuggestions(children: Child[], category: Category | undefined): string[] {
  if (!category) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const child of children) {
    for (const size of child.sizes[category] ?? []) {
      const key = normalizeSize(size)
      if (key === '' || seen.has(key)) continue
      seen.add(key)
      result.push(size)
    }
  }
  return result
}

interface SizeFieldProps {
  value: string
  suggestions: string[]
  onChange: (value: string) => void
  onBlur?: () => void
}

/** Optioneel maatveld met suggesties uit de maten van de kinderen. */
export function SizeField({ value, suggestions, onChange, onBlur }: SizeFieldProps) {
  const inputId = useId()
  const listId = useId()
  return (
    <div className="parent-field">
      <label htmlFor={inputId} className="parent-field-label">
        Maat (mag leeg blijven)
      </label>
      <input
        id={inputId}
        type="text"
        list={listId}
        value={value}
        maxLength={20}
        placeholder="bijv. 110"
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onBlur) event.currentTarget.blur()
        }}
      />
      <datalist id={listId}>
        {suggestions.map((size) => (
          <option key={size} value={size} />
        ))}
      </datalist>
    </div>
  )
}
