import { memo } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import {
  Ellipsis,
  File,
  Magnet,
  Pause,
  Play,
  RotateCw,
  Sprout,
  Trash2,
  Users,
} from 'lucide-react'
import { useTasks } from '@/stores/tasks'
import type { Aria2Task, TaskStatus } from '@/types/aria2'
import { formatBytes, formatEta, formatSpeed, formatTime } from '@/lib/format'
import {
  formatCompletedTime,
  getDisplayStatus,
  getErrorsMessage,
  getTaskDownloaded,
  getTaskEta,
  getTaskExtension,
  getTaskName,
  getTaskProgress,
  getTaskTotalSize,
  isSeeding,
  isTorrent,
} from '@/lib/task'
import { cn } from '@/lib/cn'
import { Checkbox } from '@/components/ui/Checkbox'
import { IconButton } from '@/components/ui/IconButton'
import { useConfirm } from '@/hooks/useConfirm'
import { useTaskSelection } from './useTaskSelection'

/** Progress-bar tone by status (Motrix bar tone map); seeding overrides to green. */
const BAR_TONES: Record<TaskStatus, string> = {
  active: 'bg-blue-500',
  waiting: 'bg-foreground/25',
  paused: 'bg-amber-500',
  complete: 'bg-green-500',
  error: 'bg-red-500',
  removed: 'bg-red-500',
}

/** Status pill tones; every row states its status in the 状态 column. */
const PILL_TONES: Record<TaskStatus | 'seeding', string> = {
  seeding: 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300',
  active: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300',
  waiting: 'bg-muted text-muted-foreground',
  paused: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  complete: 'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300',
  error: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300',
  removed: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300',
}

const PILL_LABELS: Record<TaskStatus | 'seeding', string> = {
  seeding: '做种中',
  active: '下载中',
  waiting: '等待中',
  paused: '已暂停',
  complete: '已完成',
  error: '错误',
  removed: '已移除',
}

const ICON_TONES: Record<TaskStatus | 'seeding', string> = {
  seeding: 'text-green-600 dark:text-green-400',
  active: 'text-down',
  waiting: 'text-amber-500',
  paused: 'text-amber-500',
  complete: 'text-green-600 dark:text-green-400',
  error: 'text-destructive',
  removed: 'text-muted-foreground',
}

/**
 * Grid template shared by the list header and the rows (Motrix look): one text
 * line per row, every datum in its own aligned column —
 * check / 名称 / 大小 / 进度 / 状态 / ↓速度 / 剩余 / 操作. Below sm the row
 * reduces to check / 名称 / 大小 / 进度 (the rest hide via classes; operations
 * stay reachable through multi-select + the inspector). The ↑速度 column only
 * exists from 1536px up, so the template swaps there and the up cell + header
 * label are hidden below that.
 *
 * 进度 is a fixed 120px track (its bar + w-12 percent): a minmax(min,max)
 * track would always resolve to its max before the 名称 fr expands, crushing
 * the name with the 380px inspector open. The narrow 状态/速度/剩余 tracks keep
 * ~135px of readable name at 1440×900 with the inspector open.
 */
export const TASK_GRID = [
  'grid items-center gap-x-2',
  'grid-cols-[32px_minmax(56px,1fr)_84px_96px]',
  'sm:grid-cols-[36px_minmax(100px,1fr)_92px_120px_76px_88px_76px_88px]',
  'min-[1536px]:grid-cols-[36px_minmax(100px,1fr)_92px_120px_76px_88px_88px_76px_88px]',
].join(' ')

interface TaskRowProps {
  task: Aria2Task
  /** Row position in the visible list, for zebra striping. */
  index: number
  /** Right-click: open the context menu (replaces an open one). */
  onOpenMenu: (task: Aria2Task, x: number, y: number) => void
  /** "⋯" button: open the context menu, or close it when already open. */
  onToggleMenu: (task: Aria2Task, x: number, y: number) => void
}

