import {
  buildManuscript,
  engineOrder,
  toEngineText,
  type Manuscript,
  type ParsedFile,
} from '../parsers/manuscript.ts'
import { EncryptedFileError } from '../parsers/hwp.ts'
import { parseFile, UnsupportedFormatError } from '../parsers/parseFile.ts'
import type { ChapterRange, ManuscriptText } from '../shared/types.ts'

/** One filled slot: the parsed manuscript plus the user's edits (title, chapter labels, range). */
export interface Slot {
  manuscript: Manuscript
  title: string
  /** Names of the dropped files, in reading order; the report lists them. */
  files: string[]
  labels: (number | null)[]
  /** null = whole manuscript, or when it has no chapters. */
  range: ChapterRange | null
}

/** Some dropped files are not txt/docx/hwp/hwpx; the whole drop is rejected. */
export class RejectedFilesError extends Error {
  readonly names: string[]
  constructor(names: string[]) {
    super(names.join(', '))
    this.names = names
  }
}

/** A supported file that could not be read (damaged, password-protected, not what its extension says). */
export class FileReadError extends Error {
  readonly fileName: string
  readonly encrypted: boolean
  constructor(fileName: string, cause: unknown) {
    super(`${fileName}: ${String(cause)}`, { cause })
    this.fileName = fileName
    this.encrypted = cause instanceof EncryptedFileError
  }
}

/** Parses dropped/selected files into a slot. Rejects the whole drop when any file is unsupported. */
export async function loadSlot(files: File[]): Promise<Slot> {
  const parsed: ParsedFile[] = []
  const rejected: string[] = []
  for (const f of files) {
    try {
      parsed.push({
        name: f.name,
        lastModified: f.lastModified,
        text: await parseFile(f.name, await f.arrayBuffer()),
      })
    } catch (err) {
      if (err instanceof UnsupportedFormatError) rejected.push(f.name)
      else throw new FileReadError(f.name, err)
    }
  }
  if (rejected.length > 0) throw new RejectedFilesError(rejected)
  const manuscript = buildManuscript(parsed)
  return {
    manuscript,
    title: manuscript.title,
    files: files.map((f) => f.name).sort(new Intl.Collator('ko', { numeric: true }).compare),
    labels: manuscript.parts.map((p) => p.label),
    range: null,
  }
}

/** [lowest, highest] chapter label, or null when the manuscript has no chapters. */
export function slotBounds(slot: Slot): ChapterRange | null {
  if (slot.manuscript.rule === 'none') return null
  const labels = slot.labels.filter((l): l is number => l !== null)
  return labels.length > 0 ? [Math.min(...labels), Math.max(...labels)] : null
}

export function slotEngineText(slot: Slot): ManuscriptText {
  return toEngineText({
    ...slot.manuscript,
    parts: slot.manuscript.parts.map((p, i) => ({ ...p, label: slot.labels[i] ?? null })),
  })
}

/** The file an offset of `slotEngineText(slot)` came from, for the report. */
export function slotFileAt(slot: Slot): (pos: number) => string {
  const parts = engineOrder(
    slot.manuscript.parts.map((p, i) => ({ ...p, label: slot.labels[i] ?? null })),
  )
  const ends: number[] = []
  let end = 0
  for (const p of parts) ends.push((end += p.text.length + 2)) // toEngineText joins with '\n\n'
  return (pos) => {
    let lo = 0
    let hi = ends.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (ends[mid]! <= pos) lo = mid + 1
      else hi = mid
    }
    return parts[lo]?.file ?? ''
  }
}

function totalChars(slot: Slot): number {
  return slot.manuscript.parts.reduce((n, p) => n + p.text.length, 0)
}

/** "198만 자" above 10,000 characters, "3,812자" below. */
function formatChars(n: number): string {
  return n >= 10_000 ? `${Math.round(n / 10_000)}만 자` : `${n.toLocaleString()}자`
}

/** Card subtitle, e.g. "500개 파일 · 499화 · 198만 자". */
export function slotInfo(slot: Slot): string {
  const { rule, files } = slot.manuscript
  const chapters = slot.labels.filter((l) => l !== null).length
  const middle = rule === 'none' ? '' : ` · ${chapters}화`
  return `${files}개 파일${middle} · ${formatChars(totalChars(slot))}`
}

export function ruleLabel(slot: Slot): string {
  switch (slot.manuscript.rule) {
    case 'filename-number':
      return '파일명 숫자'
    case 'filename-order':
      return '파일 이름순 (숫자 없음)'
    case 'title-lines':
      return `본문 제목 줄 ${slot.manuscript.parts.length}개`
    case 'none':
      return '회차 없음 — 위치는 문장 번호로 표시'
  }
}

/** "A 401~500화" / "A 전체" for the results title. */
export function rangeLabel(key: string, slot: Slot): string {
  const b = slotBounds(slot)
  if (!slot.range || b === null || (slot.range[0] === b[0] && slot.range[1] === b[1]))
    return `${key} 전체`
  return `${key} ${slot.range[0]}~${slot.range[1]}화`
}
