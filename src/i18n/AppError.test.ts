import { AppError, translateError } from './AppError'

describe('translateError', () => {
  it('translates an AppError code via the errors namespace', () => {
    expect(translateError(new AppError('unknown'))).toBe('Er ging iets mis.')
  })

  it('falls back for non-AppError values', () => {
    expect(translateError(new Error('boom'))).toBe('Er ging iets mis.')
    expect(translateError('x')).toBe('Er ging iets mis.')
  })

  it('keeps the code as message for logging', () => {
    const err = new AppError('unknown')
    expect(err.message).toBe('unknown')
    expect(err).toBeInstanceOf(Error)
  })
})
