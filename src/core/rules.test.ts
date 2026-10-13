import { describe, expect, it } from 'vitest';
import { axisAllows, createState, gateOpen, isEmptyCell, isPinnable, placePin, magnetGate, placeBomb, slide, status, undo, undoDir, validateLevel, type Level } from './rules';

const base: Level = {
  width: 5,
  height: 5,
  walls: [],
  balls: [{ id: 'A', color: 'pink', x: 0, y: 0 }],
  gates: [],
  maxMoves: 10,
  trailLife: 2,
};

describe('slide', () => {
  it('đi tới mép bàn rồi dừng', () => {
    const r = slide(createState(base), 'A', 'right');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.balls.A).toEqual({ x: 4, y: 0 });
  });

  it('dừng ngay trước khối đá', () => {
    const level = { ...base, walls: [{ x: 3, y: 0 }] };
    const r = slide(createState(level), 'A', 'right');
    expect(r.ok && r.state.balls.A).toEqual({ x: 2, y: 0 });
  });

  it('dừng ngay trước khối khác', () => {
    const level: Level = { ...base, balls: [...base.balls, { id: 'B', color: 'teal', x: 3, y: 0 }] };
    const r = slide(createState(level), 'A', 'right');
    expect(r.ok && r.state.balls.A).toEqual({ x: 2, y: 0 });
  });

  it('cú vuốt bị chặn ngay là không hợp lệ và không tính lượt', () => {
    const r = slide(createState(base), 'A', 'left');
    expect(r.ok).toBe(false);
  });

  describe('vệt', () => {
    const two: Level = { ...base, balls: [...base.balls, { id: 'B', color: 'teal', x: 0, y: 4 }] };
    const ok = (r: ReturnType<typeof slide>) => {
      if (!r.ok) throw new Error('expected ok: ' + r.reason);
      return r.state;
    };

    it('bóng không quay đầu ngay được vì vệt phía sau chặn', () => {
      const s = ok(slide(createState(base), 'A', 'right'));
      expect(slide(s, 'A', 'left').ok).toBe(false);
    });

    it('vệt vẫn chặn ở lượt m+2', () => {
      let s = ok(slide(createState(two), 'A', 'right')); // lượt 1
      s = ok(slide(s, 'B', 'right')); // lượt 2
      expect(slide(s, 'A', 'left').ok).toBe(false); // lượt 3: vệt lượt 1 còn sống
    });

    it('vệt hết hiệu lực từ lượt m+3', () => {
      let s = ok(slide(createState(two), 'A', 'right')); // lượt 1
      s = ok(slide(s, 'B', 'right')); // lượt 2
      s = ok(slide(s, 'B', 'up')); // lượt 3
      const r = slide(s, 'A', 'left'); // lượt 4
      expect(r.ok && r.state.balls.A).toEqual({ x: 0, y: 0 });
    });

    it('ô xuất phát cũng có vệt: khối khác không vào được', () => {
      const lvl: Level = { ...base, balls: [{ id: 'A', color: 'pink', x: 0, y: 0 }, { id: 'B', color: 'teal', x: 0, y: 4 }] };
      let s = ok(slide(createState(lvl), 'A', 'right')); // A rời (0,0), vệt ở (0,0)
      s = ok(slide(s, 'B', 'up')); // B tới (0,1), dừng ngay dưới vệt (0,0)
      expect(s.balls.B).toEqual({ x: 0, y: 1 });
    });
  });

  describe('cửa và kết thúc', () => {
    const gateRow0 = (color: string): Level => ({ ...base, gates: [{ color, side: 'right', index: 0 }] });

    it('trượt ra đúng cửa cùng màu thì thoát', () => {
      const r = slide(createState(gateRow0('pink')), 'A', 'right');
      expect(r.ok && r.state.balls.A).toBeUndefined();
      expect(r.ok && r.state.out).toEqual(['A']);
    });

    it('cửa sai màu coi như tường', () => {
      const r = slide(createState(gateRow0('teal')), 'A', 'right');
      expect(r.ok && r.state.balls.A).toEqual({ x: 4, y: 0 });
    });

    it('cửa chỉ có tác dụng ở đúng hàng của nó', () => {
      const lvl: Level = { ...base, balls: [{ id: 'A', color: 'pink', x: 0, y: 1 }], gates: [{ color: 'pink', side: 'right', index: 0 }] };
      const r = slide(createState(lvl), 'A', 'right');
      expect(r.ok && r.state.balls.A).toEqual({ x: 4, y: 1 });
    });

    it('khối bị hút ra thì vệt của nó bị xoá (mặc định)', () => {
      const r = slide(createState(gateRow0('pink')), 'A', 'right');
      expect(r.ok && r.state.trails.length).toBe(0);
    });

    it('với clearTrailsOnExit: false thì vệt của khối thoát vẫn còn', () => {
      const r = slide(createState({ ...gateRow0('pink'), clearTrailsOnExit: false }), 'A', 'right');
      expect(r.ok && r.state.trails.length).toBe(5);
    });

    it('trạng thái: đang chơi, thắng, thua', () => {
      const lvl: Level = { ...gateRow0('pink'), maxMoves: 1 };
      expect(status(createState(lvl))).toBe('playing');
      const won = slide(createState(lvl), 'A', 'right');
      expect(won.ok && status(won.state)).toBe('won');
      const lostLvl: Level = { ...base, maxMoves: 1 };
      const lost = slide(createState(lostLvl), 'A', 'right');
      expect(lost.ok && status(lost.state)).toBe('lost');
    });

    it('hết lượt thì không đi thêm được', () => {
      const lvl: Level = { ...base, maxMoves: 1 };
      const s = slide(createState(lvl), 'A', 'right');
      expect(s.ok && slide(s.state, 'A', 'down').ok).toBe(false);
    });
  });

  describe('hoàn tác', () => {
    const ok = (r: ReturnType<typeof slide>) => {
      if (!r.ok) throw new Error('expected ok: ' + r.reason);
      return r.state;
    };
    const lvl = (over: Partial<Level> = {}): Level => ({
      ...base,
      balls: [{ id: 'A', color: 'pink', x: 0, y: 0 }, { id: 'B', color: 'teal', x: 0, y: 4 }],
      ...over,
    });

    it('đưa khối về ô xuất phát, tốn 1 lượt, xoá vệt của cú trượt đó', () => {
      const s1 = ok(slide(createState(lvl()), 'A', 'right'));
      const s2 = ok(undo(s1, 'A'));
      expect(s2.balls.A).toEqual({ x: 0, y: 0 });
      expect(s2.turn).toBe(2);
      expect(s2.trails).toEqual([]);
    });

    it('vệt đã xoá không còn chặn khối khác', () => {
      let s = ok(slide(createState(lvl()), 'A', 'right')); // vệt hàng 0
      s = ok(undo(s, 'A'));
      s = ok(slide(s, 'B', 'right')); // B sang (4,4)
      const r = slide(s, 'B', 'up');
      expect(r.ok && r.state.balls.B).toEqual({ x: 4, y: 0 });
    });

    it('không hoàn tác được khi vệt của cú trượt đã hết hạn', () => {
      let s = ok(slide(createState(lvl()), 'A', 'right')); // lượt 1
      s = ok(slide(s, 'B', 'right')); // lượt 2
      s = ok(slide(s, 'B', 'up')); // lượt 3
      expect(undo(s, 'A').ok).toBe(false); // lượt 4: vệt lượt 1 đã hết
    });

    it('đồng hồ vệt của khối khác vẫn chạy khi hoàn tác', () => {
      let s = ok(slide(createState(lvl()), 'B', 'right')); // lượt 1, vệt hàng 4
      s = ok(slide(s, 'A', 'down')); // lượt 2
      s = ok(undo(s, 'A')); // lượt 3
      const r = slide(s, 'B', 'left'); // lượt 4: vệt lượt 1 đã hết
      expect(r.ok && r.state.balls.B).toEqual({ x: 0, y: 4 });
    });

    it('không hoàn tác được khi chưa trượt lần nào', () => {
      expect(undo(createState(lvl()), 'A').ok).toBe(false);
    });

    it('không hoàn tác được cú trượt làm khối thoát', () => {
      const exitLvl = lvl({ gates: [{ color: 'pink', side: 'right', index: 0 }] });
      const s = ok(slide(createState(exitLvl), 'A', 'right'));
      expect(undo(s, 'A').ok).toBe(false);
    });

    it('hoàn tác chuỗi được khi vệt của cú trước còn sống (độ sống 3)', () => {
      let s = ok(slide(createState(lvl({ trailLife: 3 })), 'A', 'right')); // lượt 1
      s = ok(slide(s, 'A', 'down')); // lượt 2
      s = ok(undo(s, 'A')); // lượt 3, về (4,0)
      expect(s.balls.A).toEqual({ x: 4, y: 0 });
      s = ok(undo(s, 'A')); // lượt 4, về (0,0)
      expect(s.balls.A).toEqual({ x: 0, y: 0 });
    });

    it('với độ sống 2 thì hoàn tác chuỗi không kịp', () => {
      let s = ok(slide(createState(lvl()), 'A', 'right')); // lượt 1
      s = ok(slide(s, 'A', 'down')); // lượt 2
      s = ok(undo(s, 'A')); // lượt 3
      expect(undo(s, 'A').ok).toBe(false); // lượt 4: vệt lượt 1 đã hết
    });

    it('hết lượt thì không hoàn tác được', () => {
      const s = ok(slide(createState(lvl({ maxMoves: 1 })), 'A', 'right'));
      expect(undo(s, 'A').ok).toBe(false);
    });
  });

  it('cú vuốt hợp lệ tăng lượt thêm 1', () => {
    const r = slide(createState(base), 'A', 'down');
    expect(r.ok && r.state.turn).toBe(1);
  });
});

