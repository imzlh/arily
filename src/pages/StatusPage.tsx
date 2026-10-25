import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  Power,
  RefreshCw,
  Save,
  Server,
  SlidersHorizontal,
} from 'lucide-react'
import { client, errorText } from '@/api/rpc'
import { useConnection } from '@/stores/connection'
import { useOptions } from '@/stores/options'
import { toast } from '@/stores/toasts'
import { formatSpeed } from '@/lib/format'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { ConnectionEventLog } from '@/components/ConnectionEventLog'
import { useConfirm } from '@/hooks/useConfirm'

/** Header badge per RPC state; dot colors follow the sidebar/global-stats convention. */
const STATUS_BADGE: Record<string, { label: string; variant: BadgeVariant; dot: string }> = {
  connected: { label: '已连接', variant: 'success', dot: 'bg-success' },
  connecting: { label: '连接中', variant: 'warning', dot: 'bg-warning animate-pulse' },
  disconnected: { label: '已断开', variant: 'muted', dot: 'bg-muted-foreground/40' },
  idle: { label: '未连接', variant: 'muted', dot: 'bg-muted-foreground/40' },
}

/** Bordered meta chip under the connection title. */
const META_CHIP =
  'inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs leading-4 text-muted-foreground'

/** Definition-list options shown in the quick overview. */
const OVERVIEW_OPTIONS: string[] = [
  'max-concurrent-downloads',
  'max-overall-download-limit',
  'max-connection-per-server',
  'split',
  'bt-max-peers',
  'seed-ratio',
]

/** Maps option keys to display labels. */
const OPTION_LABELS: Record<string, string> = {
  'max-concurrent-downloads': '最大同时下载数',
  'max-overall-download-limit': '全局下载限速',
  'max-connection-per-server': '每服务器连接数',
  split: '单任务分片数',
  'bt-max-peers': 'BT 最大连接数',
  'seed-ratio': '做种分享率',
}

export function StatusPage() {
  const confirm = useConfirm()

  const state = useConnection((s) => s.state)
  const useHttp = useConnection((s) => s.useHttp)
  const version = useConnection((s) => s.version)
  const sessionId = useConnection((s) => s.sessionId)
  const features = useConnection((s) => s.enabledFeatures)
  const events = useConnection((s) => s.events)

  const globalOptions = useOptions((s) => s.globalOptions)
  const [savingSession, setSavingSession] = useState(false)

  const connected = state === 'connected'

  const badge: { label: string; variant: BadgeVariant; dot: string } = STATUS_BADGE[state] ?? {
    label: state,
    variant: 'muted',
    dot: 'bg-muted-foreground/40',
  }

  useEffect(() => {
    if (connected) void useOptions.getState().loadGlobal()
  }, [connected])

  async function saveSession() {
    if (savingSession) return
    setSavingSession(true)
    try {
      const ok = await useOptions.getState().saveSession()
      if (ok) toast.success('会话已保存')
      else toast.error(`操作失败：${useOptions.getState().lastError ?? ''}`)
    } finally {
      setSavingSession(false)
    }
  }

  async function shutdown() {
    const ok = await confirm({
      title: '关闭 Aria2',
      description: '确定要关闭 aria2 吗？关闭后所有下载都会停止。',
      confirmText: '关闭 Aria2',
      danger: true,
    })
    if (!ok) return
    try {
      await client.call('forceShutdown')
    } catch (e) {
      // aria2 drops the connection as it exits; only report real RPC errors.
      const message = errorText(e)
      if (!message.includes('连接') && !message.includes('disconnect')) {
        toast.error(`操作失败：${message}`)
      }
    }
  }

  function copySessionId() {
    if (!sessionId) return
    void navigator.clipboard.writeText(sessionId).then(
      () => toast.success('已复制'),
      () => toast.error('复制失败'),
    )
  }

  function optionValue(key: string): string {
    const raw = globalOptions[key] ?? ''
    if (key === 'max-overall-download-limit') return Number(raw) > 0 ? formatSpeed(Number(raw)) : '不限速'
    if (key === 'seed-ratio') {
      const n = Number(raw)
      if (!Number.isFinite(n) || n <= 0) return '—'
      return raw
    }
    return raw || '—'
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-5">
        {/* ------------------------------------------------------- connection */}
        <Card>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 pb-4 pt-5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Server className="size-4.5" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-foreground">连接 (Aria2)</h3>
              <Badge role="status" variant={badge.variant}>
                <span className={cn('size-1.5 shrink-0 rounded-full', badge.dot)} aria-hidden="true" />
                {badge.label}
              </Badge>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => useConnection.getState().reconnect()}>
                <RefreshCw className="size-3.5" aria-hidden="true" />
                保存并重连
              </Button>
              <Button variant="secondary" size="sm" loading={savingSession} disabled={!connected} onClick={() => void saveSession()}>
                <Save className="size-3.5" aria-hidden="true" />
                保存会话
              </Button>
              <Button variant="danger" size="sm" disabled={!connected} onClick={() => void shutdown()}>
                <Power className="size-3.5" aria-hidden="true" />
                关闭 Aria2
              </Button>
            </div>
          </div>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={META_CHIP}>
                传输
                <span className="font-medium text-foreground">{useHttp ? 'HTTP' : 'WebSocket'}</span>
              </span>
              <span className={META_CHIP}>
                aria2
                <span className="font-mono font-medium text-foreground">{version || '-'}</span>
              </span>
              {sessionId ? (
                <button
                  type="button"
                  className={cn(META_CHIP, 'cursor-pointer transition-colors hover:bg-accent hover:text-foreground')}
                  title="点击复制会话 ID"
                  onClick={copySessionId}
                >
                  会话
                  <span className="font-mono font-medium text-foreground">{sessionId.slice(0, 12)}…</span>
                </button>
              ) : (
                <span className={META_CHIP}>
                  会话
                  <span className="font-mono font-medium text-foreground">-</span>
                </span>
              )}
            </div>
            {features.length > 0 && (
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">启用特性 {features.length}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {features.map((f) => (
                    <span
                      key={f}
                      className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* -------------------------------------------------------------- log */}
        <ConnectionEventLog events={events} onClear={() => useConnection.getState().clearEvents()} />

        {/* ---------------------------------------------------------- options */}
        <Card>
          <CardHeader
            icon={SlidersHorizontal}
            title="下载选项速览"
            actions={
              <Link to="/settings" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                前往设置 <span aria-hidden="true">→</span>
              </Link>
            }
          />
          <CardContent>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-xs">
              {OVERVIEW_OPTIONS.map((key) => (
                <div key={key} className="contents">
                  <dt className="truncate text-muted-foreground" title={key}>
                    {OPTION_LABELS[key]}
                  </dt>
                  <dd className="text-end font-medium text-foreground tabular">{optionValue(key)}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
