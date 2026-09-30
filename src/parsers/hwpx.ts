import { unzipSync } from 'fflate'

/**
 * HWPX is a ZIP of XML. Body text lives in Contents/section0.xml, section1.xml, …
 * as <hp:p> paragraphs containing <hp:t> text runs. Table cells and text boxes nest their
 * own <hp:p> inside a paragraph, so each run belongs only to its closest paragraph.
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
      for (const t of p.getElementsByTagName('hp:t'))
        if (closestParagraph(t) === p) line += runText(t)
      paragraphs.push(line)
    }
  }
  return paragraphs.join('\n')
}

function closestParagraph(node: Node): Node | null {
  let at = node.parentNode
  while (at && at.nodeName !== 'hp:p') at = at.parentNode
  return at
}

/** A run's text; in-run line breaks and tabs are empty elements, not characters. */
function runText(t: Element): string {
  let s = ''
  for (const n of t.childNodes) {
    if (n.nodeName === 'hp:lineBreak') s += '\n'
    else if (n.nodeName === 'hp:tab') s += '\t'
    else s += n.textContent ?? ''
  }
  return s
}
