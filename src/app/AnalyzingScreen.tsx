import { useEffect, useState } from 'react'

interface Props {
  title: string
  subtitle: string
  pct: number
  onAbort: () => void
}

export function AnalyzingScreen({ title, subtitle, pct, onAbort }: Props) {
  const p = Math.round(pct * 100)
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="analyzing">
      <h2>{title}</h2>
      <p>{subtitle}</p>
      <div className="bar">
        <i style={{ width: `${p}%` }} />
      </div>
      <div className="pct">{p}%</div>
      <div className="elapsed">{seconds}초 경과</div>
      <button className="abort" onClick={onAbort}>
        <svg viewBox="0 0 24 24">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
        중단
      </button>
    </div>
  )
}
