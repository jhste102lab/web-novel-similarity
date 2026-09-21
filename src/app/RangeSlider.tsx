import type { ChapterRange } from '../shared/types.ts'

interface Props {
  min: number
  max: number
  value: ChapterRange
  onChange: (r: ChapterRange) => void
  /** Fired when a handle is released or a typed endpoint is confirmed. */
  onCommit: () => void
}

export function RangeSlider({ min, max, value: [lo, hi], onChange, onCommit }: Props) {
  const set = (a: number, b: number): void => onChange(a <= b ? [a, b] : [b, a])
  const clamp = (raw: string): number =>
    Math.min(max, Math.max(min, Number(raw.replace(/\D/g, '')) || min))
  const pct = (v: number): number => (max > min ? ((v - min) / (max - min)) * 100 : 0)
  const digitsOnly = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') e.currentTarget.blur()
    else if (e.key.length === 1 && !/\d/.test(e.key)) e.preventDefault()
  }
  return (
    <div className="range">
      <span className="lbl">검사 범위</span>
      <span className="lo">
        <input
          key={lo}
          defaultValue={lo}
          inputMode="numeric"
          onKeyDown={digitsOnly}
          onBlur={(e) => {
            set(clamp(e.target.value), hi)
            onCommit()
          }}
        />
      </span>
      <div className="track">
        <i style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
        <input
          type="range"
          min={min}
          max={max}
          value={lo}
          onChange={(e) => set(Number(e.target.value), hi)}
          onMouseUp={onCommit}
          onTouchEnd={onCommit}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={hi}
          onChange={(e) => set(lo, Number(e.target.value))}
          onMouseUp={onCommit}
          onTouchEnd={onCommit}
        />
      </div>
      <span className="hi">
        <input
          key={hi}
          defaultValue={hi}
          inputMode="numeric"
          onKeyDown={digitsOnly}
          onBlur={(e) => {
            set(lo, clamp(e.target.value))
            onCommit()
          }}
        />
      </span>
      <span
        className="all"
        hidden={lo === min && hi === max}
        onClick={() => {
          onChange([min, max])
          onCommit()
        }}
      >
        전체
      </span>
    </div>
  )
}
