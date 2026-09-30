/** The document is password-protected; only 한글 can open it. */
export class EncryptedFileError extends Error {}

/**
 * HWP 5 binary (an OLE compound file, whatever the extension says) via rhwp's WASM build,
 * loaded on first use (~3.7 MB gzipped). `getTextFileUnicode` is Hancom's
 * GetTextFile("UNICODE"): body and table cells in reading order, footnotes left out.
 */
export async function extractHwpText(bytes: ArrayBuffer): Promise<string> {
  // Dynamic import: the WASM is fetched only when an HWP 5 file is dropped, like mammoth for .docx.
  const rhwp = await import('@rhwp/core')
  await rhwp.default()
  let doc
  try {
    doc = new rhwp.HwpDocument(new Uint8Array(bytes))
  } catch (err) {
    // rhwp reports every load failure as a message string; this is its wording for passwords.
    if (String(err).includes('비밀번호')) throw new EncryptedFileError()
    throw err
  }
  try {
    return (JSON.parse(doc.getTextFileUnicode()) as string).replace(/\r\n?/g, '\n')
  } finally {
    doc.free()
  }
}
