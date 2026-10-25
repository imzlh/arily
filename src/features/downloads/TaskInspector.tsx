import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Gauge,
  Layers,
  Link2,
  Pause,
  Play,
  RotateCw,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { errorText } from '@/api/rpc'
import { useTasks, selectSelectedTask } from '@/stores/tasks'
import { toast } from '@/stores/toasts'
import type { Aria2Task, TaskStatus } from '@/types/aria2'
import {
  basename,
  formatBytes,
  formatEta,
  formatSpeed,
  formatSpeedInput,
  formatTime,
  parseSpeed,
  stripScheme,
} from '@/lib/format'
import {
  getDisplayStatus,
  getErrorsMessage,
  getTaskDownloaded,
  getTaskEta,
  getTaskName,
  getTaskProgress,
  getTaskTotalSize,
  isTorrent,
} from '@/lib/task'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field as FormField } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Progress } from '@/components/ui/Progress'
import { Select } from '@/components/ui/Select'
import { Tabs } from '@/components/ui/Tabs'
import { Textarea } from '@/components/ui/Textarea'
import { Tooltip } from '@/components/ui/Tooltip'
import { useConfirm } from '@/hooks/useConfirm'
import { FilesTab } from './FilesTab'
import { PeersTab } from './PeersTab'
import { TrackerTab } from './TrackerTab'
import { PiecesTab } from './PiecesTab'

type DetailTab = 'details' | 'files' | 'options' | 'peers' | 'pieces'

type ServerGroup = { index: string; servers: { uri: string; currentUri: string; downloadSpeed: string }[] }

const STATUS_VARIANTS: Record<TaskStatus, BadgeVariant> = {
  active: 'info',
  waiting: 'muted',
  paused: 'warning',
  error: 'danger',
  complete: 'success',
  removed: 'muted',
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  active: '下载中',
  waiting: '等待中',
  paused: '已暂停',
  error: '出错',
  complete: '已完成',
  removed: '已移除',
}

const PROGRESS_VARIANT = {
  default: 'default',
  success: 'success',
  danger: 'danger',
} as const

export function TaskInspector() {
  const task = useTasks(selectSelectedTask)
  const hasTasks = useTasks((s) => s.active.length + s.waiting.length + s.stopped.length > 0)

  if (!task) {
    // Nothing to inspect: only invite a selection when there is something to select.
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex flex-1 items-center justify-center">
          {hasTasks ? (
            <EmptyState icon={Layers} title={<span className="text-muted-foreground">选择左侧任务查看详情</span>} />
          ) : (
            <EmptyState icon={Layers} title={<span className="text-muted-foreground">暂无任务</span>} />
          )}
        </div>
      </div>
    )
  }

  // Keyed so all per-task state (tab, limit input, servers) resets on selection change.
  return <InspectorBody key={task.gid} task={task} />
}

