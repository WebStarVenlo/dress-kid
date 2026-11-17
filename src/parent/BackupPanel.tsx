import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { todayKey } from '../domain/compat'
import { IconBackup, IconCheck, IconUndo } from '../shared/icons'
import { getStorageInfo } from '../storage'
import type { StorageInfo, WardrobeStore } from '../storage'
import { errorMessage } from './shared'

interface Props {
  store: WardrobeStore
  reload: () => Promise<void>
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',')} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1).replace('.', ',')} GB`
}

function StorageStatus({ info }: { info: StorageInfo }) {
  if (info.persisted === undefined && info.usage === undefined) return null
  return (
    <div className="parent-card parent-storage">
      {info.persisted === true ? (
        <p>Opslag is beschermd tegen automatisch opruimen.</p>
      ) : info.persisted === false ? (
        <p>
          Je browser kan de kledingkast opruimen als het apparaat vol raakt. Maak regelmatig een back-up of zet de app
          op je beginscherm.
        </p>
      ) : null}
      {info.usage !== undefined ? <p className="parent-hint">Ongeveer {formatBytes(info.usage)} in gebruik.</p> : null}
    </div>
  )
}

async function saveBackupFile(blob: Blob, filename: string): Promise<'shared' | 'cancelled' | 'download'> {
  const file = new File([blob], filename, { type: 'application/json' })
  // Alleen delen op apparaten met een touchscreen als primaire aanwijzer; op desktop is downloaden gewoner.
  const touchPrimary = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  if (touchPrimary && typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Dress Kid back-up' })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // Delen lukt niet (bijv. geen gebruikersgebaar meer): val terug op downloaden.
    }
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'download'
}

export default function BackupPanel({ store, reload }: Props) {
  const [pending, setPending] = useState<File | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [message, setMessage] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [storageInfo, setStorageInfo] = useState<StorageInfo>({})
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    void getStorageInfo().then((info) => {
      if (!cancelled) setStorageInfo(info)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function download() {
    setError(undefined)
    setMessage(undefined)
    try {
      const blob = await store.exportBackup()
      const result = await saveBackupFile(blob, `dress-kid-backup-${todayKey()}.json`)
      if (result === 'cancelled') return
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
      <div className="parent-title-row">
        <h2 id="parent-backup-title">Back-up</h2>
      </div>
      <p className="parent-lead">
        Alles wat je invoert staat alleen op dit apparaat. Raak je dit apparaat kwijt of wis je de gegevens van de
        browser, dan is de kledingkast weg. Maak daarom af en toe een back-up.
      </p>
      <StorageStatus info={storageInfo} />
      <div className="parent-stack">
        <button type="button" onClick={() => void download()}>
          <IconBackup size={22} />
          Back-up maken
        </button>
        <button type="button" className="secondary" onClick={() => fileRef.current?.click()}>
          <IconUndo size={22} />
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
          <IconCheck size={18} />
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