describe('ví dụ mục 4 của tài liệu (6 lượt, 2 lần dừng nhờ vệt)', () => {
  // Bản đồ trong tài liệu vẽ cả viền 7x7; ở đây là bàn 5x5 (x = cột, y = hàng, gốc ở ô chơi trên trái).
  const example = (trailLife: number): Level => ({
    width: 5,
    height: 5,
    walls: [{ x: 1, y: 1 }, { x: 0, y: 2 }],
    balls: [{ id: 'A', color: 'a', x: 0, y: 3 }, { id: 'B', color: 'b', x: 2, y: 0 }],
    gates: [{ color: 'a', side: 'up', index: 4 }, { color: 'b', side: 'right', index: 3 }],
    maxMoves: 6,
    trailLife,
    clearTrailsOnExit: false, // ví dụ gốc của tài liệu theo luật cũ
  });
  const steps: [string, 'up' | 'down' | 'left' | 'right'][] = [
    ['A', 'down'], ['A', 'right'], ['A', 'up'], ['B', 'down'], ['B', 'right'], ['B', 'right'],
  ];
  const play = (life: number) => {
    let s = createState(example(life));
    const stops: unknown[] = [];
    for (const [id, dir] of steps) {
      const r = slide(s, id, dir);
      if (!r.ok) throw new Error(`${id} ${dir}: ${r.reason}`);
      s = r.state;
      stops.push(s.balls[id] ?? 'out');
    }
    return { s, stops };
  };

  it('giải đúng trong 6 lượt và thắng', () => {
    const { s } = play(2);
    expect(s.turn).toBe(6);
    expect(status(s)).toBe('won');
  });

  it('B dừng nhờ vệt ở lượt 4 và 5, rồi mới ra cửa ở lượt 6', () => {
    const { stops } = play(2);
    expect(stops).toEqual([
      { x: 0, y: 4 }, { x: 4, y: 4 }, 'out', { x: 2, y: 3 }, { x: 3, y: 3 }, 'out',
    ]);
  });

  it('nếu vệt chỉ sống 1 lượt thì cùng chuỗi nước đi không còn đúng', () => {
    expect(() => play(1)).toThrow();
  });
});

