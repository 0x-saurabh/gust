// Kyte brand mark: the gradient tile with the Kyte wordmark (public/brand/kyte-mark.png, also the favicon).
export function Logo({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/kyte-mark.png"
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={`shrink-0 object-cover ring-1 ring-white/10 ${className}`}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.24) }}
    />
  )
}
