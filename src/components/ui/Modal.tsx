import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  footer?: ReactNode
  children?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  busy?: boolean
  className?: string
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function Modal({ open, onClose, title, description, footer, children, size = 'md', busy = false, className }: ModalProps) {
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const busyRef = useRef(busy)
  const closeRef = useRef(onClose)
  busyRef.current = busy
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const raf = requestAnimationFrame(() => {
      const root = panelRef.current
      if (!root) return
      const target =
        root.querySelector<HTMLElement>('[data-autofocus]') ?? root.querySelector<HTMLElement>(FOCUSABLE) ?? root
      target.focus()
    })

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!busyRef.current) closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current || e.altKey || e.ctrlKey || e.metaKey) return
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      )
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (!busyRef.current) closeRef.current()
    }

    document.addEventListener('keyup', onKeyUp)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-sm"
        onClick={() => {
          if (!busy) onClose()
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[calc(100dvh-2rem)] w-full animate-pop-in flex-col rounded-xl border border-border bg-card text-card-foreground shadow-soft outline-none',
          sizes[size],
          className,
        )}
      >
        <div className="flex items-start gap-3 px-5 pb-2 pt-5">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold leading-6 text-foreground">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="关闭"
            className="-mr-1.5 -mt-1 size-8"
            disabled={busy}
            onClick={onClose}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
        {children != null && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 text-sm">{children}</div>
        )}
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  )
}
