import { unzipSync } from 'fflate'

/**
 * HWPX is a ZIP of XML. Body text lives in Contents/section0.xml, section1.xml, …
 * as <hp:p> paragraphs containing <hp:t> text runs. Table cells and text boxes nest their
 * own <hp:p> inside a paragraph; those are emitted as their own lines, not merged into it.
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
    for (const p of doc.getElementsByTagName('hp:p')) paragraphs.push(paragraphText(p))
  }
  return paragraphs.join('\n')
}

/**
 * Text of one paragraph without its nested paragraphs. Line breaks and tabs are empty
 * elements, found inside <hp:t> or between runs' <hp:t> siblings; elsewhere (a table cell
 * outside its sub-list) they are layout debris and ignored, as rhwp does.
 */
function paragraphText(p: Element): string {
  let s = ''
  const visit = (el: Element, inText: boolean): void => {
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE || n.nodeType === Node.CDATA_SECTION_NODE) {
        if (inText) s += n.nodeValue
      } else if (n.nodeType === Node.ELEMENT_NODE && n.nodeName !== 'hp:p') {
        const breaks = inText || el.nodeName === 'hp:run'
        if (n.nodeName === 'hp:lineBreak') s += breaks ? '\n' : ''
        else if (n.nodeName === 'hp:tab') s += breaks ? '\t' : ''
        else visit(n as Element, inText || n.nodeName === 'hp:t')
      }
    }
  }
  visit(p, false)
  return s
}
