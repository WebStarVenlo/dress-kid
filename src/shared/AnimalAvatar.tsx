import type { ReactNode } from 'react'
import type { AvatarId } from '../domain/avatars'

const INK = '#2B2350'
const CHEEK = '#FF6FAE'

/** Soft pastel colour per animal, for the circle behind the head. */
export const AVATAR_COLORS: Record<AvatarId, string> = {
  fox: '#FFD9BF',
  bunny: '#FFD3E6',
  bear: '#F3DDC6',
  cat: '#FFE9A8',
  dog: '#CDEBFF',
  panda: '#D8F5E9',
  frog: '#CFF3C8',
  owl: '#E2D8FF',
  lion: '#FFE3A0',
  unicorn: '#F1D9FF',
  dino: '#C9F2E1',
  penguin: '#D3EBFF',
}

/** Shared little face: eyes, red cheeks and a smile. */
function Face({
  eyeY = 52,
  eyeDx = 16,
  cheekY = 63,
  smileY = 66,
  eyes = true,
}: {
  eyeY?: number
  eyeDx?: number
  cheekY?: number
  smileY?: number
  eyes?: boolean
}) {
  return (
    <g>
      {eyes &&
        [50 - eyeDx, 50 + eyeDx].map((x) => (
          <g key={x}>
            <circle cx={x} cy={eyeY} r={5} fill={INK} />
            <circle cx={x + 1.6} cy={eyeY - 1.8} r={1.8} fill="#fff" />
          </g>
        ))}
      <ellipse cx={50 - eyeDx - 7} cy={cheekY} rx={5} ry={3.4} fill={CHEEK} opacity={0.5} />
      <ellipse cx={50 + eyeDx + 7} cy={cheekY} rx={5} ry={3.4} fill={CHEEK} opacity={0.5} />
      <path
        d={`M44 ${smileY} Q50 ${smileY + 6} 56 ${smileY}`}
        fill="none"
        stroke={INK}
        strokeWidth={2.6}
        strokeLinecap="round"
      />
    </g>
  )
}

const Nose = ({ y = 61, color = INK }: { y?: number; color?: string }) => (
  <ellipse cx={50} cy={y} rx={4.2} ry={3} fill={color} />
)

