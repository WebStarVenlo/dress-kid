/** Little drawings for kid mode: profile picture, the guide, the dress-up doll and the stars. */
import type { CSSProperties } from 'react'
import type { Category, Child, ClothingItem, Outfit } from '../domain/types'
import { AnimalAvatar, AVATAR_COLORS } from '../shared/AnimalAvatar'
import { usePhotoUrl } from '../shared/hooks'
import { initial } from './kidUtils'

const INK = '#2B2350'
const SKIN = '#FFD9C2'
const CHEEK = '#FF6FAE'

/** Photo of a piece of clothing; always decorative (the name is next to it or in a label). */
export function Photo({ item, className }: { item: ClothingItem; className?: string }) {
  const url = usePhotoUrl(item.photo)
  return <img className={className} src={url} alt="" draggable={false} />
}

/**
 * A child's profile picture: the chosen animal, or else the (emoji) initial in the child's
 * colour. Always aria-hidden; the name appears elsewhere.
 */
export function ChildAvatar({ child, className = '' }: { child: Child; className?: string }) {
  if (child.avatar) {
    return (
      <span
        className={`kid-avatar kid-avatar--animal ${className}`}
        style={{ backgroundColor: AVATAR_COLORS[child.avatar], '--ring': child.color } as CSSProperties}
        aria-hidden="true"
      >
        <AnimalAvatar id={child.avatar} className="kid-avatar__animal" />
      </span>
    )
  }
  return (
    <span
      className={`kid-avatar kid-avatar--letter ${className}`}
      style={{ backgroundColor: child.color, '--ring': child.color } as CSSProperties}
      aria-hidden="true"
    >
      {initial(child)}
    </span>
  )
}

/** The guide when there is no child (yet): a cheerful T-shirt with a little face. */
export function Mascot({ className = '', mood = 'happy' }: { className?: string; mood?: 'happy' | 'oops' }) {
  return (
    <svg className={`kid-mascot ${className}`} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path
        d="M33 20 Q50 31 67 20 L84 29 L95 47 L80 56 L74 49 L74 86 Q74 90 70 90 L30 90 Q26 90 26 86 L26 49 L20 56 L5 47 L16 29 Z"
        fill="#39B8FF"
        stroke="#39B8FF"
        strokeWidth={6}
        strokeLinejoin="round"
      />
      <path d="M40 23 Q50 31 60 23" fill="none" stroke="#1F92D6" strokeWidth={4} strokeLinecap="round" />
      <circle cx={40} cy={55} r={4.6} fill={INK} />
      <circle cx={60} cy={55} r={4.6} fill={INK} />
      <circle cx={41.6} cy={53.4} r={1.6} fill="#fff" />
      <circle cx={61.6} cy={53.4} r={1.6} fill="#fff" />
      <ellipse cx={32} cy={64} rx={4.6} ry={3} fill={CHEEK} opacity={0.6} />
      <ellipse cx={68} cy={64} rx={4.6} ry={3} fill={CHEEK} opacity={0.6} />
      {mood === 'happy' ? (
        <path d="M43 65 Q50 73 57 65" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      ) : (
        <ellipse cx={50} cy={68} rx={4} ry={4.6} fill={INK} />
      )}
    </svg>
  )
}

/** An empty clothes hanger with sparkles, for an empty wardrobe. */
export function Hanger({ className = '' }: { className?: string }) {
  const sparkle = (x: number, y: number, r: number) =>
    `M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z`
  return (
    <svg className={`kid-hanger ${className}`} viewBox="0 0 120 100" aria-hidden="true" focusable="false">
      <path
        d="M60 36 V30 Q60 25 65 22 Q73 17 71 10 Q69 3 61 3 Q53 3 52 11"
        fill="none"
        stroke="#5A3FD6"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <path
        d="M60 36 L12 72 Q5 78 14 80 H106 Q115 78 108 72 Z"
        fill="none"
        stroke="#7B5CFF"
        strokeWidth={9}
        strokeLinejoin="round"
      />
      <path d={sparkle(20, 28, 9)} fill="#FFC93C" />
      <path d={sparkle(102, 36, 7)} fill="#FF6FAE" />
      <path d={sparkle(90, 12, 5)} fill="#2FC99A" />
    </svg>
  )
}

