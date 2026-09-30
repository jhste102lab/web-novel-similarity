// Browsers cap canvas dimensions (~16k–32k px), so a long report cannot be rasterised as one
// readable image: PNG is cut into pieces of whole rows and zipped. PDF goes through the
// browser's print dialog, which paginates real text (print rules live in app/styles/export.css).
import { zipSync } from 'fflate'

const MAX_CANVAS_SIDE = 16_000
const SCALE = 2
/** CSS px per PNG piece; the slack covers row padding that the piece plan does not count. */
const PIECE_H = MAX_CANVAS_SIDE / SCALE - 500
/** Report width on A4 with 14 mm margins, in CSS px. */
const PRINT_WIDTH = 688
// ponytail: A4 minus margins is 1017 px, but rows that avoid page breaks leave gaps; 920
// matched Chrome's page count on docs/samples within ~10 %. Only shown as "약 N쪽".
const PRINT_PAGE_H = 920

/** One top-level report element, or a row cut down to some of its children. */
type Part = { el: Element; children?: Element[] }

function outerHeight(el: Element): number {
  const cs = getComputedStyle(el)
  return el.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom)
}

/** Report elements grouped into PNG pieces; a row taller than a piece is split by its children. */
export function pngPieces(node: HTMLElement): Part[][] {
  const pieces: Part[][] = [[]]
  let h = 0
  const add = (part: Part, ph: number): void => {
    if (h + ph > PIECE_H && pieces[pieces.length - 1]!.length > 0) {
      pieces.push([])
      h = 0
    }
    pieces[pieces.length - 1]!.push(part)
    h += ph
  }
  for (const el of node.children) {
    const eh = outerHeight(el)
    if (eh <= PIECE_H || el.children.length < 2) {
      add({ el }, eh)
      continue
    }
    // The first cut fills what is left of the current piece.
    let room = PIECE_H - h
    let children: Element[] = []
    let ch = 0
    for (const c of el.children) {
      const cz = outerHeight(c)
      if (ch + cz > room && children.length > 0) {
        add({ el, children }, ch)
        room = PIECE_H
        children = []
        ch = 0
      }
      children.push(c)
      ch += cz
    }
    add({ el, children }, ch)
  }
  return pieces
}

/** Estimated A4 pages of the printed report. */
export function printPages(node: HTMLElement): number {
  const probe = document.createElement('div')
  probe.className = 'print-probe'
  probe.style.width = `${PRINT_WIDTH}px`
  probe.append(node.cloneNode(true))
  document.body.append(probe)
  const h = probe.scrollHeight
  probe.remove()
  return Math.max(1, Math.ceil(h / PRINT_PAGE_H))
}

/**
 * html2canvas paints an inline <mark> that wraps onto a second line as one box over both
 * lines, hiding the text before it. One mark per word (whitespace with a line break left
 * unmarked) keeps every mark on one line; the piece is `word-break: keep-all` for that.
 */
function splitMarks(root: Element): void {
  for (const mark of root.querySelectorAll('mark')) {
    const parts = (mark.textContent ?? '').match(/[^\s]+[^\S\n]*|\s+/g) ?? []
    mark.replaceWith(
      ...parts.map((t) => {
        if (t.includes('\n')) return t
        const m = document.createElement('mark')
        m.textContent = t
        return m
      }),
    )
  }
}

export async function savePng(node: HTMLElement, name: string): Promise<void> {
  // Dynamic import: 200 kB library loaded only when a PNG is requested.
  const { default: html2canvas } = await import('html2canvas-pro')
  const pieces = pngPieces(node)
  const images: Blob[] = []
  for (const piece of pieces) {
    // Each piece is rebuilt outside the overlay; html2canvas clones the whole document per
    // call, so the full report is skipped to keep that clone small.
    const box = document.createElement('div')
    box.className = 'rp png-piece'
    box.style.width = `${node.clientWidth}px`
    for (const { el, children } of piece) {
      if (!children) box.append(el.cloneNode(true))
      else {
        const shell = el.cloneNode(false) as Element
        shell.append(...children.map((c) => c.cloneNode(true)))
        box.append(shell)
      }
    }
    splitMarks(box)
    document.body.append(box)
    try {
      const scale = Math.min(SCALE, MAX_CANVAS_SIDE / Math.max(box.scrollHeight, box.scrollWidth))
      const canvas = await html2canvas(box, {
        scale,
        backgroundColor: '#ffffff',
        ignoreElements: (e) => e === node,
      })
      images.push(await toPng(canvas))
    } finally {
      box.remove()
    }
  }
  if (images.length === 1) return download(images[0]!, `${name}.png`)
  const files: Record<string, Uint8Array> = {}
  const width = String(images.length).length
  for (const [i, blob] of images.entries())
    files[`${name} ${String(i + 1).padStart(width, '0')}.png`] = new Uint8Array(
      await blob.arrayBuffer(),
    )
  // PNG is already compressed; storing skips a second, useless deflate.
  download(new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }), `${name}.zip`)
}

async function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  const { promise, resolve } = Promise.withResolvers<Blob | null>()
  canvas.toBlob(resolve, 'image/png')
  const blob = await promise
  if (!blob) throw new Error('png: toBlob failed')
  return blob
}

function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export function savePdf(name: string): void {
  const title = document.title
  document.title = name // becomes the suggested PDF file name
  window.print()
  document.title = title
}
