import { Plane } from "lucide-react"

export default function Loading() {
  return (
    <div
      aria-label="載入中"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
      }}
    >
      <Plane
        size={48}
        style={{
          color: 'var(--color-primary)',
          animation: 'planeFly 2s ease-in-out infinite',
          filter: 'drop-shadow(0 4px 12px rgba(14,165,233,0.3))',
        }}
      />
      <style>{`
        @keyframes planeFly {
          0%, 100% { transform: translateY(0) rotate(-5deg); }
          50% { transform: translateY(-12px) rotate(-5deg); }
        }
      `}</style>
    </div>
  )
}
