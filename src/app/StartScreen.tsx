import { SlotCard } from './SlotCard.tsx'
import type { Slot } from './slot.ts'

export interface SlotView {
  slot: Slot | null
  error: string | null
}

interface Props {
  two: boolean
  a: SlotView
  b: SlotView
  onToggleMode: () => void
  onFiles: (key: 'A' | 'B', files: File[]) => void
  onChange: (key: 'A' | 'B', slot: Slot) => void
  onClear: (key: 'A' | 'B') => void
  onSwap: () => void
  onGo: () => void
  /** Why the last run failed, shown above the button. */
  runError: string | null
}

export function StartScreen({
  two,
  a,
  b,
  onToggleMode,
  onFiles,
  onChange,
  onClear,
  onSwap,
  onGo,
  runError,
}: Props) {
  const ready = a.slot !== null && (!two || b.slot !== null)
  return (
    <div className="start">
      <div className={`mode ${two ? 'on' : ''}`} onClick={onToggleMode}>
        <span className="sw" />
        <span className="off">원고 두 개 비교</span>
      </div>
      <h1>원고를 올려 주세요</h1>
      <div className="sub">파일은 서버에 저장하지 않고 사용자의 브라우저에서만 처리됩니다</div>
      <div className={`slots ${two ? '' : 'one'}`}>
        <SlotCard
          slotKey="A"
          slot={a.slot}
          error={a.error}
          hint="txt · docx · hwpx"
          onFiles={(f) => onFiles('A', f)}
          onChange={(s) => onChange('A', s)}
          onClear={() => onClear('A')}
        />
        {two && (
          <>
            <button className="swap" title="A ↔ B" disabled={!a.slot || !b.slot} onClick={onSwap}>
              <svg viewBox="0 0 24 24">
                <path d="M4 8h14l-3-3M20 16H6l3 3" />
              </svg>
            </button>
            <SlotCard
              slotKey="B"
              slot={b.slot}
              error={b.error}
              hint="txt · docx · hwpx"
              onFiles={(f) => onFiles('B', f)}
              onChange={(s) => onChange('B', s)}
              onClear={() => onClear('B')}
            />
          </>
        )}
      </div>
      <div className="go">
        {runError && <div className="run-err">{runError}</div>}
        <button className="btn primary lg" disabled={!ready} onClick={onGo}>
          {two ? '비교하기' : '반복 찾기'}
        </button>
      </div>
    </div>
  )
}
