import type { Around } from '../engine/context.ts'
import { charDiff } from '../engine/diff.ts'
import type { Tier } from '../shared/types.ts'

/** Everything a report holds, as plain data so it can be posted to the PDF worker. */
export interface PdfManuscript {
  key: 'A' | 'B'
  /** "샘플원고 · 40화" */
  title: string
  files: string[]
}
/** One side of a finding: "12화 · 3번째 문장" and the text with its neighbours. */
export interface PdfSide extends Around {
  label: string
}
export interface PdfMatch {
  /** "A 12화 ↔ B 15화" */
  title: string
  tier: Tier
  /** "거의 동일 · 유사 문장 12개 · 구간 3개" */
  note: string
  passages: { a: PdfSide; b: PdfSide }[]
}
export interface PdfGroup {
  /** "6회 · 27화~39화" */
  title: string
  places: PdfSide[]
}
interface PdfCommon {
  heading: string
  date: string
  manuscripts: PdfManuscript[]
  /** Label/value lines under the manuscripts on the first page. */
  facts: [string, string][]
}
export type PdfInput =
  | (PdfCommon & { kind: 'compare'; rows: PdfMatch[] })
  | (PdfCommon & { kind: 'repeat'; rows: PdfGroup[] })

/** The part of a PDFKit document the layout uses; also lets it run without drawing. */
export interface Canvas {
  addPage(): void
  text(text: string, x: number, y: number, size: number, color: string): void
  rect(x: number, y: number, w: number, h: number, color: string): void
  circle(x: number, y: number, r: number, color: string): void
  /** Advance width of one character at size 1. */
  width(ch: string): number
}

// A4 in points; ~14 mm side margins.
const PAGE_W = 595.28
const PAGE_H = 841.89
const LEFT = 40
const RIGHT = PAGE_W - 40
const WIDTH = RIGHT - LEFT
const TOP = 56
const BOTTOM = PAGE_H - 52
const GAP = 16
const COL = (WIDTH - GAP) / 2
const PLACE_W = 92

const BODY = 9
const LINE = 14.5
const SMALL = 7.5

const INK = '#1f2430'
const META = '#6a7182'
const CTX = '#8b919e'
const RULE = '#dfe2e9'
const BAND = '#eef0f4'
const MARK = '#fbe7b5'
const TIER: Record<Tier, string> = { near: '#c42b1f', edited: '#a86a00' }

type Style = 'ctx' | 'own' | 'eq'
interface Run {
  text: string
  style: Style
}
interface Seg extends Run {
  x: number
  w: number
}
type Line = Seg[]

const COLOR: Record<Style, string> = { ctx: CTX, own: INK, eq: INK }
const TOKEN = /\n|[^\S\n]+|\S+/gu

class Layout {
  page = 0
  y = TOP
  private widths = new Map<string, number>()
  private drained = 0

  /** Null while counting pages: nothing is drawn. */
  readonly c: Canvas | null
  private measure: Canvas
  private pages: number
  private header: string
  private date: string
  private onPage: (page: number) => void

  constructor(
    c: Canvas | null,
    measure: Canvas,
    pages: number,
    header: string,
    date: string,
    onPage: (page: number) => void,
  ) {
    this.c = c
    this.measure = measure
    this.pages = pages
    this.header = header
    this.date = date
    this.onPage = onPage
  }

  width(s: string, size: number): number {
    let w = 0
    for (const ch of s) {
      let v = this.widths.get(ch)
      if (v === undefined) {
        v = this.measure.width(ch)
        this.widths.set(ch, v)
      }
      w += v
    }
    return w * size
  }

  /** Cuts `s` to `max` points, ending in "…". */
  fit(s: string, max: number, size: number): string {
    if (this.width(s, size) <= max) return s
    let out = ''
    for (const ch of s) {
      if (this.width(out + ch + '…', size) > max) break
      out += ch
    }
    return out + '…'
  }

  newPage(): void {
    this.page++
    this.y = TOP
    this.onPage(this.page)
    const c = this.c
    if (!c) return
    c.addPage()
    c.text(this.fit(this.header, WIDTH, SMALL), LEFT, 30, SMALL, META)
    c.rect(LEFT, 38, WIDTH, 0.5, RULE)
    c.rect(LEFT, PAGE_H - 40, WIDTH, 0.5, RULE)
    c.text(`${this.page} / ${this.pages}`, LEFT, PAGE_H - 26, 8, META)
    const d = this.fit(this.date, WIDTH / 2, 8)
    c.text(d, RIGHT - this.width(d, 8), PAGE_H - 26, 8, META)
  }

