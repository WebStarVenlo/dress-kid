import { useEffect, useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { StoredPin } from '../domain/types'
import { IconArrowLeft } from '../shared/icons'
import { getStore } from '../storage'
import type { WardrobeStore } from '../storage'
import { IconLock } from './ParentIcons'
import PinField from './PinField'
import { isValidPinFormat, pinCooldownRemaining, registerFailedPinAttempt, resetPinAttempts, verifyPin } from './pin'
import './pin.css'

export interface Sum {
  a: number
  b: number
}

export function randomSum(): Sum {
  return { a: 3 + Math.floor(Math.random() * 7), b: 3 + Math.floor(Math.random() * 7) }
}

interface GateProps {
  sum: Sum
  onUnlock: () => void
  /** Opslag waaruit de ouder-PIN wordt gelezen; standaard de gedeelde opslag van de app. */
  store?: WardrobeStore
}

type PinState = { status: 'loading' } | { status: 'none' } | { status: 'set'; pin: StoredPin }
type View = 'main' | 'forgot' | 'removed'

/**
 * Ouderslot. Zonder PIN: een som die een kind van 4 nog niet kan oplossen. Met PIN: de pincode, met
 * de som als uitweg als de PIN vergeten is (de PIN wordt dan verwijderd). Geen echte beveiliging.
 */
export default function Gate({ sum, onUnlock, store }: GateProps) {
  const activeStore = store ?? getStore()
  const [pinState, setPinState] = useState<PinState>({ status: 'loading' })
  const [view, setView] = useState<View>('main')
  // Som al goed beantwoord terwijl de PIN nog werd geladen.
  const [pendingUnlock, setPendingUnlock] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => activeStore.getParentPin())
      .then(
        (pin) => {
          if (!cancelled) setPinState(pin ? { status: 'set', pin } : { status: 'none' })
        },
        (error: unknown) => {
          // Kan de PIN niet worden gelezen, dan valt het slot terug op de som.
          console.error(error)
          if (!cancelled) setPinState({ status: 'none' })
        },
      )
    return () => {
      cancelled = true
    }
  }, [activeStore])

  useEffect(() => {
    if (pendingUnlock && pinState.status === 'none') onUnlock()
  }, [pendingUnlock, pinState, onUnlock])

  async function removePin() {
    setRemoving(true)
    setRemoveError(false)
    try {
      await activeStore.setParentPin(null)
      resetPinAttempts()
      setView('removed')
    } catch (error) {
      console.error(error)
      setRemoveError(true)
    } finally {
      setRemoving(false)
    }
  }

  let content
  if (view === 'removed') {
    content = (
      <div className="parent-card">
        <p role="status" className="parent-ok">
          De pincode is verwijderd.
        </p>
        <p>Je kunt een nieuwe pincode instellen onder Instellingen.</p>
        <button type="button" autoFocus onClick={onUnlock}>
          Verder
        </button>
      </div>
    )
  } else if (pinState.status === 'set' && view === 'forgot') {
    content = (
      <>
        <p>Pincode vergeten? Los de som op. De pincode wordt dan verwijderd en je kunt verder.</p>
        <SumForm sum={sum} submitLabel="PIN verwijderen" busy={removing} onSolved={() => void removePin()} />
        {removeError ? (
          <p role="alert" className="parent-error">
            Het verwijderen van de pincode is niet gelukt. Probeer het nog eens.
          </p>
        ) : null}
        <button type="button" className="secondary" onClick={() => setView('main')}>
          Terug naar pincode
        </button>
      </>
    )
  } else if (pinState.status === 'set') {
    content = (
      <>
        <p>Alleen voor ouders. Vul de pincode in om verder te gaan.</p>
        <PinEntry stored={pinState.pin} onSuccess={onUnlock} onForgot={() => setView('forgot')} />
      </>
    )
  } else {
    content = (
      <>
        <p>Alleen voor ouders. Los de som op om verder te gaan.</p>
        <SumForm
          sum={sum}
          submitLabel="Openen"
          onSolved={() => {
            if (pinState.status === 'loading') setPendingUnlock(true)
            else onUnlock()
          }}
        />
      </>
    )
  }

  const loading = pinState.status === 'loading'
  return (
    <div className="parent-shell">
      <main className={`page parent parent-gate${loading ? ' pin-gate-loading' : ''}`} aria-busy={loading}>
        <div className="parent-gate-card">
          <span className="parent-lock" aria-hidden="true">
            <IconLock size={44} />
          </span>
          <h1>Ouderbeheer</h1>
          {content}
        </div>
        <Link className="parent-link parent-link-quiet" to="/">
          <IconArrowLeft size={18} />
          Terug
        </Link>
      </main>
    </div>
  )
}

