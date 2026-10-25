import { useId } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: ReactNode
  description?: ReactNode
  className?: string
  id?: string
}

export function Switch({ checked, onChange, disabled, label, description, className, id }: SwitchProps) {
  const autoId = useId()
  const labelId = id ?? autoId
  const button = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={label ? labelId : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-input',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none block size-4 rounded-full bg-card shadow-xs transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  )

  if (!label && !description) return <span className={className}>{button}</span>

  return (
    <label className={cn('inline-flex cursor-pointer items-start gap-3 select-none', disabled && 'cursor-not-allowed opacity-60', className)}>
      {button}
      <span className="min-w-0 leading-snug">
        {label && (
          <span id={labelId} className="block text-sm text-foreground">
            {label}
          </span>
        )}
        {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
      </span>
    </label>
  )
}
