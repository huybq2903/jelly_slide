import { describe, expect, it } from 'vitest';
import { featureProgress, type Feature } from './features';

const F = (level: number, key: string, kind: Feature['kind'] = 'booster'): Feature => ({ level, kind, key, name: key });
const LIST = [F(8, 'pin'), F(6, 'axis', 'mechanic'), F(11, 'basket'), F(16, 'magnet')]; // cố ý không xếp thứ tự

describe('thanh tiến trình tính năng mới', () => {
  it('trước tính năng đầu tiên: tính từ level 0', () => {
    const p = featureProgress(LIST, 3)!;
    expect(p.next.key).toBe('axis');
    expect(p.from).toBe(0);
    expect(p.pct).toBeCloseTo(4 / 6);
    expect(p.pctBefore).toBeCloseTo(3 / 6);
  });

  it('xong level ngay trước level mở khoá thì đầy 100%', () => {
    const p = featureProgress(LIST, 5)!;
    expect(p.next.key).toBe('axis');
    expect(p.pct).toBe(1);
  });

  it('xong chính level mở khoá: thanh quay về đoạn tới tính năng kế tiếp, bắt đầu từ 0', () => {
    const p = featureProgress(LIST, 8)!;
    expect(p.next.key).toBe('basket');
    expect(p.from).toBe(8);
    expect(p.pctBefore).toBe(0);
    expect(p.pct).toBeCloseTo(1 / 3);
  });

  it('chọn đúng tính năng kế tiếp giữa hai mốc', () => {
    const p = featureProgress(LIST, 9)!;
    expect(p.next.key).toBe('basket');
    expect(p.pct).toBeCloseTo(2 / 3);
  });

  it('hết tính năng phía trước thì không có thanh', () => {
    expect(featureProgress(LIST, 16)).toBeNull();
    expect(featureProgress(LIST, 40)).toBeNull();
    expect(featureProgress([], 1)).toBeNull();
  });
});
