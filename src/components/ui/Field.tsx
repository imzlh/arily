import { useId } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  htmlFor?: string
  children: ReactNode
  className?: string
}

export function Field({ label, hint, error, htmlFor, children, className }: FieldProps) {
  const autoId = useId()
  const labelFor = htmlFor ?? autoId
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={labelFor} className="text-xs font-medium text-foreground">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}
