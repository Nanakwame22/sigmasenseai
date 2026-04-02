import { useEffect } from 'react';
import { useToast } from '../../hooks/useToast';
import type { Toast as ToastType } from '../../hooks/useToast';

const Toast = ({ toast, onRemove }: { toast: ToastType; onRemove: (id: string) => void }) => {
  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        onRemove(toast.id);
      }, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, onRemove]);

  const getToastStyles = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-emerald-50 border-emerald-200 text-emerald-800';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'warning':
        return 'bg-amber-50 border-amber-200 text-amber-800';
      case 'info':
      default:
        return 'bg-blue-50 border-blue-200 text-blue-800';
    }
  };

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return (
          <div className="w-5 h-5 flex items-center justify-center">
            <i className="ri-checkbox-circle-fill text-emerald-600"></i>
          </div>
        );
      case 'error':
        return (
          <div className="w-5 h-5 flex items-center justify-center">
            <i className="ri-error-warning-fill text-red-600"></i>
          </div>
        );
      case 'warning':
        return (
          <div className="w-5 h-5 flex items-center justify-center">
            <i className="ri-alert-fill text-amber-600"></i>
          </div>
        );
      case 'info':
      default:
        return (
          <div className="w-5 h-5 flex items-center justify-center">
            <i className="ri-information-fill text-blue-600"></i>
          </div>
        );
    }
  };

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg mb-3 min-w-[320px] max-w-md animate-slideIn ${getToastStyles()}`}
    >
      {getIcon()}
      <p className="flex-1 text-sm font-medium">{toast.message}</p>
      <button
        onClick={() => onRemove(toast.id)}
        className="w-5 h-5 flex items-center justify-center hover:opacity-70 transition-opacity cursor-pointer"
      >
        <i className="ri-close-line text-lg"></i>
      </button>
    </div>
  );
};

export const ToastContainer = () => {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col items-end">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
};
