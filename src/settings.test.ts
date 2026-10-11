import { describe, expect, it } from 'vitest';
import { createSettings, type StorageLike } from './settings';

const memory = (initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
};

describe('createSettings', () => {
  it('mặc định nhạc, âm thanh và rung đều bật', () => {
    const s = createSettings(memory(), 'k');
    expect([s.get('music'), s.get('sound'), s.get('haptic')]).toEqual([true, true, true]);
  });

  it('set đổi giá trị và lưu xuống bộ nhớ', () => {
    const store = memory();
    const s = createSettings(store, 'k');
    s.set('sound', false);
    expect(s.get('sound')).toBe(false);
    expect(JSON.parse(store.data.get('k')!)).toEqual({ music: true, sound: false, haptic: true });
  });

  it('lần mở sau đọc lại đúng giá trị đã lưu', () => {
    const store = memory();
    createSettings(store, 'k').set('haptic', false);
    const again = createSettings(store, 'k');
    expect(again.get('haptic')).toBe(false);
    expect(again.get('music')).toBe(true);
  });

  it('toggle lật giá trị và trả về giá trị mới', () => {
    const s = createSettings(memory(), 'k');
    expect(s.toggle('music')).toBe(false);
    expect(s.toggle('music')).toBe(true);
  });

  it('dữ liệu lưu hỏng thì dùng mặc định, không văng lỗi', () => {
    const s = createSettings(memory({ k: '{không phải json' }), 'k');
    expect(s.get('music')).toBe(true);
  });

  it('giá trị không phải boolean bị bỏ qua, khoá lạ bị bỏ', () => {
    const s = createSettings(memory({ k: JSON.stringify({ music: 'no', sound: false, haptic: 1, bogus: false }) }), 'k');
    expect([s.get('music'), s.get('sound'), s.get('haptic')]).toEqual([true, false, true]);
  });

  it('không có bộ nhớ hoặc bộ nhớ ném lỗi (chế độ riêng tư) thì vẫn chạy trong phiên', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    for (const store of [null, broken]) {
      const s = createSettings(store, 'k');
      expect(() => s.set('music', false)).not.toThrow();
      expect(s.get('music')).toBe(false);
    }
  });
});
