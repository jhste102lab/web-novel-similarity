import { unzipSync } from 'fflate'

/**
 * HWPX is a ZIP of XML. Body text lives in Contents/section0.xml, section1.xml, …
 * as <hp:p> paragraphs containing <hp:t> text runs.
 */
export function extractHwpxText(bytes: ArrayBuffer): string {
  const files = unzipSync(new Uint8Array(bytes))
  const sections = Object.keys(files)
    .filter((name) => /^Contents\/section\d+\.xml$/.test(name))
    .sort((x, y) => Number(/\d+/.exec(x)![0]) - Number(/\d+/.exec(y)![0]))
  if (sections.length === 0) throw new Error('hwpx: no Contents/section*.xml')
  const decoder = new TextDecoder()
  const paragraphs: string[] = []
  for (const name of sections) {
    const doc = new DOMParser().parseFromString(decoder.decode(files[name]!), 'application/xml')
    for (const p of doc.getElementsByTagName('hp:p')) {
      let line = ''
      for (const t of p.getElementsByTagName('hp:t')) line += t.textContent ?? ''
      paragraphs.push(line)
    }
  }
  return paragraphs.join('\n')
}
