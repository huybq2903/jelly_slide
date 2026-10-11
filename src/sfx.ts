// Bộ máy âm thanh: phát các tiếng trong audio-recipes.ts và nhạc nền tạo sinh trong music.ts, tôn trọng hai cài đặt Sound và Music.
// Trình duyệt chỉ cho phát tiếng sau lần chạm đầu tiên của người dùng nên `unlockAudio` được gọi ở mọi lần chạm (idempotent).

import { MIN_GAP, RECIPES, bell, midiHz, tone, voice, type SfxName } from './audio-recipes';
import { BAR_SECONDS, BPM as BPM_ECHO, musicBar } from './music';

interface AudioConfig {
  sound: () => boolean;
  music: () => boolean;
}

let cfg: AudioConfig = { sound: () => true, music: () => true };
let ac: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;

/** Mức nhạc nền (so với tiếng hiệu ứng) và mức khi bị hạ xuống (popup thắng/thua). */
const MUSIC_LEVEL = 0.6;
const MUSIC_DUCKED = 0.15;
let ducked = false;

/** Gắn hai hàm đọc cài đặt Sound/Music của người chơi. */
export function configureAudio(c: AudioConfig): void {
  cfg = c;
}

/** Đáp ứng xung giả cho hồi âm: nhiễu stereo tắt dần theo hàm mũ, lọc một cực cho tối đi. */
function impulse(c: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  let seed = 98765;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const x = (seed / 4294967296) * 2 - 1;
      y += 0.35 * (x - y);
      d[i] = y * Math.pow(1 - i / len, 2.6);
    }
  }
  return buf;
}

function ensure(): AudioContext | null {
  if (ac) return ac;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    const comp = ac.createDynamicsCompressor(); // giữ cho nhiều tiếng chồng nhau không vỡ
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    const master = ac.createGain();
    master.gain.value = 0.85;
    sfxBus = ac.createGain();
    musicBus = ac.createGain();
    musicBus.gain.value = 0;
    sfxBus.connect(comp);
    musicBus.connect(comp);
    // hồi âm (reverb) tổng hợp: nhiễu tắt dần, làm tối nhẹ; tiếng hiệu ứng gửi ít, nhạc gửi nhiều hơn
    const reverb = ac.createConvolver();
    reverb.buffer = impulse(ac, 1.8);
    const wet = ac.createGain();
    wet.gain.value = 0.9;
    reverb.connect(wet).connect(comp);
    const sfxSend = ac.createGain();
    sfxSend.gain.value = 0.2;
    sfxBus.connect(sfxSend).connect(reverb);
    const musicSend = ac.createGain();
    musicSend.gain.value = 0.5;
    musicBus.connect(musicSend).connect(reverb);
    // echo nốt móc đơn chấm của nhạc nền, lặp mờ dần và tối dần
    const echo = ac.createDelay(2);
    echo.delayTime.value = (60 / BPM_ECHO) * 0.75;
    const fb = ac.createGain();
    fb.gain.value = 0.33;
    const echoLp = ac.createBiquadFilter();
    echoLp.type = 'lowpass';
    echoLp.frequency.value = 2200;
    const echoSend = ac.createGain();
    echoSend.gain.value = 0.28;
    musicBus.connect(echoSend).connect(echo);
    echo.connect(echoLp);
    echoLp.connect(fb).connect(echo);
    echoLp.connect(comp);
    echoLp.connect(reverb);
    // bão hoà nhẹ (tanh) trước đầu ra: thêm hoạ âm chẵn cho ấm, đỡ "lạnh/điện tử"
    const shaper = ac.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 1.5) / Math.tanh(1.5);
    }
    shaper.curve = curve;
    shaper.oversample = '2x';
    comp.connect(shaper).connect(master).connect(ac.destination);
    document.addEventListener('visibilitychange', () => {
      if (!ac) return;
      if (document.hidden) void ac.suspend();
      else void ac.resume();
    });
  } catch {
    ac = null;
  }
  return ac;
}

/** Gọi trong mọi lần chạm: tạo/đánh thức ngữ cảnh âm thanh và bật nhạc nếu cần. */
export function unlockAudio(): void {
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  refreshMusic();
}

const lastPlayed = new Map<SfxName, number>();

/** Phát một tiếng. `p` là tham số của công thức (lực, quãng đường, số thứ tự chữ...), `delay` (giây) là độ trễ so với bây giờ. */
export function play(name: SfxName, p = 0, delay = 0): void {
  if (!cfg.sound()) return;
  const c = ensure();
  if (!c || !sfxBus || c.state !== 'running') return;
  const t = c.currentTime + Math.max(0, delay);
  const gap = MIN_GAP[name] ?? 0;
  if (gap && t - (lastPlayed.get(name) ?? -1) < gap) return;
  lastPlayed.set(name, t);
  try {
    RECIPES[name](c, sfxBus, t, p);
  } catch {
    /* không phát được thì thôi */
  }
}

// ---------- Nhạc nền ----------
let musicOn = false;
let timer = 0;
let nextBar = 0;
let barIdx = 0;

