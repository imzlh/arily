import type { InputHTMLAttributes, Ref } from 'react'
import { cn } from '@/lib/cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
  ref?: Ref<HTMLInputElement>
}

export const inputBase =
  'h-9 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-xs placeholder:text-muted-foreground/70 ' +
  'transition-[border-color,box-shadow] outline-none ' +
  'hover:border-ring/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

export function Input({ className, invalid, type = 'text', ref, ...rest }: InputProps) {
  return (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(inputBase, invalid && 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25', className)}
      {...rest}
    />
  )
}
