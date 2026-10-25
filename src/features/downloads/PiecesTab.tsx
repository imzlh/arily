import { useMemo } from 'react'
import type { Aria2Task } from '@/types/aria2'
import { formatBytes, formatPercent } from '@/lib/format'
import { cn } from '@/lib/cn'
import { Progress } from '@/components/ui/Progress'

/** 60 columns of 6px squares (+ 2px gaps) fit the inspector comfortably. */
const MAX_SLOTS = 60 * 40

/** Decode the hex bitfield into a list of piece bits (index 0 = MSB of the first byte). */
function parseBitfield(hex: string | undefined, numPieces: number): boolean[] {
  const bits: boolean[] = []
  if (!hex) return bits
  const text = hex.slice(0, Math.ceil(numPieces / 8) * 2)
  for (let i = 0; i + 1 < text.length; i += 2) {
    const byte = parseInt(text.slice(i, i + 2), 16)
    if (!Number.isFinite(byte)) break
    for (let b = 7; b >= 0; b--) bits.push(((byte >> b) & 1) === 1)
  }
  return bits
}

export function PiecesTab({ task }: { task: Aria2Task }) {
  const numPieces = Math.max(0, Number(task.numPieces) || 0)
  const pieceLength = Number(task.pieceLength) || 0
  const total = Number(task.totalLength) || 0

  const bits = useMemo(() => parseBitfield(task.bitfield, numPieces), [task.bitfield, numPieces])
  const count = Math.min(bits.length, numPieces)

  // When there are more pieces than slots, bucket consecutive pieces into one
  // square that is filled only when every piece in the bucket is complete.
  const slots = useMemo(() => {
    if (count === 0) return [] as boolean[]
    const stride = Math.max(1, Math.ceil(count / MAX_SLOTS))
    if (stride === 1) return bits.slice(0, count)
    const out: boolean[] = []
    for (let i = 0; i < count; i += stride) {
      let all = true
      for (let j = i; j < Math.min(i + stride, count); j++) {
        if (!bits[j]) {
          all = false
          break
        }
      }
      out.push(all)
    }
    return out
  }, [bits, count])

  const sampled = count > MAX_SLOTS
  const doneCount = bits.slice(0, count).filter(Boolean).length
  const verified = Number(task.verifiedLength) || 0
  const verifying = task.verifyIntegrityPending === 'true'

  if (numPieces === 0) {
    return <p className="py-8 text-center text-[11px] text-muted-foreground">—</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px] text-muted-foreground tabular">
        <span>
          {`${doneCount} / ${numPieces} 个分片`}
          {pieceLength > 0 && ` · ${formatBytes(pieceLength)}`}
          {numPieces > 0 && ` · ${formatPercent(doneCount, numPieces).toFixed(1)}%`}
        </span>
        {verifying && verified > 0 && (
          <span className="text-foreground">
            校验中 {formatPercent(verified, total).toFixed(1)}%
          </span>
        )}
      </div>

      {verifying && (
        <Progress value={formatPercent(verified, total)} striped className="h-1.5" aria-label="校验中" />
      )}

      {slots.length === 0 ? (
        <p className="py-8 text-center text-[11px] text-muted-foreground">尚未获取分片信息</p>
      ) : (
        <div
          className="flex flex-wrap content-start gap-[2px] rounded-md border border-border bg-muted/20 p-2"
          role="img"
          aria-label={`${doneCount} / ${numPieces} 个分片`}
        >
          {slots.map((filled, index) => (
            <span
              key={index}
              className={cn('size-1.5 shrink-0 rounded-[1px]', filled ? 'bg-down' : 'bg-muted')}
            />
          ))}
        </div>
      )}

      {sampled && <p className="text-[11px] text-muted-foreground">分片过多，已抽样显示</p>}

      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-[1px] bg-down" aria-hidden="true" />
          已下载
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-[1px] bg-muted" aria-hidden="true" />
          未下载
        </span>
      </div>
    </div>
  )
}
