import { charDiff } from '../engine/diff.ts'
import type { Tier } from '../shared/types.ts'

/** Everything a report holds, as plain data so it can be posted to the PDF worker. */
export interface PdfManuscript {
  key: 'A' | 'B'
  /** "샘플원고 · 40화" */
  title: string
  files: string[]
}
/** Grey context, or a finding: marked where it shares text with `other`, all of it when null. */
export interface PdfPiece {
  text: string
  other?: string | null
}
/** One box: "원본.txt · 12화 · 3·5번째 문장" and its text in reading order. */
export interface PdfSide {
  label: string
  /** The other side's sentences it matched: "↔ B 6·30번째 문장". */
  link?: string
  pieces: PdfPiece[]
}
/**
 * Stretches of one chapter pair linked by findings, each text once, in rows of boxes; a row
 * pairs an A stretch with a B stretch it matched where it can, a side runs out with null.
 */
export type PdfBlock = { a: PdfSide | null; b: PdfSide | null }[]
export interface PdfMatch {
  /** "원본.txt · 12화", one per side. */
  a: string
  b: string
  tier: Tier
  blocks: PdfBlock[]
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
/** Label column of the first-page table. */
const LABEL_W = 92
/** Inner padding of a passage column. */
const PAD = 8
/** Chip and label row on top of a passage column. */
const HEAD = 20
/** Extra heading row for the matched sentences of the other side. */
const LINK = 11

const BODY = 9
const LINE = 14.5
const SMALL = 7.5
/** Baseline of text in a LINE-high row, from the row top. */
const BASE = 10.5

const INK = '#1f2430'
const META = '#6a7182'
const CTX = '#8b919e'
const RULE = '#dfe2e9'
const BAND = '#eef0f4'
const MARK = '#fbe7b5'
const TIER: Record<Tier, string> = { near: '#c42b1f', edited: '#a86a00' }
const TIER_NAME: Record<Tier, string> = { near: '거의 동일', edited: '일부 수정' }
/** Each manuscript has its own colour: its chip and labels, and a tint behind its column. */
const SIDE = {
  A: { ink: '#2356c4', bg: '#f1f5fd' },
  B: { ink: '#1b7a50', bg: '#eff7f2' },
} as const
type Key = keyof typeof SIDE

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

  /** Label/value rows between rules on the first page; a manuscript's rows get its tint. */
  facts(rows: [string, string][], side: Key | null): void {
    const fill = (h: number): void => {
      if (side) this.c?.rect(LEFT, this.y, WIDTH, h, SIDE[side].bg)
      this.y += h
    }
    fill(7)
    for (const [label, value] of rows) {
      const lines = this.wrap([{ text: value, style: 'own' }], WIDTH - LABEL_W - 10, BODY)
      for (const [i, line] of lines.entries()) {
        this.need(LINE)
        const top = this.y
        fill(LINE)
        if (i === 0) this.c?.text(label, LEFT + 10, top + BASE, 8.5, side ? SIDE[side].ink : META)
        this.drawLine(line, LEFT + LABEL_W, top + BASE, BODY)
      }
    }
    fill(7)
  }

  hrule(h: number, color: string): void {
    this.c?.rect(LEFT, this.y, WIDTH, h, color)
    this.y += h
  }

  /** Square chip with the manuscript letter. */
  chip(key: Key, x: number, y: number): void {
    this.c?.rect(x, y, 13, 13, SIDE[key].ink)
    this.c?.text(key, x + (13 - this.width(key, 8.5)) / 2, y + 9.8, 8.5, '#ffffff')
  }

  /**
   * Grey band over a finding. A comparison band puts each side over its column in its colour
   * ("A 원본.txt · 12화"); a repeat band has one title.
   */
  band(left: string, right: string | null, tier: Tier | null, cont: boolean): void {
    const h = 24
    const c = this.c
    if (c) {
      c.rect(LEFT, this.y, WIDTH, h, BAND)
      if (tier) c.circle(LEFT + 11, this.y + h / 2, 3, TIER[tier])
      const y = this.y + 16
      const more = cont ? '(계속)' : ''
      const moreW = this.width(more, 8)
      if (more) c.text(more, RIGHT - 10 - moreW, y - 0.5, 8, META)
      if (right === null) {
        c.text(this.fit(left, WIDTH - moreW - 40, 10), LEFT + 10, y, 10, INK)
      } else {
        const bx = LEFT + COL + GAP
        c.text(this.fit(left, COL - 24, 10), LEFT + 20, y, 10, SIDE.A.ink)
        c.text('↔', bx - GAP / 2 - this.width('↔', 10) / 2, y, 10, META)
        c.text(this.fit(right, COL - moreW - 20, 10), bx, y, 10, SIDE.B.ink)
      }
    }
    this.y += h + 6
  }

  rule(): void {
    this.c?.rect(LEFT, this.y, WIDTH, 0.5, RULE)
  }
}

/** A column's pieces as runs; a finding compared with its match reads A-to-B either way. */
function pieceRuns(side: PdfSide, key: Key): Run[] {
  return side.pieces.flatMap((p): Run[] => {
    if (p.other === undefined) return [{ text: p.text, style: 'ctx' }]
    if (p.other === null) return [{ text: p.text, style: 'eq' }]
    return key === 'A' ? diffRuns(p.text, p.other, 'a') : diffRuns(p.other, p.text, 'b')
  })
}

/** One side of a diff as runs: text both sides share is 'eq' (marked), this side's own is 'own'. */
function diffRuns(a: string, b: string, side: 'a' | 'b'): Run[] {
  const other = side === 'a' ? 'ins' : 'del'
  return charDiff(a, b)
    .filter((d) => d.op !== other)
    .map((d) => ({ text: d.text, style: d.op === 'eq' ? 'eq' : 'own' }))
}

