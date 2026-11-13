import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useLabStore } from '../store/labStore';

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
};

export function ToastLayer() {
  const toasts = useLabStore((state) => state.toasts);
  const dismissToast = useLabStore((state) => state.dismissToast);
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.kind];
        return (
          <div key={toast.id} className={`toast-card ${toast.kind}`}>
            <span className="toast-icon">
              <Icon size={17} />
            </span>
            <div className="toast-copy">
              <strong>{toast.title}</strong>
              {toast.message && <p>{toast.message}</p>}
            </div>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismissToast(toast.id)}
              aria-label="关闭提示"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
