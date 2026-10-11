import { describe, expect, it } from 'vitest';
import { armWild, createState, isEmptyCell, magnetGate, placeBomb, placePin, slide, status, useMagnet, type Level, type State } from './rules';

/** Bàn 5x5: giỏ hồng ở cạnh trên cột 2, giỏ xanh ở cạnh phải hàng 4. */
const level = (over: Partial<Level> = {}): Level => ({
  width: 5,
  height: 5,
  walls: [],
  balls: [
    { id: 'A', color: 'pink', x: 2, y: 3 },
    { id: 'B', color: 'teal', x: 0, y: 0 },
  ],
  gates: [
    { color: 'pink', side: 'up', index: 2 },
    { color: 'teal', side: 'right', index: 4 },
  ],
  maxMoves: 6,
  trailLife: 2,
  ...over,
});

describe('Ghim', () => {
  it('đặt lên ô trống, chặn khối trượt tới và không tính lượt', () => {
    const s = createState(level());
    const r = placePin(s, 2, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.turn).toBe(0);
    const m = slide(r.state, 'A', 'up');
    expect(m.ok).toBe(true);
    if (m.ok) {
      expect(m.to).toEqual({ x: 2, y: 2 });
      expect(m.stop).toBe('wall'); // chặn như khối đá
    }
  });

  it('chỉ đặt lên ô trống thật sự: không phải khối, đá, ghim khác hay vệt', () => {
    let s = createState(level({ walls: [{ x: 4, y: 4 }] }));
    expect(placePin(s, 2, 3).ok).toBe(false); // khối
    expect(placePin(s, 4, 4).ok).toBe(false); // đá
    expect(placePin(s, 9, 9).ok).toBe(false); // ngoài bàn
    const p = placePin(s, 1, 1);
    expect(p.ok).toBe(true);
    if (p.ok) s = p.state;
    expect(placePin(s, 1, 1).ok).toBe(false); // khối đặt trước đó
    const m = slide(s, 'A', 'left');
    expect(m.ok).toBe(true);
    if (m.ok) expect(isEmptyCell(m.state, 1, 3)).toBe(false); // vệt vừa tạo
  });

  it('khối đặt vĩnh viễn: vẫn chặn sau nhiều lượt và không làm vệt cũ già đi', () => {
    let s: State = createState(level());
    const p = placePin(s, 3, 3);
    if (!p.ok) throw new Error('pin');
    s = p.state;
    expect(s.turn).toBe(0);
    const m1 = slide(s, 'B', 'down');
    if (!m1.ok) throw new Error('m1');
    const m2 = slide(m1.state, 'B', 'right');
    if (!m2.ok) throw new Error('m2');
    expect(isEmptyCell(m2.state, 3, 3)).toBe(false); // dù đã qua nhiều lượt (đủ cho vệt hết hạn) khối vẫn còn
    expect(m2.state.pins).toHaveLength(1);
    expect(slide(m2.state, 'A', 'right').ok).toBe(false); // A ở (2,3) bị khối ở (3,3) chặn ngay
  });
});

describe('Bom bông', () => {
  it('đẩy khối ở bốn ô cạnh ra xa một ô và không tính lượt', () => {
    const s = createState(level({ balls: [{ id: 'A', color: 'pink', x: 2, y: 3 }, { id: 'B', color: 'teal', x: 1, y: 2 }] }));
    const r = placeBomb(s, 2, 2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.turn).toBe(0);
    expect(r.state.balls.A).toEqual({ x: 2, y: 4 });
    expect(r.state.balls.B).toEqual({ x: 0, y: 2 });
    expect(r.moved.map((m) => m.id).sort()).toEqual(['A', 'B']);
  });

  it('khối bị chặn (đá, khối khác, mép bàn) thì đứng yên', () => {
    const s = createState(
      level({
        walls: [{ x: 0, y: 2 }],
        balls: [
          { id: 'A', color: 'pink', x: 2, y: 4 },
          { id: 'B', color: 'teal', x: 1, y: 2 },
          { id: 'C', color: 'gold', x: 2, y: 1 },
          { id: 'D', color: 'violet', x: 2, y: 0 },
        ],
      }),
    );
    const r = placeBomb(s, 2, 3);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.balls.A).toEqual({ x: 2, y: 4 }); // mép bàn
    const r2 = placeBomb(s, 2, 2);
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.state.balls.B).toEqual({ x: 1, y: 2 }); // đá phía sau
      expect(r2.state.balls.C).toEqual({ x: 2, y: 1 }); // khối khác phía sau
    }
  });

  it('khối bị đẩy tới ô sát giỏ của nó thì thoát; bom không làm hoàn tác được nữa', () => {
    const base = createState(level({ balls: [{ id: 'A', color: 'pink', x: 2, y: 2 }, { id: 'B', color: 'teal', x: 0, y: 0 }] }));
    const m = slide(base, 'A', 'down'); // A trượt xuống (2,4) và để lại vệt
    if (!m.ok) throw new Error('slide');
    const bomb = placeBomb(m.state, 2, 3); // đẩy A lên (2,2)... đã ở ô 4 nên bị chặn bởi mép? A ở (2,4) cạnh ô bom, đích (2,5) ngoài bàn
    expect(bomb.ok).toBe(false); // ô (2,3) là vệt của A: không trống
    const s = createState(level({ balls: [{ id: 'A', color: 'pink', x: 2, y: 2 }, { id: 'B', color: 'teal', x: 0, y: 0 }] }));
    const r = placeBomb(s, 2, 3);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.balls.A).toEqual({ x: 2, y: 1 });
      expect(r.moved[0].exit).toBeUndefined();
    }
    const s2 = createState(level({ balls: [{ id: 'A', color: 'pink', x: 2, y: 2 }, { id: 'B', color: 'teal', x: 4, y: 4 }] }));
    const r2 = placeBomb(s2, 2, 3);
    if (!r2.ok) throw new Error('bomb');
    const r3 = placeBomb(r2.state, 2, 2); // ô vừa trống, A ở (2,1) bị đẩy lên (2,0) sát giỏ hồng → thoát
    expect(r3.ok).toBe(true);
    if (r3.ok) {
      expect(r3.state.out).toContain('A');
      expect(r3.moved[0].exit).toBe('up');
      expect(r3.state.history.A).toEqual([]);
    }
  });
});