function scheduleBar(c: BaseAudioContext, bus: AudioNode, bar: number, t0: number): void {
  for (const n of musicBar(bar)) {
    const t = t0 + n.at;
    const f = midiHz(n.midi);
    if (n.kind === 'pad') {
      // thảm hợp âm: ba lớp răng cưa lệch nhẹ qua bộ lọc thấp, vào chậm cho êm
      voice(c, bus, t, { f: f, dur: n.dur, type: 'sawtooth', gain: 0.05 * n.vel, attack: 0.9, lp: 850, detune: [-9, 0, 9] });
    } else if (n.kind === 'bass') {
      tone(c, bus, t, { f0: f, dur: n.dur, gain: 0.18 * n.vel, attack: 0.02 });
      tone(c, bus, t, { f0: f * 2, dur: n.dur * 0.6, gain: 0.03 * n.vel, attack: 0.02, lp: 500 });
    } else if (n.kind === 'pluck') bell(c, bus, t, f, { dur: 1.1, gain: 0.1 * n.vel });
    else bell(c, bus, t, f, { dur: 1.8, gain: 0.06 * n.vel });
  }
}

function applyMusicLevel(): void {
  if (!ac || !musicBus) return;
  musicBus.gain.setTargetAtTime(musicOn ? (ducked ? MUSIC_DUCKED : MUSIC_LEVEL) : 0, ac.currentTime, ducked ? 0.12 : 0.35);
}

function tick(): void {
  if (!ac || !musicBus || ac.state !== 'running') return;
  while (nextBar < ac.currentTime + 0.9) {
    scheduleBar(ac, musicBus, barIdx++, nextBar);
    nextBar += BAR_SECONDS;
  }
}

function startMusic(): void {
  if (musicOn || !ac || ac.state !== 'running') return;
  musicOn = true;
  nextBar = ac.currentTime + 0.15;
  barIdx = 0;
  timer = window.setInterval(tick, 250);
  tick();
  applyMusicLevel();
}

function stopMusic(): void {
  if (!musicOn) return;
  musicOn = false;
  window.clearInterval(timer);
  applyMusicLevel(); // hạ về 0 dần; các nốt đã lên lịch trước đó tắt theo
}

/** Đồng bộ nhạc nền với cài đặt Music (gọi sau khi người chơi đổi cài đặt). */
export function refreshMusic(): void {
  if (cfg.music()) startMusic();
  else stopMusic();
}

/** Hạ nhạc nền xuống nhỏ (lúc popup thắng/thua) hoặc trả lại mức thường. */
export function duckMusic(on: boolean): void {
  if (ducked === on) return;
  ducked = on;
  applyMusicLevel();
}

/** Tạm dừng / tiếp tục toàn bộ âm thanh (game.pause/resume của lớp studio). */
export function suspendAudio(): void {
  if (ac) void ac.suspend();
}
export function resumeAudio(): void {
  if (ac && !document.hidden) void ac.resume();
}

// ---------- Kiểm thử (dev) ----------
export interface RenderStats {
  name: SfxName;
  /** Biên độ đỉnh (1 = chạm trần, > 1 sẽ vỡ tiếng). */
  peak: number;
  rms: number;
  /** Độ dài có tiếng (giây). */
  seconds: number;
}

/** Kết xuất offline một tiếng và đo biên độ/độ dài: để biết tiếng có nghe được, có vỡ không, dài bao lâu mà không cần nghe. */
export async function renderStats(name: SfxName, p = 0): Promise<RenderStats> {
  const rate = 44100;
  const oc = new OfflineAudioContext(1, rate * 2, rate);
  RECIPES[name](oc, oc.destination, 0, p);
  const data = (await oc.startRendering()).getChannelData(0);
  let peak = 0;
  let sum = 0;
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
    sum += a * a;
    if (a > 0.002) last = i;
  }
  return { name, peak, rms: Math.sqrt(sum / data.length), seconds: last / rate };
}

/** Kết xuất offline mọi tiếng và trả về bảng chữ (một dòng mỗi tiếng). */
export async function renderAllStats(p = 0.5): Promise<string> {
  const lines: string[] = [];
  for (const name of Object.keys(RECIPES) as SfxName[]) {
    const r = await renderStats(name, p);
    lines.push(`${name.padEnd(12)} peak=${r.peak.toFixed(2)} rms=${r.rms.toFixed(3)} dur=${r.seconds.toFixed(2)}s`);
  }
  return lines.join(String.fromCharCode(10));
}

/** Kết xuất offline `bars` ô nhịp nhạc nền (chỉ phần khô, chưa có hồi âm/echo): đo biên độ đỉnh và độ ồn trung bình. */
export async function renderMusicStats(bars = 4): Promise<string> {
  const rate = 44100;
  const secs = Math.ceil(bars * BAR_SECONDS + 3);
  const oc = new OfflineAudioContext(1, rate * secs, rate);
  for (let b = 0; b < bars; b++) scheduleBar(oc, oc.destination, b, b * BAR_SECONDS);
  const data = (await oc.startRendering()).getChannelData(0);
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
    sum += a * a;
  }
  return `music(${bars} ô nhịp) peak=${peak.toFixed(2)} rms=${Math.sqrt(sum / data.length).toFixed(3)}`;
}
