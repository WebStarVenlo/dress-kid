import { render } from '@testing-library/react'
import { AVATAR_IDS } from '../domain/avatars'
import { AVATAR_COLORS, AnimalAvatar } from './AnimalAvatar'

describe('AnimalAvatar', () => {
  it.each(AVATAR_IDS)('rendert %s als decoratieve svg', (id) => {
    const { container } = render(<AnimalAvatar id={id} className="x" />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(svg?.getAttribute('focusable')).toBe('false')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 100 100')
    expect(svg?.childElementCount).toBeGreaterThan(3)
    expect(AVATAR_COLORS[id]).toMatch(/^#[0-9A-F]{6}$/i)
  })

  it('geeft role img en een title als die is opgegeven', () => {
    const { getByRole, container } = render(<AnimalAvatar id="fox" title="Vos" />)
    expect(getByRole('img', { name: 'Vos' })).toBeTruthy()
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBeNull()
  })
})
