import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '@/lib/cn'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> {
  label?: ReactNode
  description?: ReactNode
  ref?: Ref<HTMLInputElement>
}

export function Checkbox({ label, description, className, id, disabled, ref, ...rest }: CheckboxProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <label
      htmlFor={inputId}
      className={cn(
        'inline-flex cursor-pointer items-start gap-2.5 select-none',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        disabled={disabled}
        className={cn(
          'mt-0.5 size-4 shrink-0 cursor-pointer appearance-none rounded-[5px] border border-input bg-card',
          'grid place-items-center transition-colors outline-none',
          'checked:border-primary checked:bg-primary',
          'focus-visible:ring-2 focus-visible:ring-ring/40',
          "before:size-2 before:scale-0 before:bg-primary-foreground before:[clip-path:polygon(14%_48%,0_62%,40%_100%,100%_22%,86%_8%,38%_70%)] before:transition-transform before:content-['']",
          'checked:before:scale-100',
          'disabled:cursor-not-allowed',
          className,
        )}
        {...rest}
      />
      {(label || description) && (
        <span className="min-w-0 leading-snug">
          {label && <span className="block text-sm text-foreground">{label}</span>}
          {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
        </span>
      )}
    </label>
  )
}
