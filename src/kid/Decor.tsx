/** Versiering zonder betekenis: seizoensachtergrond en confetti. Alles aria-hidden. */
import type { CSSProperties } from 'react'
import { IconSnowflake } from '../shared/icons'
import { Sun } from './KidArt'
import { noise } from './kidUtils'
import type { KidSeason } from './kidUtils'

const FLAKES = Array.from({ length: 9 }, (_, i) => ({
  x: Math.round(4 + noise(i, 1) * 90),
  y: Math.round(6 + noise(i, 2) * 80),
  size: Math.round(18 + noise(i, 3) * 20),
  duration: Math.round(16 + noise(i, 4) * 14),
  delay: -Math.round(noise(i, 5) * 20),
}))

/** Zachte vlekken in pastel, met een draaiend zonnetje (zomer) of dwarrelende sneeuw (winter). */
export function SeasonBackdrop({ season }: { season: KidSeason }) {
  return (
    <div className={`kid-backdrop kid-backdrop--${season}`} aria-hidden="true">
      <span className="kid-blob kid-blob--a" />
      <span className="kid-blob kid-blob--b" />
      <span className="kid-blob kid-blob--c" />
      <span className="kid-blob kid-blob--d" />
      {season === 'summer' ? (
        <Sun className="kid-sun" />
      ) : (
        FLAKES.map((flake, i) => (
          <span
            key={i}
            className="kid-flake"
            style={
              {
                '--x': flake.x,
                '--y': flake.y,
                '--size': `${flake.size}px`,
                '--dur': `${flake.duration}s`,
                '--delay': `${flake.delay}s`,
              } as CSSProperties
            }
          >
            <IconSnowflake size={flake.size} />
          </span>
        ))
      )}
    </div>
  )
}

const CONFETTI_COLORS = ['#7B5CFF', '#2FC99A', '#FF8A3D', '#FFC93C', '#FF6FAE', '#39B8FF']

const PIECES = Array.from({ length: 44 }, (_, i) => {
  const angle = noise(i, 1) * Math.PI - Math.PI / 2 // naar boven, een halve cirkel
  const power = 24 + noise(i, 2) * 30
  return {
    dx: Math.round(Math.sin(angle) * power * 1.5), // in vw
    up: Math.round(6 + Math.cos(angle) * power * 0.45), // in vh
    fall: Math.round(70 + noise(i, 3) * 40), // in vh
    spin: Math.round(noise(i, 4) * 900 - 450),
    delay: Math.round(noise(i, 5) * 180),
    duration: Math.round(1500 + noise(i, 6) * 600),
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    shape: i % 3,
  }
})

/** Een confetti-explosie van ±2 seconden; onder minder beweging verborgen (zie kid.css). */
export function Confetti() {
  return (
    <div className="kid-confetti" aria-hidden="true">
      {PIECES.map((piece, i) => (
        <i
          key={i}
          className={`kid-confetti__piece kid-confetti__piece--${piece.shape}`}
          style={
            {
              '--dx': `${piece.dx}vw`,
              '--up': `${-piece.up}vh`,
              '--fall': `${piece.fall}vh`,
              '--spin': `${piece.spin}deg`,
              '--delay': `${piece.delay}ms`,
              '--dur': `${piece.duration}ms`,
              background: piece.color,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
