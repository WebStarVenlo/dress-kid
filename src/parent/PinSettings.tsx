import { useEffect, useId, useState } from 'react'
import type { FormEvent } from 'react'
import type { StoredPin } from '../domain/types'
import type { WardrobeStore } from '../storage'
import PinField from './PinField'
import { INVALID_PIN_FORMAT, hashPin, isValidPinFormat, resetPinAttempts, verifyPin } from './pin'
import { errorMessage } from './shared'
import './pin.css'

interface Props {
  store: WardrobeStore
}

type Mode = 'idle' | 'change' | 'remove'
type Field = 'current' | 'next' | 'repeat'
interface FormError {
  field?: Field
  message: string
}

const MISMATCH = 'De twee nieuwe pincodes zijn niet hetzelfde.'
const WRONG_CURRENT = 'De huidige pincode klopt niet.'
const CRYPTO_FAILED = 'De pincode kan in deze browser niet worden verwerkt.'

/** Afleiden of controleren van de PIN; een fout van Web Crypto wordt een Nederlandse melding. */
async function safely<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (e) {
    console.error(e)
    throw new Error(CRYPTO_FAILED, { cause: e })
  }
}

/** Instellingen voor de ouder-PIN: instellen, wijzigen en verwijderen. */
export default function PinSettings({ store }: Props) {
  const [stored, setStored] = useState<StoredPin | null | undefined>()
  const [loadError, setLoadError] = useState(false)
  const [mode, setMode] = useState<Mode>('idle')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<FormError | undefined>()
  const [success, setSuccess] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const errorId = useId()

  useEffect(() => {
    let cancelled = false
    store.getParentPin().then(
      (pin) => {
        if (!cancelled) setStored(pin ?? null)
      },
      (e: unknown) => {
        console.error(e)
        if (!cancelled) setLoadError(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [store])

  function reset(nextMode: Mode) {
    setMode(nextMode)
    setCurrent('')
    setNext('')
    setRepeat('')
    setError(undefined)
  }

  function open(nextMode: Mode) {
    setSuccess(undefined)
    reset(nextMode)
  }

  function checkNew(): FormError | undefined {
    if (!isValidPinFormat(next)) return { field: 'next', message: INVALID_PIN_FORMAT }
    if (next !== repeat) return { field: 'repeat', message: MISMATCH }
    return undefined
  }

  async function checkCurrent(): Promise<FormError | undefined> {
    if (!isValidPinFormat(current)) return { field: 'current', message: INVALID_PIN_FORMAT }
    // Lees opnieuw, zodat we tegen de PIN controleren die nu echt is opgeslagen.
    const latest = await store.getParentPin()
    if (!latest) return undefined
    const ok = await safely(() => verifyPin(current, latest))
    return ok ? undefined : { field: 'current', message: WRONG_CURRENT }
  }

  async function run(validate: () => Promise<FormError | undefined>, save: () => Promise<StoredPin | null>, done: string) {
    if (busy) return
    setError(undefined)
    setSuccess(undefined)
    setBusy(true)
    try {
      const problem = await validate()
      if (problem) {
        setError(problem)
        if (problem.field === 'current') setCurrent('')
        return
      }
      const value = await save()
      await store.setParentPin(value)
      resetPinAttempts()
      setStored(value)
      reset('idle')
      setSuccess(done)
    } catch (e) {
      setError({ message: errorMessage(e, 'Opslaan van de pincode is niet gelukt.') })
    } finally {
      setBusy(false)
    }
  }

  function submitSet(event: FormEvent) {
    event.preventDefault()
    void run(
      async () => checkNew(),
      () => safely(() => hashPin(next)),
      'De pincode is ingesteld. Ouderbeheer vraagt voortaan om deze pincode.',
    )
  }

  function submitChange(event: FormEvent) {
    event.preventDefault()
    void run(
      async () => (await checkCurrent()) ?? checkNew(),
      () => safely(() => hashPin(next)),
      'De pincode is gewijzigd.',
    )
  }

  function submitRemove(event: FormEvent) {
    event.preventDefault()
    void run(checkCurrent, async () => null, 'De pincode is verwijderd. Ouderbeheer opent weer met een som.')
  }

  const invalid = (field: Field) => error?.field === field
  const errorBox = error ? (
    <p id={errorId} role="alert" className="parent-error">
      {error.message}
    </p>
  ) : null
  const fieldProps = (field: Field, value: string, onChange: (value: string) => void) => ({
    value,
    onChange: (value: string) => {
      onChange(value)
      if (error?.field === field) setError(undefined)
    },
    invalid: invalid(field),
    errorId,
    disabled: busy,
  })
  const newFields = (
    <>
      <PinField label="Nieuwe pincode" {...fieldProps('next', next, setNext)} />
      <PinField label="Herhaal nieuwe pincode" {...fieldProps('repeat', repeat, setRepeat)} />
    </>
  )
  const cancel = (
    <button type="button" className="secondary" disabled={busy} onClick={() => reset('idle')}>
      Annuleren
    </button>
  )

  let body
  if (loadError) {
    body = (
      <p role="alert" className="parent-error">
        De pincode-instelling kon niet worden geladen.
      </p>
    )
  } else if (stored === undefined) {
    body = (
      <p role="status" className="parent-hint">
        Laden…
      </p>
    )
  } else if (stored === null) {
    body = (
      <form className="parent-card" onSubmit={submitSet} noValidate aria-label="PIN instellen">
        <p>
          Er is nog geen pincode. Ouderbeheer opent nu met een som. Met een pincode van 4 cijfers kun je het beter
          afschermen.
        </p>
        {newFields}
        {errorBox}
        <button type="submit" disabled={busy}>
          PIN instellen
        </button>
      </form>
    )
  } else if (mode === 'change') {
    body = (
      <form className="parent-card" onSubmit={submitChange} noValidate aria-label="PIN wijzigen">
        <PinField label="Huidige pincode" autoFocus {...fieldProps('current', current, setCurrent)} />
        {newFields}
        {errorBox}
        <div className="pin-actions">
          <button type="submit" disabled={busy}>
            Nieuwe PIN opslaan
          </button>
          {cancel}
        </div>
      </form>
    )
  } else if (mode === 'remove') {
    body = (
      <form className="parent-card parent-confirm" onSubmit={submitRemove} noValidate aria-label="PIN verwijderen">
        <p>Zonder pincode opent ouderbeheer weer met een som.</p>
        <PinField label="Huidige pincode" autoFocus {...fieldProps('current', current, setCurrent)} />
        {errorBox}
        <div className="pin-actions">
          <button type="submit" className="danger" disabled={busy}>
            Ja, PIN verwijderen
          </button>
          {cancel}
        </div>
      </form>
    )
  } else {
    body = (
      <div className="parent-card">
        <p>Er is een pincode ingesteld. Ouderbeheer vraagt om deze pincode.</p>
        <div className="pin-actions">
          <button type="button" className="secondary" onClick={() => open('change')}>
            PIN wijzigen
          </button>
          <button type="button" className="danger" onClick={() => open('remove')}>
            PIN verwijderen
          </button>
        </div>
      </div>
    )
  }

  return (
    <section aria-labelledby="parent-pin-title">
      <h3 id="parent-pin-title">Pincode</h3>
      {body}
      {success ? (
        <p role="status" className="parent-ok">
          {success}
        </p>
      ) : null}
    </section>
  )
}
