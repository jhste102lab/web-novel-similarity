import { useEffect, useRef, useState } from 'react'
import { savePdf, savePng } from '../export/save.ts'

interface Props {
  fileName: string
  onClose: () => void
  /** Rendered next to the save button; used for report options. */
  options?: React.ReactNode
  children: React.ReactNode
}

export function ExportOverlay({ fileName, onClose, options, children }: Props) {
  const [menu, setMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  const save = async (kind: 'png' | 'pdf'): Promise<void> => {
    const node = body.current?.firstElementChild
    if (!(node instanceof HTMLElement)) return
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
          {options}
          <div className="dd">
            <button className="btn primary" disabled={busy} onClick={() => setMenu(!menu)}>
              {busy ? '만드는 중…' : '파일로 저장 ▾'}
            </button>
            {menu && (
              <div className="menu">
                <button onClick={() => save('png')}>PNG</button>
                <button onClick={() => save('pdf')}>PDF</button>
              </div>
            )}
          </div>
          <button className="x" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="body" ref={body}>
          {children}
        </div>
      </div>
    </div>
  )
}
