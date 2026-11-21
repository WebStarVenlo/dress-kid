import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DEFAULT_SETTINGS } from '../domain/types'
import type { Category } from '../domain/types'
import { canSpeak, playSound, setFeedbackEnabled, speak } from '../shared/feedback'
import { createIndexedDbStore } from '../storage'
import type { WardrobeStore } from '../storage'
import KidApp from './KidApp'

// Mock sound and speech: they do not exist in jsdom, and we want to see what is said.
vi.mock('../shared/feedback', () => ({
  canSpeak: vi.fn(() => true),
  speak: vi.fn(),
  stopSpeaking: vi.fn(),
  playSound: vi.fn(),
  vibrate: vi.fn(),
  setFeedbackEnabled: vi.fn(),
  isFeedbackEnabled: vi.fn(() => true),
}))

let counter = 0
async function newStore(names: string[] = ['Sam'], soundEnabled = true): Promise<WardrobeStore> {
  counter += 1
  const store = createIndexedDbStore(`kid-feedback-${counter}-${Math.random()}`)
  for (const name of names) await store.addChild({ name, color: '#3366ff', sizes: {} })
  await store.saveSettings({ ...DEFAULT_SETTINGS, currentSeason: 'all', soundEnabled })
  return store
}

async function add(store: WardrobeStore, category: Category, name: string) {
  return store.addItem({ category, name, season: 'all', photo: new Blob([name], { type: 'image/jpeg' }) })
}

function renderKid(store: WardrobeStore) {
  return render(
    <MemoryRouter>
      <KidApp store={store} />
    </MemoryRouter>,
  )
}

const click = (el: HTMLElement) => fireEvent.click(el)

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:test')
  URL.revokeObjectURL = vi.fn()
})

beforeEach(() => {
  vi.mocked(canSpeak).mockReturnValue(true)
})

afterEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe('KidApp: geluid en voorlezen', () => {
  it('leest de vraag van de huidige soort voor', async () => {
    const store = await newStore()
    await add(store, 'top', 'Rood shirt')
    renderKid(store)
    expect(await screen.findByText('Welk shirt wil je?')).toBeInTheDocument()
    click(screen.getByRole('button', { name: 'Voorlezen' }))
    expect(speak).toHaveBeenCalledWith('Welk shirt wil je?')
  })

  it('volgt de geluidsinstelling en verbergt dan de luidspreker', async () => {
    const store = await newStore(['Sam'], false)
    await add(store, 'top', 'Rood shirt')
    renderKid(store)
    expect(await screen.findByRole('button', { name: 'Rood shirt' })).toBeInTheDocument()
    expect(setFeedbackEnabled).toHaveBeenLastCalledWith(false)
    expect(screen.queryByRole('button', { name: 'Voorlezen' })).not.toBeInTheDocument()
  })

  it('zet geluid aan als de ouder dat wil', async () => {
    const store = await newStore()
    await add(store, 'top', 'Rood shirt')
    renderKid(store)
    await screen.findByRole('button', { name: 'Rood shirt' })
    await waitFor(() => expect(setFeedbackEnabled).toHaveBeenLastCalledWith(true))
  })

  it('verbergt de luidspreker als de browser niet kan voorlezen', async () => {
    vi.mocked(canSpeak).mockReturnValue(false)
    const store = await newStore()
    await add(store, 'top', 'Rood shirt')
    renderKid(store)
    expect(await screen.findByRole('button', { name: 'Rood shirt' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Voorlezen' })).not.toBeInTheDocument()
  })

  it('geeft geluid bij kiezen, ontkiezen en wisselen van tabblad, en leest de volgende vraag voor', async () => {
    const store = await newStore()
    await add(store, 'top', 'Rood shirt')
    await add(store, 'bottom', 'Broek')
    renderKid(store)
    click(await screen.findByRole('button', { name: 'Rood shirt' }))
    expect(playSound).toHaveBeenLastCalledWith('pick')
    expect(speak).toHaveBeenLastCalledWith('Welke broek of rok?')
    expect(await screen.findByText('Welke broek of rok?')).toBeInTheDocument()

    click(screen.getByRole('tab', { name: /Shirt/ }))
    expect(playSound).toHaveBeenLastCalledWith('tap')
    click(screen.getByRole('button', { name: 'Rood shirt' }))
    expect(playSound).toHaveBeenLastCalledWith('unpick')
  })

  it('speelt het feestgeluid bij Klaar en de sticker-pling', async () => {
    const store = await newStore()
    await add(store, 'top', 'Rood shirt')
    renderKid(store)
    click(await screen.findByRole('button', { name: 'Rood shirt' }))
    click(screen.getByRole('button', { name: /Klaar/ }))
    expect(playSound).toHaveBeenLastCalledWith('done')
    expect(await screen.findByText('Je hebt 1 sticker!')).toBeInTheDocument()
    await waitFor(() => expect(playSound).toHaveBeenLastCalledWith('sticker'), { timeout: 2500 })
  })

  it('speelt geen sticker-pling en toont geen sticker als stickers uit staan', async () => {
    const store = await newStore([])
    await store.addChild({ name: 'Sam', color: '#3366ff', stickersEnabled: false, sizes: {} })
    await add(store, 'top', 'Rood shirt')
    const { container } = renderKid(store)
    click(await screen.findByRole('button', { name: 'Rood shirt' }))
    click(screen.getByRole('button', { name: /Klaar/ }))
    expect(playSound).toHaveBeenLastCalledWith('done')
    await new Promise((resolve) => setTimeout(resolve, 1800))
    expect(playSound).not.toHaveBeenCalledWith('sticker')
    expect(screen.queryByText(/Je hebt/)).not.toBeInTheDocument()
    expect(container.querySelector('.kid-sticker')).toBeNull()
  })

  it('speelt de sticker-animatie en -pling niet opnieuw bij nogmaals Klaar op dezelfde dag', async () => {
    const store = await newStore()
    await add(store, 'top', 'Rood shirt')
    const { container } = renderKid(store)
    click(await screen.findByRole('button', { name: 'Rood shirt' }))
    click(screen.getByRole('button', { name: /Klaar/ }))
    expect(await screen.findByText('Je hebt 1 sticker!')).toBeInTheDocument()
    expect(container.querySelector('.kid-sticker--new')).not.toBeNull()
    await waitFor(() => expect(playSound).toHaveBeenLastCalledWith('sticker'), { timeout: 2500 })

    click(screen.getByRole('button', { name: 'Veranderen' }))
    vi.mocked(playSound).mockClear()
    click(screen.getByRole('button', { name: /Klaar/ }))
    expect(await screen.findByText('Je hebt 1 sticker!')).toBeInTheDocument()
    expect(container.querySelector('.kid-sticker--new')).toBeNull()
    // Wait well beyond the ping's delay: nothing may sound any more.
    await new Promise((resolve) => setTimeout(resolve, 1500))
    expect(playSound).not.toHaveBeenCalledWith('sticker')
  })

  it('begroet het kind bij het kiezen van een profiel', async () => {
    const store = await newStore(['Sam', 'Noor'])
    renderKid(store)
    click(await screen.findByRole('button', { name: /Noor/ }))
    expect(speak).toHaveBeenCalledWith('Hoi Noor! Wat trek je vandaag aan?')
  })
})
