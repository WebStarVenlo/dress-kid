import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { createIndexedDbStore } from '../storage'
import type { WardrobeStore } from '../storage'
import SettingsPanel from './SettingsPanel'
import { hashPin, verifyPin } from './pin'

let dbCounter = 0
let store: WardrobeStore

async function renderPanel() {
  const settings = await store.getSettings()
  render(<SettingsPanel store={store} settings={settings} reload={async () => undefined} />)
  return within(screen.getByRole('region', { name: 'Pincode' }))
}

function type(section: ReturnType<typeof within>, label: string, value: string) {
  fireEvent.change(section.getByLabelText(label), { target: { value } })
}

async function storedPinMatches(pin: string) {
  const stored = await store.getParentPin()
  return stored !== undefined && (await verifyPin(pin, stored))
}

beforeEach(async () => {
  store = createIndexedDbStore(`settings-test-${++dbCounter}`)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('pincode instellen', () => {
  it('stelt een nieuwe PIN in', async () => {
    const section = await renderPanel()
    await section.findByRole('button', { name: 'PIN instellen' })
    type(section, 'Nieuwe pincode', '1357')
    type(section, 'Herhaal nieuwe pincode', '1357')
    fireEvent.click(section.getByRole('button', { name: 'PIN instellen' }))
    expect(await section.findByRole('status')).toHaveTextContent('De pincode is ingesteld')
    expect(await storedPinMatches('1357')).toBe(true)
    expect(section.getByRole('button', { name: 'PIN wijzigen' })).toBeInTheDocument()
    expect(section.getByRole('button', { name: 'PIN verwijderen' })).toBeInTheDocument()
  })

  it('weigert twee verschillende pincodes', async () => {
    const section = await renderPanel()
    await section.findByRole('button', { name: 'PIN instellen' })
    type(section, 'Nieuwe pincode', '1357')
    type(section, 'Herhaal nieuwe pincode', '1358')
    fireEvent.click(section.getByRole('button', { name: 'PIN instellen' }))
    expect(await section.findByRole('alert')).toHaveTextContent('niet hetzelfde')
    expect(section.getByLabelText('Herhaal nieuwe pincode')).toHaveAttribute('aria-invalid', 'true')
    expect(await store.getParentPin()).toBeUndefined()
  })

  it('weigert een PIN die geen 4 cijfers is', async () => {
    const section = await renderPanel()
    await section.findByRole('button', { name: 'PIN instellen' })
    type(section, 'Nieuwe pincode', '12a')
    type(section, 'Herhaal nieuwe pincode', '12a')
    fireEvent.click(section.getByRole('button', { name: 'PIN instellen' }))
    expect(await section.findByRole('alert')).toHaveTextContent('precies 4 cijfers')
    expect(section.getByLabelText('Nieuwe pincode')).toHaveAttribute('aria-invalid', 'true')
    expect(await store.getParentPin()).toBeUndefined()
  })

  it('meldt het als opslaan mislukt', async () => {
    const failing: WardrobeStore = { ...store, setParentPin: () => Promise.reject(new Error('De PIN is ongeldig.')) }
    const settings = await store.getSettings()
    render(<SettingsPanel store={failing} settings={settings} reload={async () => undefined} />)
    const section = within(screen.getByRole('region', { name: 'Pincode' }))
    await section.findByRole('button', { name: 'PIN instellen' })
    type(section, 'Nieuwe pincode', '1357')
    type(section, 'Herhaal nieuwe pincode', '1357')
    fireEvent.click(section.getByRole('button', { name: 'PIN instellen' }))
    expect(await section.findByRole('alert')).toHaveTextContent('De PIN is ongeldig.')
  })
})

describe('bestaande pincode', () => {
  beforeEach(async () => {
    await store.setParentPin(await hashPin('2468', undefined, 1000))
  })

  it('wijzigt de PIN met de huidige PIN', async () => {
    const section = await renderPanel()
    fireEvent.click(await section.findByRole('button', { name: 'PIN wijzigen' }))
    type(section, 'Huidige pincode', '2468')
    type(section, 'Nieuwe pincode', '9753')
    type(section, 'Herhaal nieuwe pincode', '9753')
    fireEvent.click(section.getByRole('button', { name: 'Nieuwe PIN opslaan' }))
    expect(await section.findByRole('status')).toHaveTextContent('De pincode is gewijzigd')
    expect(await storedPinMatches('9753')).toBe(true)
    expect(await storedPinMatches('2468')).toBe(false)
  })

  it('wijzigt niets bij een verkeerde huidige PIN', async () => {
    const section = await renderPanel()
    fireEvent.click(await section.findByRole('button', { name: 'PIN wijzigen' }))
    type(section, 'Huidige pincode', '1111')
    type(section, 'Nieuwe pincode', '9753')
    type(section, 'Herhaal nieuwe pincode', '9753')
    fireEvent.click(section.getByRole('button', { name: 'Nieuwe PIN opslaan' }))
    expect(await section.findByRole('alert')).toHaveTextContent('De huidige pincode klopt niet')
    expect(section.getByLabelText('Huidige pincode')).toHaveAttribute('aria-invalid', 'true')
    expect(await storedPinMatches('2468')).toBe(true)
  })

  it('wijzigt niets als de nieuwe pincodes verschillen', async () => {
    const section = await renderPanel()
    fireEvent.click(await section.findByRole('button', { name: 'PIN wijzigen' }))
    type(section, 'Huidige pincode', '2468')
    type(section, 'Nieuwe pincode', '9753')
    type(section, 'Herhaal nieuwe pincode', '9750')
    fireEvent.click(section.getByRole('button', { name: 'Nieuwe PIN opslaan' }))
    expect(await section.findByRole('alert')).toHaveTextContent('niet hetzelfde')
    expect(await storedPinMatches('2468')).toBe(true)
  })

  it('kan wijzigen annuleren', async () => {
    const section = await renderPanel()
    fireEvent.click(await section.findByRole('button', { name: 'PIN wijzigen' }))
    fireEvent.click(section.getByRole('button', { name: 'Annuleren' }))
    expect(section.queryByLabelText('Huidige pincode')).not.toBeInTheDocument()
    expect(section.getByRole('button', { name: 'PIN wijzigen' })).toBeInTheDocument()
  })

  it('verwijdert de PIN met de huidige PIN', async () => {
    const section = await renderPanel()
    fireEvent.click(await section.findByRole('button', { name: 'PIN verwijderen' }))
    type(section, 'Huidige pincode', '2468')
    fireEvent.click(section.getByRole('button', { name: 'Ja, PIN verwijderen' }))
    expect(await section.findByRole('status')).toHaveTextContent('De pincode is verwijderd')
    await waitFor(async () => expect(await store.getParentPin()).toBeUndefined())
    expect(section.getByRole('button', { name: 'PIN instellen' })).toBeInTheDocument()
  })

  it('verwijdert niets bij een verkeerde huidige PIN', async () => {
    const section = await renderPanel()
    fireEvent.click(await section.findByRole('button', { name: 'PIN verwijderen' }))
    type(section, 'Huidige pincode', '0000')
    fireEvent.click(section.getByRole('button', { name: 'Ja, PIN verwijderen' }))
    expect(await section.findByRole('alert')).toHaveTextContent('De huidige pincode klopt niet')
    expect(section.getByLabelText('Huidige pincode')).toHaveValue('')
    expect(await storedPinMatches('2468')).toBe(true)
  })
})

it('meldt het als de pincode-instelling niet kan worden geladen', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const broken: WardrobeStore = { ...store, getParentPin: () => Promise.reject(new Error('kapot')) }
  const settings = await store.getSettings()
  render(<SettingsPanel store={broken} settings={settings} reload={async () => undefined} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('kon niet worden geladen')
})
