import type { RunStats } from '../shared/types.ts'

const ms = (v: number): string => `${v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString()}ms`

/**
 * What the run actually cost. The pruning line is the whole point of the fingerprint index:
 * it names how few of the possible sentence pairs were ever scored.
 */
export function Diagnostics({ stats, onClose }: { stats: RunStats; onClose: () => void }) {
  const kept = stats.pairsNaive > 0 ? (stats.pairsScored / stats.pairsNaive) * 100 : 0
  const speed = stats.totalMs > 0 ? stats.chars / 1000 / (stats.totalMs / 1000) : 0
  const rows: [string, string][] = [
    ['문장 분해 · 색인', ms(stats.indexMs)],
    ['지문 추출 (winnowing)', ms(stats.fingerprintMs)],
    ['후보 탐색 · 정밀 비교', ms(stats.scanMs)],
    ['회차별 묶기', ms(stats.groupMs)],
    ['전체', ms(stats.totalMs)],
    ['문장 수', `${stats.sentencesA.toLocaleString()} × ${stats.sentencesB.toLocaleString()}`],
    ['가능한 문장쌍', stats.pairsNaive.toLocaleString()],
    ['실제 비교한 쌍', `${stats.pairsScored.toLocaleString()} (${kept.toFixed(4)}%)`],
    ['처리량', `${Math.round(speed).toLocaleString()}천 자/초`],
  ]
  return (
    <div className="hud diag">
      <div className="ph">
        진단
        <button className="x" onClick={onClose} title="닫기 (d)">
          ×
        </button>
      </div>
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const KEYS: [string, string][] = [
  ['j / ↓', '다음 결과'],
  ['k / ↑', '이전 결과'],
  ['g / G', '처음 / 마지막'],
  ['/', '찾기'],
  ['x', '내보낼 결과 선택 · 해제'],
  ['Shift+클릭', '사이 결과 모두 선택'],
  ['c', '현재 문장 복사'],
  ['d', '진단'],
  ['Esc', '찾기 해제 · 패널 닫기'],
  ['?', '이 목록'],
]

export function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <div className="hud keys">
      <div className="ph">
        단축키
        <button className="x" onClick={onClose} title="닫기 (Esc)">
          ×
        </button>
      </div>
      <table>
        <tbody>
          {KEYS.map(([k, v]) => (
            <tr key={k}>
              <th>
                <kbd>{k}</kbd>
              </th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
