import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { todayKey } from '../domain/compat'
import type { WardrobeStore } from '../storage'
import { errorMessage } from './shared'

interface Props {
  store: WardrobeStore
  reload: () => Promise<void>
}

export default function BackupPanel({ store, reload }: Props) {
  const [pending, setPending] = useState<File | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [message, setMessage] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function download() {
    setError(undefined)
    setMessage(undefined)
    try {
      const blob = await store.exportBackup()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `dress-kid-backup-${todayKey()}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setMessage('De back-up is gemaakt. Bewaar het bestand op een veilige plek.')
    } catch (e) {
      console.error(e)
      setError(errorMessage(e, 'De back-up kon niet worden gemaakt.'))
    }
  }

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    setError(undefined)
    setMessage(undefined)
    setPending(file)
  }

  async function restore() {
    if (!pending) return
    setBusy(true)
    setError(undefined)
    try {
      await store.importBackup(pending)
      setPending(undefined)
      await reload()
      setMessage('De back-up is teruggezet.')
    } catch (e) {
      console.error(e)
      setPending(undefined)
      setError(errorMessage(e, 'De back-up kon niet worden teruggezet.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="parent-backup-title">
      <h2 id="parent-backup-title">Back-up</h2>
      <p>
        Alles wat je invoert staat alleen op dit apparaat. Raak je dit apparaat kwijt of wis je de gegevens van de
        browser, dan is de kledingkast weg. Maak daarom af en toe een back-up.
      </p>
      <div className="parent-stack">
        <button type="button" onClick={() => void download()}>
          Back-up maken
        </button>
        <button type="button" className="secondary" onClick={() => fileRef.current?.click()}>
          Back-up terugzetten
        </button>
      </div>
      <input
        ref={fileRef}
        className="parent-file"
        type="file"
        accept=".json,application/json"
        aria-label="Back-upbestand kiezen"
        tabIndex={-1}
        onChange={pick}
      />
      {pending ? (
        <div className="parent-card parent-confirm" role="alertdialog" aria-label="Back-up terugzetten bevestigen">
          <p>
            <strong>Let op:</strong> terugzetten van &ldquo;{pending.name}&rdquo; vervangt álles wat nu op dit
            apparaat staat. Dit kan niet ongedaan worden gemaakt.
          </p>
          <div className="parent-stack">
            <button type="button" className="danger" disabled={busy} onClick={() => void restore()}>
              Ja, alles vervangen
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setPending(undefined)}>
              Annuleren
            </button>
          </div>
        </div>
      ) : null}
      {message ? (
        <p role="status" className="parent-ok">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="parent-error">
          {error}
        </p>
      ) : null}
    </section>
  )
}
