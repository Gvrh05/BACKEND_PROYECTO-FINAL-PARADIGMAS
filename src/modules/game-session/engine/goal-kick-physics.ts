/** Pure deterministic world geometry. No network, clock or client-supplied colliders. */
export const PHYSICS = {
  version: 1,
  width: 1000,
  height: 700,
  radius: 8,
  goalY: 104,
  flightMs: 900,
  pauseMs: 350,
  durationMs: 40000,
  goalPoints: 10,
} as const;
export interface Point {
  x: number;
  y: number;
}
export interface Defender extends Point {
  id: string;
}
export type Curve = [Point, Point, Point, Point];
export type Outcome =
  'GOAL' | 'DEFENDER_BLOCK' | 'KEEPER_SAVE' | 'FRAME_HIT' | 'WIDE' | 'TIMEOUT';
export type Shape =
  | { kind: 'circle'; x: number; y: number; radius: number }
  | { kind: 'rect'; x: number; y: number; width: number; height: number };
export const KEEPER = { x: 477, y: 132 };
export const FRAME: Shape[] = [
  { kind: 'rect', x: 242, y: 60, width: 12, height: 150 },
  { kind: 'rect', x: 746, y: 60, width: 12, height: 150 },
  { kind: 'rect', x: 242, y: 60, width: 516, height: 12 },
];
export function trajectory(aimX: number, k: number): Curve {
  return [
    { x: 500, y: 620 },
    { x: 500 + (aimX - 500) / 3 + k, y: 448 },
    { x: 500 + (2 * (aimX - 500)) / 3 + k, y: 276 },
    { x: aimX, y: 104 },
  ];
}
export function bezier(c: Curve, u: number): Point {
  const v = 1 - u;
  return {
    x:
      v ** 3 * c[0].x +
      3 * v * v * u * c[1].x +
      3 * v * u * u * c[2].x +
      u ** 3 * c[3].x,
    y:
      v ** 3 * c[0].y +
      3 * v * v * u * c[1].y +
      3 * v * u * u * c[2].y +
      u ** 3 * c[3].y,
  };
}
const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});
export function flatten(
  c: Curve,
  lo = 0,
  hi = 1,
  depth = 0,
): { a: Point; b: Point; lo: number; hi: number }[] {
  const [a, b, d, e] = c;
  const length = Math.hypot(e.x - a.x, e.y - a.y);
  const distance = (p: Point) =>
    Math.abs((e.x - a.x) * (a.y - p.y) - (a.x - p.x) * (e.y - a.y)) /
    (length || 1);
  if (Math.max(distance(b), distance(d)) <= 0.2 || depth >= 16)
    return [{ a, b: e, lo, hi }];
  const ab = midpoint(a, b),
    bd = midpoint(b, d),
    de = midpoint(d, e);
  const left = midpoint(ab, bd),
    right = midpoint(bd, de),
    center = midpoint(left, right),
    half = (lo + hi) / 2;
  return [
    ...flatten([a, ab, left, center], lo, half, depth + 1),
    ...flatten([center, right, de, e], half, hi, depth + 1),
  ];
}
function rectEntry(
  a: Point,
  b: Point,
  r: Extract<Shape, { kind: 'rect' }>,
): number | undefined {
  let lo = 0,
    hi = 1;
  for (const [p, delta, min, max] of [
    [a.x, b.x - a.x, r.x, r.x + r.width],
    [a.y, b.y - a.y, r.y, r.y + r.height],
  ]) {
    if (Math.abs(delta) < 1e-10) {
      if (p < min || p > max) return;
    } else {
      const t1 = (min - p) / delta,
        t2 = (max - p) / delta;
      lo = Math.max(lo, Math.min(t1, t2));
      hi = Math.min(hi, Math.max(t1, t2));
      if (lo > hi) return;
    }
  }
  return lo;
}
function circleEntry(
  a: Point,
  b: Point,
  x: number,
  y: number,
  radius: number,
): number | undefined {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    px = a.x - x,
    py = a.y - y;
  const aa = dx * dx + dy * dy,
    bb = 2 * (px * dx + py * dy),
    cc = px * px + py * py - radius * radius;
  if (cc <= 0) return 0;
  if (aa === 0) return;
  const disc = bb * bb - 4 * aa * cc;
  if (disc < 0) return;
  const t = (-bb - Math.sqrt(disc)) / (2 * aa);
  return t >= 0 && t <= 1 ? t : undefined;
}
/** Exact circle/rect segment sweep via rounded Minkowski shape (not inflated-square corners). */
export function sweep(
  a: Point,
  b: Point,
  s: Shape,
  radius: number = PHYSICS.radius,
): number | undefined {
  if (s.kind === 'circle')
    return circleEntry(a, b, s.x, s.y, radius + s.radius);
  const hits = [
    rectEntry(a, b, { ...s, x: s.x - radius, width: s.width + 2 * radius }),
    rectEntry(a, b, { ...s, y: s.y - radius, height: s.height + 2 * radius }),
    ...[s.x, s.x + s.width].flatMap((x) =>
      [s.y, s.y + s.height].map((y) => circleEntry(a, b, x, y, radius)),
    ),
  ].filter((t): t is number => t !== undefined);
  return hits.length ? Math.min(...hits) : undefined;
}
export function body(p: Point): Shape[] {
  return [
    { kind: 'circle', x: p.x + 23, y: p.y + 10, radius: 10 },
    { kind: 'rect', x: p.x + 7, y: p.y + 20, width: 32, height: 34 },
    { kind: 'rect', x: p.x + 8, y: p.y + 54, width: 11, height: 22 },
    { kind: 'rect', x: p.x + 27, y: p.y + 54, width: 11, height: 22 },
  ];
}
export function resolveShot(
  c: Curve,
  defenders: Defender[],
): { outcome: Outcome; contactU: number; contactPoint: Point } {
  const obstacles: { shape: Shape; outcome: Outcome }[] = [];
  for (const d of defenders)
    for (const shape of body(d))
      obstacles.push({ shape, outcome: 'DEFENDER_BLOCK' });
  for (const shape of body(KEEPER))
    obstacles.push({ shape, outcome: 'KEEPER_SAVE' });
  for (const shape of FRAME) obstacles.push({ shape, outcome: 'FRAME_HIT' });
  for (const segment of flatten(c)) {
    let best = Infinity;
    let outcome: Outcome = 'WIDE';
    for (const obstacle of obstacles) {
      const hit = sweep(segment.a, segment.b, obstacle.shape, 8.2);
      if (hit !== undefined && hit < best) {
        best = hit;
        outcome = obstacle.outcome;
      }
    }
    // Field boundaries, with the complete ball remaining inside the world.
    for (const [start, end, low, high] of [
      [segment.a.x, segment.b.x, 8, 992],
      [segment.a.y, segment.b.y, 8, 692],
    ]) {
      if (end < low || end > high) {
        const t = ((end < low ? low : high) - start) / (end - start);
        if (t < best) {
          best = Math.max(0, t);
          outcome = 'WIDE';
        }
      }
    }
    if (best !== Infinity) {
      const contactU = segment.lo + best * (segment.hi - segment.lo);
      return { outcome, contactU, contactPoint: bezier(c, contactU) };
    }
  }
  return {
    outcome: c[3].x >= 262 && c[3].x <= 738 ? 'GOAL' : 'WIDE',
    contactU: 1,
    contactPoint: c[3],
  };
}
export function makeDefenders(
  rng: () => number,
  previous: Defender[] = [],
): Defender[] {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidates = Array.from({ length: rng() < 0.5 ? 2 : 3 }, (_, i) => ({
      id: `defender-${i}`,
      x: Math.floor(280 + rng() * 394),
      y: Math.floor(260 + rng() * 180),
    }));
    if (
      candidates.some((d, i) =>
        candidates
          .slice(i + 1)
          .some(
            (other) =>
              Math.abs(d.x - other.x) < 70 && Math.abs(d.y - other.y) < 100,
          ),
      )
    )
      continue;
    if (JSON.stringify(candidates) === JSON.stringify(previous)) continue;
    if (
      [272, 728].some((x) =>
        [-195, -130, -65, 65, 130, 195].some(
          (k) => resolveShot(trajectory(x, k), candidates).outcome === 'GOAL',
        ),
      )
    )
      return candidates;
  }
  const fallback = [
    { id: 'defender-0', x: 320, y: 340 },
    { id: 'defender-1', x: 650, y: 400 },
  ];
  return previous[0]?.x === 320
    ? fallback.map((d) => ({ ...d, x: 954 - d.x }))
    : fallback;
}
