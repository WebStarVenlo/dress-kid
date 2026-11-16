/** Slotje voor het ouderslot; zelfde lijnstijl als de iconen in shared/icons.tsx. */
export function IconLock({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4.5" y="10.5" width="15" height="10" rx="3" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      <circle cx="12" cy="15.5" r="1.2" fill="currentColor" />
    </svg>
  )
}
