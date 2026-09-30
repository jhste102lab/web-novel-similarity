import type { DiffOp } from '../shared/types.ts'

/**
 * One side of a diff with the text both sides share highlighted; this side's own changes stay
 * plain and the other side's are left out. `limit` cuts this side's text after that many characters.
 */
export function Marked({
  diff,
  side,
  limit = Infinity,
}: {
  diff: DiffOp[]
  side: 'a' | 'b'
  limit?: number
}) {
  const other = side === 'a' ? 'ins' : 'del'
  const out: React.ReactNode[] = []
  let left = limit
  for (const [i, d] of diff.entries()) {
    if (left <= 0) break
    if (d.op === other) continue
    const text = d.text.slice(0, left)
    left -= text.length
    out.push(d.op === 'eq' ? <mark key={i}>{text}</mark> : <span key={i}>{text}</span>)
  }
  return <>{out}</>
}
