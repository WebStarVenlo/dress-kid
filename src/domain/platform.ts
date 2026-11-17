/** Grof onderscheid tussen apparaten, voor de juiste uitleg. */
export type Platform = 'ios' | 'android' | 'desktop'

/**
 * Herkent iPhone/iPad, Android of computer. iPadOS doet zich voor als Mac; een "Mac"
 * met meer dan één aanraakpunt is dus een iPad.
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
