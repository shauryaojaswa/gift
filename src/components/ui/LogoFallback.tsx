/**
 * Themed monogram stand-in for a shop with no usable logo (missing, broken or
 * the neutral placeholder asset). Derives its initials from the shop's own
 * name, so different shops can never bleed into each other, and consumes the
 * shop theme through the CSS custom properties (see src/lib/theme.ts).
 */

export function monogram(name: string | null | undefined): string {
  const words = (name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return '★'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

export function LogoFallback({ name, size = 88 }: { name: string | null | undefined; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 88 88"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={name ? `${name} logo` : 'Store logo'}
    >
      <circle cx="44" cy="44" r="41" fill="var(--brand)" stroke="var(--secondary)" strokeWidth="3" />
      <text
        x="44"
        y="45"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="ui-serif, Georgia, serif"
        fontWeight={700}
        fontSize="30"
        fill="var(--on-brand)"
      >
        {monogram(name)}
      </text>
    </svg>
  )
}