describe('lý do dừng của cú trượt', () => {
  const stopOf = (level: Level, setup: (s: ReturnType<typeof createState>) => ReturnType<typeof createState>, id: string, dir: 'up' | 'down' | 'left' | 'right') => {
    const r = slide(setup(createState(level)), id, dir);
    return r.ok ? r.stop : r.reason;
  };
  const same = (s: ReturnType<typeof createState>) => s;
  const ballsAB: Level = { ...base, balls: [{ id: 'A', color: 'pink', x: 0, y: 0 }, { id: 'B', color: 'teal', x: 3, y: 0 }] };

  it('mép bàn', () => expect(stopOf(base, same, 'A', 'right')).toBe('edge'));
  it('khối đá', () => expect(stopOf({ ...base, walls: [{ x: 2, y: 0 }] }, same, 'A', 'right')).toBe('wall'));
  it('khối khác', () => expect(stopOf(ballsAB, same, 'A', 'right')).toBe('ball'));
  it('vệt', () => {
    const lvl: Level = { ...base, balls: [{ id: 'A', color: 'pink', x: 0, y: 0 }, { id: 'B', color: 'teal', x: 0, y: 4 }] };
    const afterA = (s: ReturnType<typeof createState>) => {
      const r = slide(s, 'A', 'right');
      if (!r.ok) throw new Error('setup');
      return r.state;
    };
    expect(stopOf(lvl, afterA, 'B', 'up')).toBe('trail');
  });
  it('dừng cạnh cửa cùng màu: lý do dừng vẫn là vật cản vật lý, thoát ghi riêng', () => {
    const lvl: Level = { ...base, gates: [{ color: 'pink', side: 'right', index: 0 }] };
    expect(stopOf(lvl, same, 'A', 'right')).toBe('edge');
    const r = slide(createState(lvl), 'A', 'right');
    expect(r.ok && r.exit).toBe('right');
  });
});

