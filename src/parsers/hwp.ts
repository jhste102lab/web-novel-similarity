import type * as Rhwp from '@rhwp/core'

/** The document is password-protected; only 한글 can open it. */
export class EncryptedFileError extends Error {}

// rhwp's init() only short-circuits once it has finished, so two slots loading HWP 5 at the
// same time would fetch and compile the WASM twice. A failed load is retried next time.
let loading: Promise<typeof Rhwp> | undefined

async function loadRhwp(): Promise<typeof Rhwp> {
  // Dynamic import: the WASM is fetched only when an HWP 5 file is dropped, like mammoth for .docx.
  const rhwp = await import('@rhwp/core')
  await rhwp.default()
  return rhwp
}

/**
 * HWP 5 binary (an OLE compound file, whatever the extension says) via rhwp's WASM build,
 * loaded on first use (~3.7 MB gzipped). `getTextFileUnicode` is Hancom's
 * GetTextFile("UNICODE"): body and table cells in reading order, footnotes left out.
 */
export async function extractHwpText(bytes: ArrayBuffer): Promise<string> {
  loading ??= loadRhwp().catch((err: unknown) => {
    loading = undefined
    throw err
  })
  const rhwp = await loading
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
