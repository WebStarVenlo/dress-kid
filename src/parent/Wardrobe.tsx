import { CATEGORIES, CATEGORY_EMOJI, CATEGORY_LABELS, SEASON_LABELS } from '../domain/types'
import type { ClothingItem } from '../domain/types'
import { Thumb, itemLabel } from './shared'

interface WardrobeProps {
  items: ClothingItem[]
  /** False als zeker is dat er nog geen kind is aangemaakt (niet tijdens laden of na een laadfout). */
  hasChildren: boolean
  onAdd: () => void
  onOpen: (id: string) => void
  onOpenChildren: () => void
}

export default function Wardrobe({ items, hasChildren, onAdd, onOpen, onOpenChildren }: WardrobeProps) {
  return (
    <section aria-labelledby="parent-wardrobe-title">
      {hasChildren ? null : (
        <div className="parent-card">
          <p>
            <strong>Nog geen kind aangemaakt.</strong> De kinderomgeving heeft minstens één kind nodig.
          </p>
          <button type="button" onClick={onOpenChildren}>
            Kind toevoegen
          </button>
        </div>
      )}
      <button type="button" className="parent-add-button" onClick={onAdd}>
        <span aria-hidden="true">📷</span> Kleding toevoegen
      </button>
      <h2 id="parent-wardrobe-title">
        Kledingkast <span className="parent-count">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <div className="parent-card parent-empty">
          <p>
            <strong>Nog niets in de kledingkast.</strong>
          </p>
          <p>
            Eerste stap: tik op <em>Kleding toevoegen</em>, kies wat het is en maak een foto. Je kunt ook
            meerdere foto&apos;s tegelijk uit je galerij kiezen.
          </p>
        </div>
      ) : (
        CATEGORIES.map((category) => {
          const inCategory = items.filter((item) => item.category === category)
          if (inCategory.length === 0) return null
          return (
            <section key={category} className="parent-group" aria-label={CATEGORY_LABELS[category]}>
              <h3>
                <span aria-hidden="true">{CATEGORY_EMOJI[category]}</span> {CATEGORY_LABELS[category]}{' '}
                <span className="parent-count">({inCategory.length})</span>
              </h3>
              <ul className="parent-grid">
                {inCategory.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`parent-tile${item.available ? '' : ' is-away'}`}
                      onClick={() => onOpen(item.id)}
                      aria-label={`${itemLabel(item)}, bekijk of wijzig`}
                    >
                      <Thumb photo={item.photo} />
                      <span className="parent-badges">
                        {item.size ? <span className="parent-badge">Maat {item.size}</span> : null}
                        {item.season !== 'all' ? (
                          <span className="parent-badge">{SEASON_LABELS[item.season]}</span>
                        ) : null}
                        {!item.available ? <span className="parent-badge parent-badge-wash">In de was</span> : null}
                        {item.excludedIds.length > 0 ? (
                          <span className="parent-badge parent-badge-no">🚫 {item.excludedIds.length}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      )}
    </section>
  )
}
