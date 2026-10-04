/** The app mark, inline so showing it never needs a file request after load. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0">
      <rect width="64" height="64" rx="16" fill="#3b35b5" />
      <rect x="14" y="34" width="8" height="16" rx="2.5" fill="#c7c4ff" />
      <rect x="28" y="24" width="8" height="26" rx="2.5" fill="#9590ff" />
      <rect x="42" y="14" width="8" height="36" rx="2.5" fill="#ffffff" />
    </svg>
  )
}
