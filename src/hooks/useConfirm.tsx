import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

export interface ConfirmOptions {
  title: ReactNode
  description?: ReactNode
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

interface Pending extends ConfirmOptions {
  resolve: (value: boolean) => void
  key: number
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const [open, setOpen] = useState(false)
  const seq = useRef(0)

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setPending((prev) => {
          prev?.resolve(false)
          return { ...options, resolve, key: ++seq.current }
        })
        setOpen(true)
      }),
    [],
  )

  const settle = useCallback(
    (result: boolean) => {
      setOpen(false)
      setPending((prev) => {
        prev?.resolve(result)
        return null
      })
    },
    [],
  )

  // Keep content mounted while closing so the dialog does not flash during its exit.
  const last = useRef<Pending | null>(null)
  if (pending) last.current = pending
  const shown = pending ?? last.current

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {shown && (
        <ConfirmDialog
          open={open}
          title={shown.title}
          description={shown.description}
          confirmText={shown.confirmText}
          cancelText={shown.cancelText}
          danger={shown.danger}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>')
  return ctx
}