describe('Nam châm', () => {
  it('chỉ chọn được khối thẳng hàng hoặc thẳng cột với giỏ cùng màu', () => {
    const s = createState(level());
    expect(magnetGate(s, 'A')).toEqual({ side: 'up', index: 2 }); // A cột 2, giỏ hồng ở cột 2
    expect(magnetGate(s, 'B')).toBeNull(); // B (0,0), giỏ xanh ở hàng 4
  });

  it('hút khối xuyên đá và khối khác, thoát, không tính lượt và không để lại vệt', () => {
    const s = createState(
      level({
        walls: [{ x: 2, y: 1 }],
        balls: [
          { id: 'A', color: 'pink', x: 2, y: 3 },
          { id: 'B', color: 'teal', x: 2, y: 2 },
        ],
      }),
    );
    const r = useMagnet(s, 'A');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.out).toEqual(['A']);
    expect(r.state.balls.A).toBeUndefined();
    expect(r.state.turn).toBe(0);
    expect(r.state.trails).toEqual([]);
    expect(r.moved[0]).toMatchObject({ id: 'A', exit: 'up', to: { x: 2, y: 0 } });
  });

  it('xoá vệt cũ của khối khi nó thoát (luật xoá vệt khi thoát)', () => {
    let s = createState(level({ balls: [{ id: 'A', color: 'pink', x: 4, y: 4 }, { id: 'B', color: 'teal', x: 0, y: 0 }] }));
    const m = slide(s, 'A', 'left'); // A từ (4,4) trượt tới (0,4) để lại vệt
    if (!m.ok) throw new Error('slide');
    s = m.state;
    expect(s.trails.length).toBeGreaterThan(0);
    const r = slide(s, 'B', 'right');
    if (!r.ok) throw new Error('b');
    const s2 = { ...r.state, balls: { ...r.state.balls, A: { x: 2, y: 4 } } }; // A thẳng cột với giỏ hồng
    const mg = useMagnet(s2, 'A');
    expect(mg.ok).toBe(true);
    if (mg.ok) expect(mg.state.trails.some((t) => t.turn === 1)).toBe(false);
  });

  it('không dùng được với khối không thẳng hàng', () => {
    expect(useMagnet(createState(level()), 'B').ok).toBe(false);
  });
});

describe('Chọn giỏ', () => {
  it('giỏ được chọn nhận khối màu khác một lần rồi về bình thường', () => {
    let s = createState(level({ balls: [{ id: 'A', color: 'pink', x: 4, y: 2 }, { id: 'B', color: 'teal', x: 0, y: 4 }] }));
    const w = armWild(s, 'right', 4);
    if (!w.ok) throw new Error('wild');
    s = w.state;
    expect(s.turn).toBe(0);
    // A (hồng) trượt xuống ô (4,4) sát giỏ xanh vạn năng → thoát qua giỏ xanh
    const m = slide(s, 'A', 'down');
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.exit).toBe('right');
    expect(m.state.out).toEqual(['A']);
    expect(m.state.wild).toEqual([]); // giỏ về bình thường
  });

  it('khối cùng màu giỏ thì không tiêu hao giỏ vạn năng', () => {
    let s = createState(level({ balls: [{ id: 'B', color: 'teal', x: 4, y: 0 }, { id: 'A', color: 'pink', x: 0, y: 4 }] }));
    const w = armWild(s, 'right', 4);
    if (!w.ok) throw new Error('wild');
    s = w.state;
    const m = slide(s, 'B', 'down');
    expect(m.ok).toBe(true);
    if (m.ok) {
      expect(m.exit).toBe('right');
      expect(m.state.wild).toEqual([{ side: 'right', index: 4 }]); // giỏ xanh vẫn đang vạn năng
    }
  });

  it('không chọn được giỏ không tồn tại hay giỏ đang vạn năng', () => {
    const s = createState(level());
    expect(armWild(s, 'down', 0).ok).toBe(false);
    const w = armWild(s, 'up', 2);
    expect(w.ok).toBe(true);
    if (w.ok) expect(armWild(w.state, 'up', 2).ok).toBe(false);
  });
});

describe('status với booster', () => {
  it('thắng khi nam châm hút nốt khối cuối', () => {
    const s = createState(level({ balls: [{ id: 'A', color: 'pink', x: 2, y: 3 }] }));
    const r = useMagnet(s, 'A');
    expect(r.ok).toBe(true);
    if (r.ok) expect(status(r.state)).toBe('won');
  });
});
