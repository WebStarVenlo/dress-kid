import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, vi } from 'vitest'
import { createIndexedDbStore } from '../storage'
import type { WardrobeStore } from '../storage'
import ParentApp from './ParentApp'
import { UNLOCK_KEY } from './unlock'

vi.mock('../domain/image', () => ({
  resizePhoto: vi.fn(async () => new Blob(['resized'], { type: 'image/jpeg' })),
}))

let dbCounter = 0
let store: WardrobeStore

/** Rendert de ouderomgeving direct ontgrendeld. */
async function renderUnlocked() {
  sessionStorage.setItem(UNLOCK_KEY, String(Date.now()))
  render(
    <MemoryRouter initialEntries={['/ouder']}>
      <Routes>
        <Route path="/ouder/*" element={<ParentApp store={store} makeSum={() => ({ a: 7, b: 6 })} />} />
      </Routes>
    </MemoryRouter>,
  )
  await screen.findByRole('button', { name: /Kleding toevoegen/ })
}

async function openChildren() {
  fireEvent.click(screen.getByRole('button', { name: 'Kinderen' }))
  await screen.findByRole('heading', { name: 'Kinderen' })
}

beforeEach(() => {
  sessionStorage.clear()
  store = createIndexedDbStore(`children-test-${++dbCounter}`)
  let n = 0
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:test/${++n}`, revokeObjectURL: () => undefined }))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('kinderen beheren', () => {
  it('toont een hint in de kast zolang er geen kind is, met link naar het kindscherm', async () => {
    await renderUnlocked()
    expect(screen.getByText('Nog geen kind aangemaakt.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Kind toevoegen' }))
    expect(await screen.findByRole('heading', { name: 'Kinderen' })).toBeInTheDocument()
  })

  it('voegt een kind toe met meerdere maten per categorie', async () => {
    await renderUnlocked()
    await openChildren()
    expect(screen.getByText(/altijd zichtbaar/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Kind toevoegen' }))
    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Mila' } })
    fireEvent.change(screen.getByLabelText('Kleur'), { target: { value: '#FF8800' } })
    fireEvent.change(screen.getByLabelText(/Shirt/), { target: { value: '104, 110 ,, 104' } })
    fireEvent.change(screen.getByLabelText(/Schoenen/), { target: { value: '28' } })
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    const row = (await screen.findByText('Mila')).closest('li') as HTMLElement
    expect(within(row).getByText(/Shirt 104, 110/)).toBeInTheDocument()
    expect(within(row).getByText(/Schoenen 28/)).toBeInTheDocument()
    const [child] = await store.listChildren()
    expect(child?.name).toBe('Mila')
    expect(child?.color).toBe('#ff8800')
    expect(child?.sizes.top).toEqual(['104', '110'])
    expect(child?.sizes.shoes).toEqual(['28'])
    // De hint over een ontbrekend kind is weg.
    fireEvent.click(screen.getByRole('button', { name: 'Kast' }))
    await screen.findByRole('button', { name: /Kleding toevoegen/ })
    expect(screen.queryByText('Nog geen kind aangemaakt.')).not.toBeInTheDocument()
  })

  it('toont de foutmelding van de opslag bij een lege naam', async () => {
    await renderUnlocked()
    await openChildren()
    fireEvent.click(screen.getByRole('button', { name: 'Kind toevoegen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Geef het kind een naam.')
    expect(screen.getByLabelText('Naam')).toHaveAttribute('aria-invalid', 'true')
    expect(await store.listChildren()).toHaveLength(0)
  })

  it('wijzigt naam en maten van een kind', async () => {
    await store.addChild({ name: 'Sam', color: '#112233', sizes: { top: ['98'] } })
    await renderUnlocked()
    await openChildren()
    fireEvent.click(await screen.findByRole('button', { name: 'Wijzig Sam' }))
    expect(screen.getByLabelText(/Shirt/)).toHaveValue('98')
    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Samuel' } })
    fireEvent.change(screen.getByLabelText(/Shirt/), { target: { value: '104, 110' } })
    fireEvent.change(screen.getByLabelText(/Broek/), { target: { value: '104; 110' } })
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
    await screen.findByText('Samuel')
    const [child] = await store.listChildren()
    expect(child?.name).toBe('Samuel')
    expect(child?.sizes.top).toEqual(['104', '110'])
    expect(child?.sizes.bottom).toEqual(['104', '110'])
  })

  it('kiest bij het toevoegen een dierfiguur uit de kiezer', async () => {
    await renderUnlocked()
    await openChildren()
    fireEvent.click(screen.getByRole('button', { name: 'Kind toevoegen' }))
    const group = screen.getByRole('radiogroup', { name: 'Dierfiguur' })
    // 12 dieren plus "Geen"; zonder keuze staat "Geen" aan.
    expect(within(group).getAllByRole('radio')).toHaveLength(13)
    expect(within(group).getByRole('radio', { name: 'Geen' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Noor' } })
    fireEvent.click(within(group).getByRole('radio', { name: 'Konijn' }))
    expect(within(group).getByRole('radio', { name: 'Konijn' })).toHaveAttribute('aria-checked', 'true')
    expect(within(group).getByRole('radio', { name: 'Geen' })).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
    await screen.findByText('Noor')
    const [child] = await store.listChildren()
    expect(child?.avatar).toBe('bunny')
  })

  it('wijzigt het dierfiguur en wist het met "Geen"', async () => {
    await store.addChild({ name: 'Sam', color: '#112233', avatar: 'fox', sizes: {} })
    await renderUnlocked()
    await openChildren()
    fireEvent.click(await screen.findByRole('button', { name: 'Wijzig Sam' }))
    // De bestaande keuze is voorgeselecteerd.
    expect(screen.getByRole('radio', { name: 'Vos' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Uil' }))
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
    // De lijst met "Wijzig"-knoppen staat ook zichtbaar terwijl het formulier open is; pas als het formulier
    // dicht is, is het opslaan (inclusief herladen) klaar.
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Kind wijzigen' })).not.toBeInTheDocument())
    expect((await store.listChildren())[0]?.avatar).toBe('owl')

    fireEvent.click(screen.getByRole('button', { name: 'Wijzig Sam' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Geen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
    // De lijst met "Wijzig"-knoppen staat ook zichtbaar terwijl het formulier open is; pas als het formulier
    // dicht is, is het opslaan (inclusief herladen) klaar.
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Kind wijzigen' })).not.toBeInTheDocument())
    await waitFor(async () => expect((await store.listChildren())[0]?.avatar).toBeUndefined())
  })

  it('toont het dierfiguur in de lijst, en anders de beginletter', async () => {
    await store.addChild({ name: 'Noor', color: '#ff7eb6', avatar: 'bunny', sizes: {} })
    await store.addChild({ name: 'Sam', color: '#112233', sizes: {} })
    await renderUnlocked()
    await openChildren()
    const noor = (await screen.findByText('Noor')).closest('li') as HTMLElement
    expect(noor.querySelector('.parent-avatar svg')).not.toBeNull()
    const sam = screen.getByText('Sam').closest('li') as HTMLElement
    expect(sam.querySelector('.parent-avatar svg')).toBeNull()
    expect(sam.querySelector('.parent-avatar-initial')).toHaveTextContent('S')
  })

  it('verwijdert pas na bevestiging', async () => {
    await store.addChild({ name: 'Sam', color: '#112233', sizes: {} })
    await renderUnlocked()
    await openChildren()
    fireEvent.click(await screen.findByRole('button', { name: 'Verwijder Sam' }))
    fireEvent.click(screen.getByRole('button', { name: 'Annuleren' }))
    expect(await store.listChildren()).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Verwijder Sam' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ja, verwijderen' }))
    await waitFor(async () => expect(await store.listChildren()).toHaveLength(0))
    expect(await screen.findByText('Nog geen kinderen.')).toBeInTheDocument()
  })
})

describe('maat bij kleding', () => {
  it('slaat de maat op bij het toevoegen en biedt suggesties uit de kindermaten', async () => {
    await store.addChild({ name: 'Mila', color: '#ff8800', sizes: { top: ['104', '110'] } })
    await store.addChild({ name: 'Sam', color: '#112233', sizes: { top: ['110', '116'] } })
    await renderUnlocked()
    fireEvent.click(screen.getByRole('button', { name: /Kleding toevoegen/ }))
    fireEvent.click(screen.getByRole('radio', { name: /Shirt/ }))
    const field = screen.getByLabelText(/Maat/)
    const options = Array.from(document.querySelectorAll(`#${CSS.escape(field.getAttribute('list') ?? '')} option`))
    expect(options.map((o) => o.getAttribute('value'))).toEqual(['104', '110', '116'])
    fireEvent.change(field, { target: { value: ' 110 ' } })
    fireEvent.change(screen.getByLabelText("Foto's kiezen uit galerij"), {
      target: { files: [new File(['a'], 'a.png', { type: 'image/png' })] },
    })
    await screen.findByText('Zojuist toegevoegd (1)')
    const [item] = await store.listItems()
    expect(item?.size).toBe('110')
    fireEvent.click(screen.getByRole('button', { name: 'Klaar' }))
    const tops = await screen.findByRole('region', { name: 'Shirt' })
    expect(within(tops).getByText('Maat 110')).toBeInTheDocument()
  })

  it('wijzigt de maat in het detailscherm en toont bij welke kinderen het past', async () => {
    await store.addChild({ name: 'Mila', color: '#ff8800', sizes: { top: ['104'] } })
    await store.addChild({ name: 'Sam', color: '#112233', sizes: { top: ['116'] } })
    const item = await store.addItem({ category: 'top', name: 'Rood shirt', season: 'all', photo: new Blob(['x']) })
    await renderUnlocked()
    fireEvent.click(await screen.findByRole('button', { name: /Rood shirt/ }))
    const fits = await screen.findByRole('heading', { name: 'Past bij' })
    const list = fits.parentElement as HTMLElement
    expect(list).toHaveTextContent('Mila: ja')
    expect(list).toHaveTextContent('Sam: ja')

    const field = screen.getByLabelText(/Maat/)
    fireEvent.change(field, { target: { value: '104' } })
    fireEvent.blur(field)
    await waitFor(async () => expect((await store.getItem(item.id))?.size).toBe('104'))
    await waitFor(() => expect(list).toHaveTextContent('Sam: nee'))
    expect(list).toHaveTextContent('Mila: ja')

    fireEvent.change(field, { target: { value: '' } })
    fireEvent.blur(field)
    await waitFor(async () => expect((await store.getItem(item.id))?.size).toBeUndefined())
  })

  it('slaat de maat ook op met Enter', async () => {
    await store.addChild({ name: 'Mila', color: '#ff8800', sizes: { top: ['104'] } })
    const item = await store.addItem({ category: 'top', name: 'Rood shirt', season: 'all', photo: new Blob(['x']) })
    await renderUnlocked()
    fireEvent.click(await screen.findByRole('button', { name: /Rood shirt/ }))
    const field = screen.getByLabelText(/Maat/)
    field.focus()
    fireEvent.change(field, { target: { value: '104' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await waitFor(async () => expect((await store.getItem(item.id))?.size).toBe('104'))
    field.focus()
    fireEvent.change(field, { target: { value: '' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await waitFor(async () => expect((await store.getItem(item.id))?.size).toBeUndefined())
  })
})
