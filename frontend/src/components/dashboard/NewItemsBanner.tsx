'use client';
export default function NewItemsBanner({ count, noun, onShow }: { count: number; noun: string; onShow: () => void }) {
  if (count === 0) return null;
  return (
    <button type="button" onClick={onShow} className="w-full mb-3 py-2 border border-teal/50 bg-teal/5 font-mono text-[10px] uppercase tracking-[0.18em] text-teal-bright hover:bg-teal/10" aria-live="polite">
      {count} new {noun}{count === 1 ? '' : 's'} — show
    </button>
  );
}
