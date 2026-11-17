import { useEffect, useId, useRef, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  canReadClipboardImage,
  fetchImageFromUrl,
  imageFilesFromDataTransfer,
  imageUrlFromDataTransfer,
  photoImportMessage,
  readClipboardImage,
} from '../domain/photoImport'
import { detectPlatform } from '../domain/platform'
import type { Platform } from '../domain/platform'

interface Props {
  /** Handles the imported photos. */
  onFiles: (files: File[]) => void | Promise<void>
  disabled?: boolean
  /** Compact display (without explanation and frame). */
  compact?: boolean
  /** Content of the drop zone, e.g. a photo. Without content, a drop zone of its own. */
  children?: ReactNode
  /** Initial value of the link field (e.g. a shared link); is not fetched automatically. */
  initialUrl?: string
  /** Which device the instructions are for; detected from the browser by default. */
  platform?: Platform
}

interface Steps {
  label: `photoImport.platforms.${Platform}`
  steps: readonly (
    | 'photoImport.steps.ios1'
    | 'photoImport.steps.ios2'
    | 'photoImport.steps.android1'
    | 'photoImport.steps.android2'
    | 'photoImport.steps.desktop1'
  )[]
  note?: 'photoImport.steps.iosNote'
}

/** Short instructions per device (translation keys) for the "From webshop" card. */
export const WEBSHOP_STEPS: Record<Platform, Steps> = {
  ios: {
    label: 'photoImport.platforms.ios',
    steps: ['photoImport.steps.ios1', 'photoImport.steps.ios2'],
    note: 'photoImport.steps.iosNote',
  },
  android: {
    label: 'photoImport.platforms.android',
    steps: ['photoImport.steps.android1', 'photoImport.steps.android2'],
  },
  desktop: {
    label: 'photoImport.platforms.desktop',
    steps: ['photoImport.steps.desktop1'],
  },
}

const PLATFORMS: Platform[] = ['ios', 'android', 'desktop']

function StepList({ steps }: { steps: Steps }) {
  const { t } = useTranslation('parent')
  return (
    <>
      <ol className="parent-import-steps">
        {steps.steps.map((step) => (
          <li key={step}>{t(step)}</li>
        ))}
      </ol>
      {steps.note ? <p className="parent-hint">{t(steps.note)}</p> : null}
    </>
  )
}

function nameFor(blob: Blob) {
  return `webshop.${blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'}`
}

