import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  LayoutList,
  Pause,
  Play,
  RefreshCw,
  RotateCw,
  Trash2,
  X,
} from 'lucide-react'
import {
  selectCounts,
  selectSelectedTask,
  selectVisibleTasks,
  useTasks,
  type BatchResult,
  type TaskFilter,
} from '@/stores/tasks'
import { toast } from '@/stores/toasts'
import { canPauseTask, canResumeTask, canRetryTask, getTaskSingleUri } from '@/lib/task'
import type { TaskSortDir, TaskSortKey } from '@/lib/task'
import { cn } from '@/lib/cn'
import { Tabs } from '@/components/ui/Tabs'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Tooltip } from '@/components/ui/Tooltip'
import { useConfirm } from '@/hooks/useConfirm'
import { TaskList } from '@/features/downloads/TaskList'
import { TaskInspector } from '@/features/downloads/TaskInspector'
import { FloatingMenu, collectTaskLinks, copyText, type MenuEntry } from '@/features/downloads/taskMenu'
import { useTaskSelection } from '@/features/downloads/useTaskSelection'
import { useTaskSortStore } from '@/features/downloads/useTaskSort'

const SORT_OPTIONS: readonly TaskSortKey[] = ['default', 'name', 'size', 'progress', 'eta', 'downSpeed', 'upSpeed']

const SORT_LABELS: Record<TaskSortKey, string> = {
  default: '默认',
  name: '名称',
  size: '大小',
  progress: '进度',
  eta: '剩余时间',
  downSpeed: '下载速度',
  upSpeed: '上传速度',
}

/** Natural direction when picking a new sort key. */
const DEFAULT_DIR: Record<TaskSortKey, TaskSortDir> = {
  default: 'asc',
  name: 'asc',
  size: 'desc',
  progress: 'desc',
  eta: 'asc',
  downSpeed: 'desc',
  upSpeed: 'desc',
}

/** Hotkeys are ignored while the focus sits inside these. */
function inTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  const tag = el?.tagName?.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) return true
  // Open dialogs own the keyboard.
  return Boolean(el?.closest('[role="dialog"]'))
}

