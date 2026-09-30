import type * as Rhwp from '@rhwp/core'

/** The document is password-protected; only 한글 can open it. */
export class EncryptedFileError extends Error {}

// rhwp's init() only short-circuits once it has finished, so two callers at the same time
// would fetch and compile the WASM twice. A failed load is retried next time.
let loading: Promise<typeof Rhwp> | undefined

function loadRhwp(): Promise<typeof Rhwp> {
  // Dynamic import keeps the reader out of the app bundle; preloadHwp() starts it after load.
  loading ??= import('@rhwp/core')
    .then(async (rhwp) => {
      await rhwp.default()
      return rhwp
    })
    .catch((err: unknown) => {
      loading = undefined
      throw err
    })
  return loading
}

/**
 * Fetches and compiles the reader (~3.7 MB gzipped WASM) right after the page has loaded; a
 * file dropped before that finishes waits only for the rest (ADR 0006). Failures are retried.
 */
export function preloadHwp(): void {
  loadRhwp().catch(() => {})
}

/**
 * HWP 5 binary (an OLE compound file, whatever the extension says) via rhwp's WASM build.
 * `getTextFileUnicode` is Hancom's GetTextFile("UNICODE"): body and table cells in reading
 * order, footnotes left out.
 */
export async function extractHwpText(bytes: ArrayBuffer): Promise<string> {
  const rhwp = await loadRhwp()
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
