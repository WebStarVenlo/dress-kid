import { act, render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CATEGORY_LABELS } from '../domain/types'
import AddFlow from '../parent/AddFlow'
import type { WardrobeStore } from '../storage'

const EN_CATEGORIES = {
  top: 'EN Shirt',
  bottom: 'EN Trousers',
  dress: 'EN Dress',
  sweater: 'EN Sweater',
  socks: 'EN Socks',
  shoes: 'EN Shoes',
  jacket: 'EN Jacket',
  accessory: 'EN Accessory',
}

beforeEach(() => {
  i18next.addResourceBundle('en', 'common', { categories: EN_CATEGORIES }, true, true)
})

afterEach(async () => {
  await act(() => i18next.changeLanguage('nl'))
  i18next.removeResourceBundle('en', 'common')
})

describe('taalwissel', () => {
  it('past CATEGORY_LABELS aan na changeLanguage', async () => {
    expect(CATEGORY_LABELS.top).toBe('Shirt')
    await act(() => i18next.changeLanguage('en'))
    expect(CATEGORY_LABELS.top).toBe('EN Shirt')
  })

  it('toont de categorie-opties in de nieuwe taal', async () => {
    const view = render(<AddFlow store={{} as WardrobeStore} children={[]} reload={async () => undefined} onDone={() => undefined} />)
    expect(screen.getByRole('radio', { name: /Jurk/ })).toBeInTheDocument()
    await act(() => i18next.changeLanguage('en'))
    view.rerender(<AddFlow store={{} as WardrobeStore} children={[]} reload={async () => undefined} onDone={() => undefined} />)
    expect(screen.getByRole('radio', { name: /EN Dress/ })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Jurk/ })).not.toBeInTheDocument()
  })
})
