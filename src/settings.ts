// Cài đặt người chơi: nhạc, âm thanh, rung. Giữ trạng thái và lưu xuống bộ nhớ trình duyệt;
// không biết gì về giao diện hay âm thanh (phần đó ở game.ts).

export type SettingKey = 'music' | 'sound' | 'haptic';

export const SETTING_KEYS: readonly SettingKey[] = ['music', 'sound', 'haptic'];

/** Phần của Storage mà module này dùng (để test được và chịu được môi trường không có Storage). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface Settings {
  get(key: SettingKey): boolean;
  set(key: SettingKey, on: boolean): void;
  /** Lật giá trị, trả về giá trị mới. */
  toggle(key: SettingKey): boolean;
}

/**
 * Mọi cài đặt mặc định là bật. `storage` null hoặc ném lỗi (chế độ riêng tư, chặn dữ liệu) thì vẫn chạy được
 * trong phiên, chỉ là không nhớ sang lần sau.
 */
export function createSettings(storage: StorageLike | null, key: string): Settings {
  const values: Record<SettingKey, boolean> = { music: true, sound: true, haptic: true };

  try {
    const raw = storage?.getItem(key);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const k of SETTING_KEYS) {
          const v = (parsed as Record<string, unknown>)[k];
          if (typeof v === 'boolean') values[k] = v;
        }
      }
    }
  } catch {
    /* dữ liệu hỏng hoặc không đọc được: dùng mặc định */
  }

  const save = (): void => {
    try {
      storage?.setItem(key, JSON.stringify(values));
    } catch {
      /* không lưu được thì thôi */
    }
  };

  return {
    get: (k) => values[k],
    set(k, on) {
      values[k] = on;
      save();
    },
    toggle(k) {
      this.set(k, !values[k]);
      return values[k];
    },
  };
}
