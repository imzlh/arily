import { cn } from '@/lib/cn'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = { sm: 'size-3.5 border-[1.5px]', md: 'size-4 border-2', lg: 'size-6 border-2' } as const

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-hidden="true"
      className={cn(
        'inline-block shrink-0 animate-spin rounded-full border-current border-r-transparent align-[-0.125em]',
        sizes[size],
        className,
      )}
    />
  )
}
