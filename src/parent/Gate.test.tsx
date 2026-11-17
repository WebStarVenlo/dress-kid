import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, vi } from 'vitest'
import { createIndexedDbStore } from '../storage'
import type { WardrobeStore } from '../storage'
import Gate from './Gate'
import { MAX_PIN_ATTEMPTS, PIN_COOLDOWN_MS, hashPin, resetPinAttempts } from './pin'

let dbCounter = 0
let store: WardrobeStore
let onUnlock: ReturnType<typeof vi.fn<() => void>>

function renderGate(customStore: WardrobeStore = store) {
  return render(
    <MemoryRouter>
      <Gate sum={{ a: 7, b: 6 }} onUnlock={onUnlock} store={customStore} />
    </MemoryRouter>,
  )
}

async function setPin(pin: string) {
  // Few iterations keep the tests fast; the stored iterations are used on verification.
  await store.setParentPin(await hashPin(pin, undefined, 1000))
}

function enterPin(pin: string) {
  fireEvent.change(screen.getByLabelText('Pincode'), { target: { value: pin } })
  fireEvent.click(screen.getByRole('button', { name: 'Ontgrendelen' }))
}

beforeEach(() => {
  store = createIndexedDbStore(`gate-test-${++dbCounter}`)
  onUnlock = vi.fn<() => void>()
  resetPinAttempts()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('zonder PIN', () => {
  it('opent met de som', async () => {
    renderGate()
    fireEvent.change(screen.getByLabelText(/Hoeveel is 7 × 6/), { target: { value: '41' } })
    fireEvent.click(screen.getByRole('button', { name: 'Openen' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Dat klopt niet')
    fireEvent.change(screen.getByLabelText(/Hoeveel is 7 × 6/), { target: { value: '42' } })
    fireEvent.click(screen.getByRole('button', { name: 'Openen' }))
    await waitFor(() => expect(onUnlock).toHaveBeenCalledTimes(1))
    expect(screen.queryByLabelText('Pincode')).not.toBeInTheDocument()
  })

  it('wacht met openen tot zeker is dat er geen PIN is', async () => {
    const { promise, resolve } = Promise.withResolvers<undefined>()
    const slow: WardrobeStore = { ...store, getParentPin: () => promise }
    renderGate(slow)
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true')
    fireEvent.change(screen.getByLabelText(/Hoeveel is 7 × 6/), { target: { value: '42' } })
    fireEvent.click(screen.getByRole('button', { name: 'Openen' }))
    expect(onUnlock).not.toHaveBeenCalled()
    await act(async () => resolve(undefined))
    expect(onUnlock).toHaveBeenCalledTimes(1)
  })

  it('vraagt toch om de PIN als die er na het laden blijkt te zijn', async () => {
    await setPin('1234')
    renderGate()
    fireEvent.change(screen.getByLabelText(/Hoeveel is 7 × 6/), { target: { value: '42' } })
    fireEvent.click(screen.getByRole('button', { name: 'Openen' }))
    expect(await screen.findByLabelText('Pincode')).toBeInTheDocument()
    expect(onUnlock).not.toHaveBeenCalled()
  })

  it('valt terug op de som als de PIN niet kan worden geladen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const broken: WardrobeStore = { ...store, getParentPin: () => Promise.reject(new Error('kapot')) }
    renderGate(broken)
    await waitFor(() => expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'false'))
    fireEvent.change(screen.getByLabelText(/Hoeveel is 7 × 6/), { target: { value: '42' } })
    fireEvent.click(screen.getByRole('button', { name: 'Openen' }))
    expect(onUnlock).toHaveBeenCalledTimes(1)
  })
})

describe('met PIN', () => {
  beforeEach(() => setPin('2580'))

  it('toont een verborgen, numeriek pincodeveld', async () => {
    renderGate()
    const input = await screen.findByLabelText('Pincode')
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(input).toHaveAttribute('autocomplete', 'off')
    expect(screen.queryByLabelText(/Hoeveel is/)).not.toBeInTheDocument()
  })

  it('opent met de juiste PIN', async () => {
    renderGate()
    await screen.findByLabelText('Pincode')
    enterPin('2580')
    await waitFor(() => expect(onUnlock).toHaveBeenCalledTimes(1))
  })

  it('weigert een verkeerde of onvolledige PIN', async () => {
    renderGate()
    await screen.findByLabelText('Pincode')
    enterPin('12')
    expect(screen.getByRole('alert')).toHaveTextContent('Vul de 4 cijfers')
    expect(screen.getByLabelText('Pincode')).toHaveAttribute('aria-invalid', 'true')
    enterPin('1111')
    expect(await screen.findByText(/niet de goede pincode/)).toHaveAttribute('role', 'alert')
    expect(screen.getByLabelText('Pincode')).toHaveValue('')
    expect(onUnlock).not.toHaveBeenCalled()
  })

  it('laat na 5 verkeerde pogingen 30 seconden wachten', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    renderGate()
    await screen.findByLabelText('Pincode')
    for (let i = 1; i < MAX_PIN_ATTEMPTS; i++) {
      enterPin('0000')
      await screen.findByText(/niet de goede pincode/)
    }
    enterPin('0000')
    expect(await screen.findByText(/Te vaak een verkeerde pincode/)).toHaveAttribute('role', 'alert')
    expect(screen.getByText('Nog 30 seconden.')).toBeInTheDocument()
    expect(screen.getByLabelText('Pincode')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Ontgrendelen' })).toBeDisabled()

    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(screen.getByText('Nog 20 seconden.')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(PIN_COOLDOWN_MS - 10_000)
    })
    expect(screen.queryByText(/Te vaak/)).not.toBeInTheDocument()
    enterPin('2580')
    await waitFor(() => expect(onUnlock).toHaveBeenCalledTimes(1))
  })

  it('houdt de wachttijd vast als het slot opnieuw wordt getoond', async () => {
    const { unmount } = renderGate()
    await screen.findByLabelText('Pincode')
    for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) {
      enterPin('0000')
      await waitFor(() => expect(screen.getByLabelText('Pincode')).toHaveValue(''))
    }
    await screen.findByText(/Te vaak/)
    unmount()
    renderGate()
    expect(await screen.findByText(/Te vaak/)).toBeInTheDocument()
    expect(screen.getByLabelText('Pincode')).toBeDisabled()
  })

  it('verwijdert de PIN via "PIN vergeten?" en de som', async () => {
    renderGate()
    await screen.findByLabelText('Pincode')
    fireEvent.click(screen.getByRole('button', { name: 'PIN vergeten?' }))
    fireEvent.change(screen.getByLabelText(/Hoeveel is 7 × 6/), { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: 'PIN verwijderen' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Dat klopt niet')
    expect(await store.getParentPin()).toBeDefined()

    fireEvent.change(screen.getByLabelText(/Hoeveel is 7 × 6/), { target: { value: '42' } })
    fireEvent.click(screen.getByRole('button', { name: 'PIN verwijderen' }))
    expect(await screen.findByRole('status')).toHaveTextContent('De pincode is verwijderd')
    expect(screen.getByText(/onder Instellingen/)).toBeInTheDocument()
    expect(await store.getParentPin()).toBeUndefined()
    expect(onUnlock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Verder' }))
    expect(onUnlock).toHaveBeenCalledTimes(1)
  })

  it('kan vanuit "PIN vergeten?" terug naar de pincode', async () => {
    renderGate()
    await screen.findByLabelText('Pincode')
    fireEvent.click(screen.getByRole('button', { name: 'PIN vergeten?' }))
    fireEvent.click(screen.getByRole('button', { name: 'Terug naar pincode' }))
    expect(screen.getByLabelText('Pincode')).toBeInTheDocument()
  })

  it('meldt het als het verwijderen van de PIN mislukt', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const failing: WardrobeStore = { ...store, setParentPin: () => Promise.reject(new Error('kapot')) }
    renderGate(failing)
    await screen.findByLabelText('Pincode')
    fireEvent.click(screen.getByRole('button', { name: 'PIN vergeten?' }))
    fireEvent.change(screen.getByLabelText(/Hoeveel is 7 × 6/), { target: { value: '42' } })
    fireEvent.click(screen.getByRole('button', { name: 'PIN verwijderen' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('niet gelukt')
    expect(onUnlock).not.toHaveBeenCalled()
  })
})