function InspectorBody({ task }: { task: Aria2Task }) {
  const confirm = useConfirm()
  const busy = useTasks((s) => s.busy[task.gid] ?? false)

  const [tab, setTab] = useState<DetailTab>('details')
  const [limitOpen, setLimitOpen] = useState(false)
  const [limitValue, setLimitValue] = useState('')
  const [options, setOptions] = useState<Record<string, string> | null>(null)
  const [servers, setServers] = useState<ServerGroup[]>([])
  const [serversLoaded, setServersLoaded] = useState(false)
  const [peerCount, setPeerCount] = useState<number | null>(null)

  const gid = task.gid
  const status = getDisplayStatus(task)
  const progress = getTaskProgress(task)
  const total = getTaskTotalSize(task)
  const downloaded = getTaskDownloaded(task)
  const downloadSpeed = Number(task.downloadSpeed) || 0
  const uploadSpeed = Number(task.uploadSpeed) || 0
  const eta = getTaskEta(task)
  const name = getTaskName(task)
  const files = task.files ?? []
  const torrent = isTorrent(task)
  const numPieces = Number(task.numPieces) || 0
  const sourceCount = files.reduce((n, f) => n + (f.uris?.length ?? 0), 0)
  const trackerCount = (task.bittorrent?.announceList ?? []).reduce((n, tier) => n + (tier?.length ?? 0), 0)
  const optionEditable = status === 'waiting' || status === 'paused'

  const progressVariant =
    status === 'complete' ? PROGRESS_VARIANT.success : status === 'error' ? PROGRESS_VARIANT.danger : PROGRESS_VARIANT.default

  useEffect(() => {
    // Servers are static per task: fetch once on selection, shown in the
    // details tab's 服务器 section.
    let alive = true
    void useTasks
      .getState()
      .getServers(gid)
      .then((res) => {
        if (!alive) return
        setServers(res ?? [])
        setServersLoaded(true)
      })
      .catch(() => {
        if (alive) setServersLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [gid])

  // One aria2.getOption call per selected task: it feeds both the quick
  // limit box and the per-task 选项 tab (which reloads only on demand).
  useEffect(() => {
    let alive = true
    void useTasks
      .getState()
      .getOption(gid)
      .then((opts) => {
        if (!alive) return
        setOptions(Object.keys(opts).length > 0 ? opts : null)
        setLimitValue(formatSpeedInput(Number(opts['max-download-limit']) || 0))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [gid])

  const reloadOptions = useCallback(async (): Promise<Record<string, string> | null> => {
    try {
      const opts = await useTasks.getState().getOption(gid)
      if (Object.keys(opts).length === 0) return null
      setOptions(opts)
      setLimitValue(formatSpeedInput(Number(opts['max-download-limit']) || 0))
      return opts
    } catch {
      return null
    }
  }, [gid])

  // The options tab is only offered for waiting/paused tasks; leave it if the
  // task moves on while it is open.
  useEffect(() => {
    if (tab === 'options' && !optionEditable) setTab('details')
  }, [tab, optionEditable])

  function toggleLimit() {
    setLimitOpen((v) => !v)
  }

  async function handleRemove() {
    const ok = await confirm({
      title: `确定要删除任务“${name}”吗？`,
      description: '已下载的文件不会被删除。',
      confirmText: '删除',
      danger: true,
    })
    if (ok) void useTasks.getState().remove(gid)
  }

  async function saveLimit() {
    try {
      await useTasks.getState().changeOption(gid, {
        'max-download-limit': String(parseSpeed(limitValue)),
      })
      toast.success('已保存')
      setLimitOpen(false)
    } catch (e) {
      toast.error(`操作失败：${errorText(e)}`)
    }
  }

  const FileTypeIcon: LucideIcon = torrent ? Link2 : FileText

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
      {/* ------------------------------------------------------------ header */}
      <div className="shrink-0 border-b border-border px-4 pb-3 pt-4">
        <div className="flex items-start gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            <FileTypeIcon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <Tooltip content={name} className="min-w-0 max-w-full">
                <h2 className="line-clamp-2 min-w-0 text-sm font-medium leading-snug text-foreground" title={name}>
                  {name}
                </h2>
              </Tooltip>
              <Badge variant={STATUS_VARIANTS[status]} className="mt-0.5 shrink-0">
                {STATUS_LABEL[status]}
              </Badge>
            </div>
            <button
              type="button"
              title="复制"
              onClick={() => {
                void navigator.clipboard
                  .writeText(gid)
                  .then(() => toast.success('已复制'))
                  .catch(() => undefined)
              }}
              className="mt-1 inline-flex max-w-full items-center gap-1 rounded font-mono text-[11px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <span className="truncate">{gid}</span>
              <Copy className="size-3 shrink-0" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------- summary */}
      <div className="mx-4 mt-4 shrink-0 rounded-lg border border-border p-3">
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0 text-[11px] text-muted-foreground tabular">
            <span className="text-foreground">{formatBytes(downloaded)}</span>
            <span className="mx-0.5">/</span>
            <span>{formatBytes(total)}</span>
          </div>
          <div className="shrink-0 text-lg font-semibold leading-none tabular text-foreground">
            {progress.toFixed(1)}%
          </div>
        </div>
        <div className="mt-2">
          <Progress value={progress} variant={progressVariant} className="h-1.5" />
        </div>
        <div className="mt-3 grid grid-cols-3">
          <Stat label="速度" value={formatSpeed(downloadSpeed)} icon={ArrowDown} tone="down" />
          <Stat label="已上传" value={formatSpeed(uploadSpeed)} icon={ArrowUp} tone="up" />
          <Stat
            label="剩余时间"
            value={status === 'active' && Number.isFinite(eta) ? formatEta(eta) : '—'}
            align="end"
          />
        </div>
      </div>

      {/* ----------------------------------------------------------- actions */}
      <div className="mx-4 mt-3 shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          {status === 'active' || status === 'waiting' ? (
            <Button size="sm" variant="secondary" className="flex-1" loading={busy} onClick={() => void useTasks.getState().pause(gid)}>
              <Pause className="size-3.5" aria-hidden="true" />
              暂停
            </Button>
          ) : status === 'paused' ? (
            <Button size="sm" variant="primary" className="flex-1" loading={busy} onClick={() => void useTasks.getState().unpause(gid)}>
              <Play className="size-3.5" aria-hidden="true" />
              继续
            </Button>
          ) : (
            <Button size="sm" variant="secondary" className="flex-1" loading={busy} onClick={() => void useTasks.getState().retry(gid)}>
              <RotateCw className="size-3.5" aria-hidden="true" />
              重试
            </Button>
          )}

          <Button
            size="sm"
            variant={limitOpen ? 'secondary' : 'outline'}
            aria-expanded={limitOpen}
            onClick={toggleLimit}
          >
            <Gauge className="size-3.5" aria-hidden="true" />
            限速
          </Button>

          {status === 'waiting' && (
            <div className="flex items-center">
              <IconButton
                icon={ChevronUp}
                label="上移"
                disabled={busy}
                onClick={() => void useTasks.getState().changePosition(gid, -1, 'POS_CUR')}
              />
              <IconButton
                icon={ChevronDown}
                label="下移"
                disabled={busy}
                onClick={() => void useTasks.getState().changePosition(gid, 1, 'POS_CUR')}
              />
            </div>
          )}

          <IconButton
            icon={Trash2}
            label="删除"
            className="ml-auto text-muted-foreground hover:text-destructive"
            disabled={busy}
            onClick={() => void handleRemove()}
          />
        </div>

        {limitOpen && (
          <div className="space-y-1.5 rounded-md border border-border bg-muted/40 p-2.5">
            <div className="flex items-center gap-2">
              <Input
                value={limitValue}
                onChange={(e) => setLimitValue(e.target.value)}
                placeholder="如 1M、500K，留空不限速"
                className="h-8 flex-1 text-xs"
                aria-label="限速"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveLimit()
                  if (e.key === 'Escape') setLimitOpen(false)
                }}
              />
              <Button size="sm" variant="primary" onClick={() => void saveLimit()}>
                保存
              </Button>
            </div>
            <p className="text-[11px] leading-4 text-muted-foreground">输入 0 或留空表示不限速</p>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------- tabs */}
      <div className="mt-3 shrink-0 border-b border-border px-4">
        <Tabs
          variant="underline"
          value={tab}
          onChange={(key) => setTab(key as DetailTab)}
          items={[
            { key: 'details', label: '任务详情' },
            { key: 'files', label: '文件', count: files.length },
            ...(optionEditable ? [{ key: 'options', label: '选项' }] : []),
            ...(torrent ? [{ key: 'peers', label: '节点', count: peerCount ?? trackerCount }] : []),
            ...(numPieces > 0 ? [{ key: 'pieces', label: '分片', count: numPieces }] : []),
          ]}
          className="gap-0 border-b-0"
        />
      </div>

      {/* -------------------------------------------------------------- body */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-xs">
        {tab === 'details' && (
          <>
            <DetailsTab task={task} />
            <DetailsSection title={`下载地址${sourceCount > 0 ? ` · ${sourceCount}` : ''}`}>
              <SourcesTab task={task} />
            </DetailsSection>
            <DetailsSection title="服务器">
              {serversLoaded && servers.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">暂无已连接服务器</p>
              ) : (
                <ServersTab groups={servers} />
              )}
            </DetailsSection>
          </>
        )}
        {tab === 'files' && <FilesTab task={task} />}
        {tab === 'options' && optionEditable && <OptionsTab task={task} options={options} reload={reloadOptions} />}
        {tab === 'peers' &&
          (torrent ? (
            <>
              <PeersTab gid={task.gid} numPieces={numPieces} onCount={setPeerCount} />
              <DetailsSection title={`Trackers · ${trackerCount}`}>
                <TrackerTab task={task} />
              </DetailsSection>
            </>
          ) : (
            <UnavailableNote text="仅 BT 任务支持" />
          ))}
        {tab === 'pieces' && <PiecesTab task={task} />}
      </div>

    </div>
  )
}

/* ------------------------------------------------------------------ helpers */

function UnavailableNote({ text }: { text: string }) {
  return <p className="py-8 text-center text-[11px] text-muted-foreground">{text}</p>
}

/** Titled sub-section inside the merged 任务详情 / 节点 tabs. */
function DetailsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t border-border/60 pt-3">
      <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  )
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
  align = 'start',
}: {
  label: string
  value: string
  icon?: LucideIcon
  tone?: 'down' | 'up'
  align?: 'start' | 'end'
}) {
  return (
    <div
      className={cn(
        'min-w-0 px-2 first:pl-0 last:pr-0',
        align === 'start' && 'border-r border-border',
        align === 'end' && 'text-right',
      )}
    >
      <div className="truncate text-[10px] leading-none text-muted-foreground">{label}</div>
      <div
        className={cn('mt-1 flex min-w-0 items-center gap-0.5 text-xs font-semibold leading-none tabular', tone === 'down' ? 'text-down' : tone === 'up' ? 'text-up' : 'text-foreground', align === 'end' && 'justify-end')}
        title={value}
      >
        {Icon && <Icon className="size-3 shrink-0" aria-hidden="true" />}
        <span className="truncate">{value}</span>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-[11px] leading-4 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-xs leading-4 text-foreground">{children}</dd>
    </>
  )
}

