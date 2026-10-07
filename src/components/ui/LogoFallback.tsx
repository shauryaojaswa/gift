export function LogoFallback({ name }: { name: string }) {
  return (
    <svg
      width="120"
      height="48"
      viewBox="0 0 120 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={name}
    >
      <rect x="2" y="2" width="116" height="44" rx="10" fill="hsl(40 80% 56%)" />
      <rect x="8" y="8" width="104" height="32" rx="6" fill="hsl(0 0% 100%)" />
      <text x="60" y="30" textAnchor="middle" fontSize="14" fontWeight={700} fill="hsl(355 85% 45%)" fontFamily="ui-serif,serif">
        {name?.slice(0, 20) ?? 'JE'}
      </text>
    </svg>
  )
}
