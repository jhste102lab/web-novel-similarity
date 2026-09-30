import { HwpDocument } from '@rhwp/core'
import { describe, expect, it } from 'vitest'
import { EncryptedFileError } from './hwp.ts'
import { parseFile } from './parseFile.ts'

/** A synthetic HWP 5 file with one paragraph per line, built with rhwp itself. */
function hwp(lines: string[], password?: string): ArrayBuffer {
  const doc = HwpDocument.createEmpty()
  lines.forEach((line, i) => {
    if (i > 0) doc.splitParagraph(0, i - 1, lines[i - 1]!.length)
    doc.insertText(0, i, 0, line)
  })
  const bytes = password ? doc.exportHwpWithPassword(password) : doc.exportHwp()
  doc.free()
  return bytes.slice().buffer
}

describe('parseFile with HWP 5 bytes', () => {
  it('reads the text whether the file is named .hwp or .hwpx', async () => {
    const bytes = hwp(['제1화', '그는 문을 열었다.'])
    expect(await parseFile('원고.hwp', bytes)).toBe('제1화\n그는 문을 열었다.')
    expect(await parseFile('원고.hwpx', bytes)).toBe('제1화\n그는 문을 열었다.')
  })

  it('reports a password-protected document as encrypted', async () => {
    await expect(parseFile('잠김.hwp', hwp(['비밀'], 'pw1234'))).rejects.toBeInstanceOf(
      EncryptedFileError,
    )
  })
})
