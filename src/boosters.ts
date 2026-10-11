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
  { key: 'pin', name: 'Block', desc: 'Places a solid block on an empty cell. It stays there for the whole level.', hint: 'Tap an empty cell to place a block for good!', unlock: 8 },
  { key: 'basket', name: 'Rainbow Gate', desc: 'Pick a gate: it takes a block of any colour, once.', hint: 'Tap a gate: it will take a block of any colour, once!', unlock: 11 },
  { key: 'magnet', name: 'Magnet', desc: 'Pulls a block lined up with its gate straight in, through anything.', hint: 'Tap a glowing block to pull it straight into its gate!', unlock: 16 },
  { key: 'bomb', name: 'Jelly Bomb', desc: 'Pops on an empty cell and pushes the 4 blocks beside it one cell away.', hint: 'Tap an empty cell to drop the bomb and blast the blocks beside it!', unlock: 21 },
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
    if (isGranted(b.key) || levelNumber < unlockLevel(b.key)) continue;
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
