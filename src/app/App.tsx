import { useState } from 'react'
import { CompareReport, RepeatReport } from '../export/Report.tsx'
import type { CompareResult, RepeatResult } from '../shared/types.ts'
import { runInWorker, type Run } from '../worker/client.ts'
import { AnalyzingScreen } from './AnalyzingScreen.tsx'
import { ExportOverlay } from './ExportOverlay.tsx'
import { Modal, type ModalProps } from './Modal.tsx'
import { CompareView, RepeatView } from './ResultsScreen.tsx'
import { filterGroups, filterPassages, type CompareFilter, type RepeatFilter } from './results.ts'
import {
  loadSlot,
  rangeLabel,
  RejectedFilesError,
  slotEngineText,
  slotBounds,
  type Slot,
} from './slot.ts'
import { StartScreen, type SlotView } from './StartScreen.tsx'

type Key = 'A' | 'B'

type Screen =
  | { kind: 'start' }
  | { kind: 'analyzing'; run: Run<CompareResult | RepeatResult>; pct: number; two: boolean }
  | { kind: 'results'; result: CompareResult | RepeatResult; a: Slot; b: Slot | null }

const REPO = 'https://github.com/jhste102lab/novel-similarity'
const HWP_MESSAGE = 'hwp는 열 수 없어요. 한글에서 hwpx로 저장해 주세요.'
const FORMAT_MESSAGE = 'txt, docx, hwpx 파일만 열 수 있어요.'

