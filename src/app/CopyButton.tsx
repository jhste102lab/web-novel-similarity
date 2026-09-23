import { useState } from 'react'

/** navigator.clipboard is undefined on plain-http origins (a LAN preview), so fall back to execCommand. */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard) return navigator.clipboard.writeText(text)
  const area = document.createElement('textarea')
  area.value = text
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.append(area)
  area.select()
  document.execCommand('copy')
  area.remove()
}

/** What a copy puts on the clipboard: one sentence, or an A/B pair labelled for pasting into a report. */
export function pairText(a: string, b?: string): string {
  return b ? `A: ${a}\n\nB: ${b}` : a
}

export function CopyButton({ a, b }: { a: string; b?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className={`copy ${done ? 'done' : ''}`}
      onClick={() => {
        void copyText(pairText(a, b)).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        })
      }}
    >
      {done ? '✓ 복사 완료' : '문장 복사'}
    </button>
  )
}
