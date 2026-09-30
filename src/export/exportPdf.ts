import font from 'pretendard/dist/public/static/alternative/Pretendard-Regular.ttf?url'
import type { Run } from '../worker/client.ts'
import type { PdfInput } from './pdf.ts'
import type { PdfRequest, PdfResponse } from './pdf.worker.ts'

export interface Pdf {
  blob: Blob
  /** Pages of the whole report, also when only a preview was drawn. */
  pages: number
}

/**
 * Builds the report in a fresh worker; `onProgress` gets the page being drawn and the total.
 * With `limit`, only the first pages are drawn (a preview).
 */
export function exportPdf(
  input: PdfInput,
  onProgress: (page: number, pages: number) => void,
  limit?: number,
): Run<Pdf> {
  const worker = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' })
  const { promise, resolve, reject } = Promise.withResolvers<Pdf>()
  worker.onmessage = (e: MessageEvent<PdfResponse>) => {
    const msg = e.data
    if (msg.type === 'progress') return onProgress(msg.page, msg.pages)
    if (msg.type === 'done') resolve({ blob: msg.blob, pages: msg.pages })
    else reject(new Error(msg.message))
    worker.terminate()
  }
  worker.onerror = (e) => {
    reject(new Error(e.message))
    worker.terminate()
  }
  worker.postMessage({
    input,
    font: new URL(font, location.href).href,
    limit,
  } satisfies PdfRequest)
  const run: Run<Pdf> = {
    result: promise,
    aborted: false,
    abort: () => {
      run.aborted = true
      worker.terminate()
      reject(new Error('aborted'))
    },
  }
  return run
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  // Revoked later: some browsers start reading the URL only after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
