/** Coarse distinction between devices, for the right instructions. */
export type Platform = 'ios' | 'android' | 'desktop'

/**
 * Recognises iPhone/iPad, Android or computer. iPadOS pretends to be a Mac; a "Mac"
 * with more than one touch point is therefore an iPad.
 */
export function detectPlatform(
  ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  maxTouchPoints: number = typeof navigator !== 'undefined' ? (navigator.maxTouchPoints ?? 0) : 0,
): Platform {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}
