// Usage: node scripts/compare.ts A.txt [B.txt] [--limit N]
// One file: repeats inside A. Two files: A/B comparison. Prints a summary and the top passages.
import { readFileSync } from 'node:fs'
import { compare } from '../src/engine/compare.ts'
import { findRepeats } from '../src/engine/repeats.ts'
import { chaptersFromTitles } from '../src/parsers/chapters.ts'
import type { ManuscriptText } from '../src/shared/types.ts'

const args = process.argv.slice(2)
const limitAt = args.indexOf('--limit')
const limit = limitAt >= 0 ? Number(args[limitAt + 1]) : 10
const files = args.filter((a, i) => !a.startsWith('--') && (limitAt < 0 || i !== limitAt + 1))

function load(path: string): ManuscriptText {
  const text = readFileSync(path, 'utf8')
  const { rule, chapters } = chaptersFromTitles(text)
  console.log(
    `${path}: ${text.length.toLocaleString()} chars, chapters: ${rule} (${chapters.length})`,
  )
  return { text, chapters }
}

const t0 = performance.now()
if (files.length === 1) {
  const r = findRepeats(load(files[0]!))
  console.log(`\n${r.groups.length} repeat groups in ${Math.round(performance.now() - t0)} ms`)
  for (const g of r.groups.slice(0, limit)) {
    const chs = g.occurrences.map((o) => o.chapter ?? `#${o.sentenceIndex}`).join(', ')
    console.log(`  ${g.occurrences.length}회  ${g.text.slice(0, 60)}  @ ${chs}`)
  }
} else {
  const r = compare(load(files[0]!), load(files[1]!))
  const counts = { near: 0, edited: 0, sentences: 0 }
  for (const m of r.matches) {
    counts[m.tier]++
    counts.sentences += m.count
  }
  console.log(
    `\n${r.matches.length} chapter pairs (${counts.sentences} sentences) in ${Math.round(performance.now() - t0)} ms`,
    counts,
  )
  for (const m of r.matches.slice(0, limit)) {
    console.log(
      `  ${m.tier}  A ${m.a}화 ↔ B ${m.b}화  · ${m.count} sentences in ${m.runs} passages`,
    )
    for (const p of m.passages.slice(0, 2)) {
      console.log(`    A: ${p.a.text.slice(0, 80)}`)
      console.log(`    B: ${p.b.text.slice(0, 80)}`)
    }
  }
}
