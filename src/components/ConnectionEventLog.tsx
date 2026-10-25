import { ScrollText } from 'lucide-react'
import type { ConnectionEvent } from '@/types/settings'
import { formatTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'

/** Row dot per log level; classification itself happens upstream in the RPC client. */
const LEVEL_DOT_CLASS: Record<string, string> = {
  info: 'border border-border bg-muted',
  success: 'bg-success',
  warn: 'bg-warning',
  error: 'bg-destructive',
}

/** Message text color per log level. */
const LEVEL_TEXT_CLASS: Record<string, string> = {
  info: 'text-muted-foreground',
  success: 'text-success',
  warn: 'text-warning',
  error: 'text-destructive',
}

/** Compact "HH:mm:ss" for the fixed-width time column. */
function formatClock(ts: number): string {
  if (!Number.isFinite(ts)) return '-'
  const d = new Date(ts)
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export interface ConnectionEventLogProps {
  /** Log events, newest first. */
  events: ConnectionEvent[]
  /** Clear handler; the 清空 button is hidden when omitted. */
  onClear?: () => void
  className?: string
}

/**
 * Shared connection log panel: a scanning-friendly list with an aligned time
 * column and a colored level dot per row, newest first. Reads events via
 * props rather than the store so it can be dropped into any page.
 */
export function ConnectionEventLog({ events, onClear, className }: ConnectionEventLogProps) {
  return (
    <Card className={className}>
      <div className="flex items-start gap-3 px-5 pb-4 pt-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <ScrollText className="size-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-6 text-foreground">连接日志</h3>
          <p className="text-xs text-muted-foreground">实时显示连接状态、事件与 RPC 调用结果</p>
        </div>
        {onClear && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            清空
          </Button>
        )}
      </div>
      <CardContent>
        {events.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-xs text-muted-foreground">
            暂无日志
          </p>
        ) : (
          <ul className="max-h-[360px] divide-y divide-border/60 overflow-y-auto rounded-lg border border-border bg-muted/30 px-3">
            {events.map((ev) => (
              <li key={ev.id} className="flex items-start gap-3 py-2">
                <span
                  className="w-[76px] shrink-0 text-[11px] leading-[18px] text-muted-foreground tabular-nums"
                  title={formatTime(ev.time)}
                >
                  {formatClock(ev.time)}
                </span>
                <span
                  className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', LEVEL_DOT_CLASS[ev.level] ?? LEVEL_DOT_CLASS.info)}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    'min-w-0 flex-1 break-all text-[13px] leading-snug',
                    LEVEL_TEXT_CLASS[ev.level] ?? LEVEL_TEXT_CLASS.info,
                  )}
                >
                  {ev.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
