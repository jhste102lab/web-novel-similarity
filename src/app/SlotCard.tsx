import { useEffect, useMemo, useRef, useState } from 'react'
import { filesFromDrop } from './dropFiles.ts'
import { RangeSlider } from './RangeSlider.tsx'
import { ruleLabel, slotBounds, slotInfo, type Slot } from './slot.ts'

interface Props {
  slotKey: 'A' | 'B'
  slot: Slot | null
  /** Rejection notice shown under the format hint. */
  error: string | null
  hint: string
  onFiles: (files: File[]) => void
  onChange: (slot: Slot) => void
  onClear: () => void
}

export function SlotCard(props: Props) {
  return props.slot ? <FilledCard {...props} slot={props.slot} /> : <EmptyCard {...props} />
}

function EmptyCard({ slotKey, error, hint, onFiles }: Props) {
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  return (
    <div
      className={`slot ${over ? 'over' : ''}`}
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        e.preventDefault()
        setOver(false)
        onFiles(await filesFromDrop(e.dataTransfer))
      }}
    >
      <input
        ref={input}
        type="file"
        multiple
        accept=".txt,.docx,.hwp,.hwpx"
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
      <div className="name">원고 {slotKey}</div>
      <div className="fmt">{hint}</div>
      {error && <div className="err">{error}</div>}
    </div>
  )
}

type SortKey = 'name' | 'date' | 'chapter' | 'chars'