/** Paste, drag or fetch a link; yields plain File objects. */
export default function PhotoImport({ onFiles, disabled, compact, children, initialUrl, platform: platformProp }: Props) {
  const { t } = useTranslation('parent')
  const [detected] = useState(detectPlatform)
  const platform = platformProp ?? detected
  const [url, setUrl] = useState(initialUrl ?? '')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | undefined>()
  const [dragging, setDragging] = useState(false)
  const urlId = useId()
  const urlRef = useRef<HTMLInputElement>(null)
  const latest = useRef({ onFiles, disabled, loading })
  useEffect(() => {
    latest.current = { onFiles, disabled, loading }
  })

  const abortRef = useRef<AbortController | undefined>(undefined)
  const dragDepth = useRef(0)

  // Closing the screen stops a running download.
  useEffect(() => () => abortRef.current?.abort(), [])

  async function fromUrl(link: string) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setMessage(undefined)
    setLoading(true)
    try {
      const blob = await fetchImageFromUrl(link, controller.signal)
      if (controller.signal.aborted) return
      await latest.current.onFiles([new File([blob], nameFor(blob), { type: blob.type })])
      if (controller.signal.aborted) return
      setUrl('')
    } catch (error) {
      if (controller.signal.aborted) return
      setMessage(photoImportMessage(error))
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = undefined
        setLoading(false)
      }
    }
  }

  async function handleTransfer(dt: DataTransfer | null): Promise<boolean> {
    const files = imageFilesFromDataTransfer(dt)
    if (files.length > 0) {
      setMessage(undefined)
      await latest.current.onFiles(files)
      return true
    }
    const link = imageUrlFromDataTransfer(dt)
    if (link) {
      // Don't fetch anything automatically: the user decides with "Fetch".
      setMessage(undefined)
      setUrl(link)
      urlRef.current?.focus()
      return true
    }
    return false
  }

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (latest.current.disabled || latest.current.loading) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        target !== urlRef.current &&
        (target.isContentEditable || target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type !== 'file'))
      ) {
        return
      }
      const dt = event.clipboardData
      if (imageFilesFromDataTransfer(dt).length === 0 && !imageUrlFromDataTransfer(dt)) return
      event.preventDefault()
      void handleTransfer(dt)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  // A just-missed drop must not replace the app with the image or page itself.
  // Assumption: only one PhotoImport is mounted at a time (the listeners attach to document).
  useEffect(() => {
    const isEditable = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLInputElement && target.type !== 'file'))
    const block = (event: globalThis.DragEvent) => {
      const types = Array.from(event.dataTransfer?.types ?? [])
      const relevant = types.includes('Files') || types.includes('text/uri-list') || types.includes('text/html')
      if (relevant && !isEditable(event.target)) event.preventDefault()
    }
    document.addEventListener('dragover', block)
    document.addEventListener('drop', block)
    return () => {
      document.removeEventListener('dragover', block)
      document.removeEventListener('drop', block)
    }
  }, [])

  async function pasteButton() {
    setMessage(undefined)
    try {
      const file = await readClipboardImage()
      if (file) await onFiles([file])
      else setMessage(t('photoImport.clipboardEmpty'))
    } catch (error) {
      setMessage(photoImportMessage(error))
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (disabled || loading) return
    void handleTransfer(event.dataTransfer).then((ok) => {
      if (!ok) setMessage(t('photoImport.dropEmpty'))
    })
  }

  const dropProps = {
    onDragOver: (event: DragEvent) => {
      event.preventDefault()
      setDragging(true)
    },
    onDragEnter: () => {
      dragDepth.current += 1
      setDragging(true)
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    },
    onDrop,
  }
  const off = disabled || loading
  const pasteFirst = platform === 'ios' && !compact
  const paste = canReadClipboardImage() ? (
    <button
      type="button"
      className={pasteFirst ? 'parent-paste-main' : 'secondary'}
      disabled={off}
      onClick={() => void pasteButton()}
    >
      {t('photoImport.pastePhoto')}
    </button>
  ) : null

  const controls = (
    <>
      {pasteFirst ? paste : null}
      <div className="parent-import-url">
        <label htmlFor={urlId} className="parent-field-label">
          {t('photoImport.urlLabel')}
        </label>
        <div className="parent-import-row">
          <input
            id={urlId}
            ref={urlRef}
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={url}
            disabled={off}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && url.trim()) void fromUrl(url)
            }}
          />
          <button type="button" className="secondary" disabled={off || url.trim() === ''} onClick={() => void fromUrl(url)}>
            {t('photoImport.fetch')}
          </button>
        </div>
      </div>
      {pasteFirst ? null : paste}
      {loading ? (
        <p role="status" className="parent-progress">
          {t('photoImport.fetching')}
        </p>
      ) : null}
      {message ? (
        <p role="alert" className="parent-error">
          {message}
        </p>
      ) : null}
    </>
  )

  if (compact) {
    return (
      <div className="parent-import is-compact">
        <div {...dropProps} className={`parent-dropzone${dragging ? ' is-dragging' : ''}`}>
          {children}
        </div>
        <p className="parent-hint">{t('photoImport.compactHint')}</p>
        {controls}
      </div>
    )
  }

  return (
    <section className="parent-card parent-import" aria-labelledby={`${urlId}-title`}>
      <h3 id={`${urlId}-title`}>{t('photoImport.fromWebshop')}</h3>
      <div className="parent-import-help" data-platform={platform}>
        <StepList steps={WEBSHOP_STEPS[platform]} />
        <details className="parent-import-other">
          <summary>{t('photoImport.otherDevices')}</summary>
          {PLATFORMS.filter((other) => other !== platform).map((other) => (
            <div key={other}>
              <h4>{t(WEBSHOP_STEPS[other].label)}</h4>
              <StepList steps={WEBSHOP_STEPS[other]} />
            </div>
          ))}
        </details>
      </div>
      <div {...dropProps} className={`parent-dropzone${dragging ? ' is-dragging' : ''}`}>
        {t('photoImport.dropHint')}
      </div>
      {controls}
    </section>
  )
}
