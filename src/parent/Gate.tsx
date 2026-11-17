import { useEffect, useId, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { StoredPin } from '../domain/types'
import { IconArrowLeft, IconLock } from '../shared/icons'
import { getStore } from '../storage'
import type { WardrobeStore } from '../storage'
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
  /** Storage the parent PIN is read from; defaults to the app's shared storage. */
  store?: WardrobeStore
}

type PinState = { status: 'loading' } | { status: 'none' } | { status: 'set'; pin: StoredPin }
type View = 'main' | 'forgot' | 'removed'

/**
 * Parent gate. Without a PIN: a sum a 4-year-old cannot solve yet. With a PIN: the PIN code, with
 * the sum as a way out if the PIN is forgotten (the PIN is then removed). Not real security.
 */
export default function Gate({ sum, onUnlock, store }: GateProps) {
  const { t } = useTranslation('parent')
  const activeStore = store ?? getStore()
  const [pinState, setPinState] = useState<PinState>({ status: 'loading' })
  const [view, setView] = useState<View>('main')
  // Sum already answered correctly while the PIN was still loading.
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
          // If the PIN cannot be read, the gate falls back to the sum.
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
          {t('gate.pinRemoved')}
        </p>
        <p>{t('gate.pinRemovedHint')}</p>
        <button type="button" autoFocus onClick={onUnlock}>
          {t('gate.continue')}
        </button>
      </div>
    )
  } else if (pinState.status === 'set' && view === 'forgot') {
    content = (
      <>
        <p>{t('gate.forgotIntro')}</p>
        <SumForm sum={sum} submitLabel={t('gate.removePin')} busy={removing} onSolved={() => void removePin()} />
        {removeError ? (
          <p role="alert" className="parent-error">
            {t('gate.removeFailed')}
          </p>
        ) : null}
        <button type="button" className="secondary" onClick={() => setView('main')}>
          {t('gate.backToPin')}
        </button>
      </>
    )
  } else if (pinState.status === 'set') {
    content = (
      <>
        <p>{t('gate.pinIntro')}</p>
        <PinEntry stored={pinState.pin} onSuccess={onUnlock} onForgot={() => setView('forgot')} />
      </>
    )
  } else {
    content = (
      <>
        <p>{t('gate.sumIntro')}</p>
        <SumForm
          sum={sum}
          submitLabel={t('gate.open')}
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
          <h1>{t('gate.title')}</h1>
          {content}
        </div>
        <Link className="parent-link parent-link-quiet" to="/">
          <IconArrowLeft size={18} />
          {t('gate.back')}
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
  const { t } = useTranslation('parent')
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
        {t('gate.sumQuestion', { a: sum.a, b: sum.b })}
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
          {t('gate.sumWrong')}
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

function PinEntry({ stored, onSuccess, onForgot }: PinEntryProps) {
  const { t } = useTranslation('parent')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<PinError | undefined>()
  const [checking, setChecking] = useState(false)
  const [remaining, setRemaining] = useState(() => pinCooldownRemaining())
  const errorId = useId()
  const blocked = remaining > 0

  // Count down the wait time; after that trying is allowed again.
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
          label={t('gate.pinLabel')}
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
            {t(`gate.pinErrors.${error}`)}
          </p>
        ) : null}
        {blocked ? (
          <>
            <p role="alert" className="parent-error">
              {t('gate.tooManyAttempts')}
            </p>
            <p className="parent-hint">{t('gate.secondsLeft', { count: Math.ceil(remaining / 1000) })}</p>
          </>
        ) : null}
        <button type="submit" disabled={blocked || checking}>
          {t('gate.unlock')}
        </button>
      </form>
      <button type="button" className="pin-link-button" onClick={onForgot}>
        {t('gate.forgotPin')}
      </button>
    </>
  )
}
