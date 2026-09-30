import { extractHwpText } from './hwp.ts'
import { extractHwpxText } from './hwpx.ts'
import { decodeText } from './text.ts'

export class UnsupportedFormatError extends Error {
  readonly fileName: string
  constructor(fileName: string) {
    super(`unsupported format: ${fileName}`)
    this.fileName = fileName
  }
}

/** Text of one manuscript file. Throws UnsupportedFormatError for anything but txt/docx/hwp/hwpx. */
export async function parseFile(name: string, bytes: ArrayBuffer): Promise<string> {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  switch (ext) {
    case 'txt':
      return decodeText(bytes)
    case 'docx':
      // Dynamic import: 400 kB library loaded only when a .docx is dropped.
      return (await (await import('mammoth')).default.extractRawText({ arrayBuffer: bytes })).value
    case 'hwp':
    case 'hwpx':
      // The extension is not trusted: an HWP 5 file renamed to .hwpx is common. HWPX is a ZIP.
      return isZip(bytes) ? extractHwpxText(bytes) : extractHwpText(bytes)
    default:
      throw new UnsupportedFormatError(name)
  }
}

function isZip(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength))
  return head[0] === 0x50 && head[1] === 0x4b
}
