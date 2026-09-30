import type { DiffOp } from '../shared/types.ts'

/** Above this many LCS cells (a.length × b.length) the diff anchors on whole sentences first. */
const MAX_CELLS = 250_000
// A sentence piece ends after ., !, ? (plus closing quotes and following spaces) or a line break.
const PIECE = /[^.!?\n]*(?:[.!?]+[”’"'」』)\]]*\s*|\n+|$)/gu

/**
 * Character diff by LCS dynamic programming. A whole copied chapter is far beyond what an
 * O(n·m) table allows, so long texts are first matched sentence by sentence and only the
 * unmatched stretches between equal sentences are diffed by character.
 */
export function charDiff(a: string, b: string): DiffOp[] {
  return a.length * b.length <= MAX_CELLS ? lcsDiff(a, b) : anchoredDiff(a, b)
}

function anchoredDiff(a: string, b: string): DiffOp[] {
  const pa = pieces(a)
  const pb = pieces(b)
  const w = pb.length + 1
  const lcs = new Uint32Array((pa.length + 1) * w)
  for (let i = pa.length - 1; i >= 0; i--)
    for (let j = pb.length - 1; j >= 0; j--)
      lcs[i * w + j] =
        pa[i] === pb[j]
          ? lcs[(i + 1) * w + j + 1]! + 1
          : Math.max(lcs[(i + 1) * w + j]!, lcs[i * w + j + 1]!)
  const out: DiffOp[] = []
  const push = (op: DiffOp): void => {
    const last = out[out.length - 1]
    if (last && last.op === op.op) last.text += op.text
    else if (op.text) out.push({ ...op })
  }
  let gapA = ''
  let gapB = ''
  const flush = (): void => {
    if (gapA.length * gapB.length <= MAX_CELLS) lcsDiff(gapA, gapB).forEach(push)
    else {
      push({ op: 'del', text: gapA })
      push({ op: 'ins', text: gapB })
    }
    gapA = ''
    gapB = ''
  }
  let i = 0
  let j = 0
  while (i < pa.length || j < pb.length) {
    if (i < pa.length && j < pb.length && pa[i] === pb[j]) {
      flush()
      push({ op: 'eq', text: pa[i]! })
      i++
      j++
    } else if (j >= pb.length || (i < pa.length && lcs[(i + 1) * w + j]! >= lcs[i * w + j + 1]!))
      gapA += pa[i++]
    else gapB += pb[j++]
  }
  flush()
  return out
}

function pieces(t: string): string[] {
  return t.match(PIECE)!.filter((p) => p !== '')
}

function lcsDiff(a: string, b: string): DiffOp[] {
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
