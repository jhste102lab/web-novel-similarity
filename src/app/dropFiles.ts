/** Files from a drop event; dropped folders are walked recursively (Chromium/WebKit entry API). */
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items].map((it) => it.webkitGetAsEntry?.() ?? null)
  if (entries.some((e) => e?.isDirectory)) {
    const out: File[] = []
    for (const e of entries) if (e) await walk(e, out)
    return out
  }
  return [...dt.files]
}

async function walk(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    const { promise, resolve, reject } = Promise.withResolvers<File>()
    ;(entry as FileSystemFileEntry).file(resolve, reject)
    const file = await promise
    if (!file.name.startsWith('.')) out.push(file)
    return
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  for (;;) {
    const { promise, resolve, reject } = Promise.withResolvers<FileSystemEntry[]>()
    reader.readEntries(resolve, reject)
    const batch = await promise
    if (batch.length === 0) return
    for (const child of batch) await walk(child, out)
  }
}
