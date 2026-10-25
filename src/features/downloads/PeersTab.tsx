import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Ban, Lock, Unlock } from 'lucide-react'
import { client } from '@/api/rpc'
import { useConnection } from '@/stores/connection'
import { formatBytes } from '@/lib/format'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { Tooltip } from '@/components/ui/Tooltip'

/** A peer as returned by aria2.getPeers */
interface Peer {
  peerId: string
  ip: string
  port: string
  bitfield?: string
  amChoking: string
  peerChoking: string
  downloadSpeed: string
  uploadSpeed: string
  seeder: string
}

type SortKey = 'address' | 'client' | 'progress' | 'speed' | 'flags'

const POLL_INTERVAL = 2000

/** aria2 reports peer IDs as a percent-encoded binary string. */
function decodePeerId(peerId: string | undefined): string {
  if (!peerId) return ''
  try {
    return decodeURIComponent(peerId)
  } catch {
    return peerId
  }
}

/** Strip unprintable characters so binary-ish peer IDs stay readable. */
function printable(text: string): string {
  return text.replace(/[^\x20-\x7e]/g, '')
}

const CLIENT_NAMES: [RegExp, string][] = [
  [/^-qB/, 'qBittorrent'],
  [/^-TR/, 'Transmission'],
  [/^-UT/, 'µTorrent'],
  [/^-DE/, 'Deluge'],
  [/^-LT/, 'libtorrent'],
  [/^-AZ/, 'Azureus'],
  [/^-XL/, 'Xunlei'],
  [/^-FD/, 'Free Download Manager'],
  [/^-WW/, 'WebTorrent'],
  [/^-AR/, 'aria2'],
]

function clientName(peer: Peer): string {
  const raw = decodePeerId(peer.peerId)
  for (const [re, name] of CLIENT_NAMES) {
    if (re.test(raw)) return name
  }
  return printable(raw) || '—'
}

