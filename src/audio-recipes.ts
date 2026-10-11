// Công thức tiếng của game, tổng hợp hoàn toàn bằng WebAudio (không có file âm thanh).
//
// Ngôn ngữ âm: thang ngũ cung C trưởng, mềm và tròn như thạch. Để tránh nghe như chip 8-bit (sóng thô trượt cao độ), các tiếng dùng:
//  - tổng hợp FM cho chuông/marimba/đàn phím (hoạ âm phong phú, tắt tự nhiên),
//  - "thân" vật lý cho tiếng va chạm: dao động tắt chậm cộng nhiễu lọc cộng hưởng, không trượt cao độ,
//  - nhiễu qua bộ lọc cộng hưởng cho tiếng gió/vụt/bong bóng.
// Mỗi công thức nhận (ngữ cảnh, nút đầu ra, thời điểm bắt đầu, tham số p) và chỉ lên lịch các nguồn âm, nên chạy được cả trên OfflineAudioContext
// (dùng để đo độ lớn/độ dài lúc kiểm thử) lẫn AudioContext thật.

export type Ctx = BaseAudioContext;
export type Recipe = (c: Ctx, out: AudioNode, t: number, p: number) => void;

export const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** Ngũ cung C trưởng từ C5: dùng cho từng chữ của logo và các tiếng lấp lánh. */
export const PENTA = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93];

interface ToneOpts {
  f0: number;
  f1?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  /** Bộ lọc thông thấp (Hz) để làm tiếng ấm hơn. */
  lp?: number;
}

/** Một nốt: dao động, có thể trượt tần số f0 → f1, bao biên độ tăng nhanh rồi tắt dần. */
export function tone(c: Ctx, out: AudioNode, t: number, o: ToneOpts): void {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f0, t);
  if (o.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + o.dur);
  const peak = o.gain ?? 0.2;
  const attack = Math.min(o.attack ?? 0.004, o.dur * 0.5);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  let node: AudioNode = osc;
  if (o.lp) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lp;
    node.connect(f);
    node = f;
  }
  node.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + o.dur + 0.02);
}

interface FmOpts {
  f: number;
  /** Tỉ số tần số bộ điều chế/sóng mang: số nguyên → hoạ âm hài hoà (marimba, đàn phím); số lẻ → kim loại (chuông). */
  ratio?: number;
  /** Độ sâu điều chế (nhân với tần số bộ điều chế): càng lớn càng sáng; giảm dần theo đời nốt. */
  index?: number;
  dur: number;
  gain?: number;
  attack?: number;
}

/** Nốt FM: một dao động điều chế tần số của dao động kia, độ sâu giảm dần nên tiếng sáng lúc đầu rồi tròn lại (như chuông, đàn phím). */
export function fm(c: Ctx, out: AudioNode, t: number, o: FmOpts): void {
  const car = c.createOscillator();
  const mod = c.createOscillator();
  const mg = c.createGain();
  const g = c.createGain();
  const ratio = o.ratio ?? 2;
  car.frequency.setValueAtTime(o.f, t);
  mod.frequency.setValueAtTime(o.f * ratio, t);
  const depth = (o.index ?? 2) * o.f * ratio;
  mg.gain.setValueAtTime(Math.max(0.01, depth), t);
  mg.gain.exponentialRampToValueAtTime(Math.max(0.01, depth * 0.04), t + o.dur * 0.7);
  mod.connect(mg).connect(car.frequency);
  const peak = o.gain ?? 0.2;
  const attack = Math.min(o.attack ?? 0.003, o.dur * 0.5);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  car.connect(g).connect(out);
  car.start(t);
  mod.start(t);
  car.stop(t + o.dur + 0.02);
  mod.stop(t + o.dur + 0.02);
}

interface VoiceOpts {
  f: number;
  dur: number;
  gain: number;
  attack?: number;
  lp?: number;
  type?: OscillatorType;
  /** Độ lệch tần số (cent) của từng lớp: nhiều lớp lệch nhẹ nghe dày và ấm, không "khô" như một dao động đơn. */
  detune?: number[];
}

