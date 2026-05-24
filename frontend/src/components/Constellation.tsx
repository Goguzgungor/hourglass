/**
 * Constellation — a faint astrolabe accent. Orion's Belt + nearby stars,
 * positioned with intent (NOT random). Twinkle is subtle.
 */
export default function Constellation({
  className,
  width = 220,
  height = 160,
}: {
  className?: string;
  width?: number;
  height?: number;
}) {
  // Coordinates roughly matching Orion (Betelgeuse, Bellatrix, Mintaka, Alnilam, Alnitak, Saiph, Rigel).
  const stars: Array<{ x: number; y: number; r: number; delay: number }> = [
    { x: 28, y: 22, r: 1.8, delay: 0 },     // Betelgeuse
    { x: 88, y: 30, r: 1.4, delay: 0.6 },   // Bellatrix
    { x: 50, y: 72, r: 1.1, delay: 0.3 },   // Mintaka (belt 1)
    { x: 62, y: 78, r: 1.3, delay: 0.9 },   // Alnilam (belt 2)
    { x: 74, y: 84, r: 1.0, delay: 1.5 },   // Alnitak (belt 3)
    { x: 34, y: 128, r: 1.4, delay: 1.1 },  // Saiph
    { x: 92, y: 132, r: 1.7, delay: 0.4 },  // Rigel
  ];

  // Lines connecting the stars in a believable constellation shape.
  const lines: Array<[number, number]> = [
    [0, 2], // Betelgeuse - Mintaka
    [1, 3], // Bellatrix - Alnilam (rough)
    [2, 3], // belt 1-2
    [3, 4], // belt 2-3
    [2, 5], // Mintaka - Saiph
    [4, 6], // Alnitak - Rigel
  ];

  return (
    <svg
      viewBox="0 0 120 160"
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
      role="presentation"
    >
      {/* connector lines */}
      <g stroke="var(--stroke-2)" strokeWidth="0.4" fill="none" opacity="0.55">
        {lines.map(([a, b], i) => (
          <line
            key={i}
            x1={stars[a].x}
            y1={stars[a].y}
            x2={stars[b].x}
            y2={stars[b].y}
          />
        ))}
      </g>

      {/* halos */}
      <g fill="var(--cream)" opacity="0.06">
        {stars.map((s, i) => (
          <circle key={`halo-${i}`} cx={s.x} cy={s.y} r={s.r * 3} />
        ))}
      </g>

      {/* stars */}
      <g fill="var(--cream)">
        {stars.map((s, i) => (
          <circle
            key={`s-${i}`}
            cx={s.x}
            cy={s.y}
            r={s.r}
            style={{
              animation: `twinkle ${3 + (i % 3)}s ease-in-out infinite`,
              animationDelay: `${s.delay}s`,
            }}
          />
        ))}
      </g>
    </svg>
  );
}
