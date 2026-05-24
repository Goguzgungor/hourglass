'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import HourglassIcon from '@/components/HourglassIcon';

type Toast = {
  id: number;
  message: string;
  /** Optional kicker shown in mono above the message ("STREAM #4 / CREATED"). */
  kicker?: string;
  /** ms until auto-dismiss. Default 4500. */
  duration?: number;
};

type ToastCtx = {
  push: (t: Omit<Toast, 'id'>) => void;
};

const ToastContext = createContext<ToastCtx | null>(null);

let counter = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((curr) => curr.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback<ToastCtx['push']>(
    (t) => {
      const id = counter++;
      const next: Toast = { id, duration: 4500, ...t };
      setToasts((curr) => [...curr, next]);
      const handle = setTimeout(() => dismiss(id), next.duration!);
      timers.current.set(id, handle);
    },
    [dismiss],
  );

  // Clean up any pending timers on unmount.
  useEffect(
    () => () => {
      timers.current.forEach((h) => clearTimeout(h));
      timers.current.clear();
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto bg-midnight border border-stroke px-5 py-4 min-w-[280px] max-w-[360px] shadow-2xl rounded-none"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">
                <HourglassIcon size={18} fill={0.75} animated={false} />
              </div>
              <div className="min-w-0">
                {t.kicker && (
                  <p className="text-[10px] uppercase tracking-[0.18em] text-cream-dim mb-1 font-mono">
                    {t.kicker}
                  </p>
                )}
                <p className="text-sm text-cream leading-snug">{t.message}</p>
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                className="text-cream-dim hover:text-cream transition-colors ml-2 shrink-0"
                onClick={() => dismiss(t.id)}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