describe('undoDir (hướng kéo ngược để hoàn tác một khối)', () => {
  const two: Level = { ...base, balls: [{ id: 'A', color: 'pink', x: 0, y: 0 }, { id: 'B', color: 'teal', x: 0, y: 4 }] };
  const ok = (r: ReturnType<typeof slide>) => {
    if (!r.ok) throw new Error('expected ok: ' + r.reason);
    return r.state;
  };

  it('chưa trượt lần nào thì không có', () => {
    expect(undoDir(createState(two), 'A')).toBeNull();
  });

  it('là hướng quay về ô xuất phát của cú trượt gần nhất', () => {
    let s = ok(slide(createState(two), 'A', 'right'));
    expect(undoDir(s, 'A')).toBe('left');
    s = ok(slide(s, 'A', 'down'));
    expect(undoDir(s, 'A')).toBe('up');
  });

  it('chỉ xét khối đó, không ảnh hưởng khối khác', () => {
    const s = ok(slide(createState(two), 'A', 'right'));
    expect(undoDir(s, 'B')).toBeNull();
  });

  it('hết hạn vệt của cú trượt đó thì không còn', () => {
    let s = ok(slide(createState(two), 'A', 'right')); // lượt 1
    s = ok(slide(s, 'B', 'right')); // lượt 2
    expect(undoDir(s, 'A')).toBe('left'); // lượt 3: vệt lượt 1 còn sống
    s = ok(slide(s, 'B', 'up')); // lượt 3
    expect(undoDir(s, 'A')).toBeNull(); // lượt 4: đã hết
  });

  it('sau khi hoàn tác thì lùi về cú trước nếu vệt của nó còn sống (độ sống 3)', () => {
    let s = ok(slide(createState({ ...two, trailLife: 3 }), 'A', 'right')); // lượt 1
    s = ok(slide(s, 'A', 'down')); // lượt 2
    s = ok(undo(s, 'A')); // lượt 3, về (4,0)
    expect(undoDir(s, 'A')).toBe('left');
  });

  it('khối đã thoát hoặc hết lượt thì không có', () => {
    const exitLvl: Level = { ...two, gates: [{ color: 'pink', side: 'right', index: 0 }] };
    expect(undoDir(ok(slide(createState(exitLvl), 'A', 'right')), 'A')).toBeNull();
    expect(undoDir(ok(slide(createState({ ...two, maxMoves: 1 }), 'A', 'right')), 'A')).toBeNull();
  });
});

describe('hút ra cửa: dừng cạnh cửa cùng màu thì tự thoát', () => {
  const lvl = (over: Partial<Level>): Level => ({ ...base, ...over });
  const ok = (r: ReturnType<typeof slide>) => {
    if (!r.ok) throw new Error('expected ok: ' + r.reason);
    return r.state;
  };

  it('bị đá chặn ngay ô sát viền có cửa cùng màu thì bị hút ra, dù không trượt hướng cửa', () => {
    // A trượt phải dọc hàng trên, đá ở (3,0) chặn A tại (2,0); cửa 'up' ở cột 2 cùng màu hút A
    const l = lvl({ walls: [{ x: 3, y: 0 }], gates: [{ color: 'pink', side: 'up', index: 2 }] });
    const r = slide(createState(l), 'A', 'right');
    expect(r.ok && r.state.out).toEqual(['A']);
    expect(r.ok && r.state.balls.A).toBeUndefined();
    expect(r.ok && r.exit).toBe('up');
  });

  it('kết quả cho biết ô cuối khối dừng, kể cả khi khối đã bị hút ra', () => {
    const l = lvl({ walls: [{ x: 3, y: 0 }], gates: [{ color: 'pink', side: 'up', index: 2 }] });
    const r = slide(createState(l), 'A', 'right');
    expect(r.ok && r.to).toEqual({ x: 2, y: 0 });
    const plain = slide(createState(lvl({})), 'A', 'down');
    expect(plain.ok && plain.to).toEqual({ x: 0, y: 4 });
  });

  it('chỉ xét ô nơi khối dừng: đi ngang qua cửa giữa chừng thì không bị hút', () => {
    const l = lvl({ gates: [{ color: 'pink', side: 'up', index: 2 }] });
    const s = ok(slide(createState(l), 'A', 'right'));
    expect(s.balls.A).toEqual({ x: 4, y: 0 });
    expect(s.out).toEqual([]);
  });

  it('cửa khác màu không hút', () => {
    const l = lvl({ walls: [{ x: 3, y: 0 }], gates: [{ color: 'teal', side: 'up', index: 2 }] });
    const s = ok(slide(createState(l), 'A', 'right'));
    expect(s.balls.A).toEqual({ x: 2, y: 0 });
  });

  it('dừng ở ô trong bàn (không sát viền có cửa) thì không bị hút', () => {
    // A đi lên cột 2 bị đá ở (2,0) chặn, dừng tại (2,1): ô này không sát viền nên giỏ 'up' ở cột 2 không hút
    const l = lvl({ balls: [{ id: 'A', color: 'pink', x: 2, y: 4 }], walls: [{ x: 2, y: 0 }], gates: [{ color: 'pink', side: 'up', index: 2 }] });
    const s = ok(slide(createState(l), 'A', 'up'));
    expect(s.balls.A).toEqual({ x: 2, y: 1 });
    expect(s.out).toEqual([]);
  });

  it('khối thoát không hoàn tác được; với clearTrailsOnExit: false vệt gồm cả ô nó dừng', () => {
    const l = lvl({ walls: [{ x: 3, y: 0 }], gates: [{ color: 'pink', side: 'up', index: 2 }] });
    const s = ok(slide(createState(l), 'A', 'right'));
    expect(undo(s, 'A').ok).toBe(false);
    const kept = ok(slide(createState({ ...l, clearTrailsOnExit: false }), 'A', 'right'));
    expect(kept.trails.map((t) => `${t.x},${t.y}`).sort()).toEqual(['0,0', '1,0', '2,0']);
  });

  it('ở góc có hai cửa, cửa cùng màu hút còn cửa khác màu thì không', () => {
    const l = lvl({
      balls: [{ id: 'A', color: 'pink', x: 2, y: 0 }],
      gates: [{ color: 'teal', side: 'up', index: 0 }, { color: 'pink', side: 'left', index: 0 }],
    });
    const r = slide(createState(l), 'A', 'left');
    expect(r.ok && r.exit).toBe('left');
  });

  it('khối thoát ngay khi đứng ở ô ngoài cùng không thay đổi luật thắng/thua', () => {
    const l = lvl({ walls: [{ x: 3, y: 0 }], gates: [{ color: 'pink', side: 'up', index: 2 }] });
    const s = ok(slide(createState(l), 'A', 'right'));
    expect(status(s)).toBe('won');
  });
});