interface SumFormProps {
  sum: Sum
  submitLabel: string
  onSolved: () => void
  busy?: boolean
}

function SumForm({ sum, submitLabel, onSolved, busy = false }: SumFormProps) {
  const [answer, setAnswer] = useState('')
  const [wrong, setWrong] = useState(false)
  const inputId = useId()
  const errorId = useId()

  function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (Number(answer.trim()) === sum.a * sum.b && answer.trim() !== '') {
      onSolved()
    } else {
      setWrong(true)
      setAnswer('')
    }
  }

  return (
    <form className="parent-card" onSubmit={submit} noValidate>
      <label htmlFor={inputId} className="parent-sum">
        Hoeveel is {sum.a} × {sum.b}?
      </label>
      <input
        id={inputId}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        autoFocus
        value={answer}
        onChange={(event) => {
          setAnswer(event.target.value)
          setWrong(false)
        }}
        aria-invalid={wrong}
        aria-describedby={wrong ? errorId : undefined}
      />
      {wrong ? (
        <p id={errorId} role="alert" className="parent-error">
          Dat klopt niet. Probeer het nog eens.
        </p>
      ) : null}
      <button type="submit" disabled={busy}>
        {submitLabel}
      </button>
    </form>
  )
}

interface PinEntryProps {
  stored: StoredPin
  onSuccess: () => void
  onForgot: () => void
}

type PinError = 'format' | 'wrong' | 'failed'

const PIN_ERRORS: Record<PinError, string> = {
  format: 'Vul de 4 cijfers van de pincode in.',
  wrong: 'Dat is niet de goede pincode. Probeer het nog eens.',
  failed: 'De pincode kan hier niet worden gecontroleerd. Gebruik “PIN vergeten?” om verder te gaan.',
}

function PinEntry({ stored, onSuccess, onForgot }: PinEntryProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<PinError | undefined>()
  const [checking, setChecking] = useState(false)
  const [remaining, setRemaining] = useState(() => pinCooldownRemaining())
  const errorId = useId()
  const blocked = remaining > 0

  // Tel de wachttijd af; daarna mag er weer geprobeerd worden.
  useEffect(() => {
    if (!blocked) return undefined
    const timer = setInterval(() => setRemaining(pinCooldownRemaining()), 1000)
    return () => clearInterval(timer)
  }, [blocked])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (checking || pinCooldownRemaining() > 0) return
    if (!isValidPinFormat(pin)) {
      setError('format')
      return
    }
    setChecking(true)
    let ok: boolean
    try {
      ok = await verifyPin(pin, stored)
    } catch (e) {
      console.error(e)
      setError('failed')
      setChecking(false)
      return
    }
    setChecking(false)
    if (ok) {
      resetPinAttempts()
      onSuccess()
      return
    }
    setPin('')
    const wait = registerFailedPinAttempt()
    setRemaining(wait)
    setError(wait > 0 ? undefined : 'wrong')
  }

  return (
    <>
      <form className="parent-card" onSubmit={(event) => void submit(event)} noValidate>
        <PinField
          label="Pincode"
          value={pin}
          onChange={(value) => {
            setPin(value)
            setError(undefined)
          }}
          invalid={error !== undefined}
          errorId={errorId}
          disabled={blocked}
          autoFocus
        />
        {error ? (
          <p id={errorId} role="alert" className="parent-error">
            {PIN_ERRORS[error]}
          </p>
        ) : null}
        {blocked ? (
          <>
            <p role="alert" className="parent-error">
              Te vaak een verkeerde pincode. Wacht even en probeer het dan opnieuw.
            </p>
            <p className="parent-hint">Nog {Math.ceil(remaining / 1000)} seconden.</p>
          </>
        ) : null}
        <button type="submit" disabled={blocked || checking}>
          Ontgrendelen
        </button>
      </form>
      <button type="button" className="pin-link-button" onClick={onForgot}>
        PIN vergeten?
      </button>
    </>
  )
}
