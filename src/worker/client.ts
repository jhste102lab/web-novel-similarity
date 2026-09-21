import type { CompareResult, RepeatResult } from '../shared/types.ts'
import type { WorkerRequest, WorkerResponse } from './protocol.ts'

export interface Run<T> {
  result: Promise<T>
  /** Terminates the worker; `result` rejects with 'aborted'. */
  abort: () => void
}

/** Starts one analysis in a fresh worker. The worker is discarded when it finishes or is aborted. */
export function runInWorker<T extends CompareResult | RepeatResult>(
  request: WorkerRequest,
  onProgress: (pct: number) => void,
): Run<T> {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  const { promise, resolve, reject } = Promise.withResolvers<T>()
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data
    if (msg.type === 'progress') onProgress(msg.pct)
    else if (msg.type === 'result') {
      resolve(msg.result as T)
      worker.terminate()
    } else {
      reject(new Error(msg.message))
      worker.terminate()
    }
  }
  worker.onerror = (e) => {
    reject(new Error(e.message))
    worker.terminate()
  }
  worker.postMessage(request)
  return {
    result: promise,
    abort: () => {
      worker.terminate()
      reject(new Error('aborted'))
    },
  }
}
