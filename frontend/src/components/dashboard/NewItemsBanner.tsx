'use client';

/** Always-mounted polite live region so the "N new …" announcement is actually read out. */
export default function NewItemsBanner({ count, noun, onShow }: { count: number; noun: string; onShow: () => void }) {
  return (
    <div aria-live="polite" aria-atomic="true" className={count > 0 ? 'mb-3' : 'sr-only'}>
      {count > 0 && (
        <button
          type="button"
          onClick={onShow}
          className="w-full py-2 border border-teal/50 bg-teal/5 font-mono text-[10px] uppercase tracking-[0.18em] text-teal-bright hover:bg-teal/10"
        >
          {count} new {noun}
          {count === 1 ? '' : 's'} — show
        </button>
      )}
    </div>
  );
}
