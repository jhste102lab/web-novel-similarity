/** Decodes .txt bytes: UTF-8/UTF-16 by BOM, strict UTF-8, then legacy CP949 (EUC-KR). */
export function decodeText(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes)
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2))
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2))
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(u8)
  } catch {
    return new TextDecoder('euc-kr').decode(u8)
  }
}
