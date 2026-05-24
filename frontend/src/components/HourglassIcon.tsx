'use client';

import { useId } from 'react';

type Props = {
  size?: number;
  /** 0..1 — proportion of sand remaining in the upper bulb. */
  fill?: number;
  animated?: boolean;
  className?: string;
};

/**
 * Hourglass: two triangles point-to-point. The upper bulb holds sand
 * proportional to `fill`; the lower bulb accumulates the remainder.
 * When animated, a few small particles drift through the pinch point.
 *
 * Pure SVG + CSS — no JS animation loops.
 */
export default function HourglassIcon({
  size = 64,
  fill = 0.5,
  animated = true,
  className,
}: Props) {
  const id = useId().replace(/:/g, '');

  const stroke = 'var(--sand)';
  const sandFill = 'var(--sand)';

  const clamped = Math.max(0, Math.min(1, fill));
  const topFillHeight = 60 * clamped;
  const topFillY = 10 + (60 - topFillHeight);

  const botFillHeight = 60 * (1 - clamped);
  const botFillY = 130 - botFillHeight;

  return (
    <svg
      viewBox="0 0 100 140"
      width={size}
      height={size * 1.4}
      className={className}
      aria-hidden="true"
      role="presentation"
    >
      <defs>
        <clipPath id={`top-${id}`}>
          <polygon points="10,10 90,10 50,70" />
        </clipPath>
        <clipPath id={`bot-${id}`}>
          <polygon points="50,70 10,130 90,130" />
        </clipPath>
        <linearGradient id={`sand-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--sand-bright)" />
          <stop offset="1" stopColor="var(--sand-deep)" />
        </linearGradient>
      </defs>

      {/* End caps + body outline (sharp 1.5px stroke, sand) */}
      <g fill="none" stroke={stroke} strokeWidth="1.4" strokeLinecap="square">
        {/* upper bulb */}
        <polygon points="10,10 90,10 50,70" />
        {/* lower bulb */}
        <polygon points="50,70 10,130 90,130" />
        {/* top + bottom caps — slightly heavier */}
        <line x1="5" y1="10" x2="95" y2="10" strokeWidth="2.2" />
        <line x1="5" y1="130" x2="95" y2="130" strokeWidth="2.2" />
      </g>

      {/* Sand in top bulb — drains over time */}
      <g clipPath={`url(#top-${id})`}>
        <rect
          x="0"
          y={topFillY}
          width="100"
          height={topFillHeight}
          fill={`url(#sand-${id})`}
          opacity="0.92"
        />
      </g>

      {/* Pile accumulating in bottom bulb */}
      <g clipPath={`url(#bot-${id})`}>
        <rect
          x="0"
          y={botFillY}
          width="100"
          height={botFillHeight}
          fill={sandFill}
          opacity="0.92"
        />
      </g>

      {/* Falling particles through the pinch point */}
      {animated && (
        <g fill={sandFill}>
          <circle
            cx="50"
            cy="70"
            r="0.7"
            style={{
              animation: 'fall 1.6s linear infinite',
              animationDelay: '0s',
            }}
          />
          <circle
            cx="49.5"
            cy="70"
            r="0.6"
            style={{
              animation: 'fall 1.6s linear infinite',
              animationDelay: '0.4s',
            }}
          />
          <circle
            cx="50.5"
            cy="70"
            r="0.55"
            style={{
              animation: 'fall 1.6s linear infinite',
              animationDelay: '0.8s',
            }}
          />
          <circle
            cx="50"
            cy="70"
            r="0.65"
            style={{
              animation: 'fall 1.6s linear infinite',
              animationDelay: '1.2s',
            }}
          />
        </g>
      )}
    </svg>
  );
}
