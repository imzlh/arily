import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Check,
  Info,
  Link2,
  Magnet,
  Pause,
  Play,
  RotateCw,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Aria2Task } from '@/types/aria2'
import { useTasks } from '@/stores/tasks'
import { toast } from '@/stores/toasts'
import {
  canPauseTask,
  canResumeTask,
  canRetryTask,
  getTaskMagnetUri,
  getTaskName,
  getTaskSingleUri,
} from '@/lib/task'
import { cn } from '@/lib/cn'
import { useConfirm } from '@/hooks/useConfirm'

// ----------------------------------------------------------------- primitives

export type MenuEntry =
  | { type: 'separator'; key: string }
  | {
      type: 'item'
      key: string
      label: string
      icon?: LucideIcon
      /** Shortcut hint shown at the end (only for shortcuts that really exist). */
      kbd?: string
      disabled?: boolean
      /** Shown as the title of a disabled item. */
      disabledReason?: string
      danger?: boolean
      /** Renders a check mark at the end (sort menu / radio items). */
      checked?: boolean
      onSelect: () => void
    }

function focusables(menu: HTMLElement): HTMLButtonElement[] {
  return [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')]
}

interface FloatingMenuProps {
  x: number
  y: number
  entries: MenuEntry[]
  onClose: () => void
  label: string
}

/**
 * Self-contained fixed-position menu rendered through a portal. Closes on
 * outside click, outside right-click, Escape, scroll and resize. Handles
 * basic menu keyboard navigation (arrows / Home / End / Tab).
 */
export function FloatingMenu({ x, y, entries, onClose, label }: FloatingMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  // Clamp into the viewport once the size is known, then focus the first
  // enabled item. Re-runs when the menu is re-anchored (replaced in place).
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const nx = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))
    const ny = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))
    setPos((p) => (p.x === nx && p.y === ny ? p : { x: nx, y: ny }))
    focusables(el)[0]?.focus()
  }, [x, y])

  useEffect(() => {
    const inside = (target: EventTarget | null) =>
      target instanceof Node && menuRef.current?.contains(target) === true

    const onClick = (e: MouseEvent) => {
      if (inside(e.target)) return
      onClose()
    }
    const onContextMenu = (e: MouseEvent) => {
      if (inside(e.target)) return
      onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    const onScroll = (e: Event) => {
      if (inside(e.target)) return
      onClose()
    }
    const onResize = () => onClose()

    // Attach after the opening event finishes propagating — the listener is
    // registered mid-dispatch otherwise and the very click that opened the
    // menu would close it immediately.
    const timer = window.setTimeout(() => {
      window.addEventListener('click', onClick)
      window.addEventListener('contextmenu', onContextMenu)
      window.addEventListener('keydown', onKeyDown, true)
      window.addEventListener('scroll', onScroll, true)
      window.addEventListener('resize', onResize)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('click', onClick)
      window.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [onClose])

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const el = menuRef.current
      if (!el) return
      if (e.key === 'Tab') {
        onClose()
        return
      }
      const items = focusables(el)
      if (items.length === 0) return
      const current = items.indexOf(document.activeElement as HTMLButtonElement)
      let next = -1
      if (e.key === 'ArrowDown') next = current < 0 ? 0 : Math.min(current + 1, items.length - 1)
      else if (e.key === 'ArrowUp') next = current < 0 ? items.length - 1 : Math.max(current - 1, 0)
      else if (e.key === 'Home') next = 0
      else if (e.key === 'End') next = items.length - 1
      if (next >= 0) {
        e.preventDefault()
        items[next]?.focus()
      }
    },
    [onClose],
  )

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      style={{ left: pos.x, top: pos.y }}
      onKeyDown={handleKeyDown}
      className={cn(
        'fixed z-[80] max-h-[min(70vh,calc(100vh-16px))] min-w-44 overflow-y-auto p-1',
        'animate-pop-in rounded-lg border border-border bg-card shadow-soft outline-none',
      )}
    >
      {entries.map((entry) =>
        entry.type === 'separator' ? (
          <div key={entry.key} role="separator" className="my-1 h-px bg-border" />
        ) : (
          <button
            key={entry.key}
            type="button"
            role="menuitem"
            disabled={entry.disabled}
            title={entry.disabled ? entry.disabledReason : undefined}
            onClick={() => {
              entry.onSelect()
              onClose()
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none transition-colors',
              'hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground',
              'disabled:pointer-events-none disabled:opacity-40',
              entry.danger &&
                'text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive',
            )}
          >
            {entry.icon ? (
              <entry.icon aria-hidden="true" className="size-4 shrink-0 opacity-70" />
            ) : (
              <span aria-hidden="true" className="size-4 shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate text-start">{entry.label}</span>
            {entry.kbd && (
              <kbd className="shrink-0 rounded border border-border bg-muted px-1 font-mono text-[10px] leading-4 text-muted-foreground">
                {entry.kbd}
              </kbd>
            )}
            {entry.checked && <Check aria-hidden="true" className="size-3.5 shrink-0 text-primary" />}
          </button>
        ),
      )}
    </div>,
    document.body,
  )
}

// ------------------------------------------------------------ task utilities

/**
 * Newline-joined single URIs of the given tasks, or null when any task has no
 * single URI (the batch "复制链接" action is disabled in that case).
 */
export function collectTaskLinks(tasks: readonly Aria2Task[]): string | null {
  if (tasks.length === 0) return null
  const links: string[] = []
  for (const task of tasks) {
    const uri = getTaskSingleUri(task)
    if (!uri) return null
    links.push(uri)
  }
  return links.join('\n')
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------- task context menu

export interface TaskContextMenuProps {
  task: Aria2Task
  x: number
  y: number
  onClose: () => void
}

/**
 * Right-click / "⋯" menu for a single task, items in Motrix order. Disabled
 * items carry a title explaining why. Operates on the store directly so it
 * works no matter where it is mounted from.
 */
export function TaskContextMenu({ task, x, y, onClose }: TaskContextMenuProps) {
  const confirm = useConfirm()
  const gid = task.gid
  const name = getTaskName(task)
  const canPause = canPauseTask(task)
  const canResume = canResumeTask(task)
  const canRetry = canRetryTask(task)
  const singleUri = getTaskSingleUri(task)
  const magnet = getTaskMagnetUri(task)
  const queueable = task.status === 'waiting'

  async function handleCopy(text: string, what: string) {
    if (await copyText(text)) toast.success(`已复制${what}`)
    else toast.error('复制失败')
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

  const entries: MenuEntry[] = [
    {
      type: 'item',
      key: 'detail',
      label: '详情',
      icon: Info,
      onSelect: () => useTasks.getState().select(gid),
    },
    {
      type: 'item',
      key: 'pause',
      label: '暂停',
      icon: Pause,
      disabled: !canPause,
      disabledReason: '仅下载中的任务可以暂停',
      onSelect: () => void useTasks.getState().pause(gid),
    },
    {
      type: 'item',
      key: 'resume',
      label: '继续',
      icon: Play,
      disabled: !canResume,
      disabledReason: '仅等待中或已暂停的任务可以继续',
      onSelect: () => void useTasks.getState().unpause(gid),
    },
    {
      type: 'item',
      key: 'retry',
      label: '重试',
      icon: RotateCw,
      disabled: !canRetry,
      disabledReason: '仅可重试带下载链接的已停止任务',
      onSelect: () => void useTasks.getState().retry(gid),
    },
    { type: 'separator', key: 'sep-copy' },
    {
      type: 'item',
      key: 'copyUri',
      label: '复制下载链接',
      icon: Link2,
      kbd: 'Ctrl+C',
      disabled: !singleUri,
      disabledReason: '该任务没有下载链接',
      onSelect: () => singleUri && void handleCopy(singleUri, '下载链接'),
    },
    {
      type: 'item',
      key: 'copyMagnet',
      label: '复制磁力链接',
      icon: Magnet,
      disabled: !magnet,
      disabledReason: '仅 BT 任务有磁力链接',
      onSelect: () => magnet && void handleCopy(magnet, '磁力链接'),
    },
    { type: 'separator', key: 'sep-move' },
    {
      type: 'item',
      key: 'top',
      label: '移至最前',
      icon: ArrowUpToLine,
      disabled: !queueable,
      disabledReason: '仅等待中的任务可以调整顺序',
      onSelect: () => void useTasks.getState().moveTo(gid, 'top'),
    },
    {
      type: 'item',
      key: 'up',
      label: '上移',
      icon: ArrowUp,
      disabled: !queueable,
      disabledReason: '仅等待中的任务可以调整顺序',
      onSelect: () => void useTasks.getState().moveTo(gid, 'up'),
    },
    {
      type: 'item',
      key: 'down',
      label: '下移',
      icon: ArrowDown,
      disabled: !queueable,
      disabledReason: '仅等待中的任务可以调整顺序',
      onSelect: () => void useTasks.getState().moveTo(gid, 'down'),
    },
    {
      type: 'item',
      key: 'bottom',
      label: '移至最后',
      icon: ArrowDownToLine,
      disabled: !queueable,
      disabledReason: '仅等待中的任务可以调整顺序',
      onSelect: () => void useTasks.getState().moveTo(gid, 'bottom'),
    },
    { type: 'separator', key: 'sep-remove' },
    {
      type: 'item',
      key: 'remove',
      label: '移除',
      icon: Trash2,
      kbd: 'Del',
      danger: true,
      onSelect: () => void handleRemove(),
    },
  ]

  return <FloatingMenu x={x} y={y} entries={entries} onClose={onClose} label={`任务菜单：${name}`} />
}
