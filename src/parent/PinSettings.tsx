import { useEffect, useId, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AppError } from '../i18n/AppError'
import type { StoredPin } from '../domain/types'
import type { WardrobeStore } from '../storage'
import PinField from './PinField'
import { errorMessage } from './shared'
import { hashPin, invalidPinFormatMessage, isValidPinFormat, resetPinAttempts, verifyPin } from './pin'
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

/** Deriving or verifying the PIN; a Web Crypto failure becomes a user-facing message. */
async function safely<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (e) {
    console.error(e)
    throw new AppError('pinCryptoFailed', undefined, { cause: e })
  }
}

/** Settings for the parent PIN: set, change and remove. */
export default function PinSettings({ store }: Props) {
  const { t } = useTranslation('settings')
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
    if (!isValidPinFormat(next)) return { field: 'next', message: invalidPinFormatMessage() }
    if (next !== repeat) return { field: 'repeat', message: t('pin.mismatch') }
    return undefined
  }

  async function checkCurrent(): Promise<FormError | undefined> {
    if (!isValidPinFormat(current)) return { field: 'current', message: invalidPinFormatMessage() }
    // Read again, so we check against the PIN that is actually stored now.
    const latest = await store.getParentPin()
    if (!latest) return undefined
    const ok = await safely(() => verifyPin(current, latest))
    return ok ? undefined : { field: 'current', message: t('pin.wrongCurrent') }
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
      setError({ message: errorMessage(e, t('pin.saveFailed')) })
    } finally {
      setBusy(false)
    }
  }

  function submitSet(event: FormEvent) {
    event.preventDefault()
    void run(
      async () => checkNew(),
      () => safely(() => hashPin(next)),
      t('pin.doneSet'),
    )
  }

  function submitChange(event: FormEvent) {
    event.preventDefault()
    void run(
      async () => (await checkCurrent()) ?? checkNew(),
      () => safely(() => hashPin(next)),
      t('pin.doneChanged'),
    )
  }

  function submitRemove(event: FormEvent) {
    event.preventDefault()
    void run(checkCurrent, async () => null, t('pin.doneRemoved'))
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
      <PinField label={t('pin.newPin')} {...fieldProps('next', next, setNext)} />
      <PinField label={t('pin.repeatNew')} {...fieldProps('repeat', repeat, setRepeat)} />
    </>
  )
  const cancel = (
    <button type="button" className="secondary" disabled={busy} onClick={() => reset('idle')}>
      {t('pin.cancel')}
    </button>
  )

  let body
  if (loadError) {
    body = (
      <p role="alert" className="parent-error">
        {t('pin.loadFailed')}
      </p>
    )
  } else if (stored === undefined) {
    body = (
      <p role="status" className="parent-hint">
        {t('pin.loading')}
      </p>
    )
  } else if (stored === null) {
    body = (
      <form className="parent-card" onSubmit={submitSet} noValidate aria-label={t('pin.setLabel')}>
        <p>{t('pin.setIntro')}</p>
        {newFields}
        {errorBox}
        <button type="submit" disabled={busy}>
          {t('pin.setLabel')}
        </button>
      </form>
    )
  } else if (mode === 'change') {
    body = (
      <form className="parent-card" onSubmit={submitChange} noValidate aria-label={t('pin.changeLabel')}>
        <PinField label={t('pin.currentPin')} autoFocus {...fieldProps('current', current, setCurrent)} />
        {newFields}
        {errorBox}
        <div className="pin-actions">
          <button type="submit" disabled={busy}>
            {t('pin.changeSave')}
          </button>
          {cancel}
        </div>
      </form>
    )
  } else if (mode === 'remove') {
    body = (
      <form className="parent-card parent-confirm" onSubmit={submitRemove} noValidate aria-label={t('pin.removeLabel')}>
        <p>{t('pin.removeIntro')}</p>
        <PinField label={t('pin.currentPin')} autoFocus {...fieldProps('current', current, setCurrent)} />
        {errorBox}
        <div className="pin-actions">
          <button type="submit" className="danger" disabled={busy}>
            {t('pin.removeYes')}
          </button>
          {cancel}
        </div>
      </form>
    )
  } else {
    body = (
      <div className="parent-card">
        <p>{t('pin.isSet')}</p>
        <div className="pin-actions">
          <button type="button" className="secondary" onClick={() => open('change')}>
            {t('pin.changeLabel')}
          </button>
          <button type="button" className="danger" onClick={() => open('remove')}>
            {t('pin.removeLabel')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <section aria-labelledby="parent-pin-title">
      <h3 id="parent-pin-title">{t('pin.title')}</h3>
      {body}
      {success ? (
        <p role="status" className="parent-ok">
          {success}
        </p>
      ) : null}
    </section>
  )
}