function TaskRowBase({ task, index, onOpenMenu, onToggleMenu }: TaskRowProps) {
  const confirm = useConfirm()
  const selectedGid = useTasks((s) => s.selectedGid)
  const busy = useTasks((s) => s.busy[task.gid] ?? false)
  const checked = useTaskSelection((s) => s.selected.has(task.gid))

  const status = getDisplayStatus(task)
  const seeding = isSeeding(task)
  const toneKey: TaskStatus | 'seeding' = seeding ? 'seeding' : status
  const selected = selectedGid === task.gid
  const progress = getTaskProgress(task)
  const isActive = status === 'active'
  const isError = status === 'error'
  const name = getTaskName(task)
  const ext = getTaskExtension(name)
  const baseName = ext ? name.slice(0, name.length - ext.length) : name
  const total = getTaskTotalSize(task)
  const downloaded = getTaskDownloaded(task)
  const downloadSpeed = Number(task.downloadSpeed) || 0
  const uploadSpeed = Number(task.uploadSpeed) || 0
  const seeders = Number(task.numSeeders) || 0
  const torrent = isTorrent(task)
  const errorCode = isError ? (task.errorCode ?? '') : ''
  const errorText = isError
    ? task.errorMessage || getErrorsMessage(task.errorCode ?? '1')
    : ''
  const barTone = seeding ? 'bg-green-500' : BAR_TONES[status]
  const etaRaw = isActive && !seeding ? formatEta(getTaskEta(task)) : '—'
  const eta = etaRaw === '-' ? '—' : etaRaw
  const completedShort = status === 'complete' ? formatCompletedTime(task) : ''
  const completedSeconds = Number(task.completedTime)
  const completedFull =
    status === 'complete' && Number.isFinite(completedSeconds) && completedSeconds > 0
      ? formatTime(completedSeconds * 1000)
      : ''
  // Seeding payloads are already complete: show the total once, not x / x.
  // One clean right-aligned value per row; the downloaded/total pair lives in
  // the tooltip (a truncated "0 B / 128.04 …" reads as a broken column).
  const sizeText =
    total > 0 || downloaded > 0 ? formatBytes(total > 0 ? total : downloaded) : '—'
  const sizeTitle =
    downloaded > 0 && total > 0 && downloaded !== total
      ? `已下载 ${formatBytes(downloaded)} / 共 ${formatBytes(total)}`
      : sizeText
  // The row carries no error line: the message lives in the title tooltip.
  const nameTitle = errorText ? `${name}\n${errorText}` : name
  const pillLabel = isError && errorCode ? `${PILL_LABELS.error} ${errorCode}` : PILL_LABELS[toneKey]
  const zebra = index % 2 === 1

  const busyWith = (fn: (gid: string) => void) => (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    fn(task.gid)
  }

  async function handleRemove(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    const ok = await confirm({
      title: `确定要删除任务“${name}”吗？`,
      description: '已下载的文件不会被删除。',
      confirmText: '删除',
      danger: true,
    })
    if (ok) void useTasks.getState().remove(task.gid)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      useTasks.getState().select(task.gid)
    }
  }

  /** Right-click / ⋯: make the row the context-menu target. Mirrors Motrix: a
   * row that is not part of the current multi-selection becomes the selection. */
  function openMenuAt(x: number, y: number) {
    const selection = useTaskSelection.getState()
    if (!selection.selected.has(task.gid)) selection.selectOnly(task.gid)
    useTasks.getState().select(task.gid)
    onOpenMenu(task, x, y)
  }

  return (
    <div
      role="row"
      tabIndex={0}
      aria-selected={selected}
      aria-label={name}
      aria-description={errorText || undefined}
      onClick={() => useTasks.getState().select(task.gid)}
      onKeyDown={handleKeyDown}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        openMenuAt(e.clientX, e.clientY)
      }}
      className={cn(
        TASK_GRID,
        'group relative h-10 cursor-default select-none border-b border-border/60 px-3 text-[13px] tabular outline-none transition-colors',
        'last:border-b-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50',
        selected ? 'bg-muted' : zebra ? 'bg-muted/30 hover:bg-muted/50' : 'hover:bg-muted/40',
      )}
    >
      {selected && (
        <span aria-hidden="true" className="absolute inset-y-0 start-0 w-0.5 bg-primary" />
      )}

      {/* Selection checkbox — never toggles the inspector selection */}
      <div role="gridcell" className="flex justify-center">
        <Checkbox
          aria-label={`选择任务 ${name}`}
          checked={checked}
          onClick={(e) => e.stopPropagation()}
          onChange={() => useTaskSelection.getState().toggle(task.gid)}
        />
      </div>

      {/* 名称: one line — icon, basename + muted extension, seeder chip while seeding */}
      <div role="gridcell" className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        {torrent ? (
          <Magnet aria-hidden="true" className={cn('size-3.5 shrink-0', ICON_TONES[toneKey])} />
        ) : (
          <File aria-hidden="true" className={cn('size-3.5 shrink-0', ICON_TONES[toneKey])} />
        )}
        <span
          dir="auto"
          title={nameTitle}
          className="flex min-w-0 flex-1 items-center text-[13px] font-medium leading-4"
        >
          <span className="min-w-0 truncate">{baseName}</span>
          {ext && <span className="shrink-0 font-normal text-muted-foreground">{ext}</span>}
        </span>
        {seeding && seeders > 0 && (
          <span className="flex shrink-0 items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-[10px] leading-none text-muted-foreground tabular">
            <Users aria-hidden="true" className="size-3" />
            种子 {seeders}
          </span>
        )}
      </div>

      {/* 大小 */}
      <div role="gridcell" className="min-w-0 text-end">
        <span className="block truncate text-xs" title={sizeTitle}>
          {sizeText}
        </span>
      </div>

      {/* 进度: thin bar + percent on one line */}
      <div role="gridcell" className="flex min-w-0 items-center gap-2">
        <div aria-hidden="true" className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full transition-[width] duration-300 ease-out', barTone)}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="w-10 shrink-0 text-end text-xs text-muted-foreground sm:w-12">
          {progress.toFixed(1)}%
        </span>
      </div>

      {/* 状态 */}
      <div role="gridcell" className="hidden min-w-0 items-center sm:flex">
        <span
          title={errorText || undefined}
          className={cn(
            'inline-flex w-fit max-w-full items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] leading-4',
            PILL_TONES[toneKey],
          )}
        >
          {seeding && <Sprout aria-hidden="true" className="size-3 shrink-0" />}
          <span className="truncate">{pillLabel}</span>
        </span>
      </div>

      {/* ↓速度 */}
      <div role="gridcell" className="hidden min-w-0 text-end sm:block">
        {downloadSpeed > 0 ? (
          <span className="block truncate text-xs text-down" title={formatSpeed(downloadSpeed)}>
            ↓ {formatSpeed(downloadSpeed)}
          </span>
        ) : (
          <span className="block text-xs text-muted-foreground">—</span>
        )}
      </div>

      {/* ↑速度 — 2xl+ only, matches the template swap in TASK_GRID */}
      <div role="gridcell" className="hidden min-w-0 text-end min-[1536px]:block">
        {uploadSpeed > 0 ? (
          <span className="block truncate text-xs text-up" title={formatSpeed(uploadSpeed)}>
            ↑ {formatSpeed(uploadSpeed)}
          </span>
        ) : (
          <span className="block text-xs text-muted-foreground">—</span>
        )}
      </div>

      {/* 剩余: ETA while downloading, 完成时间 once complete */}
      <div role="gridcell" className="hidden min-w-0 text-end text-muted-foreground sm:block">
        {completedShort ? (
          <span className="block truncate text-xs" title={`完成于 ${completedFull}`}>
            {completedShort}
          </span>
        ) : (
          <span className="block truncate text-xs">{eta}</span>
        )}
      </div>

      {/* Actions — appear on hover / focus / selection */}
      <div
        role="gridcell"
        className={cn(
          'hidden items-center justify-end gap-0.5 transition-opacity sm:flex',
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
        )}
      >
        {isActive ? (
          <IconButton
            icon={Pause}
            label="暂停"
            disabled={busy}
            className="size-7"
            onClick={busyWith(() => void useTasks.getState().pause(task.gid))}
          />
        ) : status === 'paused' ? (
          <IconButton
            icon={Play}
            label="继续"
            disabled={busy}
            className="size-7"
            onClick={busyWith(() => void useTasks.getState().unpause(task.gid))}
          />
        ) : status === 'waiting' ? null : (
          <IconButton
            icon={RotateCw}
            label="重试"
            disabled={busy}
            className="size-7"
            onClick={busyWith(() => void useTasks.getState().retry(task.gid))}
          />
        )}
        <IconButton
          icon={Trash2}
          label="删除"
          disabled={busy}
          className="size-7"
          onClick={(e) => void handleRemove(e)}
        />
        <IconButton
          icon={Ellipsis}
          label="更多操作"
          className="size-7"
          onClick={(e) => {
            e.stopPropagation()
            const rect = e.currentTarget.getBoundingClientRect()
            const selection = useTaskSelection.getState()
            if (!selection.selected.has(task.gid)) selection.selectOnly(task.gid)
            useTasks.getState().select(task.gid)
            onToggleMenu(task, rect.left, rect.bottom + 4)
          }}
        />
      </div>
    </div>
  )
}

export const TaskRow = memo(TaskRowBase)
