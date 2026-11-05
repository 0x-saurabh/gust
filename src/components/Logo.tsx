// Kyte logo: the name KYTE set in the brand gradient (green to cyan, as on the Kyte mark image).
// `size` is the cap height in px; the wordmark scales with it.
export function Logo({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      aria-label="KYTE"
      role="img"
      className={`logo-word inline-block shrink-0 select-none font-display leading-none ${className}`}
      style={{ fontSize: size }}
    >
      KYTE
    </span>
  )
}
