import { detectPlatform } from './platform'

describe('detectPlatform', () => {
  it('herkent een iPhone', () => {
    expect(
      detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', 5),
    ).toBe('ios')
  })
  it('herkent een iPad die zich als Mac voordoet aan de aanraakpunten', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
    expect(detectPlatform(ua, 5)).toBe('ios')
    expect(detectPlatform(ua, 0)).toBe('desktop')
  })
  it('herkent Android', () => {
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36', 5)).toBe(
      'android',
    )
  })
  it('valt terug op computer', () => {
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36', 0)).toBe('desktop')
    expect(detectPlatform('', 0)).toBe('desktop')
  })
})
