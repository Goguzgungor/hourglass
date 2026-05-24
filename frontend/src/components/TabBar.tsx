'use client';

type Tab = { id: string; label: string };

type Props = {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
};

/**
 * TabBar — editorial uppercase tab strip with a sand underline on the active
 * tab. The continuous hairline at the bottom keeps the typographic rhythm and
 * the active tab "lifts" via a slightly thicker sand stroke that sits on top
 * of that hairline.
 */
export default function TabBar({ tabs, active, onChange }: Props) {
  return (
    <div
      role="tablist"
      className="relative border-b border-stroke overflow-x-auto tab-scroll -mx-4 sm:mx-0 px-4 sm:px-0"
    >
      <div className="flex gap-5 sm:gap-8 min-w-max">
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(t.id)}
              className={
                'relative pb-3 pt-1 min-h-[44px] text-[11px] sm:text-xs uppercase tracking-[0.18em] whitespace-nowrap transition-colors ' +
                (isActive
                  ? 'text-cream'
                  : 'text-cream-dim hover:text-cream-muted')
              }
            >
              {t.label}
              {isActive && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-0 right-0 -bottom-px h-px bg-sand"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