/** Giọng dày: nhiều dao động lệch tần số nhẹ chồng nhau, qua bộ lọc thông thấp cho êm. */
export function voice(c: Ctx, out: AudioNode, t: number, o: VoiceOpts): void {
  const dets = o.detune ?? [-7, 7];
  for (const d of dets) {
    tone(c, out, t, { f0: o.f * Math.pow(2, d / 1200), dur: o.dur, type: o.type ?? 'triangle', gain: o.gain / dets.length, attack: o.attack, lp: o.lp });
  }
}

/** Nốt chuông/glockenspiel: FM với tỉ số lẻ (kim loại) cộng âm cơ bản ngân. */
export function bell(c: Ctx, out: AudioNode, t: number, f: number, o: { dur?: number; gain?: number } = {}): void {
  const dur = o.dur ?? 0.9;
  const g = o.gain ?? 0.18;
  fm(c, out, t, { f, ratio: 3.5, index: 1.1, dur, gain: g });
  tone(c, out, t, { f0: f * 2, dur: dur * 0.5, gain: g * 0.18, attack: 0.002 });
}

/** Nốt marimba: FM tỉ số 4 (hài hoà), ngắn và ấm như gõ gỗ. */
export function mallet(c: Ctx, out: AudioNode, t: number, f: number, o: { dur?: number; gain?: number } = {}): void {
  const dur = o.dur ?? 0.4;
  const g = o.gain ?? 0.22;
  fm(c, out, t, { f, ratio: 4, index: 0.9, dur, gain: g });
  tone(c, out, t, { f0: f, dur: dur * 0.8, gain: g * 0.25, attack: 0.003 });
}

interface NoiseOpts {
  dur: number;
  type?: BiquadFilterType;
  f0: number;
  f1?: number;
  q?: number;
  gain?: number;
  attack?: number;
}

const noiseBuffers = new WeakMap<object, AudioBuffer>();

function noiseBuffer(c: Ctx): AudioBuffer {
  let b = noiseBuffers.get(c);
  if (!b) {
    b = c.createBuffer(1, Math.floor(c.sampleRate * 1.2), c.sampleRate);
    const d = b.getChannelData(0);
    let s = 1234567;
    for (let i = 0; i < d.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0; // LCG: cùng một chuỗi nhiễu mỗi lần, không cần Math.random
      d[i] = (s / 4294967296) * 2 - 1;
    }
    noiseBuffers.set(c, b);
  }
  return b;
}

/** Nhiễu trắng qua bộ lọc có thể quét tần số f0 → f1: tiếng gió, vụt, lách tách. */
export function noise(c: Ctx, out: AudioNode, t: number, o: NoiseOpts): void {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.frequency.setValueAtTime(o.f0, t);
  if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
  f.Q.value = o.q ?? 1;
  const g = c.createGain();
  const attack = Math.min(o.attack ?? 0.006, o.dur * 0.5);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain ?? 0.2), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f).connect(g).connect(out);
  src.start(t);
  src.stop(t + o.dur + 0.02);
}

/**
 * Tiếng "thịch" có thân: dao động trầm tắt chậm (chỉ hơi hạ vài %, không trượt như chip), hoạ âm bậc 2, một cú nhiễu lọc thấp lúc va và
 * nhiễu cộng hưởng ở đúng tần số thân (như gỗ/cao su rung sau cú gõ).
 */
export function thud(c: Ctx, out: AudioNode, t: number, o: { f: number; dur: number; gain: number }): void {
  tone(c, out, t, { f0: o.f * 1.1, f1: o.f, dur: o.dur, gain: o.gain, attack: 0.003 });
  tone(c, out, t, { f0: o.f * 2, dur: o.dur * 0.4, gain: o.gain * 0.22, attack: 0.003 });
  noise(c, out, t, { dur: Math.min(0.06, o.dur), type: 'lowpass', f0: o.f * 8, gain: o.gain * 0.8 });
  noise(c, out, t, { dur: o.dur * 0.8, type: 'bandpass', f0: o.f, q: 7, gain: o.gain * 0.6 });
}

