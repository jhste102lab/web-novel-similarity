import type { Tier } from '../src/shared/types.ts'

/** Deterministic PRNG (mulberry32) so the corpus is reproducible from a seed. */
export function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SYNONYMS: [string, string][] = [
  ['천천히', '느리게'],
  ['말했다', '답했다'],
  ['바라보았다', '쳐다보았다'],
  ['아무도', '누구도'],
  ['그녀는', '그 여자는'],
  ['들었다', '올렸다'],
  ['가까워졌다', '다가왔다'],
  ['차갑게', '싸늘하게'],
  ['오래도록', '한참을'],
  ['조용히', '가만히'],
  ['다시', '또다시'],
  ['시작했다', '시작하였다'],
  ['않았다', '못했다'],
  ['목소리', '음성'],
  ['그는', '남자는'],
]
const PARTICLES: [string, string][] = [
  ['은 ', '는 '],
  ['는 ', '은 '],
  ['이 ', '가 '],
  ['가 ', '이 '],
  ['을 ', '를 '],
  ['를 ', '을 '],
]
const CLAUSES = ['잠시 후', '그러나', '조심스럽게', '아무 말 없이', '한참이 지나서야', '결국']

export type EditClass =
  | 'identical'
  | 'typo'
  | 'particle'
  | 'synonym'
  | 'insert'
  | 'delete'
  | 'reorder'
  | 'heavy'
  | 'unrelated'

/** Expected tier per edit class; null = must not be reported at all. */
export const EXPECTED: Record<EditClass, Tier | null> = {
  identical: 'near',
  typo: 'near',
  particle: 'near',
  synonym: 'edited',
  insert: 'edited',
  delete: 'edited',
  reorder: 'partial',
  heavy: 'partial',
  unrelated: null,
}

export const CLASSES = Object.keys(EXPECTED) as EditClass[]

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!

function replaceOne(s: string, r: () => number, table: [string, string][]): string {
  const hits = table.filter(([from]) => s.includes(from))
  if (hits.length === 0) return s
  const [from, to] = pick(r, hits)
  return s.replace(from, to)
}

function typo(s: string, r: () => number): string {
  const i = Math.floor(r() * s.length)
  return s.slice(0, i) + '뷁' + s.slice(i + 1)
}

function insertClause(s: string, r: () => number): string {
  const words = s.split(' ')
  const at = Math.floor(r() * words.length)
  words.splice(at, 0, pick(r, CLAUSES))
  return words.join(' ')
}

function deleteClause(s: string, r: () => number, words = 2): string {
  const parts = s.split(' ')
  if (parts.length < 4) return s
  const at = Math.floor(r() * (parts.length - words))
  parts.splice(at, words)
  return parts.join(' ')
}

function reorder(s: string, r: () => number): string {
  const words = s.split(' ')
  if (words.length < 5) return insertClause(insertClause(s, r), r)
  const half = Math.floor(words.length / 2)
  return [...words.slice(half), ...words.slice(0, half)].join(' ')
}

/** Replaces `count` words with words taken from `other`; falls back to the synonym table. */
function swapWords(s: string, other: string, r: () => number, count: number): string {
  const words = s.split(' ')
  const pool = other.split(' ')
  for (let k = 0; k < count && words.length > 2; k++) {
    words[Math.floor(r() * words.length)] = pick(r, pool)
  }
  return replaceOne(words.join(' '), r, SYNONYMS)
}

/** Applies one edit class to `s`; `other` supplies the unrelated sentence. */
export function mutate(cls: EditClass, s: string, other: string, r: () => number): string {
  switch (cls) {
    case 'identical':
      return s
    case 'typo':
      return typo(s, r)
    case 'particle':
      return replaceOne(s, r, PARTICLES)
    case 'synonym':
      return swapWords(s, other, r, 2)
    case 'insert':
      return insertClause(insertClause(s, r), r)
    case 'delete':
      return deleteClause(s, r)
    case 'reorder':
      return reorder(s, r)
    case 'heavy':
      return deleteClause(insertClause(swapWords(typo(s, r), other, r, 2), r), r, 2)
    case 'unrelated':
      return other
  }
}
