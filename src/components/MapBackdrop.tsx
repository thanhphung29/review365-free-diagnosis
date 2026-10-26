// Decorative city map behind the idle search, drawn in the Google Maps light palette.
// The street grid and buildings come from a seeded RNG, so server and client render the same map.

const W = 1600;
const H = 1000;
/** Map scale: the street grid is drawn at this zoom around the center; rivers and big roads are sized to match. */
const ZOOM = 2;
const CITY_TRANSFORM = `translate(${W / 2} ${H / 2}) scale(${ZOOM}) translate(${-W / 2} ${-H / 2}) rotate(-12 ${W / 2} ${H / 2})`;

const LAND = '#f2f1ec';
const BUILDINGS = ['#e5e3dd', '#e8e6e1', '#e1dfd9'];
const PARK = '#d4eacf';
const TREE = '#c3e0bd';
const WATER = '#c9e3f6';
const ROAD = '#ffffff';
const ROAD_EDGE = '#e1e0da';
const HIGHWAY = '#fbe3a1';
const HIGHWAY_EDGE = '#efcf7f';

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Road positions along one axis, irregularly spaced; every third one is a main road. */
function lines(from: number, to: number, rand: () => number) {
  const out: { at: number; main: boolean }[] = [];
  for (let at = from, i = 0; at < to; at += 140 + rand() * 90, i++) out.push({ at, main: i % 3 === 0 });
  return out;
}

interface Rect { x: number; y: number; w: number; h: number; fill: string }

function buildCity() {
  const rand = rng(365);
  const cols = lines(-500, W + 500, rand);
  const rows = lines(-500, H + 500, rand);
  const blocks: Rect[] = [];
  const parks: Rect[] = [];
  const trees: { x: number; y: number; r: number }[] = [];

  for (let c = 0; c < cols.length - 1; c++) {
    for (let r = 0; r < rows.length - 1; r++) {
      const x = cols[c].at + 14, y = rows[r].at + 14;
      const w = cols[c + 1].at - cols[c].at - 28, h = rows[r + 1].at - rows[r].at - 28;
      if (rand() < 0.12) {
        parks.push({ x, y, w, h, fill: PARK });
        for (let i = 0; i < 6; i++) trees.push({ x: x + 12 + rand() * (w - 24), y: y + 12 + rand() * (h - 24), r: 5 + rand() * 7 });
        continue;
      }
      // Two rows of lots per block, each split into buildings of random width.
      for (const [ly, lh] of [[y, h / 2 - 3], [y + h / 2 + 3, h / 2 - 3]]) {
        for (let lx = x; lx < x + w - 10;) {
          const bw = Math.min(28 + rand() * 46, x + w - lx);
          blocks.push({ x: lx, y: ly, w: bw - 5, h: lh, fill: BUILDINGS[Math.floor(rand() * BUILDINGS.length)] });
          lx += bw;
        }
      }
    }
  }
  return { cols, rows, blocks, parks, trees };
}

const CITY = buildCity();

const PINS = [
  { x: 250, y: 250, s: 1.1 }, { x: 1350, y: 215, s: 1 }, { x: 175, y: 660, s: 0.9 },
  { x: 1440, y: 640, s: 1.15 }, { x: 560, y: 880, s: 0.85 }, { x: 1090, y: 900, s: 1 },
];

export function MapBackdrop() {
  const { cols, rows, blocks, parks, trees } = CITY;
  const road = (main: boolean) => (main ? 22 : 10);
  return (
    <svg className="backdrop" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width={W} height={H} fill={LAND} />
      <g transform={CITY_TRANSFORM}>
        {parks.map((p, i) => <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={10} fill={p.fill} />)}
        {trees.map((t, i) => <circle key={i} cx={t.x} cy={t.y} r={t.r} fill={TREE} />)}
        {blocks.map((b, i) => <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={2} fill={b.fill} />)}
      </g>

      <path d="M-80 820C280 700 560 990 900 860S1420 690 1680 790" fill="none" stroke={WATER} strokeWidth={80 * ZOOM} strokeLinecap="round" />
      <ellipse cx={1400} cy={70} rx={150 * ZOOM} ry={70 * ZOOM} fill={WATER} />

      <g transform={CITY_TRANSFORM} fill="none" strokeLinecap="square">
        {[true, false].map((edge) => (
          <g key={String(edge)} stroke={edge ? ROAD_EDGE : ROAD}>
            {cols.map((l, i) => <line key={`c${i}`} x1={l.at} y1={-500} x2={l.at} y2={H + 500} strokeWidth={road(l.main) + (edge ? 4 : 0)} />)}
            {rows.map((l, i) => <line key={`r${i}`} x1={-500} y1={l.at} x2={W + 500} y2={l.at} strokeWidth={road(l.main) + (edge ? 4 : 0)} />)}
          </g>
        ))}
      </g>
      <path d="M-80 360C380 250 900 470 1680 270" fill="none" stroke={ROAD_EDGE} strokeWidth={30 * ZOOM} />
      <path d="M-80 360C380 250 900 470 1680 270" fill="none" stroke={ROAD} strokeWidth={26 * ZOOM} />
      <path d="M180 -60C420 300 760 560 1260 1060" fill="none" stroke={HIGHWAY_EDGE} strokeWidth={24 * ZOOM} />
      <path d="M180 -60C420 300 760 560 1260 1060" fill="none" stroke={HIGHWAY} strokeWidth={20 * ZOOM} />

      <g className="you">
        <circle cx={1180} cy={470} r={34} fill="#4285f4" opacity={0.15} />
        <circle cx={1180} cy={470} r={9} fill="#4285f4" stroke="#fff" strokeWidth={3} />
      </g>
      {PINS.map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y}) scale(${p.s})`}>
          <ellipse className="ping" cx={0} cy={0} rx={12} ry={5} fill="#ea4335" style={{ animationDelay: `${i * 0.45}s` }} />
          <g className="bob" style={{ animationDelay: `${i * 0.45}s` }}>
            <path d="M0 0C-4-9-15-16-15-27a15 15 0 1 1 30 0C15-16 4-9 0 0z" fill="#ea4335" stroke="#c5221f" strokeWidth={1.5} />
            <circle cx={0} cy={-27} r={5.5} fill="#a50e0e" />
          </g>
        </g>
      ))}
    </svg>
  );
}
