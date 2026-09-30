import { useEffect, useMemo, useState } from 'react'
import { aroundOf } from '../engine/context.ts'
import { download, exportPdf } from '../export/exportPdf.ts'
import type { PdfInput } from '../export/pdf.ts'
import type { CompareResult, RepeatResult } from '../shared/types.ts'
import { runInWorker, type Run } from '../worker/client.ts'
import { AnalyzingScreen } from './AnalyzingScreen.tsx'
import { Modal, type ModalProps } from './Modal.tsx'
import { RepeatView } from './RepeatView.tsx'
import { CompareView, type AroundFn } from './CompareView.tsx'
import {
  chapterLabel,
  filterGroups,
  filterMatches,
  groupSpan,
  ordinal,
  sortGroups,
  sortMatches,
  TIER_LABEL,
  where,
  type CompareFilter,
  type Order,
  type RepeatFilter,
} from './results.ts'
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

/** A PDF being built: the page being drawn, or why it failed. */
interface PdfJob {
  run: Run<Blob>
  page: number
  pages: number
  error?: string
}

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
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState<Order>('chapter')
  const [pdf, setPdf] = useState<PdfJob | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

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
    setQuery('')
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

  // Findings carry offsets into the text the search ran on; the same slot builds the same text.
  const slotA = results?.a ?? null
  const slotB = results?.b ?? null
  const aroundA = useMemo(() => (slotA ? aroundOf(slotEngineText(slotA)) : null), [slotA])
  const aroundB = useMemo(() => (slotB ? aroundOf(slotEngineText(slotB)) : null), [slotB])

  // The report holds every finding, in the order the list shows, whatever the tab or search.
  const startPdf = (): void => {
    if (!results || !aroundA) return
    const run = exportPdf(pdfInput(results, order, aroundA, aroundB), (page, pages) =>
      setPdf((j) => (j && j.run === run ? { ...j, page, pages } : j)),
    )
    setPdf({ run, page: 0, pages: 0 })
    run.result.then(
      (blob) => {
        // "2026. 9. 30." ends in a dot; the name would read "30..pdf".
        download(blob, `유사도 검사 ${today().slice(0, -1)}.pdf`)
        setPdf((j) => (j?.run === run ? null : j))
      },
      (err: unknown) => {
        if (run.aborted) return
        setPdf((j) => (j?.run === run ? { ...j, error: String(err) } : j))
      },
    )
  }
  const closePdf = (): void => {
    pdf?.run.abort()
    setPdf(null)
  }

  const listProps = {
    query,
    onQuery: (q: string): void => {
      setQuery(q)
      setSelected(0)
    },
    selected,
    onSelect: setSelected,
    order,
    onOrder: (o: Order): void => {
      setOrder(o)
      setSelected(0)
    },
  }

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
              <button className="btn primary" onClick={startPdf} disabled={pdf !== null}>
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
            aroundA={aroundA!}
            aroundB={aroundB!}
            running={results.run !== null}
            stopped={results.stopped ?? false}
            filter={compareFilter}
            onFilter={(f) => {
              setCompareFilter(f)
              setSelected(0)
            }}
            {...listProps}
          />
        )}
        {results && results.result.kind === 'repeat' && (
          <RepeatView
            result={results.result}
            titleA={results.a.title}
            around={aroundA!}
            running={results.run !== null}
            stopped={results.stopped ?? false}
            filter={repeatFilter}
            onFilter={(f) => {
              setRepeatFilter(f)
              setSelected(0)
            }}
            {...listProps}
          />
        )}
      </main>
      {modal && <Modal {...modal} onNo={() => setModal(null)} />}
      {pdf && (
        <div className="modal">
          <div className="box">
            <h3>{pdf.error ? 'PDF를 만들지 못했어요' : 'PDF 만드는 중'}</h3>
            <p>
              {pdf.error ??
                (pdf.pages > 0
                  ? `${pdf.page.toLocaleString()} / ${pdf.pages.toLocaleString()}쪽`
                  : '쪽을 나누고 있어요…')}
            </p>
            {!pdf.error && (
              <div className="bar">
                <i style={{ width: `${pdf.pages > 0 ? (pdf.page / pdf.pages) * 100 : 0}%` }} />
              </div>
            )}
            <div className="acts">
              <button className="btn" onClick={closePdf}>
                {pdf.error ? '닫기' : '취소'}
              </button>
            </div>
          </div>
        </div>
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

/** Report data: every finding in list order, each side with the sentences around it. */
function pdfInput(
  r: { result: CompareResult | RepeatResult; a: Slot; b: Slot | null; stopped?: boolean },
  order: Order,
  aroundA: AroundFn,
  aroundB: AroundFn | null,
): PdfInput {
  const manuscripts = [
    { key: 'A' as const, title: manuscriptLine(r.a), files: r.a.files },
    ...(r.b ? [{ key: 'B' as const, title: manuscriptLine(r.b), files: r.b.files }] : []),
  ]
  const stopped: [string, string][] = r.stopped ? [['참고', '중단됨 · 검사한 곳까지의 결과']] : []
  const common = { date: today(), manuscripts }
  if (r.result.kind === 'compare') {
    const m = r.result.matches
    const b = aroundB ?? aroundA
    return {
      ...common,
      kind: 'compare',
      heading: '유사도 검사 결과',
      facts: [
        [
          '결과',
          `회차 쌍 ${m.length.toLocaleString()}개 · 거의 동일 ${filterMatches(m, 'near').length.toLocaleString()}개 · 일부 수정 ${filterMatches(m, 'edited').length.toLocaleString()}개`,
        ],
        ['정렬', order === 'chapter' ? '회차순' : '유사도순'],
        ...stopped,
      ],
      rows: sortMatches(m, order).map((x) => ({
        title: `A ${chapterLabel(x.a)} ↔ B ${chapterLabel(x.b)}`,
        tier: x.tier,
        note: `${TIER_LABEL[x.tier]} · 유사 문장 ${x.count}개 · 구간 ${x.runs}개${x.runs > x.passages.length ? ` (상위 ${x.passages.length}개)` : ''}`,
        passages: x.passages.map((p) => ({
          a: {
            label: `${chapterLabel(p.a.chapter)} · ${ordinal(p.a)}`,
            ...aroundA(p.a.start, p.a.end),
          },
          b: { label: `${chapterLabel(p.b.chapter)} · ${ordinal(p.b)}`, ...b(p.b.start, p.b.end) },
        })),
      })),
    }
  }
  const g = r.result.groups
  return {
    ...common,
    kind: 'repeat',
    heading: '내부 반복 검사 결과',
    facts: [
      [
        '결과',
        `반복 문장 ${g.length.toLocaleString()}개 · 3회 이상 ${filterGroups(g, 3).length.toLocaleString()}개 · 5회 이상 ${filterGroups(g, 5).length.toLocaleString()}개`,
      ],
      ['정렬', order === 'chapter' ? '회차순' : '반복 많은 순'],
      ...stopped,
    ],
    rows: sortGroups(g, order).map((x) => ({
      title: `${x.occurrences.length}회 · ${groupSpan(x)}`,
      places: x.occurrences.map((o) => ({
        label: o.chapter === null ? where(o) : `${where(o)} · ${ordinal(o)}`,
        ...aroundA(o.start, o.end),
      })),
    })),
  }
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
