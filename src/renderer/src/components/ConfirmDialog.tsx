import { AlertTriangle, X } from 'lucide-react'
import { useDialogFocus } from '../lib/dialogFocus'

interface ConfirmDialogProps {
  title: string
  body: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel = '确认',
  danger,
  onConfirm,
  onCancel
}: ConfirmDialogProps): React.JSX.Element {
  const dialogRef = useDialogFocus<HTMLElement>(onCancel)

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onCancel()}
    >
      <section
        className="dialog confirm-dialog"
        ref={dialogRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="dialog-header">
          <div className="confirm-title">
            <AlertTriangle size={20} />
            <h2>{title}</h2>
          </div>
          <button className="icon-button" type="button" title="关闭" onClick={onCancel}>
            <X size={18} />
          </button>
        </header>
        <p>{body}</p>
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            取消
          </button>
          <button
            className={danger ? 'danger-button' : 'primary-button'}
            type="button"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
