// Nhạc nền tạo sinh: vòng hợp âm C – Am – F – G, mỗi ô nhịp có thảm hợp âm (pad), bass và vài nốt gảy (pluck) trên các nốt hợp âm.
// Hàm thuần (xác định theo số thứ tự ô nhịp) nên kiểm thử được; việc phát nằm ở sfx.ts.

export const BPM = 88;
export const BEATS_PER_BAR = 4;
export const BAR_SECONDS = (60 / BPM) * BEATS_PER_BAR;

export interface MusicNote {
  /** Thời điểm bắt đầu trong ô nhịp (giây). */
  at: number;
  midi: number;
  dur: number;
  kind: 'pad' | 'bass' | 'pluck' | 'shimmer';
  vel: number;
}

const CHORDS: { triad: number[]; bass: number; pluck: number[] }[] = [
  { triad: [60, 64, 67], bass: 36, pluck: [72, 76, 79, 84, 74] }, // C
  { triad: [57, 60, 64], bass: 33, pluck: [69, 72, 76, 81, 79] }, // Am
  { triad: [53, 57, 60], bass: 29, pluck: [72, 77, 81, 76, 69] }, // F
  { triad: [55, 59, 62], bass: 31, pluck: [71, 74, 79, 83, 76] }, // G
];

/** Bộ sinh số giả ngẫu nhiên mulberry32. */
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Các nốt của ô nhịp thứ `bar` (0, 1, 2...). Cùng `bar` luôn ra cùng kết quả. */
export function musicBar(bar: number): MusicNote[] {
  const ch = CHORDS[((bar % CHORDS.length) + CHORDS.length) % CHORDS.length];
  const beat = 60 / BPM;
  const notes: MusicNote[] = [];
  for (const m of ch.triad) notes.push({ at: 0, midi: m, dur: BAR_SECONDS * 0.98, kind: 'pad', vel: 0.5 });
  notes.push({ at: 0, midi: ch.bass, dur: beat * 1.6, kind: 'bass', vel: 0.9 });
  notes.push({ at: beat * 2, midi: ch.bass, dur: beat * 1.4, kind: 'bass', vel: 0.7 });
  const rand = rng(bar * 7919 + 13);
  // tám nốt móc đơn mỗi ô nhịp: gảy với xác suất ~55%, nhịp đầu luôn có nốt
  let last = -1;
  for (let i = 0; i < 8; i++) {
    if (i !== 0 && rand() > 0.55) continue;
    let k = Math.floor(rand() * ch.pluck.length);
    if (k === last) k = (k + 1) % ch.pluck.length; // không lặp một nốt hai lần liền
    last = k;
    notes.push({ at: i * beat * 0.5, midi: ch.pluck[k], dur: beat * 0.9, kind: 'pluck', vel: 0.55 + 0.35 * rand() });
  }
  // lớp lấp lánh ambient: cứ hai ô nhịp có một nốt chuông cao, ngân dài
  if (bar % 2 === 0) {
    const hi = [88, 91, 93, 96];
    notes.push({ at: beat * (rand() < 0.5 ? 1 : 3), midi: hi[Math.floor(rand() * hi.length)], dur: BAR_SECONDS * 0.9, kind: 'shimmer', vel: 0.5 });
  }
  return notes;
}