/** One star as on the celebration screen: yellow with a dark edge and a sparkle. */
export function PartyStar({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        d="M24 4.5l5.8 12 13.1 1.7-9.6 9.1 2.5 13-11.8-6.4-11.8 6.4 2.5-13-9.6-9.1 13.1-1.7z"
        fill="#FFC93C"
        stroke="#E0A400"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <path d="M17 19.5l3.2-.4" stroke="#fff" strokeWidth={3} strokeLinecap="round" opacity={0.85} />
    </svg>
  )
}

/** A little sun with spinning rays for the summer background. */
export function Sun({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <g className="kid-sun__rays">
        {Array.from({ length: 12 }, (_, i) => (
          <rect
            key={i}
            x={94}
            y={8}
            width={12}
            height={34}
            rx={6}
            fill="#FFD66B"
            transform={`rotate(${i * 30} 100 100)`}
          />
        ))}
      </g>
      <circle cx={100} cy={100} r={52} fill="#FFD66B" />
      <circle cx={84} cy={96} r={5} fill={INK} opacity={0.75} />
      <circle cx={116} cy={96} r={5} fill={INK} opacity={0.75} />
      <ellipse cx={74} cy={110} rx={7} ry={4.5} fill={CHEEK} opacity={0.45} />
      <ellipse cx={126} cy={110} rx={7} ry={4.5} fill={CHEEK} opacity={0.45} />
      <path d="M88 114 Q100 126 112 114" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" opacity={0.75} />
    </svg>
  )
}

const DASH = { fill: 'none', stroke: '#CDBFA6', strokeWidth: 2.4, strokeDasharray: '5 5', strokeLinecap: 'round' } as const

const SHIRT_PATH =
  'M40 62 Q60 55 80 62 L95 79 L86 88 L81 83 L81 121 Q60 126 39 121 L39 83 L34 88 L25 79 Z'
const PANTS_PATH =
  'M40 116 L80 116 L80 171 Q80 174 77 174 L65 174 Q62 174 62 171 L61 134 L59 134 L58 171 Q58 174 55 174 L43 174 Q40 174 40 171 Z'
const DRESS_PATH = 'M45 58 Q60 53 75 58 L79 78 L93 140 Q60 150 27 140 L41 78 Z'

/**
 * The dress-up doll: a little figure that gets dressed with what the child chooses. Empty slots
 * that still count are shown as a dotted outline; each chosen piece "plops" on in its own colour.
 */