const ANIMALS: Record<AvatarId, () => ReactNode> = {
  fox: () => (
    <>
      <path d="M12 8 L40 28 L14 50 Z" fill="#FF8A3D" />
      <path d="M88 8 L60 28 L86 50 Z" fill="#FF8A3D" />
      <path d="M17 19 L33 30 L19 42 Z" fill={INK} />
      <path d="M83 19 L67 30 L81 42 Z" fill={INK} />
      <path d="M50 24 C74 24 94 38 94 60 C94 80 74 92 50 92 C26 92 6 80 6 60 C6 38 26 24 50 24Z" fill="#FF8A3D" />
      <path d="M6 62 C14 58 34 62 50 74 C66 62 86 58 94 62 C92 82 74 92 50 92 C26 92 8 82 6 62Z" fill="#fff" />
      <Face eyeY={50} eyeDx={17} cheekY={62} smileY={74} />
      <ellipse cx={50} cy={68} rx={5} ry={3.6} fill={INK} />
    </>
  ),
  bunny: () => (
    <>
      <ellipse cx={34} cy={27} rx={11} ry={23} fill="#fff" transform="rotate(-8 34 27)" />
      <ellipse cx={66} cy={27} rx={11} ry={23} fill="#fff" transform="rotate(8 66 27)" />
      <ellipse cx={34} cy={29} rx={5.5} ry={16} fill="#FFB3D3" transform="rotate(-8 34 29)" />
      <ellipse cx={66} cy={29} rx={5.5} ry={16} fill="#FFB3D3" transform="rotate(8 66 29)" />
      <ellipse cx={50} cy={63} rx={37} ry={31} fill="#fff" />
      <Face eyeY={58} eyeDx={16} cheekY={68} smileY={72} />
      <path d="M46 64 Q50 61 54 64 Q50 69 46 64Z" fill={CHEEK} />
      <rect x={46.5} y={74.5} width={7} height={8} rx={2} fill="#fff" stroke="#E4DCEF" strokeWidth={1.5} />
    </>
  ),
  bear: () => (
    <>
      <circle cx={22} cy={26} r={15} fill="#A8744A" />
      <circle cx={78} cy={26} r={15} fill="#A8744A" />
      <circle cx={22} cy={26} r={8} fill="#E8B98F" />
      <circle cx={78} cy={26} r={8} fill="#E8B98F" />
      <circle cx={50} cy={56} r={38} fill="#A8744A" />
      <ellipse cx={50} cy={67} rx={17} ry={14} fill="#E8B98F" />
      <Face eyeY={48} eyeDx={17} cheekY={62} smileY={73} />
      <Nose y={64} />
    </>
  ),
  cat: () => (
    <>
      <path d="M12 12 L44 28 L14 54 Z" fill="#9A9AAE" />
      <path d="M88 12 L56 28 L86 54 Z" fill="#9A9AAE" />
      <path d="M18 24 L34 31 L19 44 Z" fill="#FFB3D3" />
      <path d="M82 24 L66 31 L81 44 Z" fill="#FFB3D3" />
      <ellipse cx={50} cy={60} rx={40} ry={33} fill="#B9B9CC" />
      <path d="M44 28 L46 38 M50 27 L50 38 M56 28 L54 38" stroke="#8C8CA3" strokeWidth={3} strokeLinecap="round" />
      <ellipse cx={50} cy={70} rx={16} ry={11} fill="#fff" />
      <Face eyeY={54} eyeDx={17} cheekY={65} smileY={70} />
      <path d="M46 63 L54 63 L50 68Z" fill={CHEEK} />
      <path d="M12 66 L26 68 M12 74 L26 72 M88 66 L74 68 M88 74 L74 72" stroke={INK} strokeWidth={1.8} strokeLinecap="round" opacity={0.6} />
    </>
  ),
  dog: () => (
    <>
      <path d="M22 18 C6 18 4 52 10 66 C22 68 32 56 32 40 C32 28 30 18 22 18Z" fill="#8A5A3A" />
      <path d="M78 18 C94 18 96 52 90 66 C78 68 68 56 68 40 C68 28 70 18 78 18Z" fill="#8A5A3A" />
      <ellipse cx={50} cy={56} rx={34} ry={36} fill="#E9C9A0" />
      <ellipse cx={50} cy={34} rx={7} ry={11} fill="#8A5A3A" opacity={0} />
      <ellipse cx={35} cy={46} rx={10} ry={9} fill="#8A5A3A" />
      <ellipse cx={50} cy={68} rx={18} ry={14} fill="#fff" />
      <Face eyeY={49} eyeDx={16} cheekY={62} smileY={74} />
      <ellipse cx={50} cy={64} rx={6} ry={4.4} fill={INK} />
      <path d="M50 68 L50 74" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
      <path d="M45 82 Q50 96 58 82Z" fill="#FF6F8E" />
    </>
  ),
  panda: () => (
    <>
      <circle cx={20} cy={24} r={14} fill={INK} />
      <circle cx={80} cy={24} r={14} fill={INK} />
      <ellipse cx={50} cy={57} rx={39} ry={36} fill="#fff" />
      <ellipse cx={33} cy={51} rx={10} ry={13} fill={INK} transform="rotate(25 33 51)" />
      <ellipse cx={67} cy={51} rx={10} ry={13} fill={INK} transform="rotate(-25 67 51)" />
      {[33, 67].map((x) => (
        <g key={x}>
          <circle cx={x} cy={51} r={5} fill="#fff" />
          <circle cx={x} cy={51} r={3.2} fill={INK} />
          <circle cx={x + 1.2} cy={49.8} r={1.2} fill="#fff" />
        </g>
      ))}
      <Face eyes={false} eyeDx={19} cheekY={67} smileY={70} />
      <Nose y={63} />
    </>
  ),
  frog: () => (
    <>
      <circle cx={28} cy={26} r={18} fill="#5FD068" />
      <circle cx={72} cy={26} r={18} fill="#5FD068" />
      <ellipse cx={50} cy={62} rx={43} ry={31} fill="#5FD068" />
      <ellipse cx={50} cy={74} rx={30} ry={17} fill="#B8F0A8" />
      {[28, 72].map((x) => (
        <g key={x}>
          <circle cx={x} cy={26} r={12} fill="#fff" />
          <circle cx={x} cy={27} r={6.5} fill={INK} />
          <circle cx={x + 2} cy={24.5} r={2.2} fill="#fff" />
        </g>
      ))}
      <circle cx={44} cy={58} r={1.6} fill={INK} opacity={0.6} />
      <circle cx={56} cy={58} r={1.6} fill={INK} opacity={0.6} />
      <ellipse cx={20} cy={64} rx={5.5} ry={3.6} fill={CHEEK} opacity={0.55} />
      <ellipse cx={80} cy={64} rx={5.5} ry={3.6} fill={CHEEK} opacity={0.55} />
      <path d="M30 70 Q50 88 70 70" fill="none" stroke={INK} strokeWidth={2.8} strokeLinecap="round" />
    </>
  ),
  owl: () => (
    <>
      <path d="M12 12 L40 24 L16 46 Z" fill="#8B6BD9" />
      <path d="M88 12 L60 24 L84 46 Z" fill="#8B6BD9" />
      <ellipse cx={50} cy={58} rx={40} ry={37} fill="#8B6BD9" />
      <ellipse cx={50} cy={74} rx={20} ry={15} fill="#D9CCFF" />
      <path d="M44 68 L48 72 L52 68 L56 72 M45 77 L50 81 L55 77" fill="none" stroke="#B9A6F2" strokeWidth={2} strokeLinecap="round" />
      {[32, 68].map((x) => (
        <g key={x}>
          <circle cx={x} cy={48} r={16} fill="#fff" />
          <circle cx={x} cy={48} r={9} fill="#FFC93C" />
          <circle cx={x} cy={48} r={5.5} fill={INK} />
          <circle cx={x + 2} cy={45.5} r={2} fill="#fff" />
        </g>
      ))}
      <path d="M43 58 L57 58 L50 70Z" fill="#FF8A3D" />
      <ellipse cx={14} cy={62} rx={4} ry={3} fill={CHEEK} opacity={0.5} />
      <ellipse cx={86} cy={62} rx={4} ry={3} fill={CHEEK} opacity={0.5} />
    </>
  ),
  lion: () => (
    <>
      <circle cx={50} cy={52} r={40} fill="#E8822C" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI * 2) / 12
        return (
          <circle
            key={i}
            cx={(50 + Math.cos(a) * 35).toFixed(1)}
            cy={(52 + Math.sin(a) * 35).toFixed(1)}
            r={10}
            fill={i % 2 ? '#E8822C' : '#F59A3F'}
          />
        )
      })}
      <circle cx={26} cy={22} r={9} fill="#FFC93C" />
      <circle cx={74} cy={22} r={9} fill="#FFC93C" />
      <circle cx={26} cy={22} r={4.5} fill="#E8B98F" />
      <circle cx={74} cy={22} r={4.5} fill="#E8B98F" />
      <circle cx={50} cy={56} r={31} fill="#FFC93C" />
      <ellipse cx={50} cy={68} rx={14} ry={11} fill="#FFE9A8" />
      <Face eyeY={50} eyeDx={14} cheekY={62} smileY={72} />
      <path d="M45 62 L55 62 L50 68Z" fill={INK} />
    </>
  ),
  unicorn: () => (
    <>
      <path d="M40 30 L50 2 L60 30Z" fill="#FFC93C" />
      <path d="M43 22 L57 22 M41 28 L59 28" stroke="#FF8A3D" strokeWidth={2.4} strokeLinecap="round" />
      <path d="M26 12 L38 34 L16 38Z" fill="#fff" />
      <path d="M74 12 L62 34 L84 38Z" fill="#fff" />
      <path d="M26 20 L33 32 L22 34Z" fill="#FFB3D3" />
      <path d="M74 20 L67 32 L78 34Z" fill="#FFB3D3" />
      <path d="M22 40 C0 50 4 82 18 92 C10 76 20 62 28 56Z" fill="#FF6FAE" />
      <path d="M12 54 C2 62 8 80 20 88 C14 76 20 66 24 60Z" fill="#7B5CFF" />
      <ellipse cx={52} cy={62} rx={34} ry={30} fill="#fff" />
      <path d="M30 36 C40 24 66 24 78 38 C66 34 44 34 30 36Z" fill="#FF6FAE" />
      <path d="M36 36 C46 30 60 30 70 36 C60 34 46 34 36 36Z" fill="#7B5CFF" />
      <ellipse cx={52} cy={74} rx={16} ry={11} fill="#FFE3F0" />
      <Face eyeY={54} eyeDx={16} cheekY={64} smileY={72} />
      <circle cx={46} cy={67} r={1.6} fill={INK} opacity={0.55} />
      <circle cx={58} cy={67} r={1.6} fill={INK} opacity={0.55} />
    </>
  ),
  dino: () => (
    <>
      <path d="M30 22 L38 6 L46 24Z M46 22 L54 3 L62 22Z M60 24 L70 8 L76 28Z" fill="#FF8A3D" />
      <ellipse cx={50} cy={58} rx={40} ry={34} fill="#3CC58E" />
      <ellipse cx={50} cy={72} rx={26} ry={17} fill="#BFF0D8" />
      <circle cx={30} cy={36} r={3.2} fill="#2A9E72" />
      <circle cx={70} cy={40} r={3.8} fill="#2A9E72" />
      <circle cx={22} cy={52} r={2.6} fill="#2A9E72" />
      <Face eyeY={50} eyeDx={17} cheekY={62} smileY={74} />
      <circle cx={45} cy={66} r={1.8} fill={INK} opacity={0.55} />
      <circle cx={55} cy={66} r={1.8} fill={INK} opacity={0.55} />
    </>
  ),
  penguin: () => (
    <>
      <ellipse cx={50} cy={56} rx={40} ry={38} fill={INK} />
      <path d="M50 38 C66 28 86 44 80 66 C76 82 62 90 50 90 C38 90 24 82 20 66 C14 44 34 28 50 38Z" fill="#fff" />
      <Face eyeY={50} eyeDx={15} cheekY={62} smileY={74} />
      <path d="M42 60 Q50 54 58 60 Q50 72 42 60Z" fill="#FF8A3D" />
      <path d="M44 62 Q50 66 56 62" stroke="#E8661A" strokeWidth={1.6} fill="none" strokeLinecap="round" />
    </>
  ),
}

/**
 * Cheerful animal head as inline SVG (viewBox 0 0 100 100).
 * Decorative by default (aria-hidden); with `title` an image with an accessible name.
 */
export function AnimalAvatar({
  id,
  className,
  title,
}: {
  id: AvatarId
  className?: string
  title?: string
}) {
  const a11y = title
    ? ({ role: 'img' } as const)
    : ({ 'aria-hidden': true, focusable: 'false' } as const)
  return (
    <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg" {...a11y}>
      {title && <title>{title}</title>}
      {ANIMALS[id]()}
    </svg>
  )
}