describe('clearTrailsOnExit: khối bị hút ra thì xoá hết vệt của nó (mặc định bật)', () => {
  const lvl = (clear: boolean): Level => ({
    ...base,
    balls: [{ id: 'A', color: 'pink', x: 0, y: 2 }, { id: 'B', color: 'teal', x: 3, y: 4 }],
    gates: [{ color: 'pink', side: 'up', index: 4 }],
    clearTrailsOnExit: clear,
  });
  const ok = (r: ReturnType<typeof slide>) => {
    if (!r.ok) throw new Error('expected ok: ' + r.reason);
    return r.state;
  };
  const exitA = (clear: boolean) => {
    let s = ok(slide(createState(lvl(clear)), 'A', 'up')); // lượt 1: (0,2) -> (0,0)
    s = ok(slide(s, 'A', 'right')); // lượt 2: (0,0) -> (4,0), sát giỏ nên bị hút
    return s;
  };

  it('tắt (clearTrailsOnExit: false): vệt của khối đã thoát vẫn còn', () => {
    expect(exitA(false).trails.length).toBeGreaterThan(0);
  });

  it('không khai báo thì mặc định là bật', () => {
    const l = lvl(true);
    delete l.clearTrailsOnExit;
    let s = ok(slide(createState(l), 'A', 'up'));
    s = ok(slide(s, 'A', 'right'));
    expect(s.trails).toEqual([]);
  });

  it('bật: xoá cả vệt của cú thoát lẫn các cú trượt trước của khối đó', () => {
    const s = exitA(true);
    expect(s.out).toEqual(['A']);
    expect(s.trails).toEqual([]);
  });

  it('bật: vệt của khối khác không bị xoá', () => {
    let s = ok(slide(createState(lvl(true)), 'A', 'up')); // lượt 1
    s = ok(slide(s, 'B', 'left')); // lượt 2: vệt của B
    s = ok(slide(s, 'A', 'right')); // lượt 3: A bị hút ra, xoá vệt của A (lượt 1 và 3)
    expect(s.out).toEqual(['A']);
    expect(new Set(s.trails.map((t) => t.turn))).toEqual(new Set([2]));
  });

  it('bật: khối bị xoá vệt thì khối khác đi qua được ngay', () => {
    // B ở (0,4) đi lên qua cột 0 nơi A vừa để lại vệt
    const l: Level = { ...lvl(true), balls: [{ id: 'A', color: 'pink', x: 0, y: 2 }, { id: 'B', color: 'teal', x: 0, y: 4 }] };
    let s = ok(slide(createState(l), 'A', 'up')); // A (0,2)->(0,0)
    s = ok(slide(s, 'A', 'right')); // A thoát, xoá vệt
    const r = slide(s, 'B', 'up');
    expect(r.ok && r.to).toEqual({ x: 0, y: 0 });
    const off = ok(slide(ok(slide(createState({ ...l, clearTrailsOnExit: false }), 'A', 'up')), 'A', 'right'));
    const r2 = slide(off, 'B', 'up');
    expect(r2.ok && r2.to).toEqual({ x: 0, y: 3 }); // không xoá: vệt của A ở ô xuất phát (0,2) chặn B
  });
});

