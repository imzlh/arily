import { useCallback, useMemo, useState } from 'react'
import { Check, Inbox, Minus } from 'lucide-react'
import { selectVisibleTasks, useTasks } from '@/stores/tasks'
import { useTaskForm } from '@/stores/taskForm'
import type { Aria2Task } from '@/types/aria2'
import { sortVisibleTasks } from '@/lib/task'
import { cn } from '@/lib/cn'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { TaskRow, TASK_GRID } from './TaskRow'
import { TaskContextMenu } from './taskMenu'
import { useTaskSelection } from './useTaskSelection'
import { useTaskSortStore } from './useTaskSort'

/** Header select-all checkbox with Motrix-style mixed state. */
function HeaderCheckbox({
  total,
  selected,
  onToggleAll,
}: {
  total: number
  selected: number
  onToggleAll: () => void
}) {
  const all = total > 0 && selected >= total
  const mixed = selected > 0 && !all
  const label = all ? '取消全选' : '全选'
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={all ? true : mixed ? 'mixed' : false}
      aria-label={label}
      title={label}
      disabled={total === 0}
      onClick={onToggleAll}
      className={cn(
        'grid size-4 place-items-center rounded-[5px] border transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50',
        all || mixed ? 'border-primary bg-primary' : 'border-input bg-card',
      )}
    >
      {all && <Check aria-hidden="true" className="size-3 text-primary-foreground" />}
      {mixed && <Minus aria-hidden="true" className="size-3 text-primary-foreground" />}
    </button>
  )
}

export function TaskList() {
  const tasks = useTasks(selectVisibleTasks)
  const sort = useTaskSortStore((s) => s.sort)
  const selection = useTaskSelection((s) => s.selected)
  const [menu, setMenu] = useState<{ task: Aria2Task; x: number; y: number } | null>(null)

  // Sorting is applied after selectVisibleTasks; with filter = 全部 the
  // active/waiting/stopped segments keep their aria2 order.
  const sorted = useMemo(
    () => sortVisibleTasks(tasks, sort.key, sort.dir),
    [tasks, sort.key, sort.dir],
  )
  const selectedCount = useMemo(() => {
    let count = 0
    for (const task of sorted) if (selection.has(task.gid)) count += 1
    return count
  }, [sorted, selection])

  const openMenu = useCallback((task: Aria2Task, x: number, y: number) => {
    setMenu({ task, x, y })
  }, [])
  const toggleMenu = useCallback((task: Aria2Task, x: number, y: number) => {
    setMenu((prev) => (prev?.task.gid === task.gid ? null : { task, x, y }))
  }, [])
  const closeMenu = useCallback(() => setMenu(null), [])

  const toggleAll = useCallback(() => {
    const store = useTaskSelection.getState()
    if (sorted.length > 0 && selectedCount >= sorted.length) store.clear()
    else store.setAll(sorted.map((t) => t.gid))
  }, [sorted, selectedCount])

  if (tasks.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-5">
        <EmptyState
          icon={Inbox}
          title="暂无任务"
          description="拖入链接、磁力链接或 .torrent 文件即可开始下载"
          action={
            <Button variant="primary" onClick={() => useTaskForm.getState().openForm()}>
              新建任务
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div
      role="grid"
      aria-label="任务列表"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card"
    >
      {/* Column header (Motrix TaskColumnHeader): dense, sticky above the rows */}
      <div
        role="row"
        className={cn(
          'h-8 shrink-0 border-b border-border bg-muted/40 px-3 text-[11px] font-medium text-muted-foreground',
          TASK_GRID,
        )}
      >
        <div className="flex justify-center">
          <HeaderCheckbox total={sorted.length} selected={selectedCount} onToggleAll={toggleAll} />
        </div>
        <span className="block truncate ps-1">名称</span>
        <span className="block text-end">大小</span>
        <span className="block">进度</span>
        <span className="hidden truncate sm:block">状态</span>
        <span className="hidden text-end sm:block">↓速度</span>
        <span className="hidden text-end min-[1536px]:block">↑速度</span>
        <span className="hidden text-end sm:block">剩余</span>
        <span aria-hidden="true" />
      </div>

      <div role="rowgroup" className="flex-1 overflow-y-auto">
        {sorted.map((task, index) => (
          <TaskRow key={task.gid} task={task} index={index} onOpenMenu={openMenu} onToggleMenu={toggleMenu} />
        ))}
      </div>

      {menu && <TaskContextMenu task={menu.task} x={menu.x} y={menu.y} onClose={closeMenu} />}
    </div>
  )
}
