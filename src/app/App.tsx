import { useEffect, useState } from 'react'
import { CompareReport, RepeatReport } from '../export/Report.tsx'
import { MAX_PASSAGES_PER_MATCH } from '../shared/constants.ts'
import type { CompareResult, RepeatResult } from '../shared/types.ts'
import { runInWorker, type Run } from '../worker/client.ts'
import { AnalyzingScreen } from './AnalyzingScreen.tsx'
import { ExportOverlay } from './ExportOverlay.tsx'
import { Modal, type ModalProps } from './Modal.tsx'
import { RepeatView } from './RepeatView.tsx'
import { CompareView } from './CompareView.tsx'
import { filterGroups, filterMatches, type CompareFilter, type RepeatFilter } from './results.ts'
import {
  FileReadError,
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
  | {
      kind: 'results'
      result: CompareResult | RepeatResult
      a: Slot
      b: Slot | null
      /** Set while findings are still streaming in; null once the run finished. */
      run: Run<CompareResult | RepeatResult> | null
      pct: number
      /** True when the user stopped the run, so the findings are only what was scanned. */
      stopped?: boolean
    }

const REPO = 'https://github.com/jhste102lab/web-novel-similarity'

export function App() {
  const [two, setTwo] = useState(false)
  const [slots, setSlots] = useState<Record<Key, SlotView>>({
    A: { slot: null, error: null },
    B: { slot: null, error: null },
  })
  const [screen, setScreen] = useState<Screen>({ kind: 'start' })
  const [modal, setModal] = useState<Omit<ModalProps, 'onNo'> | null>(null)
  const [compareFilter, setCompareFilter] = useState<CompareFilter>('all')
  const [repeatFilter, setRepeatFilter] = useState<RepeatFilter>('all')
  const [selected, setSelected] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [perMatch, setPerMatch] = useState(MAX_PASSAGES_PER_MATCH)

  // Nothing is saved, so leaving the page (reload, close, back) loses the loaded files and
  // results; the browser asks first.
  const unsaved = slots.A.slot !== null || slots.B.slot !== null || screen.kind !== 'start'
  useEffect(() => {
    if (!unsaved) return
    const ask = (e: BeforeUnloadEvent): void => e.preventDefault()
    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [unsaved])

  const setSlot = (key: Key, view: SlotView): void => setSlots((s) => ({ ...s, [key]: view }))

  const onFiles = async (key: Key, files: File[]): Promise<void> => {
    if (files.length === 0) return
    try {
      setSlot(key, { slot: await loadSlot(files), error: null })
    } catch (err) {
      setSlot(key, { slot: null, error: fileError(err) })
    }
  }

  const start = (): void => {
    const a = slots.A.slot
    if (!a) return
    const b = two ? slots.B.slot : null
    if (two && !b) return
    const range = (s: Slot) => (s.range && slotBounds(s) ? s.range : undefined)
    const onProgress = (pct: number): void =>
      setScreen((s) => (s.kind === 'analyzing' || s.kind === 'results' ? { ...s, pct } : s))
    // The first findings replace the progress screen, so review starts before the scan ends.
    const onPartial = (result: CompareResult | RepeatResult): void =>
      setScreen((s) =>
        s.kind === 'analyzing'
          ? { kind: 'results', result, a, b, run: s.run, pct: s.pct }
          : s.kind === 'results' && s.run
            ? { ...s, result }
            : s,
      )
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
          onPartial,
        )
      : runInWorker<RepeatResult>(
          { type: 'repeat', a: slotEngineText(a), rangeA: range(a) },
          onProgress,
          onPartial,
        )
    setRunError(null)
    setCompareFilter('all')
    setRepeatFilter('all')
    setSelected(0)
    setScreen({ kind: 'analyzing', run, pct: 0, two: b !== null })
    run.result.then(
      (result) => setScreen({ kind: 'results', result, a, b, run: null, pct: 1 }),
      (err: unknown) => {
        // Aborting rejects too. Findings already streamed in stay on screen; only a real
        // failure, or an abort before the first finding, goes back to the start.
        if (run.aborted) {
          setScreen((s) =>
            s.kind === 'results' ? { ...s, run: null, stopped: true } : { kind: 'start' },
          )
          return
        }
        setRunError(`검사를 끝내지 못했어요. ${String(err)}`)
        setScreen({ kind: 'start' })
      },
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

  // The header title leads back to the start screen; loaded files stay, results go.
  const goHome = (): void => {
    if (screen.kind === 'start') return
    const run = screen.run
    confirm(
      run ? '검사를 중단하고 처음으로 갈까요?' : '처음으로 갈까요?',
      run ? '지금까지 찾은 결과는 사라집니다.' : '지금 결과는 사라집니다.',
      () => {
        run?.abort()
        setScreen({ kind: 'start' })
      },
    )
  }

  const results = screen.kind === 'results' ? screen : null

  return (
    <>
      <header className="top">
        <div className="logo">
          <button className="home" onClick={goHome}>
            웹소설 문장 · 문단 유사도 검사
          </button>
          <a className="gh" href={REPO} title="GitHub" target="_blank" rel="noreferrer">
            <GithubIcon />
          </a>
        </div>
        <div className="r">
          {results?.run && (
            <>
              <span className="scanning">
                검사 중 {Math.round(results.pct * 100)}%
                <i style={{ width: `${Math.round(results.pct * 100)}%` }} />
              </span>
              <button className="btn text" onClick={() => results.run?.abort()}>
                중단
              </button>
            </>
          )}
          {results && !results.run && (
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
            runError={runError}
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
            running={results.run !== null}
            stopped={results.stopped ?? false}
            filter={compareFilter}
            onFilter={(f) => {
              setCompareFilter(f)
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
            running={results.run !== null}
            stopped={results.stopped ?? false}
            filter={repeatFilter}
            onFilter={(f) => {
              setRepeatFilter(f)
              setSelected(0)
            }}
            selected={selected}
            onSelect={setSelected}
          />
        )}
      </main>
      {modal && <Modal {...modal} onNo={() => setModal(null)} />}
      {exporting && results && (
        <ExportOverlay
          fileName={`유사도 검사 ${today()}`}
          onClose={() => setExporting(false)}
          options={
            results.result.kind === 'compare' && (
              <label className="opt">
                회차당 문장
                <select value={perMatch} onChange={(e) => setPerMatch(Number(e.target.value))}>
                  <option value={MAX_PASSAGES_PER_MATCH}>전체</option>
                  <option value={5}>5개</option>
                  <option value={1}>1개</option>
                </select>
              </label>
            )
          }
        >
          {results.result.kind === 'compare' ? (
            <CompareReport
              meta={{
                date: today(),
                a: manuscriptLine(results.a),
                b: results.b ? manuscriptLine(results.b) : undefined,
              }}
              all={results.result.matches}
              rows={filterMatches(results.result.matches, compareFilter)}
              perMatch={perMatch}
            />
          ) : (
            <RepeatReport
              meta={{ date: today(), a: manuscriptLine(results.a) }}
              all={results.result.groups}
              rows={filterGroups(results.result.groups, repeatFilter)}
            />
          )}
        </ExportOverlay>
      )}
    </>
  )
}

/** Slot notice for a failed drop, naming the file so one bad file among hundreds can be found. */
function fileError(err: unknown): string {
  if (err instanceof RejectedFilesError) {
    const more = err.names.length > 1 ? ` 외 ${err.names.length - 1}개` : ''
    return `‘${err.names[0]}’${more}: txt, docx, hwp, hwpx 파일만 열 수 있어요.`
  }
  if (err instanceof FileReadError)
    return err.encrypted
      ? `‘${err.fileName}’ 파일은 암호가 걸려 있어요. 한글에서 암호를 풀고 다시 저장해 주세요.`
      : `‘${err.fileName}’ 파일을 읽지 못했어요.`
  return '파일을 읽지 못했어요.'
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
