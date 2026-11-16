import {
  canSpeak,
  isFeedbackEnabled,
  playSound,
  setFeedbackEnabled,
  speak,
  stopSpeaking,
  vibrate,
} from './feedback'

type G = Record<string, unknown>
const g = globalThis as unknown as G
const nav = navigator as unknown as G
const KEYS = ['AudioContext', 'speechSynthesis', 'SpeechSynthesisUtterance'] as const
let saved: Record<string, unknown>
let savedVibrate: unknown

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, g[k]]))
  savedVibrate = nav.vibrate
  for (const k of KEYS) delete g[k]
  delete nav.vibrate
  setFeedbackEnabled(true)
})

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete g[k]
    else g[k] = saved[k]
  }
  if (savedVibrate === undefined) delete nav.vibrate
  else nav.vibrate = savedVibrate
  setFeedbackEnabled(true)
})

describe('feedback zonder browser-api\'s', () => {
  it('doet niets en gooit niet', () => {
    expect(() => {
      playSound('tap')
      playSound('done')
      speak('hallo')
      stopSpeaking()
      vibrate()
    }).not.toThrow()
    expect(canSpeak()).toBe(false)
  })

  it('onthoudt aan/uit', () => {
    expect(isFeedbackEnabled()).toBe(true)
    setFeedbackEnabled(false)
    expect(isFeedbackEnabled()).toBe(false)
  })
})

describe('playSound', () => {
  function mockAudio(state = 'running') {
    const oscillators: { start: ReturnType<typeof vi.fn> }[] = []
    const resume = vi.fn(() => Promise.resolve())
    const ctor = vi.fn(
      class {
        currentTime = 0
        destination = {}
        state = state
        resume = resume
        createOscillator() {
          const o = {
            type: '',
            frequency: { value: 0 },
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
          }
          oscillators.push(o)
          return o
        }
        createGain() {
          return {
            gain: {
              setValueAtTime: vi.fn(),
              linearRampToValueAtTime: vi.fn(),
              exponentialRampToValueAtTime: vi.fn(),
            },
            connect: vi.fn(),
          }
        }
      },
    )
    g.AudioContext = ctor
    return { oscillators, resume, ctor }
  }

  it('maakt oscillators en hergebruikt één AudioContext', () => {
    const { oscillators, ctor } = mockAudio()
    playSound('pick')
    expect(oscillators).toHaveLength(2)
    playSound('done')
    expect(oscillators).toHaveLength(6)
    expect(oscillators.every((o) => o.start.mock.calls.length === 1)).toBe(true)
    expect(ctor).toHaveBeenCalledTimes(1)
  })

  it('doet niets als feedback uit staat', () => {
    const { oscillators } = mockAudio()
    setFeedbackEnabled(false)
    playSound('tap')
    expect(oscillators).toHaveLength(0)
  })
})

describe('speak', () => {
  function mockSpeech(voices: { lang: string }[] = []) {
    const synth = {
      cancel: vi.fn(),
      speak: vi.fn(),
      getVoices: vi.fn(() => voices),
      addEventListener: vi.fn(),
    }
    g.speechSynthesis = synth
    g.SpeechSynthesisUtterance = class {
      lang = ''
      rate = 1
      pitch = 1
      voice: unknown = null
      constructor(public text: string) {}
    }
    return synth
  }

  it('annuleert eerst en spreekt dan Nederlands', () => {
    const synth = mockSpeech()
    expect(canSpeak()).toBe(true)
    speak('Trek je jas aan')
    expect(synth.cancel).toHaveBeenCalledTimes(1)
    expect(synth.speak).toHaveBeenCalledTimes(1)
    expect(synth.cancel.mock.invocationCallOrder[0]!).toBeLessThan(
      synth.speak.mock.invocationCallOrder[0]!,
    )
    const u = synth.speak.mock.calls[0]![0]
    expect(u.text).toBe('Trek je jas aan')
    expect(u.lang).toBe('nl-NL')
    expect(u.rate).toBeCloseTo(0.95)
  })

  it('kiest een Nederlandse stem als die er is', () => {
    const nl = { lang: 'nl-BE' }
    const synth = mockSpeech([{ lang: 'en-US' }, nl])
    speak('hoi')
    expect(synth.speak.mock.calls[0]![0].voice).toBe(nl)
  })

  it('doet niets als feedback uit staat', () => {
    const synth = mockSpeech()
    setFeedbackEnabled(false)
    synth.cancel.mockClear()
    speak('hoi')
    expect(synth.speak).not.toHaveBeenCalled()
    expect(synth.cancel).not.toHaveBeenCalled()
  })

  it('stopSpeaking annuleert', () => {
    const synth = mockSpeech()
    stopSpeaking()
    expect(synth.cancel).toHaveBeenCalled()
  })
})

describe('vibrate', () => {
  it('roept navigator.vibrate aan', () => {
    const fn = vi.fn()
    nav.vibrate = fn
    vibrate()
    vibrate(40)
    expect(fn).toHaveBeenNthCalledWith(1, 15)
    expect(fn).toHaveBeenNthCalledWith(2, 40)
  })

  it('doet niets als feedback uit staat', () => {
    const fn = vi.fn()
    nav.vibrate = fn
    setFeedbackEnabled(false)
    vibrate()
    expect(fn).not.toHaveBeenCalled()
  })
})
