import {
  bezier,
  body,
  flatten,
  makeDefenders,
  resolveShot,
  sweep,
  trajectory,
} from './goal-kick-physics';
describe('Goal kick deterministic physics v1', () => {
  const fallback = [
    { id: 'a', x: 320, y: 340 },
    { id: 'b', x: 650, y: 400 },
  ];
  it('uses the same cubic for endpoints, straight lines and opposite curves', () => {
    for (const x of [200, 272, 500, 728, 800])
      for (const k of [-260, 0, 260]) {
        const c = trajectory(x, k);
        expect(bezier(c, 0)).toEqual({ x: 500, y: 620 });
        expect(bezier(c, 1)).toEqual({ x, y: 104 });
        for (const u of [0, 0.1, 0.5, 0.9, 1])
          expect(bezier(trajectory(x, 0), u).x).toBeCloseTo(
            500 + (x - 500) * u,
          );
      }
    expect(bezier(trajectory(500, 260), 0.5)).toEqual({ x: 695, y: 362 });
    expect(bezier(trajectory(500, -260), 0.5)).toEqual({ x: 305, y: 362 });
    expect(bezier(trajectory(272, 65), 0.5)).toEqual({ x: 434.75, y: 362 });
  });
  it('permits curved goals to both top corners and blocks the static keeper', () => {
    expect(resolveShot(trajectory(272, 65), fallback).outcome).toBe('GOAL');
    expect(resolveShot(trajectory(728, -65), fallback).outcome).toBe('GOAL');
    expect(resolveShot(trajectory(500, 0), []).outcome).toBe('KEEPER_SAVE');
    expect(resolveShot(trajectory(200, 0), []).outcome).not.toBe('GOAL');
  });
  it('detects bodies before the keeper and stops at the earliest contact', () => {
    const hit = resolveShot(trajectory(500, 0), [{ id: 'd', x: 477, y: 340 }]);
    expect(hit.outcome).toBe('DEFENDER_BLOCK');
    expect(hit.contactU).toBeLessThan(0.6);
    expect(body({ x: 0, y: 0 })).toHaveLength(4);
    expect(flatten(trajectory(272, 260)).length).toBeGreaterThan(10);
  });
  it('sweeps through thin obstacles without square-corner false positives', () => {
    const rect = { kind: 'rect' as const, x: 10, y: 10, width: 10, height: 10 };
    expect(sweep({ x: 0, y: 0 }, { x: 0, y: 0 }, rect, 12)).toBeUndefined();
    expect(sweep({ x: 0, y: 0 }, { x: 0, y: 0 }, rect, 15)).toBe(0);
    expect(sweep({ x: 0, y: 15 }, { x: 100, y: 15 }, rect)).toBeCloseTo(0.02);
  });
  it('creates bounded, nonoverlapping playable boards and a verified fallback', () => {
    let seed = 42;
    const rng = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < 20; i++) {
      const board = makeDefenders(rng);
      expect(board.length).toBeGreaterThanOrEqual(2);
      expect(board.length).toBeLessThanOrEqual(3);
      expect(
        [272, 728].some((x) =>
          [-195, -130, -65, 65, 130, 195].some(
            (k) => resolveShot(trajectory(x, k), board).outcome === 'GOAL',
          ),
        ),
      ).toBe(true);
    }
    const a = makeDefenders(() => 0),
      b = makeDefenders(() => 0, a);
    expect(b).not.toEqual(a);
  });
});
