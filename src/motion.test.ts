import { describe, expect, it } from 'vitest';
import { IDENTITY, anticipationPose, impactPose, slideEase, springK } from './motion';

describe('springK (lò xo tắt dần)', () => {
  it('bắt đầu ở 1 (ép tối đa) rồi tắt hẳn', () => {
    expect(springK(0)).toBeCloseTo(1, 5);
    expect(Math.abs(springK(700))).toBeLessThan(0.02);
  });

  it('có nảy ngược (đổi dấu) trước khi tắt', () => {
    let negative = false;
    for (let t = 0; t < 400; t += 5) if (springK(t) < -0.05) negative = true;
    expect(negative).toBe(true);
  });

  it('biên độ giảm dần theo thời gian', () => {
    const peak = (a: number, b: number): number => {
      let m = 0;
      for (let t = a; t < b; t += 2) m = Math.max(m, Math.abs(springK(t)));
      return m;
    };
    expect(peak(0, 150)).toBeGreaterThan(peak(150, 300));
    expect(peak(150, 300)).toBeGreaterThan(peak(300, 450));
  });
});

describe('slideEase (đường đi khi trượt)', () => {
  it('đi từ 0 tới 1 và tăng đều', () => {
    expect(slideEase(0)).toBe(0);
    expect(slideEase(1)).toBe(1);
    let prev = 0;
    for (let u = 0.05; u <= 1; u += 0.05) {
      const v = slideEase(u);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('xuất phát chậm rồi tăng tốc (đạt tốc độ lớn nhất lúc tới đích)', () => {
    expect(slideEase(0.5)).toBeLessThan(0.5);
    const early = slideEase(0.3) - slideEase(0.2);
    const late = slideEase(1) - slideEase(0.9);
    expect(late).toBeGreaterThan(early);
  });

  it('giá trị ngoài [0,1] được chặn lại', () => {
    expect(slideEase(-1)).toBe(0);
    expect(slideEase(2)).toBe(1);
  });
});

describe('impactPose (bị ép khi va chạm)', () => {
  it('va khi đang đi sang phải: ép theo trục x, phình ra theo z và lên trên, dồn về phía vật cản', () => {
    const p = impactPose(1, 0, 0, 1);
    expect(p.sx).toBeLessThan(1);
    expect(p.sz).toBeGreaterThan(1);
    expect(p.sy).toBeGreaterThan(1);
    expect(p.ox).toBeGreaterThan(0); // mặt chạm giữ nguyên chỗ nên tâm dồn về phía vật cản
    expect(p.oy).toBeCloseTo(0, 6);
  });

  it('va khi đang đi lên (hàng giảm): ép theo trục z, dồn về phía trên', () => {
    const p = impactPose(0, -1, 0, 1);
    expect(p.sz).toBeLessThan(1);
    expect(p.sx).toBeGreaterThan(1);
    expect(p.oy).toBeLessThan(0);
  });

  it('sau khi lò xo tắt thì trở về nguyên trạng', () => {
    const p = impactPose(1, 0, 900, 1);
    expect(p.sx).toBeCloseTo(1, 1);
    expect(p.sy).toBeCloseTo(1, 1);
    expect(p.ox).toBeCloseTo(0, 1);
  });

  it('biên độ nhỏ thì ép ít hơn', () => {
    expect(impactPose(1, 0, 0, 0.4).sx).toBeGreaterThan(impactPose(1, 0, 0, 1).sx);
  });
});

describe('anticipationPose (nhún trước khi phóng)', () => {
  it('đầu và cuối pha đều là nguyên trạng để chuyển mượt sang chuyển động', () => {
    for (const u of [0, 1]) {
      const p = anticipationPose(1, 0, u);
      expect(p).toEqual({ ...IDENTITY, ox: expect.closeTo(0, 6), oy: expect.closeTo(0, 6), sx: expect.closeTo(1, 6), sy: expect.closeTo(1, 6), sz: expect.closeTo(1, 6) });
    }
  });

  it('giữa pha: lùi ngược hướng sắp đi và hơi dẹp lại', () => {
    const p = anticipationPose(1, 0, 0.5);
    expect(p.ox).toBeLessThan(0);
    expect(p.sx).toBeLessThan(1);
  });
});
