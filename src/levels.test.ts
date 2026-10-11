import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from './core/campaign';
import { validateLevel } from './core/rules';
import { featuresUsed, solve } from './core/solver';
import { LEVELS } from './levels';

describe('bộ level đã sinh sẵn', () => {
  it('có 50 level, khớp kịch bản', () => {
    expect(LEVELS.length).toBe(50);
    expect(CAMPAIGN.length).toBe(50);
  });

  it('mỗi level hợp lệ và đúng thông số kịch bản', () => {
    LEVELS.forEach(({ level, tier }, i) => {
      const spec = CAMPAIGN[i].spec;
      expect(validateLevel(level), `level ${i + 1}`).toEqual([]);
      expect(tier, `level ${i + 1} độ khó`).toBe(CAMPAIGN[i].tier);
      expect(level.balls.length, `level ${i + 1} số khối`).toBe(spec.balls);
      expect(level.trailLife, `level ${i + 1} độ sống`).toBe(spec.trailLife);
      expect(level.trailClock, `level ${i + 1} đồng hồ vệt`).toBe('owner');
    });
  });

  it('mọi level giải được KHÔNG cần booster, đúng bằng số lượt tối thiểu đã ghi', () => {
    LEVELS.forEach(({ level, minMoves }, i) => {
      expect(solve(level)?.length, `level ${i + 1}`).toBe(minMoves);
    });
  }, 120000);

  it('lời giải mẫu hợp lệ; level có booster giúp thì lời giải mẫu dùng booster và ngắn hơn', () => {
    LEVELS.forEach(({ level, minMoves, helps, solution }, i) => {
      const s = solve(level, helps ? { boosters: { [helps]: 1 } } : {});
      expect(solution?.length, `level ${i + 1} lời giải`).toBe(s?.moves.length);
      if (helps) expect(s!.length, `level ${i + 1} booster giúp ngắn hơn`).toBeLessThan(minMoves);
    });
  }, 120000);

  it('thang lượt dư: khó dư 1–2 lượt, siêu khó dư đúng 1, không level nào buộc booster', () => {
    LEVELS.forEach(({ level, minMoves, tier }, i) => {
      const slack = level.maxMoves - minMoves;
      if (tier === 'super') expect(slack, `level ${i + 1} siêu khó`).toBe(1);
      if (tier === 'hard') expect(slack, `level ${i + 1} khó`).toBeGreaterThanOrEqual(1);
      if (tier === 'hard') expect(slack, `level ${i + 1} khó`).toBeLessThanOrEqual(2);
    });
  });

  it('số khối chỉ tăng dần (1 → 2 → 3), không xen kẽ', () => {
    LEVELS.forEach(({ level }, i) => {
      if (i > 0) expect(level.balls.length, `level ${i + 1}`).toBeGreaterThanOrEqual(LEVELS[i - 1].level.balls.length);
    });
  });

  it('số khối theo chặng: L1–4 một khối, L5–15 hai khối, L16–50 ba khối', () => {
    LEVELS.forEach(({ level }, i) => expect(level.balls.length, `level ${i + 1}`).toBe(i < 4 ? 1 : i < 15 ? 2 : 3));
  });

  it('level 5 (khó, hai khối đầu tiên) bắt buộc cả phanh bằng vệt lẫn hoàn tác và có hướng dẫn', () => {
    expect(LEVELS[4].tier).toBe('hard');
    expect(LEVELS[4].level.balls.length).toBe(2);
    expect(LEVELS[4].needs?.brake).toBe(true);
    expect(LEVELS[4].needs?.undo).toBe(true);
    expect(LEVELS[4].tutorial).toBeDefined();
  });

  it('level 4 giống độ khó level 3 và không có hướng dẫn', () => {
    expect(LEVELS[3].tutorial).toBeUndefined();
    expect(LEVELS[3].minMoves).toBe(LEVELS[2].minMoves);
    expect(LEVELS[3].level.maxMoves - LEVELS[3].minMoves).toBe(LEVELS[2].level.maxMoves - LEVELS[2].minMoves);
    expect(LEVELS[3].needs).toEqual({ brake: false, undo: false });
  });

  it('nhịp khó: L5/15/25/35/45 khó, L10/20/30/40/50 siêu khó', () => {
    expect([4, 14, 24, 34, 44].map((i) => LEVELS[i].tier)).toEqual(['hard', 'hard', 'hard', 'hard', 'hard']);
    expect([9, 19, 29, 39, 49].map((i) => LEVELS[i].tier)).toEqual(['super', 'super', 'super', 'super', 'super']);
  });

  it('thạch một trục: L6 giới thiệu sớm (popup, không tut) rồi chỉ xuất hiện ở các level đã định, mỗi level đúng một khối', () => {
    const withAxis = [5, 6, 12, 13, 14, 28, 41, 45, 49];
    LEVELS.forEach(({ level }, i) => expect(level.balls.filter((b) => b.axis).length, `level ${i + 1}`).toBe(withAxis.includes(i) ? 1 : 0));
    expect(LEVELS[5].tutorial).toBeUndefined(); // mechanic chỉ có popup giới thiệu, không ép nước đi
    expect(LEVELS[5].introduces).toBe('axis');
    expect(LEVELS[12].tutorial).toBeUndefined();
  });

  it('mechanic ô đặc biệt: giới thiệu bằng popup đúng level và chỉ xuất hiện từ level giới thiệu trở đi', () => {
    const intro: Record<string, number> = { hidden: 22, arrows: 26, portals: 31, sticky: 36 };
    for (const [k, lv] of Object.entries(intro)) expect(LEVELS[lv - 1].introduces, `level ${lv}`).toBe(k);
    LEVELS.forEach(({ level }, i) => {
      const n = i + 1;
      if (level.balls.some((b) => b.hidden)) expect(n, `level ${n} có thạch ẩn`).toBeGreaterThanOrEqual(intro.hidden);
      if (level.arrows?.length) expect(n, `level ${n} có mũi tên`).toBeGreaterThanOrEqual(intro.arrows);
      if (level.portals?.length) expect(n, `level ${n} có cổng dịch chuyển`).toBeGreaterThanOrEqual(intro.portals);
      if (level.sticky?.length) expect(n, `level ${n} có ô dính`).toBeGreaterThanOrEqual(intro.sticky);
    });
    // level giới thiệu thật sự có mechanic đó
    expect(LEVELS[21].level.balls.some((b) => b.hidden)).toBe(true);
    expect(LEVELS[25].level.arrows?.length).toBeGreaterThan(0);
    expect(LEVELS[30].level.portals?.length).toBeGreaterThan(0);
    expect(LEVELS[35].level.sticky?.length).toBeGreaterThan(0);
  });

  it('màn có thạch ẩn chỉ dùng 2 màu (3 khối chia nhau 2 màu) để màu khối ẩn không đoán ngay được', () => {
    LEVELS.forEach(({ level }, i) => {
      if (!level.balls.some((b) => b.hidden)) return;
      expect(new Set(level.balls.map((b) => b.color)).size, `level ${i + 1}`).toBe(2);
      expect(level.gates.length, `level ${i + 1} số cửa`).toBe(2); // mỗi màu một cửa
    });
  });

  it('đa dạng màu: các level 3 khối có cả level 3 màu khác nhau lẫn level chỉ 2 màu', () => {
    const threeBall = LEVELS.slice(15).map(({ level }) => new Set(level.balls.map((b) => b.color)).size);
    expect(threeBall.filter((n) => n === 3).length).toBeGreaterThanOrEqual(8);
    expect(threeBall.filter((n) => n === 2).length).toBeGreaterThanOrEqual(15);
    LEVELS.forEach(({ level }, i) => expect(level.gates.length, `level ${i + 1}: mỗi màu đúng một cửa`).toBe(new Set(level.balls.map((b) => b.color)).size));
    expect(LEVELS.slice(0, 15).every(({ level }) => new Set(level.balls.map((b) => b.color)).size === level.balls.length)).toBe(true);
  });

  it('level có ô đặc biệt: lời giải mẫu thật sự dùng đến từng loại ô có mặt (dính, mũi tên, cổng dịch chuyển)', () => {
    LEVELS.forEach(({ level, solution }, i) => {
      const used = featuresUsed(level, solution ?? []);
      for (const f of ['sticky', 'arrows', 'portals'] as const) if (level[f]?.length) expect(used.has(f), `level ${i + 1} dùng ${f}`).toBe(true);
    });
  });

  it('level có thạch một trục: giới thiệu trục phải làm lời giải dài hơn (không phải trang trí)', () => {
    LEVELS.forEach(({ level, minMoves }, i) => {
      if (!level.balls.some((b) => b.axis)) return;
      const free = solve({ ...level, balls: level.balls.map((b) => ({ id: b.id, color: b.color, x: b.x, y: b.y })) });
      expect(free?.length ?? 99, `level ${i + 1}`).toBeLessThan(minMoves);
    });
  }, 120000);
});
