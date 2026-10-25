import type { ButtonHTMLAttributes, Ref } from 'react'
import { cn } from '@/lib/cn'
import { Spinner } from '@/components/ui/Spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
export type ButtonSize = 'sm' | 'md' | 'icon'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  ref?: Ref<HTMLButtonElement>
}

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 active:bg-primary/85',
  secondary:
    'bg-secondary text-secondary-foreground border border-border hover:bg-accent hover:text-accent-foreground',
  ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
  danger:
    'bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 active:bg-destructive/85',
  outline:
    'border border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 rounded-md px-2.5 text-xs',
  md: 'h-9 gap-2 rounded-lg px-3.5 text-sm',
  icon: 'size-9 rounded-lg',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-colors',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner size={size === 'sm' ? 'sm' : 'md'} />}
      {children}
    </button>
  )
}