describe('thạch một trục', () => {
  const lv = (axis?: 'h' | 'v'): Level => ({
    width: 5,
    height: 5,
    walls: [],
    balls: [{ id: 'A', color: 'pink', x: 2, y: 2, ...(axis ? { axis } : {}) }],
    gates: [{ color: 'pink', side: 'up', index: 0 }],
    maxMoves: 9,
    trailLife: 2,
  });

  it('trục ngang chỉ trượt trái/phải, trục dọc chỉ trượt lên/xuống', () => {
    const h = createState(lv('h'));
    expect(slide(h, 'A', 'left').ok).toBe(true);
    expect(slide(h, 'A', 'right').ok).toBe(true);
    expect(slide(h, 'A', 'up')).toEqual({ ok: false, reason: 'axis' });
    expect(slide(h, 'A', 'down')).toEqual({ ok: false, reason: 'axis' });
    const v = createState(lv('v'));
    expect(slide(v, 'A', 'down').ok).toBe(true);
    expect(slide(v, 'A', 'left')).toEqual({ ok: false, reason: 'axis' });
  });

  it('không khai báo trục thì trượt cả bốn hướng; hoàn tác vẫn dùng được', () => {
    const free = createState(lv());
    for (const d of ['up', 'down', 'left', 'right'] as const) expect(axisAllows(free.level, 'A', d)).toBe(true);
    const h = createState(lv('h'));
    const r = slide(h, 'A', 'right');
    if (!r.ok) throw new Error('right');
    expect(undoDir(r.state, 'A')).toBe('left'); // kéo ngược cũng nằm trên trục
  });
});

