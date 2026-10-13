// Booster: định nghĩa, mở khoá theo level và kho đồ của người chơi.
// Kho đồ lưu qua userData của Falcon SDK (cùng chỗ với phần còn lại của bản lưu), còn việc booster LÀM GÌ nằm ở src/core/rules.ts.

import FalconSDK from '@falcongames/game-client-sdk';

export type BoosterKey = 'pin' | 'bomb' | 'magnet' | 'basket';

export interface BoosterDef {
  key: BoosterKey;
  name: string;
  /** Mô tả ngắn ở popup. */
  desc: string;
  /** Gợi ý hiện ở đầu bàn khi booster đang chờ chọn mục tiêu. */
  hint: string;
  /** Level (1-based, như người chơi thấy) mà booster mở khoá. */
  unlock: number;
}

/** Thứ tự cũng là thứ tự bốn ô trên thanh dưới: từ trái sang phải theo thứ tự mở khoá (level tăng dần). */
export const BOOSTERS: BoosterDef[] = [
  { key: 'pin', name: 'Khối chặn', desc: 'Đặt một khối đặc lên ô trống. Khối ở lại suốt màn chơi.', hint: 'Chạm một ô trống để đặt khối vĩnh viễn!', unlock: 8 },
  { key: 'basket', name: 'Cổng cầu vồng', desc: 'Chọn một cổng: cổng nhận khối màu bất kỳ, một lần.', hint: 'Chạm một cổng: cổng sẽ nhận khối màu bất kỳ, một lần!', unlock: 11 },
  { key: 'magnet', name: 'Nam châm', desc: 'Hút khối đang thẳng hàng với cổng của nó vào thẳng cổng, xuyên mọi vật cản.', hint: 'Chạm một khối đang sáng: nam châm hút nó xuyên mọi vật cản vào cổng!', unlock: 16 },
  { key: 'bomb', name: 'Bom thạch', desc: 'Nổ ở một ô trống và đẩy 4 khối bên cạnh ra xa một ô.', hint: 'Chạm một ô trống để thả bom và đẩy các khối bên cạnh!', unlock: 21 },
];

/** Số booster tặng khi mở khoá. */
export const UNLOCK_GIFT = 2;
/** Số booster nhận được mỗi lần xem quảng cáo thưởng. */
export const AD_REWARD = 1;

export const defOf = (key: BoosterKey): BoosterDef => BOOSTERS.find((b) => b.key === key)!;

/** Chỉ bản dev: `?boosters=all` mở khoá mọi booster ngay từ level 1 để thử. */
const devAll = import.meta.env.DEV && new URLSearchParams(location.search).get('boosters') === 'all';

export const unlockLevel = (key: BoosterKey): number => (devAll ? 1 : defOf(key).unlock);

type Wallet = Partial<Record<BoosterKey, number>>;

function read(): { counts: Wallet; granted: Wallet } {
  try {
    const d = FalconSDK.userData.get();
    return { counts: { ...(d.boosters ?? {}) }, granted: { ...(d.boostersGranted ?? {}) } };
  } catch {
    return { counts: {}, granted: {} };
  }
}

function write(counts: Wallet, granted: Wallet): void {
  try {
    FalconSDK.userData.set({ boosters: counts, boostersGranted: granted });
  } catch {
    /* SDK chưa sẵn sàng: bỏ qua, lần sau sẽ lưu */
  }
}

export function countOf(key: BoosterKey): number {
  return read().counts[key] ?? 0;
}

export function isGranted(key: BoosterKey): boolean {
  return !!read().granted[key];
}

/** Cộng `n` booster (và đánh dấu đã tặng nếu `gift`). */
export function add(key: BoosterKey, n: number, gift = false): void {
  const { counts, granted } = read();
  counts[key] = (counts[key] ?? 0) + n;
  if (gift) granted[key] = 1;
  write(counts, granted);
}

/** Tiêu hao một booster. Trả về false nếu hết. */
export function spend(key: BoosterKey): boolean {
  const { counts, granted } = read();
  if ((counts[key] ?? 0) <= 0) return false;
  counts[key] = (counts[key] ?? 0) - 1;
  write(counts, granted);
  return true;
}

/**
 * Booster nào vừa mở khoá đúng ở level này (cần popup chúc mừng); những booster đã qua level mở khoá mà chưa được tặng
 * (nhảy cóc level) thì tặng luôn không popup.
 */
export function unlocksAt(levelNumber: number): BoosterKey[] {
  const popup: BoosterKey[] = [];
  for (const b of BOOSTERS) {
    if (isGranted(b.key)) {
      // bản dev: vào đúng level mở khoá thì vẫn hiện popup giới thiệu (như popup mechanic) để xem lại; không tặng thêm
      if (import.meta.env.DEV && !devAll && levelNumber === unlockLevel(b.key) && !new URLSearchParams(location.search).has('play')) popup.push(b.key);
      continue;
    }
    if (levelNumber < unlockLevel(b.key)) continue;
    if (devAll) add(b.key, 5, true); // bản dev: tặng 5 mỗi loại, không popup
    else if (levelNumber === unlockLevel(b.key)) popup.push(b.key);
    else add(b.key, UNLOCK_GIFT, true);
  }
  return popup;
}

/**
 * Xem quảng cáo thưởng để nhận thêm booster. Ở bản dev khi module quảng cáo tắt thì cho nhận luôn để thử.
 * Trả về true nếu được thưởng.
 */
export async function watchAdFor(key: BoosterKey): Promise<boolean> {
  let ok = false;
  try {
    ok = await FalconSDK.ads.showRewarded();
    if (!ok && import.meta.env.DEV && !FalconSDK.ads.enabled) ok = true;
  } catch {
    ok = false;
  }
  if (ok) add(key, AD_REWARD);
  return ok;
}

export function logUse(key: BoosterKey): void {
  try {
    FalconSDK.analytics.turn.useBooster(key);
  } catch {
    /* analytics không được làm hỏng gameplay */
  }
}
