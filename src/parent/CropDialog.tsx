import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { DEFAULT_CROP, adjustCropRect } from '../domain/crop'
import type { CropMode, CropRect } from '../domain/crop'
import { usePhotoUrl } from '../shared/hooks'

interface Props {
  /** The photo being cropped. */
  photo: Blob
  /** Confirmed: the chosen frame as fractions (0..1) of the photo. */
  onCrop: (rect: CropRect) => void
  /** Don't crop, use the whole photo. Without this function there is no "Whole photo" button. */
  onWholePhoto?: () => void
  onCancel: () => void
  title?: string
}

interface Drag {
  pointerId: number
  mode: CropMode
  startX: number
  startY: number
  start: CropRect
}

const CORNERS = ['nw', 'ne', 'sw', 'se'] as const

const KEY_STEP = 0.02
const pct = (value: number) => `${value * 100}%`

/** Return focus to the previous element; if that is gone or disabled, to the main heading or container. */
function restoreFocus(previous: Element | null) {
  if (previous instanceof HTMLElement && previous.isConnected && !(previous as HTMLButtonElement).disabled) {
    previous.focus()
    return
  }
  const fallback = document.querySelector<HTMLElement>('main, h1, h2, [role="main"]') ?? document.body
  if (fallback !== document.body && !fallback.hasAttribute('tabindex')) fallback.setAttribute('tabindex', '-1')
  fallback.focus()
}

/** Cropping with a draggable frame; works with mouse, finger and arrow keys. */
export default function CropDialog({ photo, onCrop, onWholePhoto, onCancel, title }: Props) {
  const { t } = useTranslation('parent')
  // Shared object URL; revoked as soon as nobody shows it anymore.
  const url = usePhotoUrl(photo)
  const [rect, setRect] = useState<CropRect>(DEFAULT_CROP)
  const frameRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | undefined>(undefined)
  const titleId = useId()
  const hintId = useId()
  const cancelRef = useRef(onCancel)
  useEffect(() => {
    cancelRef.current = onCancel
  })

  useEffect(() => {
    const previous = document.activeElement
    confirmRef.current?.focus()
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        cancelRef.current()
        return
      }
      if (event.key !== 'Tab') return
      // Focus trap: Tab and Shift+Tab stay inside the window.
      const nodes = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [],
      )
      if (nodes.length === 0) return
      const first = nodes[0]!
      const last = nodes[nodes.length - 1]!
      const active = document.activeElement
      if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      restoreFocus(previous)
    }
  }, [])

  function startDrag(mode: CropMode, event: PointerEvent<HTMLElement>) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = { pointerId: event.pointerId, mode, startX: event.clientX, startY: event.clientY, start: rect }
  }

  function moveDrag(event: PointerEvent<HTMLElement>) {
    const current = drag.current
    const box = frameRef.current?.getBoundingClientRect()
    if (!current || current.pointerId !== event.pointerId || !box || box.width <= 0 || box.height <= 0) return
    const dx = (event.clientX - current.startX) / box.width
    const dy = (event.clientY - current.startY) / box.height
    setRect(adjustCropRect(current.start, current.mode, dx, dy))
  }

  function endDrag(event: PointerEvent<HTMLElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = undefined
  }

  /** Arrows move the frame, Shift+arrows make it larger or smaller. */
  function onBoxKey(event: KeyboardEvent<HTMLDivElement>) {
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    }
    const step = delta[event.key]
    if (!step) return
    event.preventDefault()
    setRect((prev) => adjustCropRect(prev, event.shiftKey ? 'se' : 'move', step[0], step[1]))
  }

  const position = { left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h) }

  return (
    <div className="parent-crop-backdrop">
      <div className="parent-crop" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={hintId}>
        <h3 id={titleId}>{title ?? t('crop.title')}</h3>
        <p id={hintId} className="parent-hint">
          {t('crop.hint')}
        </p>
        <div className="parent-crop-stage">
          <div
            className="parent-crop-frame"
            ref={frameRef}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {url ? <img src={url} alt={t('crop.imageAlt')} draggable={false} /> : null}
            <div className="parent-crop-shade" aria-hidden="true">
              <div style={position} />
            </div>
            <div
              className="parent-crop-box"
              style={position}
              tabIndex={0}
              role="group"
              aria-label={t('crop.boxLabel')}
              onKeyDown={onBoxKey}
              onPointerDown={(event) => startDrag('move', event)}
            >
              {CORNERS.map((corner) => (
                <span
                  key={corner}
                  className={`parent-crop-handle is-${corner}`}
                  aria-hidden="true"
                  data-corner={t(`crop.corners.${corner}`)}
                  onPointerDown={(event) => startDrag(corner, event)}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="parent-crop-actions">
          <button ref={confirmRef} type="button" onClick={() => onCrop(rect)}>
            {t('crop.confirm')}
          </button>
          {onWholePhoto ? (
            <button type="button" className="secondary" onClick={onWholePhoto}>
              {t('crop.wholePhoto')}
            </button>
          ) : null}
          <button type="button" className="secondary" onClick={onCancel}>
            {t('crop.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