function copyText(text: string, done: () => void) {
  void navigator.clipboard.writeText(text).then(done).catch(() => undefined)
}

function CopyButton({ text, label }: { text: string; label: string }) {
  return (
    <IconButton
      icon={Copy}
      label={label}
      className="-my-1 size-6"
      onClick={() => copyText(text, () => toast.success('已复制'))}
    />
  )
}

/* ------------------------------------------------------------------ details */

function DetailsTab({ task }: { task: Aria2Task }) {
  const pieceLength = Number(task.pieceLength) || 0
  const numPieces = Number(task.numPieces) || 0
  const verified = Number(task.verifiedLength) || 0
  const hasError = Boolean(task.errorCode && task.errorCode !== '0')
  const creationDate = task.bittorrent?.creationDate
  const torrent = isTorrent(task)
  const completedTime = Number(task.completedTime) || 0
  const uploadLength = Number(task.uploadLength) || 0
  const completedLength = Number(task.completedLength) || 0

  return (
    <div className="space-y-3">
      {hasError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-destructive">
          <div className="flex items-center gap-1.5 text-[11px] font-medium">
            <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
            <span>
              错误
              {task.errorCode ? ` (${task.errorCode})` : ''}
            </span>
          </div>
          <p className="mt-1 break-words text-[11px] leading-4">{getErrorsMessage(task.errorCode ?? '1')}</p>
          {task.errorMessage && task.errorMessage !== getErrorsMessage(task.errorCode ?? '1') && (
            <p className="mt-1 break-words font-mono text-[11px] leading-4 opacity-80">{task.errorMessage}</p>
          )}
        </div>
      )}

      <dl className="grid grid-cols-[88px_1fr] items-baseline gap-x-3 gap-y-2">
        <Field label="保存路径">
          <span className="break-all font-mono text-[11px]">{task.dir || task.files?.[0]?.path || '—'}</span>
        </Field>
        <Field label="连接">
          <span className="tabular">{task.connections || '0'}</span>
        </Field>
        {torrent && (
          <Field label="种子数">
            <span className="tabular">{task.numSeeders || '0'}</span>
          </Field>
        )}
        {completedLength > 0 && (
          <Field label="分享率">
            <span className="tabular">{(uploadLength / completedLength).toFixed(2)}</span>
          </Field>
        )}
        {numPieces > 0 && (
          <Field label="分片">
            <span className="tabular">
              {numPieces} × {formatBytes(pieceLength)}
            </span>
          </Field>
        )}
        {torrent && task.infoHash && (
          <Field label="InfoHash">
            <div className="flex min-w-0 items-center gap-1">
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={task.infoHash}>
                {task.infoHash}
              </span>
              <CopyButton text={task.infoHash} label="复制" />
            </div>
          </Field>
        )}
        {typeof creationDate === 'number' && creationDate > 0 && (
          <Field label="创建时间">
            <span className="tabular">{formatTime(creationDate * 1000)}</span>
          </Field>
        )}
        {completedTime > 0 && (
          <Field label="完成时间">
            <span className="tabular">{formatTime(completedTime * 1000)}</span>
          </Field>
        )}
        {task.bittorrent?.comment && (
          <Field label="备注">
            <span className="break-words">{task.bittorrent.comment}</span>
          </Field>
        )}
        {verified > 0 && (
          <Field label="校验中">
            <span className="tabular">{formatBytes(verified)}</span>
          </Field>
        )}
      </dl>
    </div>
  )
}

