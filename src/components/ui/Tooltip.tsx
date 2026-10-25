import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface TooltipProps {
  content: ReactNode
  children: ReactElement
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

const panelSide: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  left: 'right-full top-1/2 mr-2 -translate-y-1/2',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2',
}

export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const [open, setOpen] = useState(false)
  if (content === null || content === undefined || content === '') return children

  return (
    <span
      className={cn('relative inline-flex', className)}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 w-max max-w-60 animate-fade-in rounded-md border border-border bg-card px-2 py-1 text-xs font-normal leading-4 text-card-foreground shadow-soft',
            panelSide[side],
          )}
        >
          {content}
        </span>
      )}
    </span>
  )
}
