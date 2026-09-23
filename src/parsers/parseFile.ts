import { extractHwpxText } from './hwpx.ts'
import { decodeText } from './text.ts'

export class UnsupportedFormatError extends Error {
  readonly fileName: string
  constructor(fileName: string) {
    super(`unsupported format: ${fileName}`)
    this.fileName = fileName
  }
}

/** Text of one manuscript file. Throws UnsupportedFormatError for anything but txt/docx/hwpx. */
export async function parseFile(name: string, bytes: ArrayBuffer): Promise<string> {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  switch (ext) {
    case 'txt':
      return decodeText(bytes)
    case 'docx':
      // Dynamic import: 400 kB library loaded only when a .docx is dropped.
      return (await (await import('mammoth')).default.extractRawText({ arrayBuffer: bytes })).value
    case 'hwpx':
      return extractHwpxText(bytes)
    default:
      throw new UnsupportedFormatError(name)
  }
}
