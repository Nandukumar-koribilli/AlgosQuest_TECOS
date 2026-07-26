import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { ToastContext } from '../lib/toastContext';
import './Toaster.css';

let seed = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast) => {
      const id = ++seed;
      const next = {
        id,
        variant: 'info',
        duration: 3500,
        ...toast
      };
      setToasts((prev) => [...prev, next]);
      if (next.duration > 0) {
        setTimeout(() => remove(id), next.duration);
      }
      return id;
    },
    [remove]
  );

  // Stable identity: consumers put `toast` in useCallback/useEffect deps, and a
  // fresh object every render would re-run those on each toast change.
  const value = useMemo(
    () => ({
      push,
      remove,
      success: (message, opts) => push({ ...opts, variant: 'success', message }),
      error: (message, opts) => push({ ...opts, variant: 'error', message }),
      warning: (message, opts) => push({ ...opts, variant: 'warning', message }),
      info: (message, opts) => push({ ...opts, variant: 'info', message })
    }),
    [push, remove]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toaster" role="status" aria-live="polite">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info
};

function Toast({ toast, onDismiss }) {
  const Icon = ICONS[toast.variant] || Info;
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (toast.duration > 0) {
      const t = setTimeout(() => setLeaving(true), toast.duration - 250);
      return () => clearTimeout(t);
    }
  }, [toast.duration]);

  return (
    <div className={`toast toast-${toast.variant} ${leaving ? 'toast-leaving' : ''}`}>
      <Icon size={18} className="toast-icon" />
      <div className="toast-body">
        {toast.title && <div className="toast-title">{toast.title}</div>}
        <div className="toast-message">{toast.message}</div>
      </div>
      <button
        type="button"
        className="toast-dismiss"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <X size={14} />
      </button>
    </div>
  );
}
