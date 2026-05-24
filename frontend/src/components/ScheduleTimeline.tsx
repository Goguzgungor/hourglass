'use client';

import { useEffect, useState } from 'react';
import { formatTimestamp } from '@/lib/format';

type Props = {
  start_ts: number;
  cliff_ts: number;
  end_ts: number;
  height?: number;
};

/**
 * ScheduleTimeline — a horizontal scale strip showing the four cardinal
 * moments of a stream (start, cliff, now, end). Updates every second.
 */
export default function ScheduleTimeline({
  start_ts,
  cliff_ts,
  end_ts,
  height = 72,
}: Props) {
  const [nowSec, setNowSec] = useState(() =>
    Math.floor(Date.now() / 1000),
  );

  useEffect(() => {
    const handle = setInterval(
      () => setNowSec(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => clearInterval(handle);
  }, []);

  const duration = Math.max(1, end_ts - start_ts);
  const nowPct = Math.min(1, Math.max(0, (nowSec - start_ts) / duration));
  const cliffPct =
    cliff_ts > start_ts ? Math.min(1, (cliff_ts - start_ts) / duration) : 0;

  const W = 1000;
  const trackY = 22;

  return (
    <div
      className="relative w-full overflow-hidden rounded-sm border border-stroke bg-gradient-to-br from-midnight to-night/80 px-4 py-4"
      style={{ height }}
    >
      <svg
        viewBox={`0 0 ${W} 56`}
        preserveAspectRatio="none"
        width="100%"
        height={height - 32}
        className="overflow-visible"
        aria-hidden
      >
        <defs>
          <linearGradient id="g-tl-fill" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--sand-deep)" stopOpacity="0.6" />
            <stop offset="1" stopColor="var(--sand-bright)" stopOpacity="0.8" />
          </linearGradient>
        </defs>

        {/* Background track */}
        <line
          x1={0}
          x2={W}
          y1={trackY}
          y2={trackY}
          stroke="var(--stroke-2)"
          strokeWidth="1"
        />

        {/* Progress fill */}
        <rect
          x={0}
          y={trackY - 2}
          width={W * nowPct}
          height={4}
          fill="url(#g-tl-fill)"
        />

        {/* START marker */}
        <g>
          <line
            x1={1}
            x2={1}
            y1={trackY - 8}
            y2={trackY + 8}
            stroke="var(--sand)"
            strokeWidth="2"
          />
          <text
            x={6}
            y={trackY + 22}
            fontFamily="var(--font-geist-mono)"
            fontSize="9"
            letterSpacing="2.4"
            fill="var(--sand)"
          >
            START
          </text>
        </g>

        {/* CLIFF marker */}
        {cliffPct > 0.01 && cliffPct < 0.99 && (
          <g>
            <line
              x1={W * cliffPct}
              x2={W * cliffPct}
              y1={trackY - 7}
              y2={trackY + 7}
              stroke="var(--violet)"
              strokeWidth="2"
            />
            <text
              x={W * cliffPct + 4}
              y={trackY + 22}
              fontFamily="var(--font-geist-mono)"
              fontSize="9"
              letterSpacing="2.4"
              fill="var(--violet)"
            >
              CLIFF
            </text>
          </g>
        )}

        {/* NOW marker */}
        <g>
          <line
            x1={W * nowPct}
            x2={W * nowPct}
            y1={trackY - 11}
            y2={trackY + 11}
            stroke="var(--teal-bright)"
            strokeWidth="2"
          />
          <circle
            cx={W * nowPct}
            cy={trackY}
            r={4}
            fill="var(--teal-bright)"
            style={{ animation: 'bob 2.4s ease-in-out infinite' }}
          />
          <circle
            cx={W * nowPct}
            cy={trackY}
            r={9}
            fill="none"
            stroke="var(--teal-bright)"
            strokeOpacity="0.25"
            strokeWidth="1"
          />
          <text
            x={W * nowPct + 6}
            y={trackY - 12}
            fontFamily="var(--font-geist-mono)"
            fontSize="9"
            letterSpacing="2.4"
            fill="var(--teal-bright)"
          >
            NOW
          </text>
        </g>

        {/* END marker */}
        <g>
          <line
            x1={W - 1}
            x2={W - 1}
            y1={trackY - 8}
            y2={trackY + 8}
            stroke="var(--cream)"
            strokeWidth="2"
          />
          <text
            x={W - 6}
            y={trackY + 22}
            textAnchor="end"
            fontFamily="var(--font-geist-mono)"
            fontSize="9"
            letterSpacing="2.4"
            fill="var(--cream)"
          >
            END
          </text>
        </g>
      </svg>

      {/* DOM-layer timestamps (kept in HTML so locale formatting is sharp) */}
      <div className="pointer-events-none absolute inset-x-4 bottom-2 flex justify-between font-mono text-[10px] text-cream-dim">
        <span>{formatTimestamp(start_ts)}</span>
        <span>{formatTimestamp(end_ts)}</span>
      </div>
    </div>
  );
}