/* ------------------------------------------------------------------ options */

type OptionKind = 'int' | 'float' | 'speed' | 'size' | 'string' | 'password' | 'bool' | 'tracker'

interface OptionDef {
  key: string
  label: string
  kind: OptionKind
  group: 'basic' | 'http' | 'bt'
  min?: number
  max?: number
  placeholder?: string
  wide?: boolean
}

const OPTION_GROUPS: { id: OptionDef['group']; label: string }[] = [
  { id: 'basic', label: '基本设置' },
  { id: 'http', label: 'HTTP 与代理' },
  { id: 'bt', label: 'BitTorrent' },
]

const OPTION_FIELDS: OptionDef[] = [
  { key: 'split', label: '分段数', kind: 'int', group: 'basic', min: 1, max: 128 },
  { key: 'max-connection-per-server', label: '单服务器最大连接数', kind: 'int', group: 'basic', min: 1, max: 64 },
  { key: 'min-split-size', label: '最小分段大小', kind: 'size', group: 'basic', placeholder: '20M' },
  { key: 'max-download-limit', label: '下载限速', kind: 'speed', group: 'basic', placeholder: '0 或留空不限速' },
  { key: 'max-upload-limit', label: '上传限速', kind: 'speed', group: 'basic', placeholder: '0 或留空不限速' },
  { key: 'lowest-speed-limit', label: '最小下载速度限制', kind: 'speed', group: 'basic', placeholder: '0 或留空不限速' },
  { key: 'http-user', label: 'HTTP 用户名', kind: 'string', group: 'http' },
  { key: 'http-passwd', label: 'HTTP 密码', kind: 'password', group: 'http' },
  { key: 'all-proxy', label: '代理', kind: 'string', group: 'http', placeholder: '[http://][用户名:密码@]主机[:端口]', wide: true },
  { key: 'all-proxy-user', label: '代理用户名', kind: 'string', group: 'http' },
  { key: 'all-proxy-passwd', label: '代理密码', kind: 'password', group: 'http' },
  { key: 'bt-max-peers', label: 'BT 最大节点数', kind: 'int', group: 'bt', min: 0 },
  { key: 'bt-stop-timeout', label: 'BT 超时（秒）', kind: 'int', group: 'bt', min: 0 },
  { key: 'seed-ratio', label: '分享率', kind: 'float', group: 'bt', min: 0 },
  { key: 'seed-time', label: '做种时长（分钟）', kind: 'float', group: 'bt', min: 0 },
  { key: 'bt-tracker', label: '追加 Tracker', kind: 'tracker', group: 'bt', placeholder: '每行一个 Tracker 地址', wide: true },
  { key: 'force-save', label: '强制保存', kind: 'bool', group: 'bt' },
  { key: 'continue', label: '断点续传', kind: 'bool', group: 'bt' },
]

