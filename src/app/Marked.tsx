import type { DiffOp } from '../shared/types.ts'

/** One side of a diff; the other side's changes are omitted, own changes are highlighted. */
export function Marked({ diff, side }: { diff: DiffOp[]; side: 'a' | 'b' }) {
  const own = side === 'a' ? 'del' : 'ins'
  const other = side === 'a' ? 'ins' : 'del'
  return (
    <>
      {diff.map((d, i) =>
        d.op === other ? null : d.op === own ? (
          <mark key={i}>{d.text}</mark>
        ) : (
          <span key={i}>{d.text}</span>
        ),
      )}
    </>
  )
}
