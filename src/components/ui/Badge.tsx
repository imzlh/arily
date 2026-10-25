import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline' | 'muted'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const variants: Record<BadgeVariant, string> = {
  default: 'bg-primary/12 text-primary dark:bg-primary/20',
  success: 'bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
  warning: 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
  danger: 'bg-destructive/12 text-destructive dark:bg-destructive/20',
  info: 'bg-sky-500/12 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300',
  outline: 'border border-border text-muted-foreground',
  muted: 'bg-muted text-muted-foreground',
}

export function Badge({ variant = 'default', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4',
        variants[variant],
        className,
      )}
      {...rest}
    />
  )
}
