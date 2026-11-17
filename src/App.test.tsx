import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

describe('App', () => {
  it('toont de kinderomgeving op /', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Wat trek je vandaag aan?' })).toBeInTheDocument()
  })

  it('toont de ouderomgeving op /parent', () => {
    render(
      <MemoryRouter initialEntries={['/parent']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Ouderbeheer' })).toBeInTheDocument()
  })
})
