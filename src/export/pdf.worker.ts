// Builds the report PDF off the main thread: a 3,000-page report takes seconds and would
// freeze the page. PDFKit writes each page out as soon as the next starts, so memory stays at
// the size of the output instead of the whole document (ADR 0007).
import PDFDocument from 'pdfkit'
import { renderPdf, type Canvas, type PdfInput } from './pdf.ts'

export interface PdfRequest {
  input: PdfInput
  /** URL of the Korean TTF bundled with the app; the PDF embeds the glyphs it uses. */
  font: string
}
export type PdfResponse =
  | { type: 'progress'; page: number; pages: number }
  | { type: 'done'; blob: Blob }
  | { type: 'error'; message: string }

const post = (msg: PdfResponse): void => self.postMessage(msg)

self.onmessage = async (e: MessageEvent<PdfRequest>) => {
  try {
    const { input, font } = e.data
    const data = await (await fetch(font)).arrayBuffer()
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      autoFirstPage: false,
      compress: true,
      // The browser build ships no standard fonts; the default would be Helvetica and throw.
      font: data as unknown as string,
      info: { Title: input.heading, Creator: '웹소설 문장 · 문단 유사도 검사' },
    })
    const parts: BlobPart[] = []
    doc.on('data', (chunk: Uint8Array<ArrayBuffer>) => parts.push(chunk))
    const ended = new Promise<void>((resolve) => doc.on('end', () => resolve()))
    const opts = { lineBreak: false, baseline: 'alphabetic' } as const
    const canvas: Canvas = {
      addPage: () => void doc.addPage(),
      text: (t, x, y, size, color) => void doc.fontSize(size).fillColor(color).text(t, x, y, opts),
      rect: (x, y, w, h, color) => void doc.rect(x, y, w, h).fill(color),
      circle: (x, y, r, color) => void doc.circle(x, y, r).fill(color),
      width: (ch) => doc.fontSize(1000).widthOfString(ch) / 1000,
    }
    await renderPdf(input, canvas, (page, pages) => {
      if (page % 20 === 0 || page === pages) post({ type: 'progress', page, pages })
    })
    doc.end()
    await ended
    post({ type: 'done', blob: new Blob(parts, { type: 'application/pdf' }) })
  } catch (err) {
    post({ type: 'error', message: String(err) })
  }
}
