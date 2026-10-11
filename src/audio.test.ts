import { describe, expect, it } from 'vitest';
import { MIN_GAP, PENTA, RECIPES, midiHz, type SfxName } from './audio-recipes';
import { BAR_SECONDS, musicBar } from './music';
import { LOGO_LETTER_HITS_MS } from './logo';

/** Ngữ cảnh giả: ghi lại các nguồn âm được lên lịch và kiểm tra tham số hợp lệ. */
function fakeContext() {
  const starts: { kind: string; t: number }[] = [];
  const param = (): AudioParam =>
    ({
      value: 0,
      setValueAtTime: () => undefined,
      exponentialRampToValueAtTime: (v: number) => {
        if (!(v > 0)) throw new Error('exponentialRamp tới giá trị không dương: ' + v);
      },
    }) as unknown as AudioParam;
  const node = (kind: string): Record<string, unknown> => {
    const n: Record<string, unknown> = {
      kind,
      frequency: param(),
      gain: param(),
      Q: param(),
      type: '',
      connect: (to: unknown) => to ?? n,
      start: (t: number) => starts.push({ kind, t }),
      stop: () => undefined,
    };
    return n;
  };
  const c = {
    sampleRate: 44100,
    createOscillator: () => node('osc'),
    createGain: () => node('gain'),
    createBiquadFilter: () => node('filter'),
    createBufferSource: () => node('noise'),
    createBuffer: (_ch: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
  };
  return { c: c as unknown as BaseAudioContext, starts };
}

describe('công thức âm thanh', () => {
  const names = Object.keys(RECIPES) as SfxName[];

  it('mọi tiếng đều lên lịch ít nhất một nguồn âm và không ném lỗi', () => {
    for (const name of names) {
      const { c, starts } = fakeContext();
      expect(() => RECIPES[name](c, c.destination ?? ({} as AudioNode), 1, 0.5), name).not.toThrow();
      expect(starts.length, name).toBeGreaterThan(0);
      for (const s of starts) expect(s.t, `${name} thời điểm bắt đầu`).toBeGreaterThanOrEqual(1);
    }
  });

  it('tham số p ở các biên không làm hỏng công thức', () => {
    for (const name of names) for (const p of [0, 1, 9, -1]) {
      const { c } = fakeContext();
      expect(() => RECIPES[name](c, {} as AudioNode, 0, p), `${name} p=${p}`).not.toThrow();
    }
  });

  it('khoảng cách tối thiểu chỉ khai báo cho tiếng có thật', () => {
    for (const name of Object.keys(MIN_GAP)) expect(names).toContain(name);
  });

  it('midiHz: A4 = 440Hz, đổi quãng tám thì gấp đôi', () => {
    expect(midiHz(69)).toBeCloseTo(440, 5);
    expect(midiHz(81)).toBeCloseTo(880, 5);
  });

  it('ngũ cung chỉ gồm các nốt C D E G A', () => {
    const allowed = new Set([0, 2, 4, 7, 9]);
    for (const m of PENTA) expect(allowed.has(m % 12), String(m)).toBe(true);
  });
});

describe('nhạc nền', () => {
  it('xác định theo số thứ tự ô nhịp', () => {
    expect(musicBar(5)).toEqual(musicBar(5));
    expect(musicBar(0)).not.toEqual(musicBar(1));
  });

  it('mỗi ô nhịp có thảm hợp âm, bass và nốt gảy, trong khoảng thời gian của ô nhịp', () => {
    for (let bar = 0; bar < 8; bar++) {
      const notes = musicBar(bar);
      for (const kind of ['pad', 'bass', 'pluck'] as const) expect(notes.some((n) => n.kind === kind), `bar ${bar} ${kind}`).toBe(true);
      for (const n of notes) {
        expect(n.at).toBeGreaterThanOrEqual(0);
        expect(n.at).toBeLessThan(BAR_SECONDS);
        expect(n.midi).toBeGreaterThan(20);
        expect(n.midi).toBeLessThan(100);
      }
    }
  });

  it('vòng hợp âm lặp sau 4 ô nhịp (phần thảm hợp âm và bass)', () => {
    const pb = (bar: number) => musicBar(bar).filter((n) => n.kind === 'pad' || n.kind === 'bass');
    expect(pb(0)).toEqual(pb(4));
  });
});

describe('logo', () => {
  it('có đúng 10 thời điểm chạm đáy (Jelly + Slide), tăng dần theo từng dòng', () => {
    expect(LOGO_LETTER_HITS_MS.length).toBe(10);
    for (let i = 1; i < 5; i++) expect(LOGO_LETTER_HITS_MS[i]).toBeGreaterThan(LOGO_LETTER_HITS_MS[i - 1]);
    for (let i = 6; i < 10; i++) expect(LOGO_LETTER_HITS_MS[i]).toBeGreaterThan(LOGO_LETTER_HITS_MS[i - 1]);
  });
});
