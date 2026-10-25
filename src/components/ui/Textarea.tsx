import type { Ref, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
  ref?: Ref<HTMLTextAreaElement>
}

export function Textarea({ className, invalid, ref, ...rest }: TextareaProps) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'min-h-24 w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs',
        'placeholder:text-muted-foreground/70 transition-[border-color,box-shadow] outline-none',
        'hover:border-ring/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid && 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25',
        className,
      )}
      {...rest}
    />
  )
}
