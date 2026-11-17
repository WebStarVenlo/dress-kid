/**
 * Beeps, speech and vibration. Everything is feature-detected and never throws:
 * in jsdom or old browsers the functions simply do nothing.
 */
import i18next from '../i18n'

export type SoundKind = 'tap' | 'pick' | 'unpick' | 'done' | 'sticker'

let enabled = true

export function setFeedbackEnabled(value: boolean): void {
  enabled = value
  if (!value) stopSpeaking()
}

export function isFeedbackEnabled(): boolean {
  return enabled
}

// ---------- sound (Web Audio) ----------

const MASTER_GAIN = 0.15

let audioCtx: AudioContext | null = null

type AudioCtor = new () => AudioContext

function getAudio(): AudioContext | null {
  try {
    if (audioCtx) return audioCtx
    if (typeof window === 'undefined') return null
    const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }
    const Ctor = w.AudioContext ?? w.webkitAudioContext
    if (!Ctor) return null
    audioCtx = new Ctor()
    return audioCtx
  } catch {
    return null
  }
}

type Note = { freq: number; start: number; dur: number; type?: OscillatorType; gain?: number }

const SOUNDS: Record<SoundKind, Note[]> = {
  tap: [{ freq: 500, start: 0, dur: 0.04, type: 'sine', gain: 0.8 }],
  pick: [
    { freq: 660, start: 0, dur: 0.06, type: 'triangle' },
    { freq: 880, start: 0.06, dur: 0.06, type: 'triangle' },
  ],
  unpick: [
    { freq: 660, start: 0, dur: 0.06, type: 'triangle' },
    { freq: 440, start: 0.06, dur: 0.06, type: 'triangle' },
  ],
  done: [
    { freq: 523.25, start: 0, dur: 0.16, type: 'triangle' },
    { freq: 659.25, start: 0.13, dur: 0.16, type: 'triangle' },
    { freq: 783.99, start: 0.26, dur: 0.16, type: 'triangle' },
    { freq: 1046.5, start: 0.39, dur: 0.4, type: 'triangle' },
  ],
  sticker: [
    { freq: 1318.5, start: 0, dur: 0.14, type: 'sine', gain: 0.8 },
    { freq: 1568, start: 0.07, dur: 0.14, type: 'sine', gain: 0.8 },
    { freq: 2093, start: 0.14, dur: 0.3, type: 'sine', gain: 0.7 },
  ],
}

export function playSound(kind: SoundKind): void {
  if (!enabled) return
  try {
    const ctx = getAudio()
    if (!ctx) return
    if (ctx.state === 'suspended') void Promise.resolve(ctx.resume()).catch(() => {})
    const t0 = ctx.currentTime
    for (const n of SOUNDS[kind]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = n.type ?? 'sine'
      osc.frequency.value = n.freq
      const peak = MASTER_GAIN * (n.gain ?? 1)
      const start = t0 + n.start
      const end = start + n.dur
      // Short attack and release, so no clicks are audible.
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.linearRampToValueAtTime(peak, start + Math.min(0.01, n.dur / 3))
      gain.gain.exponentialRampToValueAtTime(0.0001, end)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(end + 0.02)
    }
  } catch {
    // sound is never essential
  }
}

// ---------- speech ----------

function synth(): SpeechSynthesis | null {
  try {
    if (typeof window === 'undefined') return null
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return null
    return window.speechSynthesis
  } catch {
    return null
  }
}

export function canSpeak(): boolean {
  return synth() !== null
}

/** BCP 47 tag for speech synthesis, derived from the active i18n language ('nl' -> 'nl-NL'). */
function speechLang(): string {
  const lng = i18next.language || 'nl'
  return lng === 'nl' ? 'nl-NL' : lng
}

function pickVoice(s: SpeechSynthesis, lang: string): SpeechSynthesisVoice | null {
  try {
    const voices = s.getVoices?.() ?? []
    const prefix = (lang.split('-')[0] ?? lang).toLowerCase()
    return voices.find((v) => v.lang?.toLowerCase().startsWith(prefix)) ?? null
  } catch {
    return null
  }
}

let waitingForVoices = false

export function speak(text: string): void {
  if (!enabled) return
  try {
    const s = synth()
    if (!s || !text) return
    s.cancel()
    const u = new SpeechSynthesisUtterance(text)
    const lang = speechLang()
    u.lang = lang
    u.rate = 0.95
    u.pitch = 1.1
    const voice = pickVoice(s, lang)
    if (voice) {
      u.voice = voice
    } else if (!waitingForVoices && typeof s.addEventListener === 'function') {
      // Voices sometimes load later: listen once, then we know the right one next time.
      waitingForVoices = true
      s.addEventListener('voiceschanged', () => (waitingForVoices = false), { once: true })
    }
    s.speak(u)
  } catch {
    // speech is never essential
  }
}

export function stopSpeaking(): void {
  try {
    synth()?.cancel()
  } catch {
    // ignore
  }
}

// ---------- vibration ----------

export function vibrate(ms = 15): void {
  if (!enabled) return
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms)
    }
  } catch {
    // ignore
  }
}