describe('ô đặc biệt', () => {
  const mk = (extra: Partial<Level>, ball = { x: 0, y: 2 }): Level => ({
    width: 6,
    height: 5,
    walls: [],
    balls: [{ id: 'A', color: 'pink', ...ball }],
    gates: [{ color: 'pink', side: 'down', index: 5 }],
    maxMoves: 9,
    trailLife: 2,
    ...extra,
  });
  const go = (lv: Level, dir: 'up' | 'down' | 'left' | 'right') => {
    const r = slide(createState(lv), 'A', dir);
    if (!r.ok) throw new Error(r.reason);
    return r;
  };

  it('ô dính: dừng ngay tại ô đó', () => {
    const r = go(mk({ sticky: [{ x: 3, y: 2 }] }), 'right');
    expect(r.to).toEqual({ x: 3, y: 2 });
    expect(r.stop).toBe('sticky');
    // xuất phát từ ô dính thì đi được bình thường
    const r2 = go(mk({ sticky: [{ x: 3, y: 2 }] }, { x: 3, y: 2 }), 'right');
    expect(r2.to).toEqual({ x: 5, y: 2 });
  });

  it('ô mũi tên: bẻ hướng và đi tiếp; bị chặn ngay thì dừng trên ô mũi tên', () => {
    const lv = mk({ arrows: [{ x: 2, y: 2, dir: 'down' }] });
    const r = go(lv, 'right');
    expect(r.to).toEqual({ x: 2, y: 4 });
    expect(r.path).toEqual([{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 3 }, { x: 2, y: 4 }]);
    const blocked = go(mk({ arrows: [{ x: 2, y: 2, dir: 'down' }], walls: [{ x: 2, y: 3 }] }), 'right');
    expect(blocked.to).toEqual({ x: 2, y: 2 });
  });

  it('cổng dịch chuyển: vào ô này ra ô kia và đi tiếp cùng hướng; ô ra bị chặn thì dừng tại ô vào', () => {
    const lv = mk({ portals: [{ a: { x: 2, y: 2 }, b: { x: 4, y: 0 } }] });
    const r = go(lv, 'right');
    expect(r.to).toEqual({ x: 5, y: 0 });
    expect(r.jumps).toEqual([2]); // đoạn path[2] (ô vào) → path[3] (ô ra)
    expect(r.path![2]).toEqual({ x: 2, y: 2 });
    expect(r.path![3]).toEqual({ x: 4, y: 0 });
    const blocked = go(mk({ portals: [{ a: { x: 2, y: 2 }, b: { x: 4, y: 0 } }], walls: [{ x: 5, y: 0 }] }), 'right');
    expect(blocked.to).toEqual({ x: 4, y: 0 }); // ra tới ô ra nhưng bị đá chắn tiếp: dừng ở ô ra
    const exitBlocked = go(mk({ portals: [{ a: { x: 2, y: 2 }, b: { x: 4, y: 0 } }], balls: [{ id: 'A', color: 'pink', x: 0, y: 2 }, { id: 'B', color: 'teal', x: 4, y: 0 }] as Level['balls'], gates: [{ color: 'pink', side: 'down', index: 5 }, { color: 'teal', side: 'up', index: 4 }] }), 'right');
    expect(exitBlocked.to).toEqual({ x: 2, y: 2 }); // ô ra có khối khác: dừng tại ô vào
  });

  it('hoàn tác sau ô mũi tên / cổng dịch chuyển: kéo ngược theo đường vừa đi (ô liền trước), không phải hướng thẳng về ô xuất phát', () => {
    const lv = mk({ arrows: [{ x: 2, y: 2, dir: 'down' }] });
    const r = go(lv, 'right');
    expect(r.to).toEqual({ x: 2, y: 4 });
    expect(undoDir(r.state, 'A')).toBe('up'); // trước là ô (2,3) phía trên, dù ô xuất phát (0,2) nằm bên trái
    const u = undo(r.state, 'A');
    expect(u.ok && u.state.balls.A).toEqual({ x: 0, y: 2 });
    const lp = mk({ portals: [{ a: { x: 2, y: 2 }, b: { x: 4, y: 0 } }] }, { x: 2, y: 0 });
    const rp = go(lp, 'down');
    expect(rp.to).toEqual({ x: 4, y: 4 });
    expect(undoDir(rp.state, 'A')).toBe('up'); // đi xuống cột 4 sau cổng, nên kéo ngược là lên
    const up = undo(rp.state, 'A');
    expect(up.ok && up.state.balls.A).toEqual({ x: 2, y: 0 });
  });

  it('ô mũi tên ngược chiều đang đi: thạch dừng trên ô mũi tên', () => {
    const lv = mk({ arrows: [{ x: 2, y: 2, dir: 'left' }] });
    const r = go(lv, 'right');
    expect(r.to).toEqual({ x: 2, y: 2 });
  });

  it('pin không đặt được lên ô của cổng (tránh tự khoá cổng)', () => {
    const lv = mk({ gates: [{ color: 'pink', side: 'down', index: 3 }] });
    expect(isEmptyCell(createState(lv), 3, 4)).toBe(true);
    expect(isPinnable(createState(lv), 3, 4)).toBe(false);
    expect(placePin(createState(lv), 3, 4).ok).toBe(false);
    expect(placePin(createState(lv), 3, 3).ok).toBe(true);
  });

  it('vòng lặp mũi tên không treo: dừng lại', () => {
    const lv = mk({ arrows: [{ x: 2, y: 2, dir: 'right' }, { x: 3, y: 2, dir: 'left' }] });
    expect(() => go(lv, 'right')).not.toThrow();
  });

  it('Block/Bom không đặt được lên ô đặc biệt; validateLevel bắt ô đặc biệt trùng ô', () => {
    const lv = mk({ sticky: [{ x: 3, y: 2 }], arrows: [{ x: 3, y: 2, dir: 'up' }] });
    expect(validateLevel(lv).some((e) => e.includes('trùng'))).toBe(true);
    expect(isEmptyCell(createState(mk({ sticky: [{ x: 3, y: 3 }] })), 3, 3)).toBe(false);
  });
});

describe('hai khối cùng màu dùng chung một cửa', () => {
  const lv: Level = {
    width: 5,
    height: 5,
    walls: [],
    balls: [{ id: 'A', color: 'pink', x: 2, y: 0 }, { id: 'B', color: 'pink', x: 2, y: 4 }],
    gates: [{ color: 'pink', side: 'right', index: 2 }],
    maxMoves: 9,
    trailLife: 2,
  };

  it('cửa nhận cả hai khối, lần lượt', () => {
    let s = createState({ ...lv, balls: [{ id: 'A', color: 'pink', x: 2, y: 2 }, { id: 'B', color: 'pink', x: 0, y: 2 }] });
    const r1 = slide(s, 'A', 'right');
    if (!r1.ok) throw new Error(r1.reason);
    expect(r1.exit).toBe('right');
    s = r1.state;
    expect(s.out).toEqual(['A']);
    expect(status(s)).toBe('playing'); // còn khối B
    const r2 = slide(s, 'B', 'right');
    if (!r2.ok) throw new Error(r2.reason);
    expect(r2.exit).toBe('right'); // cùng một cửa nhận khối thứ hai
    expect(status(r2.state)).toBe('won');
  });
});

