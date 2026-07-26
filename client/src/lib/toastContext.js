import { createContext, useContext } from 'react';

// Kept out of Toaster.jsx so that file exports components only — mixing a hook
// and a component in one module breaks React Fast Refresh, which silently
// resets every component's state whenever the toast code is edited.
export const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
