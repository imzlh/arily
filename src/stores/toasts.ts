import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastState {
  toasts: ToastItem[]
  push: (message: string, type?: ToastType, duration?: number) => number
  dismiss: (id: number) => void
}

let nextId = 1

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message, type = 'info', duration = 4000) => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { id, message, type }].slice(-5) }))
    if (duration > 0) setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), duration)
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

/** Imperative helper usable outside components: toast('saved'), toast.error(msg) */
export const toast = Object.assign(
  (message: string, type: ToastType = 'info') => useToasts.getState().push(message, type),
  {
    success: (message: string) => useToasts.getState().push(message, 'success'),
    error: (message: string) => useToasts.getState().push(message, 'error', 6000),
    info: (message: string) => useToasts.getState().push(message, 'info'),
  },
)
