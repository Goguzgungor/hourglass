'use client';
import { useEffect, useRef, useState } from 'react';
import { searchKind } from '@/lib/dashboard/filters';

export default function SearchBox({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  const [text, setText] = useState(value);
  // Last value this box pushed upstream; a `value` equal to it is our own echo,
  // not an external change (Clear filters, shared URL), so local typing survives.
  const lastSent = useRef(value);

  useEffect(() => {
    if (value !== lastSent.current) {
      lastSent.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    const next = text.trim();
    if (next === lastSent.current) return;
    const id = setTimeout(() => {
      lastSent.current = next;
      onChange(next);
    }, 300);
    return () => clearTimeout(id);
  }, [text, onChange]);

  const kind = searchKind(text);
  return (
    <div className="flex-1 min-w-[220px]">
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search: stream id, G… account or C… token"
        aria-label="Search streams"
        spellCheck={false}
        className="w-full bg-transparent border-b border-stroke px-0 py-1.5 font-mono text-xs text-cream placeholder:text-cream-dim/60 outline-none focus:border-sand"
      />
      {kind === 'invalid' && <p className="mt-1 text-[10px] text-warning">Search by stream id, G… account or C… token.</p>}
    </div>
  );
}