export function Doll({ outfit, slots, className = '' }: { outfit: Outfit; slots: readonly Category[]; className?: string }) {
  const has = (category: Category) => outfit[category] !== undefined
  const ghost = (category: Category) => slots.includes(category) && !has(category)
  return (
    <svg className={`kid-doll ${className}`} viewBox="0 0 120 200" aria-hidden="true" focusable="false">
      {/* Body */}
      <rect x={43} y={116} width={15} height={62} rx={7.5} fill={SKIN} />
      <rect x={62} y={116} width={15} height={62} rx={7.5} fill={SKIN} />
      <path d="M41 66 L27 108 M79 66 L93 108" stroke={SKIN} strokeWidth={12} strokeLinecap="round" />
      <path d="M41 62 Q60 56 79 62 L80 122 Q60 127 40 122 Z" fill="#FFF1E4" />
      <rect x={54} y={48} width={12} height={14} rx={4} fill={SKIN} />
      <ellipse cx={50} cy={182} rx={10} ry={6} fill={SKIN} />
      <ellipse cx={70} cy={182} rx={10} ry={6} fill={SKIN} />

      {/* Dotted outlines: something still goes here */}
      {ghost('top') ? <path d={SHIRT_PATH} {...DASH} /> : null}
      {ghost('dress') ? <path d={DRESS_PATH} {...DASH} /> : null}
      {ghost('bottom') ? <path d={PANTS_PATH} {...DASH} /> : null}
      {ghost('shoes') ? (
        <path d="M39 186 Q39 176 50 176 Q61 176 61 186 Z M59 186 Q59 176 70 176 Q81 176 81 186 Z" {...DASH} />
      ) : null}

      {/* Chosen clothes */}
      {has('socks') ? (
        <g className="kid-doll__piece">
          <rect x={42} y={164} width={17} height={18} rx={5} fill="#fff" stroke="#E7DDF8" strokeWidth={1.5} />
          <rect x={61} y={164} width={17} height={18} rx={5} fill="#fff" stroke="#E7DDF8" strokeWidth={1.5} />
          <path d="M42 170 H59 M61 170 H78" stroke="#FF6FAE" strokeWidth={3} />
        </g>
      ) : null}
      {has('bottom') ? (
        <g className="kid-doll__piece">
          <path d={PANTS_PATH} fill="#7B5CFF" />
          <path d="M40 122 H80" stroke="#5A3FD6" strokeWidth={3} />
        </g>
      ) : null}
      {has('shoes') ? (
        <g className="kid-doll__piece">
          <path d="M38 188 Q38 175 50 175 Q62 175 62 188 Z" fill="#FF8A3D" />
          <path d="M58 188 Q58 175 70 175 Q82 175 82 188 Z" fill="#FF8A3D" />
          <path d="M37 188 H63 M57 188 H83" stroke="#E06A1B" strokeWidth={4} strokeLinecap="round" />
        </g>
      ) : null}
      {has('top') ? (
        <g className="kid-doll__piece">
          <path d={SHIRT_PATH} fill="#39B8FF" stroke="#39B8FF" strokeWidth={2} strokeLinejoin="round" />
          <path d="M52 59 Q60 66 68 59" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" />
        </g>
      ) : null}
      {has('dress') ? (
        <g className="kid-doll__piece">
          <path d={DRESS_PATH} fill="#FF6FAE" stroke="#FF6FAE" strokeWidth={2} strokeLinejoin="round" />
          <path d="M40 92 Q60 98 80 92" fill="none" stroke="#D94D8B" strokeWidth={3} strokeLinecap="round" />
          <circle cx={50} cy={112} r={3} fill="#fff" />
          <circle cx={66} cy={120} r={3} fill="#fff" />
          <circle cx={56} cy={132} r={3} fill="#fff" />
          <circle cx={74} cy={136} r={3} fill="#fff" />
          <circle cx={42} cy={132} r={3} fill="#fff" />
        </g>
      ) : null}
      {has('sweater') ? (
        <g className="kid-doll__piece">
          <path d="M41 66 L27 106 M79 66 L93 106" stroke="#2FC99A" strokeWidth={15} strokeLinecap="round" />
          <path d="M39 62 Q60 55 81 62 L82 122 Q60 127 38 122 Z" fill="#2FC99A" />
          <path d="M39 116 Q60 121 81 116" fill="none" stroke="#1FA67C" strokeWidth={4} />
          <path d="M51 59 Q60 67 69 59" fill="none" stroke="#1FA67C" strokeWidth={4} strokeLinecap="round" />
        </g>
      ) : null}
      {has('jacket') ? (
        <g className="kid-doll__piece">
          <path d="M41 66 L26 107 M79 66 L94 107" stroke="#FF8A3D" strokeWidth={16} strokeLinecap="round" />
          <path d="M38 62 Q48 57 56 58 L56 126 Q46 126 36 123 Z" fill="#FF8A3D" />
          <path d="M82 62 Q72 57 64 58 L64 126 Q74 126 84 123 Z" fill="#FF8A3D" />
          <circle cx={52} cy={80} r={2.6} fill="#E06A1B" />
          <circle cx={52} cy={96} r={2.6} fill="#E06A1B" />
          <circle cx={52} cy={112} r={2.6} fill="#E06A1B" />
        </g>
      ) : null}
      {/* Little hands over the sleeves */}
      <circle cx={26} cy={112} r={6.5} fill={SKIN} />
      <circle cx={94} cy={112} r={6.5} fill={SKIN} />

      {/* Head */}
      <circle cx={60} cy={32} r={23} fill={SKIN} />
      <path d="M37 32 Q36 8 60 8 Q84 8 83 32 Q77 19 64 18 Q66 24 58 26 Q60 20 52 19 Q42 21 37 32 Z" fill="#7A5236" />
      <circle cx={51.5} cy={35} r={3.2} fill={INK} />
      <circle cx={68.5} cy={35} r={3.2} fill={INK} />
      <circle cx={52.6} cy={33.8} r={1.1} fill="#fff" />
      <circle cx={69.6} cy={33.8} r={1.1} fill="#fff" />
      <ellipse cx={45} cy={42} rx={4.2} ry={2.6} fill={CHEEK} opacity={0.55} />
      <ellipse cx={75} cy={42} rx={4.2} ry={2.6} fill={CHEEK} opacity={0.55} />
      <path d="M54 43 Q60 49 66 43" fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      {has('accessory') ? (
        <g className="kid-doll__piece">
          <path d="M37 25 Q38 6 60 6 Q82 6 83 25 Z" fill="#FFC93C" />
          <path d="M60 22 H92 Q95 22 93 26 H60 Z" fill="#E0A400" />
          <circle cx={60} cy={7} r={3.4} fill="#E0A400" />
        </g>
      ) : null}
    </svg>
  )
}
