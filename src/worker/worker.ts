import { compare } from '../engine/compare.ts'
import { findRepeats } from '../engine/repeats.ts'
import type { WorkerRequest, WorkerResponse } from './protocol.ts'

const post = (r: WorkerResponse): void => self.postMessage(r)

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data
  let last = -1
  const onProgress = (pct: number): void => {
    const step = Math.floor(pct * 100)
    if (step === last) return
    last = step
    post({ type: 'progress', pct })
  }
  try {
    const result =
      req.type === 'compare'
        ? compare(req.a, req.b, { rangeA: req.rangeA, rangeB: req.rangeB, onProgress })
        : findRepeats(req.a, { rangeA: req.rangeA, onProgress })
    post({ type: 'result', result })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
