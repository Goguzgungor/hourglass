'use client';

import { useEffect, useRef, type ReactNode } from 'react';

type Props = {
  open: boolean;
  onDismiss: () => void;
  title?: string;
  kicker?: string;
  danger?: boolean;
  /** While true, Esc / backdrop clicks are ignored and buttons are disabled. */
  busy?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When provided, a Cancel / Confirm footer is rendered. */
  onConfirm?: () => void;
  children?: ReactNode;
};

export default function ConfirmDialog({
  open,
  onDismiss,
  title,
  kicker,
  danger = false,
  busy = false,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onDismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, busy, onDismiss]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night/80 backdrop-blur-sm"
      onClick={busy ? undefined : onDismiss}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'confirm-dialog-title' : undefined}
        className="max-w-[440px] w-full mx-6 bg-midnight border border-stroke p-8 rounded-sm outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {kicker && <p className={`eyebrow mb-3 ${danger ? 'text-warning' : 'text-cream-dim'}`}>· {kicker}</p>}
        {title && (
          <h3 id="confirm-dialog-title" className="headline-roman text-2xl text-cream mb-4">
            {title}
          </h3>
        )}
        {children}
        {onConfirm && (
          <div className="flex gap-3 justify-end mt-8">
            <button
              type="button"
              onClick={onDismiss}
              disabled={busy}
              className="text-[11px] uppercase tracking-[0.18em] px-5 py-2 border border-stroke text-cream-dim hover:text-cream hover:border-cream-dim transition-colors rounded-sm disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className={
                'text-[11px] uppercase tracking-[0.18em] px-5 py-2 border rounded-sm transition-colors disabled:opacity-50 ' +
                (danger
                  ? 'border-warning text-warning hover:bg-warning/10'
                  : 'border-sand bg-sand text-night hover:bg-sand-bright hover:border-sand-bright')
              }
            >
              {busy ? 'Working…' : confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