export function App() {
  const [two, setTwo] = useState(true)
  const [slots, setSlots] = useState<Record<Key, SlotView>>({
    A: { slot: null, error: null },
    B: { slot: null, error: null },
  })
  const [screen, setScreen] = useState<Screen>({ kind: 'start' })
  const [modal, setModal] = useState<Omit<ModalProps, 'onNo'> | null>(null)
  const [filter, setFilter] = useState<CompareFilter | RepeatFilter>('all')
  const [selected, setSelected] = useState(0)
  const [exporting, setExporting] = useState(false)

  const setSlot = (key: Key, view: SlotView): void => setSlots((s) => ({ ...s, [key]: view }))

  const onFiles = async (key: Key, files: File[]): Promise<void> => {
    if (files.length === 0) return
    try {
      setSlot(key, { slot: await loadSlot(files), error: null })
    } catch (err) {
      const message =
        err instanceof RejectedFilesError
          ? err.hwp
            ? HWP_MESSAGE
            : FORMAT_MESSAGE
          : '파일을 읽지 못했어요.'
      setSlot(key, { slot: null, error: message })
    }
  }

  const start = (): void => {
    const a = slots.A.slot
    if (!a) return
    const b = two ? slots.B.slot : null
    if (two && !b) return
    const range = (s: Slot) => (s.range && slotBounds(s) ? s.range : undefined)
    const onProgress = (pct: number): void =>
      setScreen((s) => (s.kind === 'analyzing' ? { ...s, pct } : s))
    const run = b
      ? runInWorker<CompareResult>(
          {
            type: 'compare',
            a: slotEngineText(a),
            b: slotEngineText(b),
            rangeA: range(a),
            rangeB: range(b),
          },
          onProgress,
        )
      : runInWorker<RepeatResult>(
          { type: 'repeat', a: slotEngineText(a), rangeA: range(a) },
          onProgress,
        )
    setScreen({ kind: 'analyzing', run, pct: 0, two: b !== null })
    run.result.then(
      (result) => {
        setFilter('all')
        setSelected(0)
        setScreen({ kind: 'results', result, a, b })
      },
      () => setScreen({ kind: 'start' }),
    )
  }

  const confirm = (title: string, text: string, onYes: () => void): void =>
    setModal({
      title,
      text,
      onYes: () => {
        setModal(null)
        onYes()
      },
    })

  const results = screen.kind === 'results' ? screen : null
  const isCompare = results?.result.kind === 'compare'

  return (
    <>
      <header className="top">
        <div className="logo">
          문장 · 문단 유사도 검사
          <a className="gh" href={REPO} title="GitHub" target="_blank" rel="noreferrer">
            <GithubIcon />
          </a>
        </div>
        <div className="r">
          {results && (
            <>
              <button
                className="btn text"
                onClick={() =>
                  confirm('새로 비교할까요?', '지금 결과는 사라집니다.', () =>
                    setScreen({ kind: 'start' }),
                  )
                }
              >
                새로 비교
              </button>
              <button className="btn primary" onClick={() => setExporting(true)}>
                내보내기
              </button>
            </>
          )}
        </div>
      </header>
      <main>
        {screen.kind === 'start' && (
          <StartScreen
            two={two}
            a={slots.A}
            b={slots.B}
            onToggleMode={() => setTwo(!two)}
            onFiles={onFiles}
            onChange={(key, slot) => setSlot(key, { slot, error: null })}
            onClear={(key) =>
              confirm(
                '원고를 비울까요?',
                `${slots[key].slot?.title ?? ''} — 파일 선택과 고친 회차가 사라집니다.`,
                () => setSlot(key, { slot: null, error: null }),
              )
            }
            onSwap={() => setSlots((s) => ({ A: s.B, B: s.A }))}
            onGo={start}
          />
        )}
        {screen.kind === 'analyzing' && (
          <AnalyzingScreen
            title={screen.two ? '비교하고 있어요' : '반복을 찾고 있어요'}
            subtitle={
              screen.two
                ? `${slots.A.slot?.title} ↔ ${slots.B.slot?.title}`
                : (slots.A.slot?.title ?? '')
            }
            pct={screen.pct}
            onAbort={() =>
              confirm('비교를 중단할까요?', '지금까지 진행한 내용은 사라집니다.', () =>
                screen.run.abort(),
              )
            }
          />
        )}
        {results && results.result.kind === 'compare' && (
          <CompareView
            result={results.result}
            titleA={results.a.title}
            titleB={results.b?.title ?? ''}
            rangeNote={rangeNote(results.a, results.b)}
            filter={filter as CompareFilter}
            onFilter={(f) => {
              setFilter(f)
              setSelected(0)
            }}
            selected={selected}
            onSelect={setSelected}
          />
        )}
        {results && results.result.kind === 'repeat' && (
          <RepeatView
            result={results.result}
            titleA={results.a.title}
            filter={filter as RepeatFilter}
            onFilter={(f) => {
              setFilter(f)
              setSelected(0)
            }}
            selected={selected}
            onSelect={setSelected}
          />
        )}
      </main>
      {modal && <Modal {...modal} onNo={() => setModal(null)} />}
      {exporting && results && (
        <ExportOverlay fileName={`유사도 검사 ${today()}`} onClose={() => setExporting(false)}>
          {isCompare ? (
            <CompareReport
              meta={{
                date: today(),
                a: manuscriptLine(results.a),
                b: results.b ? manuscriptLine(results.b) : undefined,
              }}
              all={(results.result as CompareResult).passages}
              rows={filterPassages(
                (results.result as CompareResult).passages,
                filter as CompareFilter,
              )}
            />
          ) : (
            <RepeatReport
              meta={{ date: today(), a: manuscriptLine(results.a) }}
              all={(results.result as RepeatResult).groups}
              rows={filterGroups((results.result as RepeatResult).groups, filter as RepeatFilter)}
            />
          )}
        </ExportOverlay>
      )}
    </>
  )
}

/** "A 401~500화 · B 전체", or null when both cover everything. */
function rangeNote(a: Slot, b: Slot | null): string | null {
  const parts = [rangeLabel('A', a), ...(b ? [rangeLabel('B', b)] : [])]
  return parts.every((p) => p.endsWith('전체')) ? null : parts.join(' · ')
}

function manuscriptLine(s: Slot): string {
  const b = slotBounds(s)
  return b === null ? s.title : `${s.title} · ${b[0] === 1 ? '' : `${b[0]}~`}${b[1]}화`
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  )
}
