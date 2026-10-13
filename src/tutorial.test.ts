import { describe, expect, it } from 'vitest';
import { LEVELS } from './levels';
import { buildTutorial } from './tutorial';

describe('hướng dẫn', () => {
  it('level 1 chỉ một cú vuốt vào cửa', () => {
    const t = buildTutorial(LEVELS[0])!;
    expect(t.length).toBe(1);
    expect(t[0].kind).toBe('slide');
  });

  it('level 2 có 4 cú vuốt và lời chữ về vệt biến mất', () => {
    const t = buildTutorial(LEVELS[1])!;
    expect(t.map((x) => x.kind)).toEqual(['slide', 'slide', 'slide', 'slide']);
    expect(t[1].text).toContain('2 lần đi nữa');
  });

  it('level 5 hướng dẫn HẾT lời giải tối ưu (có cú phanh nhờ vệt của khối khác, không hoàn tác)', () => {
    const t = buildTutorial(LEVELS[4])!;
    expect(t.length).toBe(LEVELS[4].solution!.length);
    expect(t.some((x) => x.kind === 'slide' && x.brake)).toBe(true);
    expect(t.some((x) => x.kind === 'undo')).toBe(false);
  });

  it('level 4 dạy lùi lại: vuốt đúng, vuốt SAI vào ngõ cụt, lùi lại, rồi đi tới cổng', () => {
    const t = buildTutorial(LEVELS[3])!;
    expect(t.map((x) => x.kind)).toEqual(['slide', 'slide', 'undo', 'slide']);
    const [first, wrong, undo, last] = t;
    if (first.kind !== 'slide' || wrong.kind !== 'slide' || undo.kind !== 'undo' || last.kind !== 'slide') throw new Error('kiểu bước');
    expect(wrong.dir).not.toBe(last.dir); // nước sai khác nước đúng
    expect(undo.id).toBe(wrong.id);
    expect(last.gate).toBeDefined();
    expect(t.every((x) => x.text.length > 0)).toBe(true);
  });

  it('level không có hướng dẫn trả null', () => {
    for (const i of [2, 5, 6, 8, 9, 11, 12, 21, 25, 30, 35]) expect(buildTutorial(LEVELS[i]), `level ${i + 1}`).toBeNull();
    expect(buildTutorial(LEVELS[9])).toBeNull();
  });
});
