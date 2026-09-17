// frontend/src/components/create/ShapeTabs.tsx
'use client';

import type { Shape } from '@/lib/create/schedule';

const TABS: Array<{ id: Shape; label: string; hint: string }> = [
  { id: 'linear', label: 'Linear', hint: 'Continuous release, optional cliff and unlocks.' },
  { id: 'tranched', label: 'Tranched', hint: 'Discrete unlocks at fixed times.' },
  { id: 'recurring', label: 'Recurring', hint: 'Equal amounts every period.' },
];

export default function ShapeTabs({ shape, onChange }: { shape: Shape; onChange: (s: Shape) => void }) {
  return (
    <div>
      <div role="tablist" aria-label="Stream shape" className="flex gap-2 flex-wrap">
        {TABS.map((t) => {
          const active = t.id === shape;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.id)}
              className={
                'px-4 py-2 rounded-none border font-mono text-[11px] uppercase tracking-[0.18em] transition-colors ' +
                (active ? 'border-sand bg-sand/10 text-sand-bright' : 'border-stroke text-cream hover:border-stroke-2')
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-cream-dim/80">{TABS.find((t) => t.id === shape)?.hint}</p>
    </div>
  );
}