/** Raw value from aria2.getOption -> editable draft text. */
function normalizeOption(def: OptionDef, raw: string | undefined): string {
  const v = raw ?? ''
  switch (def.kind) {
    case 'speed':
      return formatSpeedInput(Number(v) || 0)
    case 'tracker':
      return v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .join('\n')
    case 'bool':
      return v === 'true' ? 'true' : 'false'
    default:
      return v
  }
}

/** Draft text -> value sent to aria2.changeOption. */
function serializeOption(def: OptionDef, draft: string): string {
  switch (def.kind) {
    case 'speed':
    case 'size':
      return String(parseSpeed(draft))
    case 'int':
    case 'float':
      return String(Number(draft))
    case 'tracker':
      return draft
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .join(',')
    default:
      return draft
  }
}

/** Inline validation message, or null when the draft value is acceptable. */
function validateOption(def: OptionDef, draft: string): string | null {
  const text = draft.trim()
  switch (def.kind) {
    case 'int': {
      if (!/^-?\d+$/.test(text)) return '请输入整数'
      const n = Number(text)
      if (def.min !== undefined && n < def.min) return `不能小于 ${def.min}`
      if (def.max !== undefined && n > def.max) return `不能大于 ${def.max}`
      return null
    }
    case 'float': {
      if (text === '' || !Number.isFinite(Number(text))) return '请输入数字'
      if (def.min !== undefined && Number(text) < def.min) return `不能小于 ${def.min}`
      return null
    }
    case 'speed':
      if (text !== '' && parseSpeed(text) === 0) return '格式无效，如 1M、500K'
      return null
    case 'size':
      if (text === '' || parseSpeed(text) <= 0) return '请输入有效大小，如 20M'
      return null
    default:
      return null
  }
}

