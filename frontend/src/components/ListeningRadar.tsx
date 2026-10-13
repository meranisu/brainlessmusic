import type { RadarReading } from '../lib/listeningRadar';

const SIZE = 220;
const CENTRE = SIZE / 2;
const RADIUS = 78;

/** Where reading `i` of `count` sits at `scale` (0 to 1), clockwise from the top. */
function point(i: number, count: number, scale: number): [number, number] {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
  return [CENTRE + Math.cos(angle) * RADIUS * scale, CENTRE + Math.sin(angle) * RADIUS * scale];
}

const polygon = (count: number, scaleOf: (i: number) => number) =>
  Array.from({ length: count }, (_, i) => point(i, count, scaleOf(i)).join(',')).join(' ');

/**
 * A profile's listening over the picked range as a radar, after SOUND VOLTEX's EFFECT RADAR (as the Android app draws
 * it in the Gear skin): six axes on a hexagon, flat lines and a see-through fill in the theme's accent, no glow. The
 * readings are also listed beside it in words, so the shape is never the only way to read them.
 */
export function ListeningRadar({ readings, title, dimmed }: { readings: RadarReading[]; title: string; dimmed?: boolean }) {
  const count = readings.length;
  return (
    <section
      aria-label={title}
      className={`card flex flex-col items-center gap-4 p-4 transition-opacity sm:flex-row sm:gap-8 sm:p-5 ${dimmed ? 'opacity-60' : ''}`}
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-56 w-56 shrink-0" role="img" aria-hidden="true">
        {[0.25, 0.5, 0.75, 1].map((ring) => (
          <polygon key={ring} points={polygon(count, () => ring)} className="fill-none stroke-blue-700" strokeWidth={1} />
        ))}
        {readings.map((r, i) => {
          const [x, y] = point(i, count, 1);
          return <line key={r.name} x1={CENTRE} y1={CENTRE} x2={x} y2={y} className="stroke-blue-700" strokeWidth={1} />;
        })}
        <polygon
          points={polygon(count, (i) => Math.max(0.04, readings[i].value))}
          className="fill-orange-600/25 stroke-orange-600"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {readings.map((r, i) => {
          const [x, y] = point(i, count, 1.24);
          return (
            <text
              key={r.name}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-blue-300 font-mono text-[9px] uppercase tracking-widest"
            >
              {r.name}
            </text>
          );
        })}
      </svg>
      <div className="w-full min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          {readings.map((r) => (
            <div key={r.name} className="min-w-0">
              <dt className="font-mono text-xs uppercase tracking-widest text-blue-400">{r.name}</dt>
              <dd className="flex items-baseline gap-2">
                <span className="font-mono text-lg font-semibold tabular-nums text-white">{Math.round(r.value * 100)}%</span>
                <span className="truncate text-xs text-blue-300">{r.detail}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
