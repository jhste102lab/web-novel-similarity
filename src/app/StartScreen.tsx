import { SlotCard } from './SlotCard.tsx'
import type { Slot } from './slot.ts'

export interface SlotView {
  slot: Slot | null
  error: string | null
  /** Set while dropped files are being read. */
  loading?: { done: number; total: number }
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
      <div className="sub">
        올려주신 파일은 사용자의 브라우저로만 처리되며 외부 서버로 전송되지 않습니다.
      </div>
      <div className={`slots ${two ? '' : 'one'}`}>
        <SlotCard
          slotKey="A"
          slot={a.slot}
          error={a.error}
          loading={a.loading}
          hint="txt · docx · hwp · hwpx"
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
              loading={b.loading}
              hint="txt · docx · hwp · hwpx"
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
