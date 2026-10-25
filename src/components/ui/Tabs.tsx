import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface TabItem {
  key: string
  label: ReactNode
  count?: number
}

export interface TabsProps {
  items: TabItem[]
  value: string
  onChange: (key: string) => void
  variant?: 'segmented' | 'underline'
  className?: string
}

export function Tabs({ items, value, onChange, variant = 'segmented', className }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn(
        variant === 'segmented'
          ? 'inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5'
          : 'flex items-center gap-1 border-b border-border',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.key === value
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className={cn(
              'inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              variant === 'segmented'
                ? cn(
                    'rounded-md px-3 py-1 text-[13px]',
                    active ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
                  )
                : cn(
                    '-mb-px border-b-2 px-2 pb-2 pt-1.5',
                    active
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                  ),
            )}
          >
            {item.label}
            {typeof item.count === 'number' && (
              <span
                className={cn(
                  'tabular rounded px-1 text-[11px] leading-4',
                  active ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground',
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