export function DownloadsPage() {
  const confirm = useConfirm()
  const filter = useTasks((s) => s.filter)
  const search = useTasks((s) => s.search)
  const counts = useTasks(selectCounts)
  const visible = useTasks(selectVisibleTasks)
  const selectedSet = useTaskSelection((s) => s.selected)
  const sort = useTaskSortStore((s) => s.sort)
  const setSort = useTaskSortStore((s) => s.setSort)
  const [sortMenuPos, setSortMenuPos] = useState<{ x: number; y: number } | null>(null)
  const selectedTask = useTasks(selectSelectedTask)

  // The selection can only contain visible gids: filter/search changes reset it.
  const selectedTasks = useMemo(
    () => visible.filter((t) => selectedSet.has(t.gid)),
    [visible, selectedSet],
  )
  const selectedGids = useMemo(() => selectedTasks.map((t) => t.gid), [selectedTasks])
  const hasSelection = selectedGids.length > 0
  const canPauseAny = selectedTasks.some(canPauseTask)
  const canResumeAny = selectedTasks.some(canResumeTask)
  const canRetryAny = selectedTasks.some(canRetryTask)
  const linksCopyable =
    selectedTasks.length > 0 && selectedTasks.every((t) => getTaskSingleUri(t) !== null)

  useEffect(() => {
    useTaskSelection.getState().clear()
  }, [filter, search])
  // Leaving the page drops the selection.
  useEffect(() => () => useTaskSelection.getState().clear(), [])

  const announce = useCallback((result: BatchResult) => {
    if (result.failed.length > 0) {
      const reason = result.failed[0]?.error ?? '未知错误'
      if (result.ok.length > 0) toast.error(`成功 ${result.ok.length} 项，失败 ${result.failed.length} 项：${reason}`)
      else toast.error(`失败 ${result.failed.length} 项：${reason}`)
    } else if (result.ok.length > 0) {
      toast.success(`成功 ${result.ok.length} 项`)
    }
  }, [])

  const runBatch = useCallback(
    async (kind: 'pause' | 'unpause' | 'retry') => {
      if (selectedGids.length === 0) return
      const store = useTasks.getState()
      const result =
        kind === 'pause'
          ? await store.batchPause(selectedGids)
          : kind === 'unpause'
            ? await store.batchUnpause(selectedGids)
            : await store.batchRetry(selectedGids)
      announce(result)
      useTaskSelection.getState().clear()
    },
    [selectedGids, announce],
  )

  const runBatchRemove = useCallback(async () => {
    if (selectedGids.length === 0) return
    if (selectedGids.length > 1) {
      const ok = await confirm({
        title: `确定要移除 ${selectedGids.length} 个任务吗？`,
        description: '已下载的文件不会被删除。',
        confirmText: '移除',
        danger: true,
      })
      if (!ok) return
    }
    const result = await useTasks.getState().batchRemove(selectedGids)
    announce(result)
    useTaskSelection.getState().clear()
  }, [selectedGids, confirm, announce])

  const runCopyLinks = useCallback(async () => {
    const links = collectTaskLinks(selectedTasks)
    if (links === null) return
    if (await copyText(links)) toast.success(`已复制 ${selectedTasks.length} 个下载链接`)
    else toast.error('复制失败')
  }, [selectedTasks])

  // List hotkeys: Ctrl/Cmd+A select all visible, Ctrl/Cmd+C copy links,
  // Delete remove selection, Escape clear selection.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (inTextField(e.target)) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'a') {
        if (visible.length === 0) return
        e.preventDefault()
        useTaskSelection.getState().setAll(visible.map((t) => t.gid))
        return
      }
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'c') {
        // Respect a plain text selection; only intercept otherwise.
        if ((window.getSelection()?.toString() ?? '') !== '') return
        const links = collectTaskLinks(selectedTasks)
        if (links === null) return
        e.preventDefault()
        void runCopyLinks()
        return
      }
      if (!mod && !e.altKey && e.key === 'Delete') {
        if (selectedGids.length === 0) return
        e.preventDefault()
        void runBatchRemove()
        return
      }
      if (e.key === 'Escape' && selectedGids.length > 0) {
        useTaskSelection.getState().clear()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [visible, selectedTasks, selectedGids, runCopyLinks, runBatchRemove])

  const toggleSortMenu = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation() // keep the open menu's outside-click handler out of it
    const rect = e.currentTarget.getBoundingClientRect()
    setSortMenuPos((prev) => (prev ? null : { x: rect.left, y: rect.bottom + 4 }))
  }
  const closeSortMenu = useCallback(() => setSortMenuPos(null), [])

  const sortEntries: MenuEntry[] = useMemo(
    () => [
      ...SORT_OPTIONS.map(
        (key): MenuEntry => ({
          type: 'item',
          key,
          label: SORT_LABELS[key],
          checked: sort.key === key,
          onSelect: () =>
            setSort(
              sort.key === key
                ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
                : { key, dir: DEFAULT_DIR[key] },
            ),
        }),
      ),
      { type: 'separator', key: 'sep-dir' },
      {
        type: 'item',
        key: 'asc',
        label: '升序',
        icon: ArrowUp,
        disabled: sort.key === 'default',
        checked: sort.key !== 'default' && sort.dir === 'asc',
        onSelect: () => setSort({ key: sort.key, dir: 'asc' }),
      },
      {
        type: 'item',
        key: 'desc',
        label: '降序',
        icon: ArrowDown,
        disabled: sort.key === 'default',
        checked: sort.key !== 'default' && sort.dir === 'desc',
        onSelect: () => setSort({ key: sort.key, dir: 'desc' }),
      },
    ],
    [sort, setSort],
  )

  const items = [
    { key: 'all', label: '全部', count: counts.all },
    { key: 'active', label: '下载中', count: counts.active },
    { key: 'waiting', label: '等待中', count: counts.waiting },
    { key: 'stopped', label: '已停止', count: counts.stopped },
  ]

  async function handlePurge() {
    const ok = await confirm({
      title: '清除已完成',
      description: '确定要清除所有已完成、出错和已移除的任务记录吗？',
      confirmText: '清除已完成',
      danger: true,
    })
    if (ok) void useTasks.getState().purgeStopped()
  }

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col px-3 pt-3 pb-4 sm:px-6">
        {/* List toolbar: status tabs on the left, sort + bulk actions on the right.
            On narrow screens the groups wrap onto two rows and the tabs scroll. */}
        <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Tabs
                variant="segmented"
                items={items}
                value={filter}
                onChange={(key) => useTasks.getState().setFilter(key as TaskFilter)}
              />
            </div>
            <span className="hidden items-center gap-1 text-xs text-muted-foreground tabular-nums sm:flex">
              <LayoutList className="size-3.5" />
              <span>{visible.length}</span>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={toggleSortMenu}
              aria-haspopup="menu"
              aria-expanded={sortMenuPos !== null}
            >
              <ArrowUpDown className="size-3.5" aria-hidden="true" />
              <span className="max-sm:hidden">{SORT_LABELS[sort.key]}</span>
              {sort.key !== 'default' &&
                (sort.dir === 'asc' ? (
                  <ArrowUp className="size-3" aria-hidden="true" />
                ) : (
                  <ArrowDown className="size-3" aria-hidden="true" />
                ))}
            </Button>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
            <IconButton icon={Pause} label="全部暂停" onClick={() => void useTasks.getState().pauseAll()} />
            <IconButton icon={Play} label="全部开始" onClick={() => void useTasks.getState().unpauseAll()} />
            <IconButton icon={RefreshCw} label="刷新" onClick={() => void useTasks.getState().refresh()} />
            <Tooltip content="清除已完成">
              <span>
                <IconButton icon={Trash2} label="清除已完成" onClick={() => void handlePurge()} />
              </span>
            </Tooltip>
          </div>
        </div>

        {/* Batch action bar, slides in while a multi-selection exists */}
        {hasSelection && (
          <div className="mb-3 flex shrink-0 animate-fade-in flex-wrap items-center gap-1 rounded-lg border border-border/70 bg-muted/50 px-2 py-1.5">
            <span className="me-1.5 px-1 text-xs text-muted-foreground">
              已选 <span className="font-medium text-foreground tabular">{selectedGids.length}</span> 项
            </span>
            <Button variant="ghost" size="sm" disabled={!canPauseAny} onClick={() => void runBatch('pause')}>
              <Pause className="size-3.5" aria-hidden="true" />
              暂停
            </Button>
            <Button variant="ghost" size="sm" disabled={!canResumeAny} onClick={() => void runBatch('unpause')}>
              <Play className="size-3.5" aria-hidden="true" />
              继续
            </Button>
            <Tooltip content="仅限可重试的 URI 任务" side="bottom">
              <Button variant="ghost" size="sm" disabled={!canRetryAny} onClick={() => void runBatch('retry')}>
                <RotateCw className="size-3.5" aria-hidden="true" />
                重试
              </Button>
            </Tooltip>
            <Tooltip
              content={linksCopyable ? `复制 ${selectedGids.length} 个下载链接` : '有任务缺少下载链接，无法复制'}
              side="bottom"
            >
              <Button variant="ghost" size="sm" disabled={!linksCopyable} onClick={() => void runCopyLinks()}>
                <Copy className="size-3.5" aria-hidden="true" />
                复制链接
              </Button>
            </Tooltip>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void runBatchRemove()}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              移除
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ms-auto text-muted-foreground"
              onClick={() => useTaskSelection.getState().clear()}
            >
              <X className="size-3.5" aria-hidden="true" />
              取消选择
            </Button>
          </div>
        )}

        <TaskList />
      </section>

      <aside
        className={cn(
          'hidden w-[380px] shrink-0 flex-col border-s border-border bg-card',
          selectedTask && 'xl:flex',
        )}
      >
        <TaskInspector />
      </aside>

      {sortMenuPos && (
        <FloatingMenu
          x={sortMenuPos.x}
          y={sortMenuPos.y}
          entries={sortEntries}
          onClose={closeSortMenu}
          label="排序方式"
        />
      )}
    </div>
  )
}
