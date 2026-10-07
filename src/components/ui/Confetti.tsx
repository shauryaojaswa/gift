import type { ReactNode } from 'react'

export function Confetti({ active = true, count = 12 }: { active?: boolean; count?: number }) {
  if (!active) return null
  const colors = ['#8A1428', '#D7A638', '#E53935', '#F5E7C6', '#B97D26', '#6E1522']
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => {
        const left = (i * (360 / count)) % 360
        const delay = (i * 70) % 1000
        const size = 6 + (i % 4) * 3
        const color = colors[i % colors.length]
        const x = 48 + (i % 2 === 0 ? -1 : 1) * (10 + (i % 5))
        return (
          <span
            key={i}
            className="confetti-piece absolute block rounded-full"
            style={{
              left: `${x}%`,
              top: '40%',
              width: `${size}px`,
              height: `${size}px`,
              backgroundColor: color,
              animation: `confetti-burst ${900 + (i % 3) * 180}ms ease-out ${delay}ms both`,
              transform: `rotate(${left}deg)`,
            }}
            aria-hidden="true"
          />
        )
      })}
      <style>{`
@media (prefers-reduced-motion: reduce) {
  .confetti-piece { animation: none !important; }
}
@keyframes confetti-burst {
  0% { transform: translateY(0) scale(0.5) rotate(0); opacity: 0; }
  15% { opacity: 1; }
  100% { transform: translateY(-180px) scale(1) rotate(360deg); opacity: 0; }
}
      `}</style>
    </div>
  )
}

export function FadeUp({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <div className="fade-up" style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  )
}
