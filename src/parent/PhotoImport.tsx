import { useEffect, useId, useRef, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import {
  canReadClipboardImage,
  fetchImageFromUrl,
  imageFilesFromDataTransfer,
  imageUrlFromDataTransfer,
  photoImportMessage,
  readClipboardImage,
} from '../domain/photoImport'

interface Props {
  /** Verwerkt de binnengehaalde foto's. */
  onFiles: (files: File[]) => void | Promise<void>
  disabled?: boolean
  /** Compacte weergave (zonder uitleg en kader). */
  compact?: boolean
  /** Inhoud van het sleepvlak, bv. een foto. Zonder inhoud een eigen vlak. */
  children?: ReactNode
}

function nameFor(blob: Blob) {
  return `webshop.${blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'}`
}

/** Plakken, slepen of een link ophalen; levert gewone File-objecten op. */
export default function PhotoImport({ onFiles, disabled, compact, children }: Props) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | undefined>()
  const [dragging, setDragging] = useState(false)
  const urlId = useId()
  const urlRef = useRef<HTMLInputElement>(null)
  const latest = useRef({ onFiles, disabled, loading })
  useEffect(() => {
    latest.current = { onFiles, disabled, loading }
  })

  async function fromUrl(link: string) {
    setMessage(undefined)
    setLoading(true)
    try {
      const blob = await fetchImageFromUrl(link)
      await latest.current.onFiles([new File([blob], nameFor(blob), { type: blob.type })])
      setUrl('')
    } catch (error) {
      setMessage(photoImportMessage(error))
    } finally {
      setLoading(false)
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
      setUrl(link)
      await fromUrl(link)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function pasteButton() {
    setMessage(undefined)
    try {
      const file = await readClipboardImage()
      if (file) await onFiles([file])
      else setMessage('Er staat geen foto op het klembord. Kopieer eerst een afbeelding, of plak een link.')
    } catch (error) {
      setMessage(photoImportMessage(error))
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    if (disabled || loading) return
    void handleTransfer(event.dataTransfer).then((ok) => {
      if (!ok) setMessage('Hier zat geen foto of afbeeldingslink in.')
    })
  }

  const dropProps = {
    onDragOver: (event: DragEvent) => {
      event.preventDefault()
      setDragging(true)
    },
    onDragLeave: () => setDragging(false),
    onDrop,
  }
  const off = disabled || loading

  const controls = (
    <>
      <div className="parent-import-url">
        <label htmlFor={urlId} className="parent-field-label">
          Afbeeldingslink plakken
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
            Ophalen
          </button>
        </div>
      </div>
      {canReadClipboardImage() ? (
        <button type="button" className="secondary" disabled={off} onClick={() => void pasteButton()}>
          Plak foto
        </button>
      ) : null}
      {loading ? (
        <p role="status" className="parent-progress">
          Foto ophalen…
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
        {controls}
      </div>
    )
  }

  return (
    <section className="parent-card parent-import" aria-labelledby={`${urlId}-title`}>
      <h3 id={`${urlId}-title`}>Van webshop</h3>
      <p className="parent-hint">Rechtsklik (of druk lang) op de foto in de webshop → Afbeelding kopiëren → plak hier (Ctrl+V).</p>
      <div {...dropProps} className={`parent-dropzone${dragging ? ' is-dragging' : ''}`}>
        Of sleep een foto of afbeeldingslink hierheen
      </div>
      {controls}
    </section>
  )
}
