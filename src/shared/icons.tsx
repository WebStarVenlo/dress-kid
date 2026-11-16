import type { ReactNode } from 'react'

export type IconProps = { className?: string; size?: number }

/** Basis voor alle iconen: afgeronde lijnen, 24×24, kleur volgt de tekstkleur. */
function Icon({
  className,
  size = 24,
  fill = 'none',
  children,
}: IconProps & { fill?: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill={fill}
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const IconGear = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
  </Icon>
)

export const IconSpeaker = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  </Icon>
)

export const IconRestart = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5" />
    <path d="M4.5 4v4.5H9" />
  </Icon>
)

export const IconUndo = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 14L4.5 9.5 9 5" />
    <path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3" />
  </Icon>
)

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 12.5l5 5 10-11" />
  </Icon>
)

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const IconCamera = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 8.5a2 2 0 0 1 2-2h2l1.5-2h6l1.5 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icon>
)

export const IconImage = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M4 17l5-4.5 4 3.5 3-2.5 4.5 4" />
  </Icon>
)

export const IconWardrobe = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 7.5V6.3a2 2 0 1 1 2-2" />
    <path d="M12 7.5L3 15a2 2 0 0 0 1.3 3.5h15.4A2 2 0 0 0 21 15z" />
  </Icon>
)

export const IconChildren = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    <circle cx="17.5" cy="9" r="2.4" />
    <path d="M17 14c2.3 0 4 1.6 4 4" />
  </Icon>
)

export const IconSettings = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h9M19 7h1M4 17h1M11 17h9" />
    <circle cx="16" cy="7" r="2.5" />
    <circle cx="8" cy="17" r="2.5" />
  </Icon>
)

export const IconBackup = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 18.5a4.5 4.5 0 0 1-.6-8.9 6 6 0 0 1 11.4 1.4A3.8 3.8 0 0 1 17 18.5" />
    <path d="M12 11.5v8M9 14.5l3-3 3 3" />
  </Icon>
)

export const IconStar = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Icon {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />
  </Icon>
)

export const IconArrowLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19.5 12h-15M11 5.5L4.5 12l6.5 6.5" />
  </Icon>
)

export const IconArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 12h15M13 5.5l6.5 6.5-6.5 6.5" />
  </Icon>
)

export const IconSun = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4" />
  </Icon>
)

export const IconSnowflake = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />
    <path d="M9.5 4.8L12 6.5l2.5-1.7M9.5 19.2L12 17.5l2.5 1.7" />
  </Icon>
)

export const IconSparkle = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.5 4c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5C8.2 9.9 9.9 8.2 10.5 4z" />
    <path d="M18.5 15.5c.3 1.8 1 2.5 2.8 2.8-1.8.3-2.5 1-2.8 2.8-.3-1.8-1-2.5-2.8-2.8 1.8-.3 2.5-1 2.8-2.8z" />
  </Icon>
)

export const IconTrash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M9.5 7V4.5h5V7" />
    <path d="M6 7l1 12a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 17 19l1-12" />
    <path d="M10 11.5v5M14 11.5v5" />
  </Icon>
)

export const IconWash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3.5c3 3.8 5 6.2 5 9a5 5 0 0 1-10 0c0-2.8 2-5.2 5-9z" />
    <circle cx="18" cy="6.5" r="1.8" />
    <circle cx="19.5" cy="15" r="1.3" />
  </Icon>
)

export const IconSticker = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.5 20.5H7a3.5 3.5 0 0 1-3.5-3.5V7A3.5 3.5 0 0 1 7 3.5h10A3.5 3.5 0 0 1 20.5 7v7.5z" />
    <path d="M20.5 14.5h-3.5a2.5 2.5 0 0 0-2.5 2.5v3.5" />
    <circle cx="9.5" cy="10" r="1" fill="currentColor" />
    <circle cx="14.5" cy="10" r="1" fill="currentColor" />
    <path d="M9 14c1.5 1.5 3.5 1.5 5 0" />
  </Icon>
)
