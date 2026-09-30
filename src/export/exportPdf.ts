import font from 'pretendard/dist/public/static/alternative/Pretendard-Regular.ttf?url'
import type { Run } from '../worker/client.ts'
import type { PdfInput } from './pdf.ts'
import type { PdfRequest, PdfResponse } from './pdf.worker.ts'

/** Builds the report in a fresh worker; `onProgress` gets the page being drawn and the total. */
export function exportPdf(
  input: PdfInput,
  onProgress: (page: number, pages: number) => void,
): Run<Blob> {
  const worker = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' })
  const { promise, resolve, reject } = Promise.withResolvers<Blob>()
  worker.onmessage = (e: MessageEvent<PdfResponse>) => {
    const msg = e.data
    if (msg.type === 'progress') return onProgress(msg.page, msg.pages)
    if (msg.type === 'done') resolve(msg.blob)
    else reject(new Error(msg.message))
    worker.terminate()
  }
  worker.onerror = (e) => {
    reject(new Error(e.message))
    worker.terminate()
  }
  worker.postMessage({ input, font: new URL(font, location.href).href } satisfies PdfRequest)
  const run: Run<Blob> = {
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
