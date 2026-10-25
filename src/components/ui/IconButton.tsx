import type { MouseEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Tooltip } from '@/components/ui/Tooltip'

export interface IconButtonProps {
  icon: LucideIcon
  label: string
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  variant?: 'ghost' | 'solid'
  className?: string
}

export function IconButton({ icon: Icon, label, onClick, disabled, variant = 'ghost', className }: IconButtonProps) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-md transition-colors outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring/50',
          'disabled:pointer-events-none disabled:opacity-40',
          variant === 'ghost'
            ? 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            : 'bg-secondary text-secondary-foreground border border-border hover:bg-accent hover:text-accent-foreground',
          className,
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </button>
    </Tooltip>
  )
}
