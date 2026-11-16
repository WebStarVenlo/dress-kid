import { useId } from 'react'
import { normalizeSize } from '../domain/sizes'
import { CATEGORY_LABELS } from '../domain/types'
import type { Category, Child, ClothingItem } from '../domain/types'
import { usePhotoUrl } from '../shared/hooks'

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

interface ChoiceGroupProps<T extends string> {
  legend: string
  value: T | undefined
  options: ReadonlyArray<{ value: T; label: string; emoji?: string }>
  onChange: (value: T) => void
  big?: boolean
}

/** Groep keuzeknoppen (radiogroep) voor categorie en seizoen. */
export function ChoiceGroup<T extends string>({ legend, value, options, onChange, big }: ChoiceGroupProps<T>) {
  return (
    <div className="parent-field" role="radiogroup" aria-label={legend}>
      <p className="parent-field-label" aria-hidden="true">
        {legend}
      </p>
      <div className={big ? 'parent-choices parent-choices-big' : 'parent-choices'}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            className={`parent-choice${option.value === value ? ' is-selected' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.emoji ? (
              <span className="parent-choice-emoji" aria-hidden="true">
                {option.emoji}
              </span>
            ) : null}
            {option.label}
          </button>
        ))}
      </div>
    </div>
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
