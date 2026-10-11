import { describe, expect, it } from 'vitest';
import { createState, slide, trailLeft, undo, undoDir, type Level } from './rules';

/** Bàn 5x5: A ở (0,4), B ở (4,0), giỏ cho cả hai ở cạnh xa nên không ai tự thoát. */
const level = (clock?: 'turn' | 'owner'): Level => ({
  width: 5,
  height: 5,
  walls: [],
  balls: [
    { id: 'A', color: 'pink', x: 0, y: 4 },
    { id: 'B', color: 'teal', x: 4, y: 0 },
  ],
  gates: [
    { color: 'pink', side: 'up', index: 2 },
    { color: 'teal', side: 'down', index: 2 },
  ],
  maxMoves: 12,
  trailLife: 2,
  ...(clock ? { trailClock: clock } : {}),
});

describe("đồng hồ vệt 'owner'", () => {
  it('vệt của A không già đi khi chỉ khối B di chuyển (đồng hồ chung thì có)', () => {
    for (const [clock, expiresAfterBMoves] of [['turn', true], ['owner', false]] as const) {
      let s = createState(level(clock));
      const a = slide(s, 'A', 'up'); // A trượt (0,4) -> (0,0), để vệt cột 0
      if (!a.ok) throw new Error('A');
      s = a.state;
      const b1 = slide(s, 'B', 'down');
      if (!b1.ok) throw new Error('B1');
      const b2 = slide(b1.state, 'B', 'left');
      if (!b2.ok) throw new Error('B2');
      const trailA = b2.state.trails.filter((t) => t.turn === 1);
      expect(trailA.length > 0).toBe(!expiresAfterBMoves);
    }
  });

  it('vệt hết hạn sau khi chính khối chủ đã đi thêm trailLife lần', () => {
    let s = createState(level('owner'));
    const step = (id: string, dir: 'up' | 'down' | 'left' | 'right'): void => {
      const r = slide(s, id, dir);
      if (!r.ok) throw new Error(`${id}:${dir}`);
      s = r.state;
    };
    step('A', 'up'); // vệt k=1
    const first = s.trails.find((t) => t.owner === 'A' && t.k === 1)!;
    expect(trailLeft(s, first)).toBe(2);
    step('A', 'right');
    expect(trailLeft(s, first)).toBe(1);
    step('A', 'down');
    expect(s.trails.some((t) => t.k === 1)).toBe(false); // đã đi thêm 2 lần: hết hạn và bị lọc
  });

  it('hoàn tác luôn được với cú trượt gần nhất của chính khối, dù các khối khác đã đi nhiều lần', () => {
    let s = createState(level('owner'));
    const a = slide(s, 'A', 'up');
    if (!a.ok) throw new Error('A');
    s = a.state;
    for (const d of ['down', 'left', 'up'] as const) {
      const r = slide(s, 'B', d);
      if (r.ok) s = r.state;
    }
    expect(undoDir(s, 'A')).not.toBeNull();
    const u = undo(s, 'A');
    expect(u.ok).toBe(true);
    if (u.ok) expect(u.state.moves.A).toBe(2); // hoàn tác cũng là một lượt đi: bộ đếm tăng, không lùi
  });

  it('không hoàn tác được nếu ô xuất phát đã bị khối khác chiếm', () => {
    let s = createState(level('owner'));
    const a = slide(s, 'A', 'up');
    if (!a.ok) throw new Error('A');
    s = { ...a.state, balls: { ...a.state.balls, B: { x: 0, y: 4 } } };
    expect(undo(s, 'A').ok).toBe(false);
  });

  it("chế độ 'turn' (mặc định) giữ nguyên hành vi cũ: hoàn tác hết hạn theo lượt chung", () => {
    let s = createState(level());
    const a = slide(s, 'A', 'up');
    if (!a.ok) throw new Error('A');
    s = a.state;
    expect(undoDir(s, 'A')).not.toBeNull();
    for (const d of ['down', 'left'] as const) {
      const r = slide(s, 'B', d);
      if (r.ok) s = r.state;
    }
    expect(undoDir(s, 'A')).toBeNull();
  });

  it('hoàn tác cũng làm các vệt khác già đi; vệt cũ hết hạn thì không hoàn tác tiếp được và kéo dọc nó là cú trượt thường', () => {
    let s = createState(level('owner'));
    const step = (r: ReturnType<typeof slide>) => {
      if (!r.ok) throw new Error(r.reason);
      return r.state;
    };
    s = step(slide(s, 'A', 'right')); // cú 1: (0,4) → (4,4)
    s = step(slide(s, 'A', 'up')); // cú 2: (4,4) → (4,1) vì B đứng ở (4,0)
    expect(s.trails.filter((t) => t.k === 1).every((t) => trailLeft(s, t) === 1)).toBe(true);
    s = step(undo(s, 'A')); // huỷ cú 2: vệt cú 1 vẫn đếm hạn, tuổi tăng thêm 1 → hết hạn và tan
    expect(s.trails.some((t) => t.k === 1)).toBe(false);
    // cú 1 mất vệt: không hoàn tác tiếp được; kéo ngược dọc đường cũ (sang trái) là cú trượt thường
    expect(undoDir(s, 'A')).toBeNull();
    expect(undo(s, 'A').ok).toBe(false);
    expect(slide(s, 'A', 'left').ok).toBe(true);
  });

  it('hoàn tác khi vệt cũ còn hạn: vệt đó chỉ còn ít lượt hơn, không được cộng lại', () => {
    let s = createState(level('owner'));
    const a = slide(s, 'A', 'up');
    if (!a.ok) throw new Error('A');
    const b = slide(a.state, 'A', 'right');
    if (!b.ok) throw new Error('A2');
    s = b.state;
    const lefts = (st: typeof s): number[] => st.trails.filter((t) => t.k === 1).map((t) => trailLeft(st, t));
    expect(Math.max(...lefts(s))).toBe(1);
    const u = undo(s, 'A');
    expect(u.ok).toBe(true);
    if (u.ok) expect(lefts(u.state).every((n) => n <= 0)).toBe(true); // vệt cú 1 hết hạn sau khi hoàn tác tính là một lượt
  });
});
