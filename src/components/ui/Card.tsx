import type { HTMLAttributes, ReactNode, Ref } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

export function Card({ className, ref, ...rest }: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn('rounded-xl border border-border bg-card text-card-foreground shadow-soft', className)}
      {...rest}
    />
  )
}

export interface CardHeaderProps {
  icon?: LucideIcon
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

export function CardHeader({ icon: Icon, title, description, actions, className }: CardHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start gap-x-3 gap-y-2 px-5 pb-3 pt-5', className)}>
      {Icon && (
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      )}
      {/* min-w keeps the title readable: once squeezed past it, the actions
          wrap onto their own row instead of crushing the text vertically. */}
      <div className="min-w-40 flex-1">
        <h3 className="text-sm font-semibold leading-6 text-foreground">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions && (
        <div className="ms-auto flex max-w-full shrink-0 flex-wrap items-center gap-1.5">{actions}</div>
      )}
    </div>
  )
}

export function CardContent({ className, ref, ...rest }: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cn('px-5 pb-5', className)} {...rest} />
}
