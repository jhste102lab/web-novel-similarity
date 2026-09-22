import { useEffect, useRef, useState } from 'react'
import type { Grid, GridCell } from '../shared/types.ts'

interface Props {
  grid: Grid
  /** Axis captions, e.g. ['A', 'B'] for a compare and ['회차', '회차'] for a repeat. */
  axis: [string, string]
  /** Chapter pair of the selected row, drawn as a crosshair. */
  cursor: { a: number | null; b: number | null } | null
  onPick: (cell: GridCell) => void
}

/** Side of the drawing area in CSS pixels; the canvas backing store is scaled by DPR. */
const SIZE = 328
const PAD = 1

/**
 * Chapter × chapter density map, the way a genome dotplot shows shared sequence.
 * A copied chapter is one dot, a copied arc is a diagonal streak, a scattered rewrite is a cloud,
 * none of which is visible in a flat list of findings.
 */
export function Dotplot({ grid, axis, cursor, onPick }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<GridCell | null>(null)
  const aSpan = grid.aMax - grid.aMin + 1
  const bSpan = grid.bMax - grid.bMin + 1
  const inner = SIZE - PAD * 2
  const cellW = Math.max(1, inner / bSpan)
  const cellH = Math.max(1, inner / aSpan)
  const dotW = Math.max(3, cellW)
  const dotH = Math.max(3, cellH)

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const dpr = Math.min(2, devicePixelRatio || 1)
    el.width = SIZE * dpr
    el.height = SIZE * dpr
    const ctx = el.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, SIZE, SIZE)

    // Equal chapter numbers on both axes: on a rewrite of the same work the hits land here.
    if (grid.aMin <= grid.bMax && grid.bMin <= grid.aMax) {
      ctx.strokeStyle = 'rgba(0,0,0,0.06)'
      ctx.beginPath()
      const from = Math.max(grid.aMin, grid.bMin)
      const to = Math.min(grid.aMax, grid.bMax)
      ctx.moveTo(PAD + (from - grid.bMin) * cellW, PAD + (from - grid.aMin) * cellH)
      ctx.lineTo(PAD + (to - grid.bMin + 1) * cellW, PAD + (to - grid.aMin + 1) * cellH)
      ctx.stroke()
    }

    let peak = 1
    for (const c of grid.cells) if (c.count > peak) peak = c.count
    for (const c of grid.cells) {
      // Density drives opacity on a square-root scale: one hit stays visible next to a hundred.
      const weight = 0.25 + 0.75 * Math.sqrt(c.count / peak)
      ctx.fillStyle = c.near > 0 ? `rgba(220,38,38,${weight})` : `rgba(217,119,6,${weight})`
      ctx.fillRect(
        PAD + (c.b - grid.bMin) * cellW - (dotW - cellW) / 2,
        PAD + (c.a - grid.aMin) * cellH - (dotH - cellH) / 2,
        dotW,
        dotH,
      )
    }

    if (cursor && cursor.a !== null && cursor.b !== null) {
      ctx.strokeStyle = 'rgba(17,17,17,0.55)'
      ctx.lineWidth = 1
      const x = PAD + (cursor.b - grid.bMin) * cellW + cellW / 2
      const y = PAD + (cursor.a - grid.aMin) * cellH + cellH / 2
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, SIZE)
      ctx.moveTo(0, y)
      ctx.lineTo(SIZE, y)
      ctx.stroke()
    }
  }, [grid, cursor, cellW, cellH, dotW, dotH])

  const cellAt = (e: React.MouseEvent<HTMLCanvasElement>): GridCell | null => {
    const box = e.currentTarget.getBoundingClientRect()
    const b = grid.bMin + Math.floor((e.clientX - box.left - PAD) / cellW)
    const a = grid.aMin + Math.floor((e.clientY - box.top - PAD) / cellH)
    let best: GridCell | null = null
    let bestDist = Infinity
    for (const c of grid.cells) {
      const dist = Math.abs(c.a - a) + Math.abs(c.b - b)
      // Snapping keeps single-pixel dots clickable on a 500-chapter map.
      if (dist < bestDist && dist <= Math.ceil(6 / Math.min(cellW, cellH))) {
        best = c
        bestDist = dist
      }
    }
    return best
  }

  return (
    <div className="dotplot">
      <canvas
        ref={canvas}
        style={{ width: SIZE, height: SIZE }}
        onMouseMove={(e) => setHover(cellAt(e))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const cell = cellAt(e)
          if (cell) onPick(cell)
        }}
      />
      <div className="axis">
        <span>
          ↓ {axis[0]} {grid.aMin}~{grid.aMax}화
        </span>
        <span>
          → {axis[1]} {grid.bMin}~{grid.bMax}화
        </span>
      </div>
      <div className="hint">
        {hover
          ? `${axis[0]} ${hover.a}화 ↔ ${axis[1]} ${hover.b}화 · ${hover.count}곳`
          : grid.truncated
            ? `밀도 상위 ${grid.cells.length.toLocaleString()}개 회차쌍`
            : `회차쌍 ${grid.cells.length.toLocaleString()}개 · 점을 누르면 이동해요`}
      </div>
    </div>
  )
}
