import type { DiffOp } from '../shared/types.ts'

/**
 * Character diff by LCS dynamic programming. Passage texts are a few hundred
 * characters and diffs are computed lazily for the opened result only, so the
 * O(n·m) table is acceptable.
 */
export function charDiff(a: string, b: string): DiffOp[] {
  const n = a.length
  const m = b.length
  const w = m + 1
  const lcs = new Uint16Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * w + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * w + j + 1]! + 1
          : Math.max(lcs[(i + 1) * w + j]!, lcs[i * w + j + 1]!)
    }
  }
  const raw: DiffOp[] = []
  const push = (op: DiffOp['op'], ch: string): void => {
    const last = raw[raw.length - 1]
    if (last && last.op === op) last.text += ch
    else raw.push({ op, text: ch })
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('eq', a[i]!)
      i++
      j++
    } else if (lcs[(i + 1) * w + j]! >= lcs[i * w + j + 1]!) {
      push('del', a[i]!)
      i++
    } else {
      push('ins', b[j]!)
      j++
    }
  }
  while (i < n) push('del', a[i++]!)
  while (j < m) push('ins', b[j++]!)
  return fold(raw)
}

/**
 * A one-character equal run between two changes ("미끄|러|졌다" vs "흘|러|내렸다") reads
 * as noise; fold such islands into one del + ins pair per change cluster.
 */
function fold(ops: DiffOp[]): DiffOp[] {
  const out: DiffOp[] = []
  let del = ''
  let ins = ''
  const flush = (): void => {
    if (del) out.push({ op: 'del', text: del })
    if (ins) out.push({ op: 'ins', text: ins })
    del = ''
    ins = ''
  }
  ops.forEach((o, k) => {
    const island = o.op === 'eq' && o.text.length === 1 && k > 0 && k < ops.length - 1
    if (o.op === 'del' || island) del += o.text
    if (o.op === 'ins' || island) ins += o.text
    if (o.op === 'eq' && !island) {
      flush()
      out.push(o)
    }
  })
  flush()
  return out
}