function cover(l: Layout, input: PdfInput): void {
  l.need(60)
  l.y += 26
  l.c?.text(input.heading, LEFT, l.y, 20, INK)
  l.y += 16
  l.hrule(1.2, INK)
  l.facts([['검사일', input.date]], null)
  for (const m of input.manuscripts) {
    l.hrule(0.5, RULE)
    l.facts(
      [
        [`원고 ${m.key}`, m.title],
        [`${m.key} 파일 ${m.files.length.toLocaleString()}개`, m.files.join(', ')],
      ],
      m.key,
    )
  }
  l.hrule(0.5, RULE)
  l.facts(input.facts, null)
  l.hrule(1.2, INK)
  // Legend: what the colours mean.
  l.need(LINE * 2)
  l.y += LINE * 1.6
  const c = l.c
  let x = LEFT
  const item = (text: string, color: string, w: number): void => {
    c?.text(text, x, l.y, 8.5, color)
    x += w + 22
  }
  const eq = l.width('겹치는 부분', 8.5)
  c?.rect(x - 3, l.y - 9, eq + 6, 12.5, MARK)
  item('겹치는 부분', INK, eq)
  item('앞뒤 문장', CTX, l.width('앞뒤 문장', 8.5))
  if (input.kind === 'compare') {
    for (const t of ['near', 'edited'] as const) {
      c?.circle(x + 3, l.y - 3, 3, TIER[t])
      x += 10
      item(TIER_NAME[t], INK, l.width(TIER_NAME[t], 8.5))
    }
  }
  l.y += 20
}

/** Tinted boxes of one row, side by side; split over pages, the heading only on top. */
function boxes(l: Layout, sides: Record<Key, PdfSide | null>, again: () => void): void {
  const lines = {
    A: sides.A ? l.wrap(pieceRuns(sides.A, 'A'), COL - PAD * 2, BODY) : [],
    B: sides.B ? l.wrap(pieceRuns(sides.B, 'B'), COL - PAD * 2, BODY) : [],
  }
  const top0 = sides.A?.link || sides.B?.link ? HEAD + LINK : HEAD
  const rows = Math.max(lines.A.length, lines.B.length)
  let i = 0
  while (i < rows) {
    const head = i === 0 ? top0 : 0
    if (l.need(PAD * 2 + head + LINE)) again()
    const n = Math.min(rows - i, Math.floor((BOTTOM - l.y - PAD * 2 - head) / LINE))
    const h = PAD * 2 + head + n * LINE
    const top = l.y
    for (const [key, x] of [
      ['A', LEFT],
      ['B', LEFT + COL + GAP],
    ] as const) {
      const side = sides[key]
      if (!side) continue
      l.c?.rect(x, top, COL, h, SIDE[key].bg)
      if (head) {
        const w = COL - PAD * 2 - 18
        l.chip(key, x + PAD, top + PAD)
        l.c?.text(l.fit(side.label, w, SMALL), x + PAD + 18, top + PAD + 9.5, SMALL, SIDE[key].ink)
        if (side.link) {
          l.c?.text(l.fit(side.link, w, SMALL), x + PAD + 18, top + PAD + 9.5 + LINK, SMALL, META)
        }
      }
      for (let k = 0; k < n; k++) {
        const line = lines[key][i + k]
        if (line) l.drawLine(line, x + PAD, top + PAD + head + k * LINE + BASE, BODY)
      }
    }
    l.y += h
    i += n
  }
}

async function compareBody(l: Layout, rows: PdfMatch[]): Promise<void> {
  for (const m of rows) {
    const again = (): void => l.band(`A ${m.a}`, `B ${m.b}`, m.tier, true)
    l.need(30 + PAD * 2 + HEAD + LINK + LINE * 2)
    l.band(`A ${m.a}`, `B ${m.b}`, m.tier, false)
    for (const block of m.blocks) {
      for (const row of block) {
        await l.breathe()
        boxes(l, { A: row.a, B: row.b }, again)
        l.y += 5
      }
      l.y += 9
    }
    l.y += 6
  }
}

async function repeatBody(l: Layout, rows: PdfGroup[]): Promise<void> {
  for (const g of rows) {
    l.need(30 + LINE * 2)
    l.band(g.title, null, null, false)
    for (const p of g.places) {
      await l.breathe()
      const lines = l.wrap(pieceRuns(p, 'A'), WIDTH - PLACE_W, BODY)
      const label = l.wrap([{ text: p.label, style: 'own' }], PLACE_W - 10, 8)
      if (l.need(LINE * 2)) l.band(g.title, null, null, true)
      l.y += 4
      for (let i = 0; i < Math.max(lines.length, label.length); i++) {
        if (l.need(LINE)) l.band(g.title, null, null, true)
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

/** Thrown out of the drawing pass once a preview has its pages. */
const STOP = Symbol('stop')

/**
 * Lays the report out twice: once without drawing to count pages (the footer says "n / N"),
 * then onto `canvas`. `onPage` reports each page of the drawing pass. With `limit`, only the
 * first `limit` pages are drawn (a preview); their footers still count every page.
 */
export async function renderPdf(
  input: PdfInput,
  canvas: Canvas,
  onPage: (page: number, pages: number) => void,
  limit = Infinity,
): Promise<number> {
  const header = headerOf(input)
  const count = new Layout(null, canvas, 0, header, input.date, () => {})
  await run(count, input)
  const pages = count.page
  const draw = new Layout(canvas, canvas, pages, header, input.date, (p) => {
    if (p > limit) throw STOP
    onPage(p, pages)
  })
  try {
    await run(draw, input)
  } catch (err) {
    if (err !== STOP) throw err
  }
  return pages
}
