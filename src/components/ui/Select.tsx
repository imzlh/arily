import type { ReactNode, Ref, SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options?: SelectOption[]
  invalid?: boolean
  children?: ReactNode
  ref?: Ref<HTMLSelectElement>
}

export function Select({ className, options, invalid, ref, children, ...rest }: SelectProps) {  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          'h-9 w-full appearance-none rounded-lg border border-input bg-card pl-3 pr-8 text-sm text-foreground shadow-xs',
          'transition-[border-color,box-shadow] outline-none',
          'hover:border-ring/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
          'disabled:cursor-not-allowed disabled:opacity-50',
          invalid && 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25',
          className,
        )}
        {...rest}
      >
        {options
          ? options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))
          : children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}
