import { describe, expect, it } from 'vitest';
import { createState, status, type Level } from './rules';
import { applyMove, solve } from './solver';

const example = (over: Partial<Level> = {}): Level => ({
  width: 5,
  height: 5,
  walls: [{ x: 1, y: 1 }, { x: 0, y: 2 }],
  balls: [{ id: 'A', color: 'a', x: 0, y: 3 }, { id: 'B', color: 'b', x: 2, y: 0 }],
  gates: [{ color: 'a', side: 'up', index: 4 }, { color: 'b', side: 'right', index: 3 }],
  maxMoves: 10,
  trailLife: 2,
  clearTrailsOnExit: false, // ví dụ gốc của tài liệu theo luật cũ: vệt của khối đã thoát vẫn còn
  ...over,
});

describe('solve', () => {
  it('ra đúng 6 lượt cho ví dụ trong tài liệu, trong đó 2 lần dừng nhờ vệt', () => {
    const sol = solve(example());
    expect(sol?.length).toBe(6);
    expect(sol?.trailStops).toBe(2);
    expect(sol?.undos).toBe(0);
  });

  it('lời giải chạy lại bằng luật thật thì thắng', () => {
    const sol = solve(example())!;
    let s = createState(example());
    for (const m of sol.moves) {
      const r = applyMove(s, m);
      if (!r.ok) throw new Error(r.reason);
      s = r.state;
    }
    expect(status(s)).toBe('won');
    expect(s.turn).toBe(sol.length);
  });

  it('level một cú vuốt là 1 lượt', () => {
    const lvl: Level = {
      width: 5, height: 5, walls: [], balls: [{ id: 'A', color: 'a', x: 0, y: 0 }],
      gates: [{ color: 'a', side: 'right', index: 0 }], maxMoves: 3, trailLife: 2,
    };
    expect(solve(lvl)?.length).toBe(1);
  });

  it('không có đường thắng thì trả về null', () => {
    const lvl = example({ gates: [{ color: 'a', side: 'up', index: 4 }] });
    expect(solve(lvl)).toBeNull();
  });

  it('không vượt quá số lượt tối đa của level', () => {
    expect(solve(example({ maxMoves: 5 }))).toBeNull();
    expect(solve(example({ maxMoves: 6 }))?.length).toBe(6);
  });

  it('dùng hoàn tác khi nó là cách duy nhất (level tìm bằng quét ngẫu nhiên)', () => {
    const lvl: Level = {
      width: 5, height: 5,
      walls: [{ x: 0, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 0 }, { x: 1, y: 3 }],
      balls: [{ id: 'A', color: 'a', x: 0, y: 4 }, { id: 'B', color: 'b', x: 3, y: 3 }],
      gates: [{ color: 'a', side: 'down', index: 1 }, { color: 'b', side: 'right', index: 3 }],
      maxMoves: 9, trailLife: 2,
    };
    const withUndo = solve(lvl);
    expect(withUndo?.length).toBe(5);
    expect(withUndo?.undos).toBe(1);
    expect(solve(lvl, { undo: false })).toBeNull();
  });

  it('cấm dừng nhờ vệt: ví dụ tài liệu không còn giải được ngắn như 6 lượt', () => {
    const sol = solve(example(), { noTrailStops: true });
    expect(sol === null || sol.length > 6).toBe(true);
    expect(sol?.trailStops ?? 0).toBe(0);
  });

  it('luật mới (xoá vệt khi khối bị hút): ví dụ của tài liệu còn 5 lượt, 1 lần dừng nhờ vệt', () => {
    const sol = solve(example({ clearTrailsOnExit: true }));
    expect(sol?.length).toBe(5);
    expect(sol?.trailStops).toBe(1);
  });
});

describe('giải từ trạng thái đang chơi dở', () => {
  it('from = trạng thái đầu thì giống giải từ đầu; còn quá ít lượt thì vô giải', async () => {
    const { LEVELS } = await import('../levels');
    const { createState } = await import('./rules');
    const { level, minMoves } = LEVELS[1];
    expect(solve(level, { from: createState(level) })?.length).toBe(minMoves);
    expect(solve(level, { from: { ...createState(level), turn: level.maxMoves - 1 } })).toBeNull();
  });
});
