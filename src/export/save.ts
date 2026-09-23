// Browsers cap canvas dimensions (~16k–32k px), so a long report cannot be rasterised as one
// image. PNG scales down to fit the cap; PDF goes through the browser's print dialog, which
// paginates real text (print rules live in app/styles/export.css).
const MAX_CANVAS_SIDE = 16_000

export async function savePng(node: HTMLElement, name: string): Promise<void> {
  // Dynamic import: 200 kB library loaded only when a PNG is requested.
  const { default: html2canvas } = await import('html2canvas-pro')
  const scale = Math.min(2, MAX_CANVAS_SIDE / Math.max(node.scrollHeight, node.scrollWidth))
  const canvas = await html2canvas(node, { scale, backgroundColor: '#ffffff' })
  const { promise, resolve } = Promise.withResolvers<Blob | null>()
  canvas.toBlob(resolve, 'image/png')
  const blob = await promise
  if (!blob) throw new Error('png: toBlob failed')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.png`
  a.click()
  URL.revokeObjectURL(url)
}

export function savePdf(name: string): void {
  const title = document.title
  document.title = name // becomes the suggested PDF file name
  window.print()
  document.title = title
}
