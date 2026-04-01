import { useState, useCallback } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

let toastListeners: ((toasts: Toast[]) => void)[] = [];
let toastsState: Toast[] = [];

const notifyListeners = () => {
  toastListeners.forEach(listener => listener(toastsState));
};

export const addToast = (message: string, type: ToastType = 'info', duration: number = 4000) => {
  const id = `toast-${Date.now()}-${Math.random()}`;
  const newToast: Toast = { id, message, type, duration };
  
  toastsState = [...toastsState, newToast];
  notifyListeners();

  if (duration > 0) {
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }
};

export const removeToast = (id: string) => {
  toastsState = toastsState.filter(toast => toast.id !== id);
  notifyListeners();
};

export const useToast = (): ToastContextValue => {
  const [toasts, setToasts] = useState<Toast[]>(toastsState);

  useState(() => {
    toastListeners.push(setToasts);
    return () => {
      toastListeners = toastListeners.filter(listener => listener !== setToasts);
    };
  });

  const showToast = useCallback((message: string, type: ToastType = 'info', duration: number = 4000) => {
    addToast(message, type, duration);
  }, []);

  const removeToastCallback = useCallback((id: string) => {
    removeToast(id);
  }, []);

  return {
    toasts,
    showToast,
    removeToast: removeToastCallback,
  };
};