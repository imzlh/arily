import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useConnection } from '@/stores/connection'
import { useOptions } from '@/stores/options'
import { useTasks } from '@/stores/tasks'
import { toast } from '@/stores/toasts'
import { formatSpeed, formatSpeedInput, parseSpeed } from '@/lib/format'
import { cn } from '@/lib/cn'

const STATE_LABEL: Record<string, string> = {
  connected: '已连接',
  connecting: '连接中',
  disconnected: '已断开',
  idle: '未连接',
}

const STATE_DOT: Record<string, string> = {
  connected: 'bg-success',
  connecting: 'bg-warning animate-pulse',
  disconnected: 'bg-muted-foreground/40',
  idle: 'bg-muted-foreground/40',
}

const INPUT_CLASS =
  'h-7 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs text-foreground ' +
  'outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/60 ' +
  'hover:border-ring/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

const compactLimit = (value: number): string => formatSpeedInput(value) || '不限'

/**
 * Motrix-style slim footer at the bottom of the main inset card: global
 * down/up speeds on the left with the global speed-limit editor, and the
 * aria2 version, connection state and active-task count on the right.
 * Renders disconnected as a grayed bar with "—" speeds; safe to mount always.
 */
export function GlobalStatsBar() {
  const state = useConnection((s) => s.state)
  const version = useConnection((s) => s.version)
  const stat = useTasks((s) => s.stat)
  const globalOptions = useOptions((s) => s.globalOptions)

  const connected = state === 'connected'
  const downSpeed = Number(stat.downloadSpeed) || 0
  const upSpeed = Number(stat.uploadSpeed) || 0
  const activeCount = Number(stat.numActive) || 0

  const downLimit = Number(globalOptions['max-overall-download-limit']) || 0
  const upLimit = Number(globalOptions['max-overall-upload-limit']) || 0
  const limitText =
    downLimit <= 0 && upLimit <= 0 ? '不限速' : `↓ ${compactLimit(downLimit)} / ↑ ${compactLimit(upLimit)}`

  // Fetch the current global options once per connection so the limits are live.
  useEffect(() => {
    if (state === 'connected') void useOptions.getState().loadGlobal()
  }, [state])

  // ---- limit editor popover
  const [open, setOpen] = useState(false)
  const [downInput, setDownInput] = useState('')
  const [upInput, setUpInput] = useState('')
  const [saving, setSaving] = useState(false)
  const popRef = useRef<HTMLDivElement>(null)

  function openEditor() {
    if (!connected) return
    setDownInput(formatSpeedInput(downLimit))
    setUpInput(formatSpeedInput(upLimit))
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      const ok = await useOptions.getState().saveGlobal({
        'max-overall-download-limit': String(parseSpeed(downInput)),
        'max-overall-upload-limit': String(parseSpeed(upInput)),
      })
      if (ok) {
        toast.success('全局限速已保存')
        setOpen(false)
      } else {
        toast.error(`操作失败：${useOptions.getState().lastError ?? ''}`)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <footer className="hidden h-9 shrink-0 select-none items-center gap-3 border-t border-border px-4 text-xs text-muted-foreground lg:flex">
      {/* ------------------------------------------------------- left: speeds */}
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn('flex shrink-0 items-center gap-1 tabular-nums', connected ? 'text-down' : 'text-muted-foreground/50')}
          title="下载速度"
        >
          <ArrowDown className="size-3" aria-hidden="true" />
          {connected ? formatSpeed(downSpeed) : '—'}
          <span className="hidden text-[10px] font-medium text-muted-foreground sm:inline">下载</span>
        </span>
        <span
          className={cn('flex shrink-0 items-center gap-1 tabular-nums', connected ? 'text-up' : 'text-muted-foreground/50')}
          title="上传速度"
        >
          <ArrowUp className="size-3" aria-hidden="true" />
          {connected ? formatSpeed(upSpeed) : '—'}
          <span className="hidden text-[10px] font-medium text-muted-foreground sm:inline">上传</span>
        </span>

        {/* global speed limit: badge -> small editor popover */}
        <div className="relative hidden sm:block" ref={popRef}>
          <button
            type="button"
            onClick={() => (open ? setOpen(false) : openEditor())}
            disabled={!connected}
            aria-expanded={open}
            title="点击修改全局限速"
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default',
              connected
                ? 'border-border bg-card/60 text-muted-foreground hover:bg-accent hover:text-foreground'
                : 'border-transparent text-muted-foreground/50',
            )}
          >
            <SlidersHorizontal className="size-3" aria-hidden="true" />
            <span className="tabular-nums">{limitText}</span>
          </button>

          {open && (
            <div className="absolute bottom-full left-0 z-30 mb-2 w-72 animate-pop-in rounded-xl border border-border bg-card p-3 text-xs text-foreground shadow-soft">
              <p className="mb-2 text-xs font-semibold text-foreground">全局限速</p>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-muted-foreground">下载</span>
                  <input
                    type="text"
                    value={downInput}
                    onChange={(e) => setDownInput(e.target.value)}
                    placeholder="如 10M，留空不限速"
                    className={INPUT_CLASS}
                    spellCheck={false}
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-muted-foreground">上传</span>
                  <input
                    type="text"
                    value={upInput}
                    onChange={(e) => setUpInput(e.target.value)}
                    placeholder="如 5M，留空不限速"
                    className={INPUT_CLASS}
                    spellCheck={false}
                  />
                </label>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">留空或 0 表示不限速</span>
                <Button size="sm" onClick={() => void save()} loading={saving} disabled={!connected}>
                  保存
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------ right: engine */}
      <div className="ms-auto flex shrink-0 items-center gap-3">
        <span
          className="hidden rounded border border-border bg-muted/50 px-1.5 py-px font-mono text-[10px] leading-4 text-muted-foreground md:inline"
          title="aria2 版本"
        >
          {version ? `aria2 v${version}` : 'aria2 —'}
        </span>
        <span className="flex items-center gap-1.5" role="status">
          <span className={cn('size-1.5 shrink-0 rounded-full', STATE_DOT[state] ?? STATE_DOT.idle)} aria-hidden="true" />
          <span className={cn(connected && 'text-foreground/80')}>{STATE_LABEL[state] ?? state}</span>
        </span>
        <span className="hidden items-center gap-1 md:flex">
          活动任务
          <span className={cn('tabular-nums', connected ? 'font-medium text-foreground' : 'text-muted-foreground/50')}>
            {connected ? activeCount : '—'}
          </span>
        </span>
      </div>
    </footer>
  )
}