describe('thạch đóng băng', () => {
  const lv = (): Level => ({
    width: 6,
    height: 3,
    walls: [],
    balls: [{ id: 'A', color: 'pink', x: 0, y: 1 }, { id: 'B', color: 'teal', x: 3, y: 1, frozen: true }],
    gates: [{ color: 'pink', side: 'up', index: 5 }, { color: 'teal', side: 'down', index: 5 }],
    maxMoves: 9,
    trailLife: 2,
  });

  it('khối đóng băng không vuốt được', () => {
    expect(slide(createState(lv()), 'B', 'right')).toEqual({ ok: false, reason: 'frozen' });
  });

  it('trượt tới dừng sát khối đóng băng thì băng vỡ và khối đó vuốt được', () => {
    const r = slide(createState(lv()), 'A', 'right');
    if (!r.ok) throw new Error(r.reason);
    expect(r.to).toEqual({ x: 2, y: 1 });
    expect(r.thawed).toBe('B');
    expect(r.state.frozen).toEqual([]);
    expect(slide(r.state, 'B', 'right').ok).toBe(true);
  });

  it('khối đóng băng không bị Nam châm kéo và không bị Bom đẩy', () => {
    const l = lv();
    const s = createState({ ...l, balls: [{ id: 'A', color: 'pink', x: 0, y: 1 }, { id: 'B', color: 'teal', x: 5, y: 2, frozen: true }] });
    expect(magnetGate(s, 'B')).toBeNull();
    const b = placeBomb(createState({ ...l, balls: [l.balls[0], { ...l.balls[1], x: 3, y: 1 }] }), 2, 1);
    if (!b.ok) throw new Error(b.reason);
    expect(b.state.balls.B).toEqual({ x: 3, y: 1 });
  });
});

describe('cổng đóng băng và cổng theo nhịp', () => {
  const lv = (gates: Level['gates'], balls?: Level['balls']): Level => ({
    width: 5,
    height: 3,
    walls: [],
    balls: balls ?? [{ id: 'A', color: 'pink', x: 0, y: 0 }, { id: 'B', color: 'teal', x: 0, y: 2 }],
    gates,
    maxMoves: 9,
    trailLife: 2,
  });

  it('cổng đóng băng: không nhận khối cho tới khi đủ số khối đã thoát', () => {
    const l = lv([{ color: 'pink', side: 'right', index: 0, lock: 1 }, { color: 'teal', side: 'right', index: 2 }]);
    let s = createState(l);
    expect(gateOpen(s, l.gates[0])).toBe(false);
    const stay = slide(s, 'A', 'right');
    if (!stay.ok) throw new Error(stay.reason);
    expect(stay.exit).toBeUndefined(); // tới sát cổng nhưng cổng đang khoá
    expect(stay.to).toEqual({ x: 4, y: 0 });
    // B thoát trước (cổng teal không khoá) → cổng pink mở
    const b = slide(createState(l), 'B', 'right');
    if (!b.ok) throw new Error(b.reason);
    expect(b.exit).toBe('right');
    s = b.state;
    expect(gateOpen(s, l.gates[0])).toBe(true);
    const a = slide(s, 'A', 'right');
    if (!a.ok) throw new Error(a.reason);
    expect(a.exit).toBe('right');
    expect(status(a.state)).toBe('won');
  });

  it('cổng theo nhịp: chỉ nhận khối ở lượt đúng chẵn/lẻ', () => {
    // A ở hàng 0 trượt phải là lượt 1 (lẻ): cổng 'even' đóng, cổng 'odd' mở
    const evenGate = lv([{ color: 'pink', side: 'right', index: 0, rhythm: 'even' }, { color: 'teal', side: 'right', index: 2 }]);
    const r1 = slide(createState(evenGate), 'A', 'right');
    if (!r1.ok) throw new Error(r1.reason);
    expect(r1.exit).toBeUndefined();
    const oddGate = lv([{ color: 'pink', side: 'right', index: 0, rhythm: 'odd' }, { color: 'teal', side: 'right', index: 2 }]);
    const r2 = slide(createState(oddGate), 'A', 'right');
    if (!r2.ok) throw new Error(r2.reason);
    expect(r2.exit).toBe('right');
    // sau một lượt khác (B đi) thì lượt của A là chẵn → cổng 'even' mở
    const b = slide(createState(evenGate), 'B', 'right');
    if (!b.ok) throw new Error(b.reason);
    const a = slide(b.state, 'A', 'right');
    if (!a.ok) throw new Error(a.reason);
    expect(a.exit).toBe('right');
  });
});
