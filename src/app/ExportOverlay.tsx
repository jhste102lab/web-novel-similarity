import { useEffect, useRef, useState } from 'react'
import { pngPieces, printPages, savePdf, savePng } from '../export/save.ts'

interface Props {
  fileName: string
  onClose: () => void
  /** Report options, shown in a row under the title. */
  options: React.ReactNode
  children: React.ReactNode
}

export function ExportOverlay({ fileName, onClose, options, children }: Props) {
  const [menu, setMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  const [size, setSize] = useState({ pages: 1, pngs: 1 })
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  const report = (): HTMLElement | null => {
    const node = body.current?.firstElementChild
    return node instanceof HTMLElement ? node : null
  }
  // Re-measured whenever the report's size changes, i.e. after an option changed its content.
  useEffect(() => {
    const node = body.current?.firstElementChild
    if (!(node instanceof HTMLElement)) return
    const observer = new ResizeObserver(() => {
      const next = { pages: printPages(node), pngs: pngPieces(node).length }
      setSize((s) => (s.pages === next.pages && s.pngs === next.pngs ? s : next))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const save = async (kind: 'png' | 'pdf'): Promise<void> => {
    const node = report()
    if (!node) return
    setMenu(false)
    setBusy(true)
    try {
      if (kind === 'png') await savePng(node, fileName)
      else savePdf(fileName)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ov" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="panel">
        <div className="ph">
          <h2>내보내기</h2>
          <div className="dd">
            <button className="btn primary" disabled={busy} onClick={() => setMenu(!menu)}>
              {busy ? '만드는 중…' : '파일로 저장 ▾'}
            </button>
            {menu && (
              <div className="menu">
                <button onClick={() => save('png')}>
                  PNG{size.pngs > 1 && ` · ${size.pngs}장 (압축 파일)`}
                </button>
                <button onClick={() => save('pdf')}>PDF · {size.pages.toLocaleString()}쪽</button>
              </div>
            )}
          </div>
          <button className="x" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="ph2">
          {options}
          <span className="est">A4 약 {size.pages.toLocaleString()}쪽</span>
        </div>
        <div className="body" ref={body}>
          {children}
        </div>
      </div>
    </div>
  )
}
