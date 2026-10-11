import { describe, expect, it } from 'vitest';
import { armWild, boardCells, createState, gateCell, inBoard, isEmptyCell, magnetGate, placeBomb, slide, useMagnet, validateLevel, type Level } from './rules';

/** Kim cương bán kính 2 (13 ô) trong khung 5x5. */
const diamond = ['..#..', '.###.', '#####', '.###.', '..#..'];

const level = (over: Partial<Level> = {}): Level => ({
  width: 5,
  height: 5,
  mask: diamond,
  walls: [],
  balls: [{ id: 'A', color: 'pink', x: 2, y: 2 }],
  gates: [{ color: 'pink', side: 'up', index: 2 }],
  maxMoves: 6,
  trailLife: 2,
  ...over,
});

describe('bàn có hình dạng', () => {
  it('inBoard và boardCells theo mặt nạ', () => {
    const l = level();
    expect(inBoard(l, 2, 0)).toBe(true);
    expect(inBoard(l, 0, 0)).toBe(false);
    expect(inBoard(l, 5, 2)).toBe(false);
    expect(boardCells(l)).toHaveLength(13);
  });

  it('khối trượt dừng ở mép hình dạng, không phải mép khung bao', () => {
    const l = level({ gates: [{ color: 'pink', side: 'down', index: 2 }], balls: [{ id: 'A', color: 'pink', x: 1, y: 2 }] });
    const s = createState(l);
    // sang phải từ (1,2) tới (4,2); xuống từ (1,2): (1,3) trong bàn, (1,4) ngoài bàn nên dừng ở (1,3)
    const down = slide(s, 'A', 'down');
    expect(down.ok).toBe(true);
    if (down.ok) expect(down.to).toEqual({ x: 1, y: 3 });
  });

  it('cửa có độ sâu nằm trong bàn: khối dừng ở ô đó thì bị hút', () => {
    // cửa trên ở cột 1, độ sâu 1: ô (1,1)
    const l = level({ gates: [{ color: 'pink', side: 'up', index: 1, depth: 1 }], balls: [{ id: 'A', color: 'pink', x: 1, y: 3 }] });
    expect(validateLevel(l)).toEqual([]);
    expect(gateCell(l, l.gates[0])).toEqual({ x: 1, y: 1 });
    const r = slide(createState(l), 'A', 'up');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.exit).toBe('up');
      expect(r.state.out).toEqual(['A']);
    }
  });

  it('validateLevel bắt lỗi: cửa không ở mép, khối ngoài bàn, mặt nạ sai', () => {
    expect(validateLevel(level({ gates: [{ color: 'pink', side: 'up', index: 2, depth: 1 }] }))).toHaveLength(1); // (2,1) có láng giềng (2,0) trong bàn
    expect(validateLevel(level({ balls: [{ id: 'A', color: 'pink', x: 0, y: 0 }] })).length).toBeGreaterThan(0);
    expect(validateLevel(level({ mask: ['###'] })).length).toBeGreaterThan(0);
    expect(validateLevel(level())).toEqual([]);
  });

  it('booster: ô ngoài hình không phải ô trống; nam châm hút tới đúng ô cửa; chọn giỏ theo độ sâu', () => {
    const l = level({ gates: [{ color: 'pink', side: 'up', index: 1, depth: 1 }], balls: [{ id: 'A', color: 'pink', x: 1, y: 3 }] });
    const s = createState(l);
    expect(isEmptyCell(s, 0, 0)).toBe(false);
    expect(magnetGate(s, 'A')).toEqual({ side: 'up', index: 1, depth: 1 });
    const m = useMagnet(s, 'A');
    expect(m.ok).toBe(true);
    if (m.ok) expect(m.moved[0].to).toEqual({ x: 1, y: 1 });
    expect(armWild(s, 'up', 1, 1).ok).toBe(true);
    expect(armWild(s, 'up', 1).ok).toBe(false); // không có cửa độ sâu 0 ở cột 1
    expect(placeBomb(s, 0, 0).ok).toBe(false);
  });
});
