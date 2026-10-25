import type { ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

export interface ConfirmDialogProps {
  open: boolean
  title: ReactNode
  description?: ReactNode
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText,
  cancelText,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {cancelText ?? '取消'}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} data-autofocus onClick={onConfirm}>
            {confirmText ?? '确定'}
          </Button>
        </>
      }
    />
  )
}