export type SfxName =
  | 'slide' | 'bump' | 'bumpSoft' | 'bumpBall' | 'gate' | 'pop' | 'undo'
  | 'tap' | 'release' | 'popupOpen' | 'popupClose' | 'denied'
  | 'arm' | 'pinDrop' | 'bombWhistle' | 'bombBoom' | 'magnet' | 'rainbow'
  | 'letter' | 'slam' | 'confettiPop' | 'fanfare' | 'tutorialStep'
  | 'outOfMoves' | 'fail' | 'revive' | 'intro';

export const RECIPES: Record<SfxName, Recipe> = {
  /** Cú trượt (nhẹ nhàng): hơi gió mềm lướt lên chậm, vào từ từ (không có cú "xì" đầu), thêm một chút không khí cao rất nhẹ. */
  slide(c, out, t, p) {
    const dur = 0.2 + 0.2 * p;
    noise(c, out, t, { dur, f0: 260, f1: 950, q: 0.7, gain: 0.24, attack: 0.05 });
    noise(c, out, t, { dur: dur * 0.9, type: 'lowpass', f0: 320, f1: 700, q: 1, gain: 0.1, attack: 0.06 });
    noise(c, out, t, { dur: dur * 0.8, type: 'highpass', f0: 2500, f1: 3600, gain: 0.03, attack: 0.06 });
  },
  /** Khối đập vào tường/mép: thịch trầm có thân, p = lực 0..1. */
  bump(c, out, t, p) {
    thud(c, out, t, { f: 140, dur: 0.28, gain: 0.22 + 0.14 * p });
  },
  /** Dừng nhờ vệt: êm hơn, như chạm vào thạch mềm. */
  bumpSoft(c, out, t) {
    thud(c, out, t, { f: 190, dur: 0.16, gain: 0.14 });
  },
  /** Hai thạch va nhau: thịch cao hơn cộng một tiếng "tách" thuỷ tinh. */
  bumpBall(c, out, t) {
    thud(c, out, t, { f: 240, dur: 0.16, gain: 0.2 });
    fm(c, out, t + 0.015, { f: 880, ratio: 3.5, index: 1.4, dur: 0.14, gain: 0.07 });
    thud(c, out, t + 0.06, { f: 200, dur: 0.12, gain: 0.14 });
  },
  /** Bị cửa hút vào: tiếng hút (nhiễu cộng hưởng quét lên), giọt nước đi lên rồi hai nốt chuông lấp lánh. */
  gate(c, out, t) {
    noise(c, out, t, { dur: 0.18, f0: 300, f1: 2200, q: 4, gain: 0.3 });
    tone(c, out, t + 0.02, { f0: 420, f1: 900, dur: 0.12, gain: 0.16, lp: 2500 });
    bell(c, out, t + 0.1, midiHz(88), { dur: 0.55, gain: 0.12 });
    bell(c, out, t + 0.17, midiHz(91), { dur: 0.65, gain: 0.1 });
  },
  /** Vệt vỡ: giọt nước nhỏ (tần số đi lên như bong bóng thật), cao độ ngẫu nhiên theo p. */
  pop(c, out, t, p) {
    const f = 600 + 500 * p;
    tone(c, out, t, { f0: f, f1: f * 2.2, dur: 0.035, gain: 0.22, attack: 0.002 });
    noise(c, out, t, { dur: 0.03, f0: 2500, q: 5, gain: 0.12 });
  },
  /** Hoàn tác: gió quét ngược xuống và một nốt đàn phím mềm. */
  undo(c, out, t) {
    noise(c, out, t, { dur: 0.15, f0: 1800, f1: 500, q: 1.5, gain: 0.3 });
    fm(c, out, t + 0.08, { f: 440, ratio: 2, index: 1.2, dur: 0.25, gain: 0.17 });
  },
  /** Bấm nút: tiếng "tích" gỗ nhỏ. */
  tap(c, out, t) {
    noise(c, out, t, { dur: 0.035, f0: 2200, q: 3, gain: 0.6 });
    tone(c, out, t, { f0: 900, f1: 800, dur: 0.05, gain: 0.15 });
  },
  release(c, out, t) {
    noise(c, out, t, { dur: 0.035, f0: 2800, q: 3, gain: 0.45 });
    tone(c, out, t, { f0: 1100, f1: 1000, dur: 0.045, gain: 0.12 });
  },
  popupOpen(c, out, t) {
    noise(c, out, t, { dur: 0.18, f0: 300, f1: 1400, q: 0.8, gain: 0.12 });
    fm(c, out, t + 0.03, { f: 523, ratio: 2, index: 1, dur: 0.28, gain: 0.14 });
    bell(c, out, t + 0.1, midiHz(84), { dur: 0.45, gain: 0.1 });
  },
  popupClose(c, out, t) {
    noise(c, out, t, { dur: 0.12, f0: 1200, f1: 300, q: 0.8, gain: 0.1 });
    fm(c, out, t, { f: 392, ratio: 2, index: 0.8, dur: 0.14, gain: 0.1 });
  },
  /** Không làm được: hai tiếng "cộc" trầm. */
  denied(c, out, t) {
    thud(c, out, t, { f: 130, dur: 0.12, gain: 0.26 });
    thud(c, out, t + 0.11, { f: 125, dur: 0.12, gain: 0.26 });
  },
  /** Bật booster chờ chọn mục tiêu: hai nốt chuông đi lên. */
  arm(c, out, t) {
    bell(c, out, t, midiHz(79), { dur: 0.4, gain: 0.18 });
    bell(c, out, t + 0.07, midiHz(84), { dur: 0.55, gain: 0.18 });
  },
  /** Block rơi xuống: thịch nặng cộng một tia lấp lánh. */
  pinDrop(c, out, t) {
    thud(c, out, t, { f: 100, dur: 0.35, gain: 0.55 });
    bell(c, out, t + 0.1, midiHz(93), { dur: 0.5, gain: 0.09 });
  },
  bombWhistle(c, out, t) {
    tone(c, out, t, { f0: 1100, f1: 260, dur: 0.35, gain: 0.14, lp: 3000 });
    noise(c, out, t, { dur: 0.35, type: 'highpass', f0: 2500, gain: 0.05 });
  },
  /** Nổ: cú thịch sâu, tiếng ầm lọc tối dần và lách tách của mảnh vụn. */
  bombBoom(c, out, t) {
    noise(c, out, t, { dur: 0.55, type: 'lowpass', f0: 1500, f1: 120, gain: 0.55, attack: 0.005 });
    thud(c, out, t, { f: 55, dur: 0.6, gain: 0.7 });
    noise(c, out, t + 0.05, { dur: 0.25, type: 'highpass', f0: 3000, gain: 0.08 });
  },
  /** Nam châm: tiếng ù FM tăng dần rồi một tia "tạch" lúc hút xong. */
  magnet(c, out, t) {
    fm(c, out, t, { f: 110, ratio: 1.5, index: 2.5, dur: 0.4, gain: 0.2 });
    tone(c, out, t, { f0: 90, f1: 200, dur: 0.4, gain: 0.14, lp: 900 });
    noise(c, out, t + 0.38, { dur: 0.06, f0: 2200, q: 2, gain: 0.12 });
  },
  /** Cầu vồng: năm nốt chuông lấp lánh đi lên. */
  rainbow(c, out, t) {
    [72, 76, 79, 84, 88].forEach((m, i) => bell(c, out, t + i * 0.06, midiHz(m), { dur: 0.6, gain: 0.14 }));
  },
  /** Từng chữ của logo: một nốt marimba trên thang ngũ cung, p = số thứ tự chữ. */
  letter(c, out, t, p) {
    const f = midiHz(PENTA[Math.max(0, Math.round(p)) % PENTA.length]);
    mallet(c, out, t, f, { dur: 0.45, gain: 0.26 });
    noise(c, out, t, { dur: 0.015, type: 'highpass', f0: 3000, gain: 0.05 });
  },
  /** Cú đập của logo: thịch sâu hai tầng cộng lách tách và một vệt lấp lánh cao. */
  slam(c, out, t) {
    thud(c, out, t, { f: 60, dur: 0.5, gain: 0.6 });
    thud(c, out, t, { f: 140, dur: 0.3, gain: 0.3 });
    noise(c, out, t, { dur: 0.1, type: 'bandpass', f0: 3500, q: 1.2, gain: 0.08 });
  },
  /** Pháo giấy nổ "bụp": hơi nén cộng tiếng giấy loạt xoạt. */
  confettiPop(c, out, t) {
    noise(c, out, t, { dur: 0.12, f0: 1800, q: 0.9, gain: 0.3 });
    noise(c, out, t + 0.02, { dur: 0.18, type: 'highpass', f0: 4000, gain: 0.06 });
    thud(c, out, t, { f: 300, dur: 0.06, gain: 0.15 });
  },
  /** Thắng: bốn nốt đàn phím đi lên rồi hợp âm C trưởng ngân dài kèm chuông. */
  fanfare(c, out, t) {
    [72, 76, 79, 84].forEach((m, i) => {
      fm(c, out, t + i * 0.09, { f: midiHz(m), ratio: 2, index: 1.3, dur: 0.45, gain: 0.2 });
      bell(c, out, t + i * 0.09, midiHz(m + 12), { dur: 0.5, gain: 0.07 });
    });
    [72, 76, 79, 84].forEach((m) => voice(c, out, t + 0.36, { f: midiHz(m), dur: 0.9, gain: 0.12, lp: 2200, detune: [-9, 0, 9] }));
    bell(c, out, t + 0.36, midiHz(96), { dur: 1.1, gain: 0.1 });
  },
  tutorialStep(c, out, t) {
    bell(c, out, t, 1318, { dur: 0.5, gain: 0.15 });
    bell(c, out, t + 0.07, 1760, { dur: 0.45, gain: 0.11 });
  },
  /** Hết lượt: hai nốt trầm FM đi xuống ("wah" mềm, không còn răng cưa chói). */
  outOfMoves(c, out, t) {
    fm(c, out, t, { f: midiHz(55), ratio: 1, index: 1.6, dur: 0.32, gain: 0.22 });
    fm(c, out, t + 0.3, { f: midiHz(48), ratio: 1, index: 1.4, dur: 0.5, gain: 0.22 });
    tone(c, out, t, { f0: midiHz(55), f1: midiHz(51), dur: 0.3, gain: 0.08, lp: 600 });
    tone(c, out, t + 0.3, { f0: midiHz(48), f1: midiHz(46), dur: 0.45, gain: 0.08, lp: 500 });
  },
  /** Thua hẳn: ba nốt thứ đi xuống, tiếng nứt của trái tim rồi một cú thịch trầm. */
  fail(c, out, t) {
    [67, 64, 60].forEach((m, i) => {
      fm(c, out, t + i * 0.2, { f: midiHz(m), ratio: 2, index: 1, dur: 0.4, gain: 0.2 });
      bell(c, out, t + i * 0.2, midiHz(m + 12), { dur: 0.4, gain: 0.05 });
    });
    noise(c, out, t + 0.05, { dur: 0.08, type: 'highpass', f0: 3500, gain: 0.2 });
    thud(c, out, t + 0.55, { f: 80, dur: 0.4, gain: 0.4 });
  },
  /** Nhận thêm lượt: arpeggio chuông đi lên. */
  revive(c, out, t) {
    [67, 72, 76, 79, 84].forEach((m, i) => bell(c, out, t + i * 0.05, midiHz(m), { dur: 0.55, gain: 0.16 }));
    bell(c, out, t + 0.28, midiHz(96), { dur: 0.7, gain: 0.09 });
  },
  /** Mở màn: tiếng gió nhẹ lúc bàn bay vào. */
  intro(c, out, t) {
    noise(c, out, t, { dur: 0.3, type: 'lowpass', f0: 250, f1: 1000, gain: 1.1 });
  },
};

/** Khoảng cách tối thiểu (giây) giữa hai lần phát cùng một tiếng, để tiếng dồn dập không thành một mớ. */
export const MIN_GAP: Partial<Record<SfxName, number>> = { pop: 0.035, tap: 0.04, release: 0.04, confettiPop: 0.05, bump: 0.06 };
