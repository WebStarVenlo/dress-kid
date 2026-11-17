import i18next from 'i18next'
import type nlErrors from './locales/nl/errors.json'

/** Keys of the `errors` namespace; every AppError code must exist there. */
export type ErrorCode = keyof typeof nlErrors

/**
 * Error carrying a translation key (in the `errors` namespace) instead of a
 * user-facing message, so domain/storage code stays language-independent.
 * `message` holds the code for logging; the UI translates via `translateError`.
 */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly params?: Record<string, string | number>

  constructor(code: ErrorCode, params?: Record<string, string | number>, options?: ErrorOptions) {
    super(code, options)
    this.name = 'AppError'
    this.code = code
    this.params = params
  }
}

type LooseT = (key: string, options?: Record<string, unknown>) => string

/** Translates any thrown value into a user-facing message. */
export function translateError(err: unknown, fallbackCode: ErrorCode = 'unknown'): string {
  const code = err instanceof AppError ? err.code : fallbackCode
  const params = err instanceof AppError ? err.params : undefined
  return (i18next.t as unknown as LooseT)(code, { ns: 'errors', ...params })
}
