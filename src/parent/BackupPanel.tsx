import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { todayKey } from '../domain/compat'
import { t as translate } from '../i18n'
import { IconBackup, IconCheck, IconUndo } from '../shared/icons'
import { resetLaundryRun } from '../shared/hooks'
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
  const { t } = useTranslation('settings')
  if (info.persisted === undefined && info.usage === undefined) return null
  return (
    <div className="parent-card parent-storage">
      {info.persisted === true ? (
        <p>{t('backup.persisted')}</p>
      ) : info.persisted === false ? (
        <p>{t('backup.notPersisted')}</p>
      ) : null}
      {info.usage !== undefined ? <p className="parent-hint">{t('backup.usage', { size: formatBytes(info.usage) })}</p> : null}
    </div>
  )
}

async function saveBackupFile(blob: Blob, filename: string): Promise<'shared' | 'cancelled' | 'download'> {
  const file = new File([blob], filename, { type: 'application/json' })
  // Only share on devices with a touchscreen as primary pointer; on desktop downloading is more common.
  const touchPrimary = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  if (touchPrimary && typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: translate('settings:backup.shareTitle') })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // Sharing fails (e.g. no user gesture left): fall back to downloading.
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
  const { t } = useTranslation('settings')
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
      setMessage(t('backup.created'))
    } catch (e) {
      console.error(e)
      setError(errorMessage(e, t('backup.createFailed')))
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
      // Imported outfits and settings may need a laundry run today.
      resetLaundryRun(store)
      setPending(undefined)
      await reload()
      setMessage(t('backup.restored'))
    } catch (e) {
      console.error(e)
      setPending(undefined)
      setError(errorMessage(e, t('backup.restoreFailed')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="parent-backup-title">
      <div className="parent-title-row">
        <h2 id="parent-backup-title">{t('backup.title')}</h2>
      </div>
      <p className="parent-lead">{t('backup.lead')}</p>
      <StorageStatus info={storageInfo} />
      <div className="parent-stack">
        <button type="button" onClick={() => void download()}>
          <IconBackup size={22} />
          {t('backup.create')}
        </button>
        <button type="button" className="secondary" onClick={() => fileRef.current?.click()}>
          <IconUndo size={22} />
          {t('backup.restore')}
        </button>
      </div>
      <input
        ref={fileRef}
        className="parent-file"
        type="file"
        accept=".json,application/json"
        aria-label={t('backup.fileAria')}
        tabIndex={-1}
        onChange={pick}
      />
      {pending ? (
        <div className="parent-card parent-confirm" role="alertdialog" aria-label={t('backup.confirmLabel')}>
          <p>
            <Trans
              t={t}
              i18nKey="backup.confirmText"
              values={{ name: pending.name }}
              components={{ strong: <strong /> }}
            />
          </p>
          <div className="parent-stack">
            <button type="button" className="danger" disabled={busy} onClick={() => void restore()}>
              {t('backup.confirmYes')}
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setPending(undefined)}>
              {t('backup.cancel')}
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
