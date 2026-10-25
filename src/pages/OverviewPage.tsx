import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Activity,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  Cpu,
  Gauge,
  HardDrive,
  Hourglass,
  Layers,
  Magnet,
  Pause,
  CircleHelp,
  XCircle,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { useTasks } from '@/stores/tasks'
import { useConnection } from '@/stores/connection'
import { useOptions } from '@/stores/options'
import { formatBytes, formatSpeed } from '@/lib/format'
import { isTorrent } from '@/lib/task'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ history */

export interface SpeedSample {
  t: number
  down: number
  up: number
}

/** Ring buffer length; 60 samples at 1s = the last minute */
export const HISTORY_SIZE = 60

/**
 * Rolling global-speed history. Sampling happens on its own timer so the chart
 * keeps a smooth cadence even when polling is slower than 1s.
 */
export function useSpeedHistory(): SpeedSample[] {
  const [samples, setSamples] = useState<SpeedSample[]>([])
  const ref = useRef<SpeedSample[]>([])

  useEffect(() => {
    const id = window.setInterval(() => {
      const { stat } = useTasks.getState()
      const now = Date.now()
      ref.current = [...ref.current, { t: now, down: Number(stat.downloadSpeed) || 0, up: Number(stat.uploadSpeed) || 0 }].slice(
        -HISTORY_SIZE,
      )
      setSamples(ref.current)
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  return samples
}

/* ---------------------------------------------------------------- helpers */

function formatAxisSpeed(value: number): string {
  if (value <= 0) return '0'
  return formatSpeed(value).replace('/s', '')
}

function formatClock(t: number): string {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

interface TileProps {
  icon: typeof Activity
  label: string
  value: ReactNode
  sub?: string
  tone?: 'down' | 'up' | 'default'
  className?: string
}

function Tile({ icon: Icon, label, value, sub, tone = 'default', className }: TileProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-3.5 shadow-soft', className)}>
      <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
        <span
          className={cn(
            'grid size-5 shrink-0 place-items-center rounded-md',
            tone === 'down' ? 'bg-down/10 text-down' : tone === 'up' ? 'bg-up/10 text-up' : 'bg-accent text-muted-foreground',
          )}
        >
          <Icon className="size-3" aria-hidden="true" />
        </span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2 text-[22px] leading-none font-semibold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">{sub}</div>}
    </div>
  )
}

const CONNECTION_LABEL: Record<string, string> = {
  connected: '已连接',
  connecting: '连接中',
  disconnected: '已断开',
  idle: '未连接',
}

/* ------------------------------------------------------------------- page */

export function OverviewPage() {
  const stat = useTasks((s) => s.stat)
  const active = useTasks((s) => s.active)
  const waiting = useTasks((s) => s.waiting)
  const stopped = useTasks((s) => s.stopped)
  const connection = useConnection((s) => s.state)
  const globalOptions = useOptions((s) => s.globalOptions)
  const samples = useSpeedHistory()

  const down = Number(stat.downloadSpeed) || 0
  const up = Number(stat.uploadSpeed) || 0

  /* ---------------------------------------------------------- aggregates */
  const agg = useMemo(() => {
    const live = [...active, ...waiting]
    const complete = stopped.filter((task) => task.status === 'complete')
    const error = stopped.filter((task) => task.status === 'error')
    const paused = waiting.filter((task) => task.status === 'paused')
    let done = 0
    let total = 0
    let peers = 0
    let torrents = 0
    let seeding = 0
    let uploaded = 0
    for (const task of live) {
      done += Number(task.completedLength) || 0
      total += Number(task.totalLength) || 0
      peers += Number(task.connections) || 0
      uploaded += Number(task.uploadLength) || 0
      if (isTorrent(task)) {
        torrents += 1
        if (task.seeder === 'true') seeding += 1
      }
    }
    for (const task of stopped) uploaded += Number(task.uploadLength) || 0
    return {
      live,
      complete,
      error,
      paused,
      waitingCount: waiting.filter((task) => task.status === 'waiting').length,
      done,
      total,
      peers,
      torrents,
      seeding,
      uploaded,
      downloaded: complete.reduce((sum, task) => sum + (Number(task.totalLength) || 0), 0),
      progress: total > 0 ? (done / total) * 100 : 0,
    }
  }, [active, waiting, stopped])

  /** Keep the plot fully zeroed only while nothing has ever been seen */
  const hasTraffic = samples.some((s) => s.down > 0 || s.up > 0)
  const peak = useMemo(
    () => samples.reduce((m, s) => Math.max(m, s.down, s.up), 0),
    [samples],
  )
  const peakDown = useMemo(() => samples.reduce((m, s) => Math.max(m, s.down), 0), [samples])
  const peakUp = useMemo(() => samples.reduce((m, s) => Math.max(m, s.up), 0), [samples])

  const allLimits =
    (Number(globalOptions['max-overall-download-limit']) || 0) + (Number(globalOptions['max-overall-upload-limit']) || 0) > 0
  const unlimited = (v?: string) => !v || v === '0'

  // Status distribution (all tasks known to this session)
  const distribution = [
    { key: 'active', label: '下载中', count: active.length, tone: 'bg-down' },
    { key: 'waiting', label: '等待中', count: agg.waitingCount, tone: 'bg-warning/70' },
    { key: 'paused', label: '已暂停', count: agg.paused.length, tone: 'bg-warning/40' },
    { key: 'complete', label: '已完成', count: agg.complete.length, tone: 'bg-success' },
    { key: 'error', label: '出错', count: agg.error.length, tone: 'bg-destructive' },
  ]
  const distTotal = Math.max(1, distribution.reduce((sum, d) => sum + d.count, 0))

  const connectionTone =
    connection === 'connected'
      ? 'bg-success/10 text-success'
      : connection === 'connecting'
        ? 'bg-warning/10 text-warning'
        : 'bg-destructive/10 text-destructive'
  const connectionDot = connection === 'connected' ? 'bg-success' : connection === 'connecting' ? 'bg-warning' : 'bg-destructive'

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-4 px-6 pt-4 pb-6">
        {/* ---------------------------------------------- headline numbers */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Tile
            icon={ArrowDown}
            tone="down"
            label="下载速度"
            value={<span className="text-down">{formatSpeed(down)}</span>}
            sub={
              unlimited(globalOptions['max-overall-download-limit'])
                ? '不限速'
                : `上限 ${formatSpeed(globalOptions['max-overall-download-limit'] ?? 0)}`
            }
          />
          <Tile
            icon={ArrowUp}
            tone="up"
            label="上传速度"
            value={<span className="text-up">{formatSpeed(up)}</span>}
            sub={
              unlimited(globalOptions['max-overall-upload-limit'])
                ? '不限速'
                : `上限 ${formatSpeed(globalOptions['max-overall-upload-limit'] ?? 0)}`
            }
          />
          <Tile
            icon={Activity}
            label="活动任务"
            value={Number(stat.numActive) || 0}
            sub="正在下载的任务数"
          />
          <Tile
            icon={Hourglass}
            label="等待任务"
            value={Number(stat.numWaiting) || 0}
            sub="排队或已暂停的任务数"
          />
          <Tile
            icon={CheckCircle2}
            label="已停止"
            value={`${stat.numStopped} / ${stat.numStoppedTotal}`}
            sub="已完成与出错的记录数"
          />
          <Tile
            icon={Layers}
            label="总进度"
            value={`${agg.progress.toFixed(1)}%`}
            sub={`已完成 ${formatBytes(agg.done)} / 共 ${formatBytes(agg.total)}`}
          />
        </div>

        {/* ------------------------------------------- speed chart (hero) */}
        <Card>
          <CardHeader
            icon={Activity}
            title="实时速度"
            description="最近 1 分钟的整体下载与上传速度"
            actions={
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <span className="size-2 rounded-full bg-down" />
                  {`下载 · 峰值 ${formatSpeed(peakDown)}`}
                </span>
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <span className="size-2 rounded-full bg-up" />
                  {`上传 · 峰值 ${formatSpeed(peakUp)}`}
                </span>
                <span
                  className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5', connectionTone)}
                  title={CONNECTION_LABEL[connection] ?? connection}
                >
                  <span className={cn('size-1.5 rounded-full', connectionDot)} />
                  {CONNECTION_LABEL[connection] ?? connection}
                </span>
              </div>
            }
          />
          <CardContent className="h-[260px] p-2 pt-0">
            {samples.length < 2 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                加载中…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={samples} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="downFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--down)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--down)" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="upFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--up)" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="var(--up)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="t"
                    tickFormatter={formatClock}
                    minTickGap={60}
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => formatAxisSpeed(v)}
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                    domain={[0, (max: number) => Math.max(max * 1.15, 1024)]}
                  />
                  <ChartTooltip
                    contentStyle={{
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      fontSize: 11,
                      color: 'var(--foreground)',
                      boxShadow: '0 8px 24px -12px rgb(0 0 0 / 0.25)',
                    }}
                    labelFormatter={(label) => formatClock(Number(label))}
                    formatter={(value, name) => [formatSpeed(Number(value)), name === 'down' ? '下载' : '上传']}
                  />
                  <Area
                    type="monotone"
                    dataKey="down"
                    stroke="var(--down)"
                    strokeWidth={2}
                    fill="url(#downFill)"
                    isAnimationActive={false}
                  />
                  {hasTraffic && (
                    <Line type="monotone" dataKey="up" stroke="var(--up)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* ------------------------------------- task status distribution */}
          <Card>
            <CardHeader icon={Gauge} title="任务分布" />
            <CardContent className="space-y-3 p-4 pt-0">
              <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted">
                {distribution.map((d) => (
                  <div
                    key={d.key}
                    className={cn('h-full first:rounded-l-full last:rounded-r-full', d.tone)}
                    style={{ width: `${(d.count / distTotal) * 100}%` }}
                  />
                ))}
              </div>
              <ul className="space-y-1.5">
                {distribution.map((d) => (
                  <li key={d.key} className="flex items-center gap-2 text-xs">
                    <span className={cn('size-2 rounded-sm', d.tone)} />
                    <span className="flex-1 text-muted-foreground">{d.label}</span>
                    <span className="font-medium tabular-nums">{d.count}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* -------------------------------------------- session totals */}
          <Card>
            <CardHeader icon={Hourglass} title="本次会话" />
            <CardContent className="space-y-2.5 p-4 pt-0 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <CheckCircle2 className="size-3.5 text-success" />
                  已完成
                </span>
                <span className="font-medium tabular-nums">{agg.complete.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <XCircle className="size-3.5 text-destructive" />
                  出错
                </span>
                <span className="font-medium tabular-nums">{agg.error.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Pause className="size-3.5 text-warning" />
                  已暂停
                </span>
                <span className="font-medium tabular-nums">{agg.paused.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="size-3.5" />
                  等待中
                </span>
                <span className="font-medium tabular-nums">{agg.waitingCount}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2.5">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <ArrowDown className="size-3.5 text-down" />
                  累计下载
                </span>
                <span className="font-medium tabular-nums">{formatBytes(agg.downloaded)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <ArrowUp className="size-3.5 text-up" />
                  累计上传
                </span>
                <span className="font-medium tabular-nums">{formatBytes(agg.uploaded)}</span>
              </div>
            </CardContent>
          </Card>

          {/* ------------------------------------------ engine / network */}
          <Card>
            <CardHeader icon={Cpu} title="引擎与网络" />
            <CardContent className="space-y-2.5 p-4 pt-0 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-muted/60 px-2.5 py-2">
                  <div className="text-[10px] text-muted-foreground">并发数</div>
                  <div className="mt-0.5 font-semibold tabular-nums">
                    {globalOptions['max-concurrent-downloads'] ?? '—'}
                  </div>
                </div>
                <div className="rounded-lg bg-muted/60 px-2.5 py-2">
                  <div className="text-[10px] text-muted-foreground">每任务连接</div>
                  <div className="mt-0.5 font-semibold tabular-nums">
                    {globalOptions['max-connection-per-server'] ?? '—'}
                  </div>
                </div>
                <div className="rounded-lg bg-muted/60 px-2.5 py-2">
                  <div className="text-[10px] text-muted-foreground">BT 任务</div>
                  <div className="mt-0.5 flex items-center gap-1 font-semibold tabular-nums">
                    <Magnet className="size-3 text-muted-foreground" />
                    {agg.torrents}
                  </div>
                </div>
                <div className="rounded-lg bg-muted/60 px-2.5 py-2">
                  <div className="text-[10px] text-muted-foreground">做种中</div>
                  <div className="mt-0.5 flex items-center gap-1 font-semibold tabular-nums">
                    <ArrowUp className="size-3 text-up" />
                    {agg.seeding}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <HardDrive className="size-3.5" />
                  全局限速
                </span>
                <span className="flex items-center gap-1 font-medium text-foreground">
                  <CircleHelp className={cn('size-3', allLimits ? 'text-warning' : 'text-muted-foreground')} />
                  {allLimits ? '已限速' : '不限速'}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Gauge className="size-3.5" />
                  峰值合计
                </span>
                <span className="font-medium text-foreground tabular-nums">{formatSpeed(peak)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
