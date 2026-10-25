import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useToasts } from '@/stores/toasts'
import type { ToastItem } from '@/stores/toasts'
import { cn } from '@/lib/cn'

const icons = {
  success: CircleCheck,
  error: CircleAlert,
  info: Info,
} as const

const tones = {
  success: 'text-emerald-600 dark:text-emerald-400',
  error: 'text-destructive',
  info: 'text-primary',
} as const

function Toast({ toast }: { toast: ToastItem }) {
  const dismiss = useToasts((s) => s.dismiss)
  const Icon = icons[toast.type] ?? Info
  return (
    <div
      role="status"
      className="pointer-events-auto flex w-80 max-w-[calc(100vw-2rem)] animate-slide-in items-start gap-2.5 rounded-lg border border-border bg-card py-2.5 pl-3 pr-2 text-card-foreground shadow-soft"
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', tones[toast.type])} aria-hidden="true" />
      <p className="min-w-0 flex-1 whitespace-pre-line break-words py-0.5 text-[13px] leading-5">{toast.message}</p>
      <button
        type="button"
        aria-label="关闭"
        onClick={() => dismiss(toast.id)}
        className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  )
}
