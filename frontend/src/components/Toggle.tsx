'use client';

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel: string;
  size?: 'sm' | 'default';
}

export default function Toggle({ checked, onChange, ariaLabel, size = 'default' }: ToggleProps) {
  const isSmall = size === 'sm';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={[
        'relative shrink-0 rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sand-bright focus-visible:ring-offset-2',
        isSmall ? 'h-5 w-9' : 'h-6 w-11',
        checked
          ? 'border-sand-bright bg-sand-bright'
          : 'border-stroke bg-void',
      ].join(' ')}
    >
      <span
        className={[
          'block rounded-full bg-white shadow transition-transform',
          isSmall ? 'h-3 w-3' : 'h-4 w-4',
          checked
            ? isSmall ? 'translate-x-4' : 'translate-x-5'
            : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  );
}
