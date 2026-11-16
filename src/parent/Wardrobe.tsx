import { CATEGORIES, CATEGORY_EMOJI, CATEGORY_LABELS, SEASON_LABELS } from '../domain/types'
import type { ClothingItem } from '../domain/types'
import { IconCamera, IconChildren, IconWash } from '../shared/icons'
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
    <section aria-labelledby="parent-wardrobe-title" className="parent-wardrobe">
      <div className="parent-title-row">
        <h2 id="parent-wardrobe-title">Kledingkast</h2>
        <span className="parent-count">
          {items.length}
        </span>
      </div>
      {hasChildren ? null : (
        <div className="parent-card parent-notice">
          <span className="parent-notice-icon" aria-hidden="true">
            <IconChildren size={26} />
          </span>
          <p>
            <strong>Nog geen kind aangemaakt.</strong> De kinderomgeving heeft minstens één kind nodig.
          </p>
          <button type="button" onClick={onOpenChildren}>
            Kind toevoegen
          </button>
        </div>
      )}
      {items.length === 0 ? (
        <div className="parent-card parent-empty">
          <span className="parent-empty-icon" aria-hidden="true">
            <IconCamera size={34} />
          </span>
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
            <section key={category} className="parent-shelf" aria-label={CATEGORY_LABELS[category]}>
              <h3 className="parent-shelf-head">
                <span className="parent-shelf-emoji" aria-hidden="true">
                  {CATEGORY_EMOJI[category]}
                </span>
                {CATEGORY_LABELS[category]}
                <span className="parent-count">{inCategory.length}</span>
              </h3>
              <ul className="parent-shelf-row">
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
                        {!item.available ? (
                          <span className="parent-badge parent-badge-wash">
                            <IconWash size={11} />
                            In de was
                          </span>
                        ) : null}
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
      <button type="button" className="parent-fab" onClick={onAdd}>
        <span className="parent-fab-icon" aria-hidden="true">
          <IconCamera size={22} />
        </span>
        <span className="parent-fab-label">Kleding toevoegen</span>
      </button>
    </section>
  )
}