function FilledCard({ slot, onChange, onClear }: Props & { slot: Slot }) {
  const { manuscript, labels } = slot
  const dated = manuscript.rule === 'filename-number' || manuscript.rule === 'filename-order'
  const editable = manuscript.rule !== 'none'
  const bounds = slotBounds(slot)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null)
  const [fillFrom, setFillFrom] = useState<number | null>(null)
  const [hit, setHit] = useState<{ index: number; nonce: number } | null>(null)
  const badCursor = useRef(0)
  const box = useRef<HTMLDivElement>(null)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  const order = useMemo(() => {
    const idx = manuscript.parts.map((_, i) => i)
    if (!sort) return idx
    const collator = new Intl.Collator('ko', { numeric: true })
    const val = (i: number): string | number => {
      const p = manuscript.parts[i]!
      if (sort.key === 'name') return p.name
      if (sort.key === 'date') return p.lastModified ?? 0
      if (sort.key === 'chars') return p.text.length
      return labels[i] ?? Number.POSITIVE_INFINITY
    }
    idx.sort((x, y) => {
      const a = val(x)
      const b = val(y)
      const c = typeof a === 'string' ? collator.compare(a, String(b)) : a - (b as number)
      return sort.dir === 'asc' ? c : -c
    })
    return idx
  }, [manuscript, labels, sort])

  const bad = editable ? labels.filter((l) => l === null).length : 0
  const dirty = labels.some((l, i) => l !== manuscript.parts[i]!.label)
  const setLabels = (next: (number | null)[]): void => onChange({ ...slot, labels: next })

  const commit = (i: number, raw: string): void => {
    const v = raw.replace(/\D/g, '')
    const next = [...labels]
    next[i] = v ? Number(v) : null
    setLabels(next)
    // Offer fill-down after four consecutive values ending at this row.
    let run = 0
    for (let j = i; j > 0 && next[j] !== null && next[j - 1] === next[j]! - 1; j--) run++
    setFillFrom(run >= 3 && i < next.length - 1 ? i : null)
  }
  const fillDown = (): void => {
    if (fillFrom === null) return
    const base = labels[fillFrom]!
    setLabels(labels.map((l, j) => (j > fillFrom ? base + (j - fillFrom) : l)))
    setFillFrom(null)
  }
  const reset = (): void => {
    setLabels(manuscript.parts.map((p) => p.label))
    setFillFrom(null)
  }
  const jumpToBad = (): void => {
    const bads = labels.map((l, i) => (l === null ? i : -1)).filter((i) => i >= 0)
    if (bads.length === 0) return
    setHit({ index: bads[badCursor.current++ % bads.length]!, nonce: Date.now() })
  }
  useEffect(() => {
    if (!hit) return
    const input = inputs.current[hit.index]
    input?.focus()
    input?.select()
    input?.closest('div')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [hit])
  const scrollToRangeStart = (): void => {
    const el = box.current
    if (!el || !slot.range) return
    const row = el.querySelector<HTMLElement>('div[data-in="1"]')
    if (!row) return
    const fh = el.querySelector<HTMLElement>('.fh')?.offsetHeight ?? 0
    el.scrollTo({
      top: row.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - fh,
      behavior: 'smooth',
    })
  }

  const head = (key: SortKey, label: string) => (
    <span
      className={sort?.key === key ? sort.dir : ''}
      onClick={() =>
        setSort({ key, dir: sort?.key === key && sort.dir === 'asc' ? 'desc' : 'asc' })
      }
    >
      {label}
    </span>
  )

  return (
    <div className="slot filled">
      <button className="x" title="비우기" onClick={onClear}>
        ×
      </button>
      <input
        className="name"
        value={slot.title}
        spellCheck={false}
        onChange={(e) => onChange({ ...slot, title: e.target.value })}
      />
      <div className="info">{slotInfo(slot)}</div>
      <div className="rule">
        회차 · <b>{ruleLabel(slot)}</b>
        {bad > 0 && (
          <span className="warn" onClick={jumpToBad}>
            회차 못 읽음 {bad}개
          </span>
        )}
        <span className="acts">
          {fillFrom !== null && (
            <button className="fill" onClick={fillDown}>
              아래 {labels.length - 1 - fillFrom}개 이어서 채우기
            </button>
          )}
          {dirty && (
            <button className="reset" onClick={reset}>
              되돌리기
            </button>
          )}
        </span>
      </div>
      {bounds && bounds[1] > bounds[0] && (
        <RangeSlider
          min={bounds[0]}
          max={bounds[1]}
          value={slot.range ?? bounds}
          onChange={(range) => onChange({ ...slot, range })}
          onCommit={scrollToRangeStart}
        />
      )}
      <div className={`files ${dated ? 'dated' : ''}`} ref={box}>
        <div className="fh">
          {head('name', dated ? '파일' : '첫 문장')}
          {dated && head('date', '파일 수정일')}
          {head('chapter', '회차')}
          {head('chars', '글자 수')}
        </div>
        {order.map((i) => {
          const p = manuscript.parts[i]!
          const label = labels[i] ?? null
          const inRange =
            !slot.range || label === null || (label >= slot.range[0] && label <= slot.range[1])
          return (
            <div
              key={hit?.index === i ? `${i}-${hit.nonce}` : i}
              className={`${inRange ? '' : 'out'} ${hit?.index === i ? 'hit' : ''}`}
              data-in={inRange && label !== null ? 1 : 0}
            >
              <span title={p.name}>{p.name}</span>
              {dated && <span className="dt">{formatDate(p.lastModified)}</span>}
              {editable ? (
                <span className={`ch ${label === null ? 'bad' : ''}`}>
                  <input
                    ref={(el) => {
                      inputs.current[i] = el
                    }}
                    key={label ?? '?'}
                    defaultValue={label ?? ''}
                    placeholder="?"
                    inputMode="numeric"
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const next = inputs.current[order[order.indexOf(i) + 1] ?? -1]
                        if (next) next.focus()
                        else e.currentTarget.blur()
                      } else if (e.key.length === 1 && !/\d/.test(e.key)) e.preventDefault()
                    }}
                    onBlur={(e) => commit(i, e.target.value)}
                  />
                  {label !== null && '화'}
                </span>
              ) : (
                <span className="ch" style={{ cursor: 'default', color: 'var(--meta)' }}>
                  —
                </span>
              )}
              <span>{p.text.length.toLocaleString()}자</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatDate(ms: number | null): string {
  if (ms === null) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}