function OptionInput({
  def,
  value,
  error,
  disabled,
  onChange,
}: {
  def: OptionDef
  value: string
  error: string | null
  disabled?: boolean
  onChange: (v: string) => void
}) {
  const id = useId()

  if (def.kind === 'bool') {
    return (
      <FormField label={def.label} htmlFor={id}>
        <Select
          id={id}
          className="h-8 text-xs"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          options={[
            { value: 'true', label: '开' },
            { value: 'false', label: '关' },
          ]}
        />
      </FormField>
    )
  }

  if (def.kind === 'tracker') {
    return (
      <FormField label={def.label} htmlFor={id} error={error} className="col-span-2">
        <Textarea
          id={id}
          className="text-xs"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder}
          spellCheck={false}
        />
      </FormField>
    )
  }

  return (
    <FormField label={def.label} htmlFor={id} error={error} className={def.wide ? 'col-span-2' : undefined}>
      <Input
        id={id}
        type={def.kind === 'password' ? 'password' : 'text'}
        className="h-8 text-xs"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={def.placeholder}
        inputMode={def.kind === 'int' || def.kind === 'float' ? 'decimal' : undefined}
        autoComplete={def.kind === 'password' ? 'new-password' : 'off'}
        spellCheck={false}
      />
    </FormField>
  )
}

/**
 * Per-task options editor. Only mounted for waiting/paused tasks — the
 * statuses aria2's changeOption accepts. Values load from the options
 * snapshot the inspector already fetched (one getOption per task); edits are
 * kept as a local draft and sent per-key via changeOption on save.
 */
