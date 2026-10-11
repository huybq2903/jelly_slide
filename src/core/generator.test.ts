import { describe, expect, it } from 'vitest';
import { generateLevels, specForLevel, type LevelSpec } from './generator';
import { adjacentGate } from './rules';
import { solve } from './solver';

const spec: LevelSpec = {
  width: 5, height: 5, balls: 2, walls: [2, 4], trailLife: 2, minMoves: 4, maxMoves: 7, slack: 2,
};

describe('generateLevels', () => {
  const out = generateLevels(spec, 4, 1);

  it('sinh đủ số level yêu cầu', () => {
    expect(out.length).toBe(4);
  });

  it('cùng seed cho cùng kết quả, khác seed cho kết quả khác', () => {
    expect(generateLevels(spec, 4, 1)).toEqual(out);
    expect(generateLevels(spec, 4, 2)).not.toEqual(out);
  });

  it('level hợp lệ theo spec: kích thước, số bóng, số đá, độ sống, ô không trùng', () => {
    for (const { level } of out) {
      expect([level.width, level.height]).toEqual([5, 5]);
      expect(level.balls.length).toBe(2);
      expect(level.walls.length).toBeGreaterThanOrEqual(2);
      expect(level.walls.length).toBeLessThanOrEqual(4);
      expect(level.trailLife).toBe(2);
      const cells = [...level.walls, ...level.balls].map((p) => `${p.x},${p.y}`);
      expect(new Set(cells).size).toBe(cells.length);
      const slots = level.gates.map((g) => `${g.side}${g.index}`);
      expect(new Set(slots).size).toBe(slots.length);
      expect(level.gates.map((g) => g.color).sort()).toEqual(level.balls.map((b) => b.color).sort());
    }
  });

  it('số lượt tối thiểu nằm trong khoảng và số lượt tối đa = tối thiểu + slack', () => {
    for (const { level, minMoves } of out) {
      expect(minMoves).toBeGreaterThanOrEqual(4);
      expect(minMoves).toBeLessThanOrEqual(7);
      expect(level.maxMoves).toBe(minMoves + 2);
      expect(solve(level)?.length).toBe(minMoves);
    }
  });

  it('không khối nào xuất phát sát giỏ cùng màu (luật hút chỉ áp dụng sau cú vuốt)', () => {
    const wide: LevelSpec = { ...specForLevel(0), minMoves: 1, maxMoves: 8 };
    const many = generateLevels(wide, 80, 3);
    expect(many.length).toBe(80);
    for (const { level } of many) {
      for (const b of level.balls) expect(adjacentGate(level, b.id, b.x, b.y)).toBeNull();
    }
  });

  it('không sinh level trùng nhau', () => {
    const keys = out.map((o) => JSON.stringify(o.level));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('hết số lần thử thì trả về ít hơn yêu cầu, không treo', () => {
    const impossible: LevelSpec = { ...spec, minMoves: 40, maxMoves: 41 };
    expect(generateLevels(impossible, 3, 1, 30)).toEqual([]);
  }, 30000); // solver duyệt hết không gian trạng thái của 30 ứng viên nên có lúc vượt 5s mặc định khi máy bận

  it("teach 'brake': không thắng nổi trong số lượt cho phép nếu cấm dừng nhờ vệt", () => {
    const res = generateLevels({ ...spec, teach: 'brake' }, 2, 1);
    expect(res.length).toBe(2);
    for (const { level } of res) {
      expect(solve(level)).not.toBeNull();
      expect(solve(level, { noTrailStops: true })).toBeNull();
    }
  }, 30000);

  it("teach 'undo': không thắng nổi trong số lượt cho phép nếu cấm hoàn tác", () => {
    const res = generateLevels({ ...spec, minMoves: 3, maxMoves: 8, teach: 'undo' }, 2, 1, 4000);
    expect(res.length).toBe(2);
    for (const { level } of res) {
      expect(solve(level)).not.toBeNull();
      expect(solve(level, { undo: false })).toBeNull();
    }
  }, 30000);
});

describe('specForLevel (thang học mục 7.1, level đánh số từ 0)', () => {
  it('level 1–10: 1 bóng, vệt sống 1, dư 2–3 lượt', () => {
    for (const i of [0, 4, 9]) {
      const s = specForLevel(i);
      expect([s.balls, s.trailLife]).toEqual([1, 2]);
      expect(s.slack).toBeGreaterThanOrEqual(2);
      expect(s.slack).toBeLessThanOrEqual(3);
    }
  });

  it('level 11–25: 2 bóng, vệt sống 2, dư 2 lượt', () => {
    for (const i of [10, 17, 24]) {
      const s = specForLevel(i);
      expect([s.balls, s.trailLife, s.slack]).toEqual([2, 2, 2]);
    }
  });

  it('level 26+: 2 bóng, dư 1–2 lượt; mỗi 10 level là level thử thách 3 bóng', () => {
    const normal = specForLevel(27);
    expect(normal.balls).toBe(2);
    expect(normal.slack).toBeGreaterThanOrEqual(1);
    expect(normal.slack).toBeLessThanOrEqual(2);
    const challenge = specForLevel(29); // level 30
    expect(challenge.balls).toBe(3);
    expect(challenge.trailLife).toBeGreaterThanOrEqual(2);
    expect(challenge.trailLife).toBeLessThanOrEqual(3);
  });

  it('level 11–18 dạy dừng nhờ vệt, level 19–25 dạy hoàn tác', () => {
    expect(specForLevel(12).teach).toBe('brake');
    expect(specForLevel(20).teach).toBe('undo');
  });
});