function num(v: string | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Completion percentage (0-100) implied by a peer's piece bitfield, or null when unknown. */
function peerProgress(bitfield: string | undefined, numPieces: number): number | null {
  if (!bitfield || numPieces <= 0) return null
  const text = bitfield.slice(0, Math.ceil(numPieces / 8) * 2)
  let done = 0
  let idx = 0
  for (let i = 0; i + 1 < text.length; i += 2) {
    const byte = parseInt(text.slice(i, i + 2), 16)
    if (!Number.isFinite(byte)) break
    for (let b = 7; b >= 0; b--) {
      if (idx >= numPieces) return Math.round((done / numPieces) * 100)
      if ((byte >> b) & 1) done++
      idx++
    }
  }
  return Math.round((done / numPieces) * 100)
}

/** Order peers for every sort key except 'progress' (needs numPieces, handled at the call site). */
function compare(a: Peer, b: Peer, key: Exclude<SortKey, 'progress'>): number {
  switch (key) {
    case 'address':
      return `${a.ip}:${a.port}`.localeCompare(`${b.ip}:${b.port}`)
    case 'client':
      return clientName(a).localeCompare(clientName(b))
    case 'speed':
      return num(a.downloadSpeed) + num(a.uploadSpeed) - (num(b.downloadSpeed) + num(b.uploadSpeed))
    case 'flags': {
      // Seeders first, then non-choking, then choking
      const rank = (p: Peer) => (p.seeder === 'true' ? 0 : p.amChoking === 'false' ? 1 : 2)
      return rank(a) - rank(b)
    }
  }
}

export function PeersTab({
  gid,
  numPieces = 0,
  onCount,
}: {
  gid: string
  numPieces?: number
  onCount?: (count: number) => void
}) {
  const [peers, setPeers] = useState<Peer[] | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('speed')
  const [asc, setAsc] = useState(false)
  const connected = useConnection((s) => s.state === 'connected')

  useEffect(() => {
    if (!connected) return
    let stopped = false
    let timer = 0
    let pending = false
    const tick = async () => {
      if (stopped || pending) return
      pending = true
      try {
        const res = await client.call<Peer[]>('getPeers', [gid])
        if (!stopped) setPeers(res ?? [])
      } catch {
        // Transport/rpc errors already surface in the connection log.
      } finally {
        pending = false
        // Chain the next poll only after this one settles, so slow RPCs never pile up.
        if (!stopped) timer = window.setTimeout(() => void tick(), POLL_INTERVAL)
      }
    }
    void tick()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [gid, connected])

  // Report the peer count so the tab label can show it as a badge.
  useEffect(() => {
    onCount?.(peers?.length ?? 0)
  }, [peers, onCount])

  const sorted = useMemo(() => {
    if (!peers) return []
    const progressOf = (p: Peer) => peerProgress(p.bitfield, numPieces)
    const list = [...peers]
    list.sort((a, b) => {
      if (sortKey === 'progress') return (progressOf(a) ?? -1) - (progressOf(b) ?? -1)
      return compare(a, b, sortKey)
    })
    return asc ? list : list.reverse()
  }, [peers, sortKey, asc, numPieces])

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setAsc((v) => !v)
    } else {
      setSortKey(key)
      setAsc(key === 'address' || key === 'client')
    }
  }

  const header = (key: SortKey, label: string, className?: string) => {
    const active = key === sortKey
    const Icon = !active ? ArrowUpDown : asc ? ArrowUp : ArrowDown
    return (
      <th scope="col" className={cn('h-8 px-2 text-start font-medium', className)}>
        <button
          type="button"
          onClick={() => toggleSort(key)}
          aria-sort={active ? (asc ? 'ascending' : 'descending') : 'none'}
          className={cn(
            'inline-flex items-center gap-1 rounded outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40',
            active ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {label}
          <Icon className={cn('size-3 shrink-0', !active && 'opacity-40')} aria-hidden="true" />
        </button>
      </th>
    )
  }

  if (peers && sorted.length === 0) {
    return <p className="py-8 text-center text-[11px] text-muted-foreground">暂无已连接节点</p>
  }

  return (
    <div className="min-w-0">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[360px] border-collapse text-[11px]">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              {header('address', '地址')}
              {header('client', '客户端')}
              {numPieces > 0 && header('progress', '进度')}
              {header('speed', '速度', 'text-end')}
              {header('flags', '标志', 'text-end')}
            </tr>
          </thead>
          <tbody>
            {sorted.map((peer) => {
              const down = num(peer.downloadSpeed)
              const up = num(peer.uploadSpeed)
              const pct = numPieces > 0 ? peerProgress(peer.bitfield, numPieces) : null
              const seeder = peer.seeder === 'true'
              const amChoking = peer.amChoking === 'true'
              const peerChoking = peer.peerChoking === 'true'
              const client = clientName(peer)
              const rawId = decodePeerId(peer.peerId)
              return (
                <tr key={`${peer.ip}:${peer.port}`} className="h-8 border-b border-border/60 last:border-b-0 hover:bg-muted/40">
                  <td className="max-w-40 truncate px-2 font-mono tabular" title={`${peer.ip}:${peer.port}`}>
                    {peer.ip}:{peer.port}
                  </td>
                  <td className="max-w-28 truncate px-2 text-muted-foreground" title={rawId || peer.peerId}>
                    {client}
                  </td>
                  {numPieces > 0 && (
                    <td className="px-2">
                      {pct === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex items-center gap-1.5" title={`${pct}%`}>
                          <Progress
                            value={pct}
                            variant={pct >= 100 ? 'success' : 'default'}
                            className="h-1 w-12 shrink-0"
                            aria-label={`进度 ${pct}%`}
                          />
                          <span className="shrink-0 text-[10px] text-muted-foreground tabular">{pct}%</span>
                        </div>
                      )}
                    </td>
                  )}
                  <td className="whitespace-nowrap px-2 text-end tabular">
                    <span className={down > 0 ? 'text-down' : 'text-muted-foreground'}>{formatBytes(down)}/s</span>
                    <span className="mx-1 text-muted-foreground/50">·</span>
                    <span className={up > 0 ? 'text-up' : 'text-muted-foreground'}>{formatBytes(up)}/s</span>
                  </td>
                  <td className="px-2">
                    <div className="flex items-center justify-end gap-1">
                      {seeder ? (
                        <Badge variant="success">做种</Badge>
                      ) : (
                        <Badge variant="muted">下载</Badge>
                      )}
                      {peerChoking && (
                        <Tooltip content="对方暂时不发送数据">
                          <span className="text-muted-foreground" aria-label="对方暂时不发送数据">
                            <Lock className="size-3" aria-hidden="true" />
                          </span>
                        </Tooltip>
                      )}
                      {amChoking && (
                        <Tooltip content="我暂时不发送数据">
                          <span className="text-muted-foreground" aria-label="我暂时不发送数据">
                            <Ban className="size-3" aria-hidden="true" />
                          </span>
                        </Tooltip>
                      )}
                      {!amChoking && !peerChoking && (
                        <Tooltip content="正在交换数据">
                          <span className="text-muted-foreground" aria-label="正在交换数据">
                            <Unlock className="size-3" aria-hidden="true" />
                          </span>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 px-1 text-[11px] text-muted-foreground tabular">{`共 ${sorted.length} 个节点`}</div>
    </div>
  )
}