  /** Starts a new page unless `h` more points fit; true when it did. */
  need(h: number): boolean {
    if (this.page > 0 && this.y + h <= BOTTOM) return false
    this.newPage()
    return true
  }

  /**
   * Lets PDFKit hand its output over. It queues each written chunk and drains the queue in a
   * microtask; drawing thousands of pages without yielding left millions queued, and draining
   * them one `shift()` at a time took minutes.
   */
  async breathe(): Promise<void> {
    if (this.page - this.drained < 10) return
    this.drained = this.page
    await Promise.resolve()
  }

  /** Greedy wrap by words; a word wider than the line is split between characters. */
  wrap(runs: Run[], max: number, size: number): Line[] {
    const lines: Line[] = []
    let line: Line = []
    let x = 0
    const push = (text: string, style: Style, w: number): void => {
      const last = line.at(-1)
      if (last && last.style === style) {
        last.text += text
        last.w += w
      } else line.push({ text, style, x, w })
      x += w
    }
    const breakLine = (): void => {
      lines.push(line)
      line = []
      x = 0
    }
    for (const run of runs) {
      for (const [tok] of run.text.matchAll(TOKEN)) {
        if (tok === '\n') {
          if (line.length > 0) breakLine()
          continue
        }
        const w = this.width(tok, size)
        if (/^\s/u.test(tok)) {
          if (line.length > 0) push(' ', run.style, this.width(' ', size))
          continue
        }
        if (x + w <= max) {
          push(tok, run.style, w)
          continue
        }
        if (w <= max && line.length > 0) {
          breakLine()
          push(tok, run.style, w)
          continue
        }
        for (const ch of tok) {
          const cw = this.width(ch, size)
          if (x + cw > max && line.length > 0) breakLine()
          push(ch, run.style, cw)
        }
      }
    }
    if (line.length > 0) lines.push(line)
    return lines
  }

  drawLine(line: Line, x: number, y: number, size: number): void {
    const c = this.c
    if (!c) return
    for (const s of line) {
      if (s.style === 'eq') c.rect(x + s.x, y - size * 0.95, s.w, size * 1.35, MARK)
      c.text(s.text, x + s.x, y, size, COLOR[s.style])
    }
  }

  /** Label on the left, wrapped value on the right (first page). */
  fact(label: string, value: string): void {
    const lines = this.wrap([{ text: value, style: 'own' }], WIDTH - 80, BODY)
    for (const [i, l] of lines.entries()) {
      this.need(LINE)
      this.y += LINE
      if (i === 0) this.c?.text(label, LEFT, this.y, 8.5, META)
      this.drawLine(l, LEFT + 80, this.y, BODY)
    }
  }

  /** Grey band with a tier dot, a title and a note on the right. */
  band(title: string, note: string, tier: Tier | null): void {
    const h = 24
    const c = this.c
    if (c) {
      c.rect(LEFT, this.y, WIDTH, h, BAND)
      if (tier) c.circle(LEFT + 11, this.y + h / 2, 3, TIER[tier])
      const tx = LEFT + (tier ? 20 : 10)
      const noteW = this.width(note, 8)
      c.text(this.fit(title, WIDTH - noteW - 40, 10), tx, this.y + 16, 10, INK)
      c.text(note, RIGHT - 10 - noteW, this.y + 15.5, 8, META)
    }
    this.y += h + 4
  }

  rule(): void {
    this.c?.rect(LEFT, this.y, WIDTH, 0.5, RULE)
  }
}

function runs(side: Around, mid: Run[]): Run[] {
  return [
    ...(side.before ? [{ text: side.before + ' ', style: 'ctx' as const }] : []),
    ...mid,
    ...(side.after ? [{ text: ' ' + side.after, style: 'ctx' as const }] : []),
  ]
}

/** One side of a diff as runs: text both sides share is 'eq' (marked), this side's own is 'own'. */
function diffRuns(a: string, b: string, side: 'a' | 'b'): Run[] {
  const other = side === 'a' ? 'ins' : 'del'
  return charDiff(a, b)
    .filter((d) => d.op !== other)
    .map((d) => ({ text: d.text, style: d.op === 'eq' ? 'eq' : 'own' }))
}

