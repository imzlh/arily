import { useRef } from 'react'
import type { RefObject } from 'react'
import { useLocation } from 'react-router'
import { ArrowDown, ArrowUp, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useTasks } from '@/stores/tasks'
import { useTaskForm } from '@/stores/taskForm'
import { formatSpeed } from '@/lib/format'

function pageTitle(pathname: string): string {
  if (pathname.startsWith('/settings')) return '设置'
  if (pathname.startsWith('/about')) return '关于'
  if (pathname.startsWith('/status')) return '状态'
  if (pathname.startsWith('/overview')) return '总览'
  return '下载'
}

interface TopBarProps {
  searchRef?: RefObject<HTMLInputElement | null>
}

/**
 * Panel header inside the inset card, mirroring Motrix's PanelShell:
 * `px-6`, big `text-2xl font-semibold tracking-tight` title on the left,
 * a `min-h-9 gap-2` action row on the right. No bottom border — the inset
 * card itself is the surface.
 */
export function TopBar({ searchRef }: TopBarProps) {
  const { pathname } = useLocation()
  const localRef = useRef<HTMLInputElement>(null)
  const inputRef = searchRef ?? localRef
  const search = useTasks((s) => s.search)
  const setSearch = useTasks((s) => s.setSearch)
  const downloadSpeed = useTasks((s) => s.stat.downloadSpeed)
  const uploadSpeed = useTasks((s) => s.stat.uploadSpeed)
  const isDownloads = pageTitle(pathname) === '下载'

  return (
    <header className="flex h-[60px] shrink-0 items-center gap-3 px-4 sm:h-[68px] sm:gap-4 sm:px-6">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight text-foreground select-none sm:text-2xl">
          {pageTitle(pathname)}
        </h1>
      </div>

      <div className="ms-auto flex min-h-9 min-w-0 shrink-0 items-center gap-2.5 sm:gap-3">
        <div className="flex items-center gap-2.5 text-xs tabular-nums sm:gap-3">
          <span className="flex items-center gap-1 text-down" title="下载速度">
            <ArrowDown className="size-3.5" aria-hidden="true" />
            {formatSpeed(downloadSpeed)}
          </span>
          <span className="flex items-center gap-1 text-up" title="上传速度">
            <ArrowUp className="size-3.5" aria-hidden="true" />
            {formatSpeed(uploadSpeed)}
          </span>
        </div>

        {isDownloads && (
          <div className="relative hidden w-56 md:block">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索任务…"
              className="h-9 w-full rounded-lg bg-muted/60 pr-8 pl-9 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:bg-card focus:ring-2 focus:ring-ring/40"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-border bg-card px-1 font-mono text-[10px] leading-4 text-muted-foreground">
              /
            </kbd>
          </div>
        )}

        <Button variant="primary" aria-label="新建任务" onClick={() => useTaskForm.getState().openForm()}>
          <Plus className="size-4" aria-hidden="true" />
          <span className="max-sm:hidden">新建任务</span>
        </Button>
      </div>
    </header>
  )
}
