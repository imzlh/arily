import { cn } from '@/lib/cn'

export interface ProgressProps {
  value: number
  variant?: 'default' | 'success' | 'danger'
  striped?: boolean
  thin?: boolean
  className?: string
  'aria-label'?: string
}

const variants = {
  default: 'bg-primary',
  success: 'bg-emerald-500',
  danger: 'bg-destructive',
} as const

export function Progress({ value, variant = 'default', striped = false, thin = false, className, ...rest }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={rest['aria-label']}
      className={cn('w-full overflow-hidden rounded-full bg-muted', thin ? 'h-1' : 'h-1.5', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300 ease-out', variants[variant], striped && 'progress-stripes')}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