function cover(l: Layout, input: PdfInput): void {
  l.need(40)
  l.y += 22
  l.c?.text(input.heading, LEFT, l.y, 18, INK)
  l.y += 14
  l.fact('검사일', input.date)
  for (const m of input.manuscripts) {
    l.fact(`원고 ${m.key}`, m.title)
    l.fact(`${m.key} 파일 ${m.files.length.toLocaleString()}개`, m.files.join(', '))
  }
  for (const [k, v] of input.facts) l.fact(k, v)
  // Legend: what the colours mean.
  l.need(LINE * 2)
  l.y += LINE * 1.6
  const c = l.c
  const legend = [
    ['겹치는 부분', 'eq'],
    ['앞뒤 문장', 'ctx'],
  ] as const
  let x = LEFT
  for (const [text, style] of legend) {
    const w = l.width(text, 8.5)
    if (style === 'eq') c?.rect(x - 3, l.y - 9, w + 6, 12.5, MARK)
    c?.text(text, x, l.y, 8.5, style === 'eq' ? INK : CTX)
    x += w + 24
  }
  l.y += 20
}

async function compareBody(l: Layout, rows: PdfMatch[]): Promise<void> {
  for (const m of rows) {
    l.need(24 + 4 + 14 + LINE * 2)
    l.band(m.title, m.note, m.tier)
    for (const p of m.passages) {
      await l.breathe()
      const a = l.wrap(runs(p.a, diffRuns(p.a.text, p.b.text, 'a')), COL, BODY)
      const b = l.wrap(runs(p.b, diffRuns(p.a.text, p.b.text, 'b')), COL, BODY)
      if (l.need(14 + LINE * 2)) l.band(`${m.title} (계속)`, m.note, m.tier)
      l.y += 10
      l.c?.text(l.fit(`A · ${p.a.label}`, COL, SMALL), LEFT, l.y, SMALL, META)
      l.c?.text(l.fit(`B · ${p.b.label}`, COL, SMALL), LEFT + COL + GAP, l.y, SMALL, META)
      l.y += 2
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (l.need(LINE)) l.band(`${m.title} (계속)`, m.note, m.tier)
        l.y += LINE
        if (a[i]) l.drawLine(a[i]!, LEFT, l.y, BODY)
        if (b[i]) l.drawLine(b[i]!, LEFT + COL + GAP, l.y, BODY)
      }
      l.y += 8
      l.rule()
    }
    l.y += 14
  }
}

async function repeatBody(l: Layout, rows: PdfGroup[]): Promise<void> {
  for (const g of rows) {
    l.need(24 + 4 + LINE * 2)
    l.band(g.title, '', null)
    for (const p of g.places) {
      await l.breathe()
      const lines = l.wrap(runs(p, [{ text: p.text, style: 'eq' }]), WIDTH - PLACE_W, BODY)
      const label = l.wrap([{ text: p.label, style: 'own' }], PLACE_W - 10, 8)
      if (l.need(LINE * 2)) l.band(`${g.title} (계속)`, '', null)
      l.y += 4
      for (let i = 0; i < Math.max(lines.length, label.length); i++) {
        if (l.need(LINE)) l.band(`${g.title} (계속)`, '', null)
        l.y += LINE
        if (label[i]) for (const s of label[i]!) l.c?.text(s.text, LEFT + s.x, l.y, 8, META)
        if (lines[i]) l.drawLine(lines[i]!, LEFT + PLACE_W, l.y, BODY)
      }
      l.y += 7
      l.rule()
    }
    l.y += 14
  }
}

async function run(l: Layout, input: PdfInput): Promise<void> {
  cover(l, input)
  if (input.kind === 'compare') await compareBody(l, input.rows)
  else await repeatBody(l, input.rows)
}

/** Running header: "A 원본.txt ↔ B 편집본.txt"; a many-file manuscript shows its first file. */
function headerOf(input: PdfInput): string {
  return input.manuscripts
    .map((m) => {
      const f = m.files.length > 1 ? `${m.files[0]} 외 ${m.files.length - 1}개` : (m.files[0] ?? '')
      return `${m.key} ${f}`
    })
    .join('  ↔  ')
}

/**
 * Lays the report out twice: once without drawing to count pages (the footer says "n / N"),
 * then onto `canvas`. `onPage` reports each page of the drawing pass.
 */
export async function renderPdf(
  input: PdfInput,
  canvas: Canvas,
  onPage: (page: number, pages: number) => void,
): Promise<number> {
  const header = headerOf(input)
  const count = new Layout(null, canvas, 0, header, input.date, () => {})
  await run(count, input)
  const pages = count.page
  await run(new Layout(canvas, canvas, pages, header, input.date, (p) => onPage(p, pages)), input)
  return pages
}
