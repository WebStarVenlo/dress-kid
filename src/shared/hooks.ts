/** React-hooks die zowel de kind- als de ouderomgeving gebruiken. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_SETTINGS } from '../domain/types'
import type { Child, ClothingItem, Settings } from '../domain/types'
import { getStore } from '../storage'
import type { WardrobeStore } from '../storage'

// ---------------------------------------------------------------------------
// usePhotoUrl
//
// Object-URL's worden per Blob gedeeld en met een referentieteller bijgehouden. Zo blijft de URL
// geldig in StrictMode (effecten draaien daar mount → cleanup → mount) en wordt hij pas
// ingetrokken als geen enkel gemount component hem nog gebruikt.

interface UrlEntry {
  url: string
  refs: number
  timer: ReturnType<typeof setTimeout> | undefined
}

const urlCache = new WeakMap<Blob, UrlEntry>()
/** Een URL die wel gerenderd maar nooit gemount werd, ruimen we na deze tijd op. */
const ORPHAN_DELAY_MS = 30_000

function scheduleRevoke(photo: Blob, entry: UrlEntry, delay: number): void {
  if (entry.timer !== undefined) clearTimeout(entry.timer)
  entry.timer = setTimeout(() => {
    entry.timer = undefined
    if (entry.refs <= 0 && urlCache.get(photo) === entry) {
      urlCache.delete(photo)
      URL.revokeObjectURL(entry.url)
    }
  }, delay)
}

function peekPhotoUrl(photo: Blob): string {
  let entry = urlCache.get(photo)
  if (!entry) {
    entry = { url: URL.createObjectURL(photo), refs: 0, timer: undefined }
    urlCache.set(photo, entry)
    scheduleRevoke(photo, entry, ORPHAN_DELAY_MS)
  }
  return entry.url
}

function acquirePhotoUrl(photo: Blob, url: string): () => void {
  const entry = urlCache.get(photo)
  // Niet (meer) in de cache: dan is de URL al vervangen; niets bij te houden.
  if (!entry || entry.url !== url) return () => undefined
  entry.refs += 1
  if (entry.timer !== undefined) {
    clearTimeout(entry.timer)
    entry.timer = undefined
  }
  return () => {
    entry.refs -= 1
    if (entry.refs <= 0) scheduleRevoke(photo, entry, 0)
  }
}

/** Geeft een object-URL voor de foto; die wordt ingetrokken bij wisselen of unmounten. */
export function usePhotoUrl(photo: Blob | undefined): string | undefined {
  const url = useMemo(() => (photo ? peekPhotoUrl(photo) : undefined), [photo])
  useEffect(() => {
    if (!photo || !url) return undefined
    return acquirePhotoUrl(photo, url)
  }, [photo, url])
  return url
}

// ---------------------------------------------------------------------------
// useWardrobe

export interface WardrobeState {
  items: ClothingItem[]
  settings: Settings
  /** True totdat de eerste keer laden klaar is (gelukt of mislukt). */
  loading: boolean
  error: string | undefined
  /** Haalt kledingstukken en instellingen opnieuw op. Gooit nooit; fouten komen in `error`. */
  reload: () => Promise<void>
}

const LOAD_ERROR = 'De kledingkast kon niet worden geladen. Probeer het opnieuw.'

interface LoadedState {
  items: ClothingItem[]
  settings: Settings
  loading: boolean
  error: string | undefined
}

const INITIAL_STATE: LoadedState = {
  items: [],
  settings: DEFAULT_SETTINGS,
  loading: true,
  error: undefined,
}

/** Laadt de kledingstukken en instellingen uit de opslag. */
export function useWardrobe(store: WardrobeStore = getStore()): WardrobeState {
  const [state, setState] = useState<LoadedState>(INITIAL_STATE)
  const mountedRef = useRef(false)
  const requestRef = useRef(0)

  const load = useCallback(async () => {
    const request = ++requestRef.current
    let next: Partial<LoadedState>
    try {
      const [items, settings] = await Promise.all([store.listItems(), store.getSettings()])
      next = { items, settings, error: undefined }
    } catch (error) {
      console.error(error)
      next = { error: LOAD_ERROR }
    }
    // Alleen het laatst gestarte verzoek telt, en niet meer na unmount.
    if (!mountedRef.current || request !== requestRef.current) return
    setState((prev) => ({ ...prev, ...next, loading: false }))
  }, [store])

  useEffect(() => {
    mountedRef.current = true
    void load()
    return () => {
      mountedRef.current = false
    }
  }, [load])

  return { ...state, reload: load }
}

// ---------------------------------------------------------------------------
// useChildren

export interface ChildrenState {
  children: Child[]
  /** True totdat de eerste keer laden klaar is (gelukt of mislukt). */
  loading: boolean
  error: string | undefined
  /** Haalt de kinderen opnieuw op. Gooit nooit; fouten komen in `error`. */
  reload: () => Promise<void>
}

const CHILDREN_LOAD_ERROR = 'De kinderen konden niet worden geladen. Probeer het opnieuw.'

interface LoadedChildren {
  children: Child[]
  loading: boolean
  error: string | undefined
}

/** Laadt de kinderen uit de opslag, in de volgorde waarin ze zijn toegevoegd. */
export function useChildren(store: WardrobeStore = getStore()): ChildrenState {
  const [state, setState] = useState<LoadedChildren>({ children: [], loading: true, error: undefined })
  const mountedRef = useRef(false)
  const requestRef = useRef(0)

  const load = useCallback(async () => {
    const request = ++requestRef.current
    let next: Partial<LoadedChildren>
    try {
      next = { children: await store.listChildren(), error: undefined }
    } catch (error) {
      console.error(error)
      next = { error: CHILDREN_LOAD_ERROR }
    }
    if (!mountedRef.current || request !== requestRef.current) return
    setState((prev) => ({ ...prev, ...next, loading: false }))
  }, [store])

  useEffect(() => {
    mountedRef.current = true
    void load()
    return () => {
      mountedRef.current = false
    }
  }, [load])

  return { ...state, reload: load }
}
