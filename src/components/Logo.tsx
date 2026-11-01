// Placeholder mark: three wind lines. Replace with the real brand mark.
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="24" y2="24">
          <stop stopColor="var(--color-accent)" />
          <stop offset="1" stopColor="var(--color-accent-2)" />
        </linearGradient>
      </defs>
      <path
        d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"
        stroke="url(#logo-g)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}
