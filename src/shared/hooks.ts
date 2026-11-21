/** React hooks used by both the child and the parent area. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { todayKey } from '../domain/compat'
import { DEFAULT_SETTINGS } from '../domain/types'
import type { Child, ClothingItem, Settings } from '../domain/types'
import { AppError, translateError } from '../i18n/AppError'
import { getStore } from '../storage'
import type { WardrobeStore } from '../storage'

// ---------------------------------------------------------------------------
// usePhotoUrl
//
// Object URLs are shared per Blob and tracked with a reference counter. This keeps the URL
// valid in StrictMode (effects run mount → cleanup → mount there) and only revokes it
// once no mounted component uses it any more.

interface UrlEntry {
  url: string
  refs: number
  timer: ReturnType<typeof setTimeout> | undefined
}

const urlCache = new WeakMap<Blob, UrlEntry>()
/** A URL that was rendered but never mounted is cleaned up after this time. */
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
  // No longer in the cache: the URL was already replaced; nothing to track.
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

/** Returns an object URL for the photo; it is revoked on change or unmount. */
export function usePhotoUrl(photo: Blob | undefined): string | undefined {
  const url = useMemo(() => (photo ? peekPhotoUrl(photo) : undefined), [photo])
  useEffect(() => {
    if (!photo || !url) return undefined
    return acquirePhotoUrl(photo, url)
  }, [photo, url])
  return url
}

// ---------------------------------------------------------------------------
// Laundry run

/** The laundry run per store: at most one per local day (shared by kid and parent area). */
const laundryRuns = new WeakMap<WardrobeStore, { day: string; run: Promise<void> }>()

/**
 * Runs `store.processLaundry` for `day` (default: today), at most once per store and day;
 * concurrent callers share the same run. Never rejects: a failure is logged, the app carries
 * on with the data as it is, and the next call tries again.
 */
export function ensureLaundryProcessed(store: WardrobeStore, day: string = todayKey()): Promise<void> {
  const current = laundryRuns.get(store)
  if (current?.day === day) return current.run
  const run: Promise<void> = Promise.resolve()
    .then(() => store.processLaundry(day))
    .then(
      () => undefined,
      (error: unknown) => {
        console.error(error)
        if (laundryRuns.get(store)?.run === run) laundryRuns.delete(store)
      },
    )
  laundryRuns.set(store, { day, run })
  return run
}

/**
 * Forgets that today's laundry run happened, so the next `ensureLaundryProcessed` runs again.
 * Call after changes that affect the outcome: laundry settings and backup imports.
 */
export function resetLaundryRun(store: WardrobeStore): void {
  laundryRuns.delete(store)
}

// ---------------------------------------------------------------------------
// useWardrobe

export interface WardrobeState {
  items: ClothingItem[]
  settings: Settings
  /** True until the first load has finished (succeeded or failed). */
  loading: boolean
  error: string | undefined
  /** Reloads items and settings. Never throws; failures end up in `error`. */
  reload: () => Promise<void>
}


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

/**
 * Loads the items and settings from storage. The day's laundry run (see
 * `ensureLaundryProcessed`) finishes first, so the items are up to date.
 */
export function useWardrobe(store: WardrobeStore = getStore()): WardrobeState {
  const [state, setState] = useState<LoadedState>(INITIAL_STATE)
  const mountedRef = useRef(false)
  const requestRef = useRef(0)

  const load = useCallback(async () => {
    const request = ++requestRef.current
    let next: Partial<LoadedState>
    try {
      await ensureLaundryProcessed(store)
      const [items, settings] = await Promise.all([store.listItems(), store.getSettings()])
      next = { items, settings, error: undefined }
    } catch (error) {
      console.error(error)
      next = { error: translateError(new AppError('wardrobeLoadFailed')) }
    }
    // Only the most recently started request counts, and not after unmount.
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
  /** True until the first load has finished (succeeded or failed). */
  loading: boolean
  error: string | undefined
  /** Reloads the children. Never throws; failures end up in `error`. */
  reload: () => Promise<void>
}


interface LoadedChildren {
  children: Child[]
  loading: boolean
  error: string | undefined
}

/** Loads the children from storage, in the order they were added. */
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
      next = { error: translateError(new AppError('childrenLoadFailed')) }
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
