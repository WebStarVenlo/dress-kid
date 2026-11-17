import { Trans, useTranslation } from 'react-i18next'
import { CATEGORIES, CATEGORY_EMOJI, CATEGORY_LABELS, SEASON_LABELS } from '../domain/types'
import type { ClothingItem } from '../domain/types'
import { IconCamera, IconChildren, IconWash } from '../shared/icons'
import { Thumb, itemLabel } from './shared'

interface WardrobeProps {
  items: ClothingItem[]
  /** False when it is certain no child has been created yet (not while loading or after a load error). */
  hasChildren: boolean
  onAdd: () => void
  onOpen: (id: string) => void
  onOpenChildren: () => void
}

export default function Wardrobe({ items, hasChildren, onAdd, onOpen, onOpenChildren }: WardrobeProps) {
  const { t } = useTranslation('parent')
  return (
    <section aria-labelledby="parent-wardrobe-title" className="parent-wardrobe">
      <div className="parent-title-row">
        <h2 id="parent-wardrobe-title">{t('wardrobe.title')}</h2>
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
            <strong>{t('wardrobe.noChildTitle')}</strong> {t('wardrobe.noChildBody')}
          </p>
          <button type="button" onClick={onOpenChildren}>
            {t('wardrobe.addChild')}
          </button>
        </div>
      )}
      {items.length === 0 ? (
        <div className="parent-card parent-empty">
          <span className="parent-empty-icon" aria-hidden="true">
            <IconCamera size={34} />
          </span>
          <p>
            <strong>{t('wardrobe.emptyTitle')}</strong>
          </p>
          <p>
            <Trans t={t} i18nKey="wardrobe.emptyHint" components={{ em: <em /> }} />
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
                      aria-label={t('wardrobe.tileLabel', { label: itemLabel(item) })}
                    >
                      <Thumb photo={item.photo} />
                      <span className="parent-badges">
                        {item.size ? <span className="parent-badge">{t('wardrobe.size', { size: item.size })}</span> : null}
                        {item.season !== 'all' ? (
                          <span className="parent-badge">{SEASON_LABELS[item.season]}</span>
                        ) : null}
                        {!item.available ? (
                          <span className="parent-badge parent-badge-wash">
                            <IconWash size={11} />
                            {t('wardrobe.inWash')}
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
        <span className="parent-fab-label">{t('wardrobe.add')}</span>
      </button>
    </section>
  )
}