function OptionsTab({
  task,
  options,
  reload,
}: {
  task: Aria2Task
  options: Record<string, string> | null
  reload: () => Promise<Record<string, string> | null>
}) {
  const gid = task.gid
  const torrent = isTorrent(task)
  const fields = useMemo(() => OPTION_FIELDS.filter((f) => f.group !== 'bt' || torrent), [torrent])

  const [draft, setDraft] = useState<Record<string, string>>({})
  const [base, setBase] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const initializedRef = useRef(false)

  const applyOptions = useCallback(
    (opts: Record<string, string>, keep?: Record<string, string>) => {
      const next: Record<string, string> = {}
      for (const f of fields) next[f.key] = normalizeOption(f, opts[f.key])
      setBase(next)
      setDraft(keep ? { ...next, ...keep } : next)
    },
    [fields],
  )

  // Initialise the draft once the options snapshot first arrives. Later
  // snapshots come only from an explicit reload, which applies itself.
  useEffect(() => {
    if (!options || initializedRef.current) return
    initializedRef.current = true
    applyOptions(options)
  }, [options, applyOptions])

  const changedFields = fields.filter((f) => (draft[f.key] ?? '') !== (base[f.key] ?? ''))
  const dirty = changedFields.length > 0
  const hasErrors = changedFields.some((f) => validateOption(f, draft[f.key] ?? '') !== null)

  function setField(key: string, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    if (saving || changedFields.length === 0 || hasErrors) return
    setSaving(true)
    const results = await Promise.allSettled(
      changedFields.map((f) =>
        useTasks.getState().changeOption(gid, { [f.key]: serializeOption(f, draft[f.key] ?? '') }),
      ),
    )
    setSaving(false)

    // Keep the local value for keys that failed so the user can retry them.
    const failed: Record<string, string> = {}
    let failCount = 0
    let firstError = ''
    changedFields.forEach((f, i) => {
      const r = results[i]
      if (r && r.status === 'fulfilled') return
      failCount += 1
      failed[f.key] = draft[f.key] ?? ''
      if (!firstError && r && r.status === 'rejected') firstError = errorText(r.reason)
    })

    const fresh = await reload()
    if (fresh) {
      // Server values win; keys that failed keep the local draft so they can be retried.
      applyOptions(fresh, failCount > 0 ? failed : undefined)
    } else if (options && failCount > 0) {
      // Reload failed too: keep the stale snapshot, preserving failed drafts.
      applyOptions(options, failed)
    }
    // Otherwise leave the draft untouched — nothing reliable to reconcile against.

    if (failCount === 0) toast.success(`已保存 ${changedFields.length} 项修改`)
    else toast.error(`${failCount} 项保存失败：${firstError || '调用失败'}`)
  }

  async function handleReload() {
    if (saving) return
    const fresh = await reload()
    if (fresh) applyOptions(fresh)
  }

  if (!options) {
    return <p className="py-8 text-center text-[11px] text-muted-foreground">正在加载选项…</p>
  }

  return (
    <div className="space-y-3">
      {OPTION_GROUPS.filter((g) => g.id !== 'bt' || torrent).map((group) => (
        <section key={group.id} className="rounded-lg border border-border p-3">
          <h3 className="mb-2.5 text-[11px] font-medium text-muted-foreground">{group.label}</h3>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            {fields
              .filter((f) => f.group === group.id)
              .map((f) => {
                const value = draft[f.key] ?? ''
                const error = value !== (base[f.key] ?? '') ? validateOption(f, value) : null
                return (
                  <OptionInput
                    key={f.key}
                    def={f}
                    value={value}
                    error={error}
                    disabled={saving}
                    onChange={(v) => setField(f.key, v)}
                  />
                )
              })}
          </div>
        </section>
      ))}

      <div className="flex items-center gap-2">
        <Button size="sm" variant="primary" disabled={!dirty || hasErrors} loading={saving} onClick={() => void handleSave()}>
          保存修改
        </Button>
        <Button size="sm" variant="outline" disabled={saving} onClick={() => void handleReload()}>
          重新加载
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {hasErrors ? '请先修正标红的输入' : dirty ? '有未保存的修改' : '与服务器一致'}
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ sources */

function SourcesTab({ task }: { task: Aria2Task }) {
  const files = (task.files ?? []).filter((f) => (f.uris?.length ?? 0) > 0)

  if (files.length === 0) {
    return <p className="text-[11px] text-muted-foreground">—</p>
  }

  return (
    <div className="space-y-2">
      {files.map((file) => (
        <div key={file.index} className="space-y-0.5">
          {files.length > 1 && (
            <div className="truncate px-1 text-[11px] font-medium text-muted-foreground" title={file.path}>
              {basename(file.path)}
            </div>
          )}
          {file.uris.map((u) => (
            <div
              key={u.uri}
              className="group flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-muted/50"
            >
              <span
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  u.status === 'used' ? 'bg-emerald-500' : 'bg-muted-foreground/40',
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={u.uri}>
                {stripScheme(u.uri)}
              </span>
              <CopyButton text={u.uri} label="复制" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ servers */

function ServersTab({ groups }: { groups: ServerGroup[] }) {
  if (groups.length === 0) {
    return <p className="py-8 text-center text-[11px] text-muted-foreground">暂无已连接服务器</p>
  }

  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <div key={group.index} className="space-y-0.5">
          <div className="px-1 text-[11px] font-medium text-muted-foreground tabular">#{group.index}</div>
          {group.servers.map((server) => (
            <div
              key={server.uri}
              className="flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-muted/50"
            >
              <span
                className="min-w-0 flex-1 truncate font-mono text-[11px]"
                title={server.currentUri || server.uri}
              >
                {stripScheme(server.currentUri || server.uri)}
              </span>
              <span
                className={cn(
                  'shrink-0 text-[11px] tabular',
                  Number(server.downloadSpeed) > 0 ? 'text-down' : 'text-muted-foreground',
                )}
              >
                {formatSpeed(server.downloadSpeed)}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
